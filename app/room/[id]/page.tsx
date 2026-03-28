"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PlaybackState, RoomSnapshot, SearchSong, VoteResult } from "@/app/types";
import Player from "./components/Player";
import Queue from "./components/Queue";
import Search from "./components/Search";
import { ensureAnonymousSession } from "@/lib/qbeat/auth";
import { appConfig } from "@/lib/qbeat/config";
import { getOrCreateNickname } from "@/lib/qbeat/local-storage";
import {
  fetchRoomSnapshot,
  joinRoom,
  withOptimisticRemoval,
  withOptimisticTrack,
  withOptimisticVote,
} from "@/lib/qbeat/room-service";
import { buildRoomSections } from "@/lib/qbeat/room-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

function withOptimisticPlayback(
  snapshot: RoomSnapshot,
  playbackPatch: Partial<PlaybackState>,
  userId: string,
) {
  const now = new Date().toISOString();

  return {
    ...snapshot,
    playbackState: {
      ...snapshot.playbackState,
      ...playbackPatch,
      updated_at: now,
      updated_by: userId,
      sync_anchor_at: playbackPatch.sync_anchor_at ?? now,
    },
  };
}

export default function RoomPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [nickname, setNickname] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const roleRef = useRef<RoomSnapshot["role"]>("listener");
  const userIdRef = useRef<string | null>(null);

  const refreshSnapshot = useCallback(async () => {
    if (!roomIdRef.current || !userIdRef.current) {
      return;
    }

    try {
      const nextSnapshot = await fetchRoomSnapshot(
        supabase,
        roomIdRef.current,
        userIdRef.current,
        roleRef.current,
      );
      startTransition(() => setSnapshot(nextSnapshot));
    } catch (refreshError) {
      setActionError(getErrorMessage(refreshError, "Failed to refresh room state."));
    }
  }, [supabase]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshSnapshot();
    }, 90);
  }, [refreshSnapshot]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRoom() {
      try {
        const roomCode = params.id.toUpperCase();
        const displayName = getOrCreateNickname();
        setNickname(displayName);

        const session = await ensureAnonymousSession(supabase);
        userIdRef.current = session.user.id;

        const joinedRoom = await joinRoom(supabase, roomCode, displayName);
        roomIdRef.current = joinedRoom.room_id;
        roleRef.current = joinedRoom.role;

        const initialSnapshot = await fetchRoomSnapshot(
          supabase,
          joinedRoom.room_id,
          session.user.id,
          joinedRoom.role,
        );

        if (cancelled) {
          return;
        }

        setSnapshot(initialSnapshot);

        const channel = supabase
          .channel(`room:${joinedRoom.room_id}:live`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "room_tracks",
              filter: `room_id=eq.${joinedRoom.room_id}`,
            },
            scheduleRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "playback_state",
              filter: `room_id=eq.${joinedRoom.room_id}`,
            },
            scheduleRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "rooms",
              filter: `id=eq.${joinedRoom.room_id}`,
            },
            scheduleRefresh,
          );

        channel.subscribe();
        channelRef.current = channel;
      } catch (roomError) {
        if (!cancelled) {
          setError(getErrorMessage(roomError, "Failed to load room."));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrapRoom();

    return () => {
      cancelled = true;

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [params.id, scheduleRefresh, supabase]);

  const handleAddSong = async (song: SearchSong) => {
    if (!snapshot || !userIdRef.current) {
      return;
    }

    setActionError("");
    setSnapshot((current) => (current ? withOptimisticTrack(current, song, userIdRef.current as string) : current));

    const { error: addError } = await supabase.rpc("add_track_to_room", {
      p_room_id: snapshot.room.id,
      p_provider: song.provider,
      p_provider_track_id: song.providerTrackId,
      p_title: song.title,
      p_artist: song.artist,
      p_thumbnail_url: song.thumbnailUrl,
      p_duration_seconds: song.durationSeconds,
    });

    if (addError) {
      await refreshSnapshot();
      throw new Error(addError.message);
    }

    await refreshSnapshot();
  };

  const handleVote = async (roomTrackId: string) => {
    if (!snapshot) {
      return;
    }

    setActionError("");
    setSnapshot((current) => (current ? withOptimisticVote(current, roomTrackId) : current));

    const { data, error: voteError } = await supabase
      .rpc("upvote_track", { p_room_track_id: roomTrackId })
      .single();

    const voteResult = (data ?? null) as VoteResult | null;

    if (voteError || !voteResult?.applied) {
      await refreshSnapshot();
      setActionError(voteError?.message ?? "Permanent vote already used on this track.");
      return;
    }

    await refreshSnapshot();
  };

  const handleRemove = async (roomTrackId: string) => {
    if (!snapshot) {
      return;
    }

    setActionError("");
    setSnapshot((current) => (current ? withOptimisticRemoval(current, roomTrackId) : current));

    const { error: removeError } = await supabase.rpc("remove_track_from_room", {
      p_room_track_id: roomTrackId,
    });

    if (removeError) {
      await refreshSnapshot();
      setActionError(removeError.message);
      return;
    }

    await refreshSnapshot();
  };

  const handleTogglePlayback = async (action: "pause" | "resume", positionSeconds: number) => {
    if (!snapshot || !userIdRef.current) {
      return;
    }

    setActionError("");
    setSnapshot((current) =>
      current
        ? withOptimisticPlayback(
            current,
            {
              is_playing: action === "resume",
              position_seconds: positionSeconds,
            },
            userIdRef.current as string,
          )
        : current,
    );

    const { error: playbackError } = await supabase.rpc("set_room_playback", {
      p_room_id: snapshot.room.id,
      p_action: action,
      p_position_seconds: positionSeconds,
    });

    if (playbackError) {
      await refreshSnapshot();
      setActionError(playbackError.message);
      return;
    }

    await refreshSnapshot();
  };

  const handleSeek = async (positionSeconds: number) => {
    if (!snapshot || !userIdRef.current) {
      return;
    }

    setActionError("");
    setSnapshot((current) =>
      current
        ? withOptimisticPlayback(
            current,
            {
              position_seconds: positionSeconds,
            },
            userIdRef.current as string,
          )
        : current,
    );

    const { error: seekError } = await supabase.rpc("set_room_playback", {
      p_room_id: snapshot.room.id,
      p_action: "seek",
      p_position_seconds: positionSeconds,
    });

    if (seekError) {
      await refreshSnapshot();
      setActionError(seekError.message);
      return;
    }

    await refreshSnapshot();
  };

  const handleSkip = async () => {
    if (!snapshot) {
      return;
    }

    setActionError("");
    const { error: skipError } = await supabase.rpc("skip_current_track", {
      p_room_id: snapshot.room.id,
    });

    if (skipError) {
      setActionError(skipError.message);
      return;
    }

    await refreshSnapshot();
  };

  const handleCopyCode = async () => {
    if (!snapshot) {
      return;
    }

    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setCopyState("copied");

      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }

      copyTimerRef.current = window.setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    } catch {
      setActionError("Room code copy failed.");
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel rounded-[28px] px-6 py-5 text-sm text-[var(--text-muted)]">
          Joining room...
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel max-w-md rounded-[28px] p-6 text-center">
          <p className="section-kicker">Room error</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--text)]">
            {error || "This room is unavailable."}
          </h1>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
          >
            Back home
          </button>
        </div>
      </main>
    );
  }

  const sections = buildRoomSections(snapshot.tracks);
  const isHost = snapshot.role === "host";

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="grid gap-4 border-b border-[var(--line)] pb-5 xl:grid-cols-[0.78fr_1fr_1fr] xl:items-center">
          <div className="flex items-center justify-between xl:justify-start">
            <Link href="/" className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              QBeat
            </Link>
            <span className="text-sm text-[var(--text-muted)] xl:hidden">{snapshot.role}</span>
          </div>

          <div className="text-center">
            <p className="section-kicker">Live room</p>
            <h1 className="display-font mt-2 text-4xl text-[var(--text)] sm:text-5xl">
              Room {snapshot.room.code}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Share the code and shape the queue together.
            </p>
          </div>

          <div className="space-y-3 xl:text-right">
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <span className="badge-chip">{nickname}</span>
              <span className="badge-chip">{snapshot.role}</span>
              <span className="badge-chip">{appConfig.voteMode}</span>
            </div>
            <p className="text-sm leading-6 text-[var(--text-muted)]">
              {isHost ? "You control playback." : "The host controls playback."} Rooms expire after{" "}
              {appConfig.roomExpiryHours} hours of inactivity.
            </p>
            <div className="flex xl:justify-end">
              <button
                type="button"
                onClick={handleCopyCode}
                className="rounded-full border border-[var(--line-strong)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-white/40"
              >
                {copyState === "copied" ? "Code copied" : "Copy room code"}
              </button>
            </div>
          </div>
        </header>

        {actionError ? (
          <div className="rounded-[24px] border border-[rgba(194,64,50,0.18)] bg-[rgba(194,64,50,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            {actionError}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr] xl:items-start">
          <section className="order-1 space-y-5">
            <Search onAddSong={handleAddSong} />
            <Player
              currentTrack={sections.currentTrack}
              playbackState={snapshot.playbackState}
              isHost={isHost}
              onTogglePlayback={handleTogglePlayback}
              onSeek={handleSeek}
              onSkip={handleSkip}
            />
          </section>

          <aside className="order-2">
            <Queue
              upNextTrack={sections.upNextTrack}
              queuedTracks={sections.queuedTracks}
              playedTracks={sections.playedTracks}
              votedTrackIds={snapshot.votedTrackIds}
              isHost={isHost}
              onVote={handleVote}
              onRemove={handleRemove}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
