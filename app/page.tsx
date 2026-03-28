"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { appConfig, getEnabledProviders } from "@/lib/qbeat/config";
import { ensureAnonymousSession } from "@/lib/qbeat/auth";
import { getStoredNickname, setStoredNickname } from "@/lib/qbeat/local-storage";
import { createRoom, joinRoom } from "@/lib/qbeat/room-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PendingAction = "create" | "join" | null;

const roomFlow = [
  {
    title: "Create a room",
    copy: "Start a shared room and instantly get a short code you can send to everyone else.",
  },
  {
    title: "Add songs together",
    copy: "Anyone in the room can search and add tracks from the enabled music provider.",
  },
  {
    title: "Votes choose the order",
    copy: "Permanent upvotes push stronger songs toward the front of the queue.",
  },
];

const queueStates = [
  {
    title: "Currently playing",
    copy: "The live song at the center of the room right now.",
  },
  {
    title: "Up next",
    copy: "The immediate next track ready to take over after the current song.",
  },
  {
    title: "Queue",
    copy: "The rest of the tracks still competing for position through votes.",
  },
  {
    title: "Played",
    copy: "The room history after songs are finished or skipped.",
  },
];

export default function Home() {
  const router = useRouter();
  const enabledProviders = useMemo(() => getEnabledProviders(), []);
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNickname(getStoredNickname());
  }, []);

  const providerLabels = enabledProviders.map((provider) => appConfig.providers[provider].label);

  const persistNickname = () => {
    const trimmed = nickname.trim();

    if (!trimmed) {
      throw new Error("Enter a nickname before creating or joining a room.");
    }

    setStoredNickname(trimmed);
    return trimmed;
  };

  const handleCreateRoom = async () => {
    setPendingAction("create");
    setError("");

    try {
      const trimmedNickname = persistNickname();
      const supabase = getSupabaseBrowserClient();
      await ensureAnonymousSession(supabase);
      const createdRoom = await createRoom(supabase, trimmedNickname);
      router.push(`/room/${createdRoom.room_code}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to create room.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleJoinRoom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingAction("join");
    setError("");

    try {
      const trimmedNickname = persistNickname();
      const supabase = getSupabaseBrowserClient();
      await ensureAnonymousSession(supabase);
      const joinedRoom = await joinRoom(supabase, roomCode.trim().toUpperCase(), trimmedNickname);
      router.push(`/room/${joinedRoom.room_code}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to join room.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[100svh] max-w-7xl flex-col">
        <header className="flex items-center justify-between py-6 sm:py-8">
          <Link href="/" className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            QBeat
          </Link>
          <p className="hidden text-sm text-[var(--text-muted)] sm:block">
            Collaborative music rooms
          </p>
        </header>

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-xl space-y-8 text-center">
            <div className="space-y-4">
              <p className="section-kicker">Create or join</p>
              <h1 className="display-font text-5xl leading-[0.94] text-[var(--text)] sm:text-6xl">
                Build a room and let the queue move with the crowd.
              </h1>
              <p className="mx-auto max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
                Start with a nickname, create a room, or join one with a shared code.
              </p>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-col gap-5 text-left">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Nickname
                </span>
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="What should the room call you?"
                  className="w-full border-0 border-b border-[var(--line-strong)] bg-transparent px-0 py-3 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-0"
                />
              </label>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={pendingAction !== null}
                className="rounded-full bg-[var(--text)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pendingAction === "create" ? "Creating room..." : "Create room"}
              </button>

              <div className="flex items-center gap-4 pt-1">
                <div className="h-px flex-1 bg-[var(--line)]" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  or join
                </span>
                <div className="h-px flex-1 bg-[var(--line)]" />
              </div>

              <form className="space-y-4" onSubmit={handleJoinRoom}>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Room code
                  </span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={appConfig.roomCodeLength}
                    className="w-full border-0 border-b border-[var(--line-strong)] bg-transparent px-0 py-3 text-base uppercase text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--secondary)] focus:ring-0"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pendingAction !== null}
                  className="w-full rounded-full border border-[var(--line-strong)] bg-transparent px-5 py-3.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {pendingAction === "join" ? "Joining room..." : "Join room"}
                </button>
              </form>

              {error ? (
                <div className="rounded-[22px] border border-[rgba(194,64,50,0.18)] bg-[rgba(194,64,50,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              ) : null}

              <p className="text-center text-sm text-[var(--text-muted)]">
                {providerLabels.join(", ")} enabled. {appConfig.voteMode} voting. Rooms expire after{" "}
                {appConfig.roomExpiryHours} hours of inactivity.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col gap-12 pb-16 pt-6 sm:gap-16 sm:pb-20">
        <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <div className="glass-panel rounded-[32px] p-6 sm:p-8">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="section-kicker">How it works</p>
                <h2 className="text-3xl font-semibold text-[var(--text)]">
                  A clean room flow from creation to playback.
                </h2>
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  The first screen stays focused on room access. Once people are inside, the app
                  shifts into a shared queue built for live collaboration.
                </p>
              </div>

              <div className="grid gap-3">
                {roomFlow.map((step, index) => (
                  <article key={step.title} className="soft-card rounded-[28px] p-5">
                    <p className="section-kicker">Step {index + 1}</p>
                    <h3 className="mt-3 text-lg font-semibold text-[var(--text)]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{step.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[32px] p-6 sm:p-8">
            <div className="space-y-5">
              <div className="space-y-3">
                <p className="section-kicker">Queue states</p>
                <h2 className="text-3xl font-semibold text-[var(--text)]">
                  Every room keeps the same shared structure.
                </h2>
                <p className="text-sm leading-6 text-[var(--text-muted)]">
                  Songs always live in one of four states so the room stays easy to follow on every
                  screen size.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {queueStates.map((state) => (
                  <article key={state.title} className="soft-card rounded-[28px] p-5">
                    <p className="text-lg font-semibold text-[var(--text)]">{state.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{state.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <article className="glass-panel rounded-[30px] p-5 sm:p-6">
            <p className="section-kicker">Realtime voting</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Votes change the room immediately.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              As soon as someone votes, the room order updates for everyone watching the queue.
            </p>
          </article>

          <article className="glass-panel rounded-[30px] p-5 sm:p-6">
            <p className="section-kicker">Host playback</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              One host controls the live player.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              The host can play, pause, seek, skip, and clean up the queue while everyone else
              shapes what comes next.
            </p>
          </article>

          <article className="glass-panel rounded-[30px] p-5 sm:p-6">
            <p className="section-kicker">Provider setup</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--text)]">
              Config-driven provider support.
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              You can enable or disable music providers in one config layer without changing the
              overall room flow.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
