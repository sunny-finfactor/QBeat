"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PlaybackState, RoomTrack } from "@/app/types";
import { derivePlaybackPosition } from "@/lib/qbeat/room-state";

interface PlayerProps {
  currentTrack: RoomTrack | null;
  playbackState: PlaybackState | null;
  isHost: boolean;
  onTogglePlayback: (action: "pause" | "resume", positionSeconds: number) => Promise<void>;
  onSeek: (positionSeconds: number) => Promise<void>;
  onSkip: () => Promise<void>;
}

function formatTime(value: number) {
  const safeValue = Math.max(0, Math.floor(value));
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Player({
  currentTrack,
  playbackState,
  isHost,
  onTogglePlayback,
  onSeek,
  onSkip,
}: PlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);
  const onSkipRef = useRef(onSkip);
  const volumeRef = useRef(85);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(85);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const cleanup = () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }

      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };

    const ensurePlayer = () => {
      if (playerRef.current) {
        return;
      }

      playerRef.current = new window.YT.Player("qbeat-youtube-player", {
        height: "0",
        width: "0",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.setVolume(volumeRef.current);
          },
          onStateChange: (event) => {
            if (!playerRef.current) {
              return;
            }

            if (event.data === window.YT.PlayerState.PLAYING) {
              setDuration(playerRef.current.getDuration() || 0);
            }

            if (event.data === window.YT.PlayerState.ENDED && isHost) {
              void onSkipRef.current();
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      ensurePlayer();
    } else {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
      window.onYouTubeIframeAPIReady = ensurePlayer;
    }

    return cleanup;
  }, [isHost]);

  useEffect(() => {
    if (!playerRef.current || !readyRef.current) {
      return;
    }

    playerRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
    }

    progressTimerRef.current = window.setInterval(() => {
      if (!playerRef.current || !readyRef.current) {
        return;
      }

      setCurrentTime(playerRef.current.getCurrentTime() || 0);
      setDuration(playerRef.current.getDuration() || 0);
    }, 500);

    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentTrack || !playbackState || !playerRef.current || !readyRef.current) {
      return;
    }

    const player = playerRef.current;
    const targetPosition = derivePlaybackPosition(playbackState);
    const activeTrackChanged = lastTrackIdRef.current !== currentTrack.id;

    if (activeTrackChanged) {
      lastTrackIdRef.current = currentTrack.id;
      if (currentTrack.provider === "youtube") {
        player.loadVideoById(currentTrack.provider_track_id, targetPosition);
      }

      if (!playbackState.is_playing) {
        window.setTimeout(() => {
          player.pauseVideo();
          player.seekTo(targetPosition, true);
        }, 120);
      }

      return;
    }

    const livePosition = player.getCurrentTime() || 0;
    const drift = Math.abs(livePosition - targetPosition);
    const playerState = player.getPlayerState();

    if (drift > 1.5) {
      player.seekTo(targetPosition, true);
    }

    if (playbackState.is_playing && playerState !== window.YT.PlayerState.PLAYING) {
      player.playVideo();
    }

    if (!playbackState.is_playing && playerState === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    }
  }, [currentTrack, playbackState]);

  if (!currentTrack) {
    return (
      <section className="glass-panel overflow-hidden rounded-[40px]">
        <div className="relative isolate min-h-[520px] overflow-hidden rounded-[40px] px-6 py-8 sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,98,61,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(20,117,110,0.14),transparent_30%),linear-gradient(145deg,rgba(255,255,255,0.88),rgba(255,248,239,0.76))]" />
          <div className="relative flex h-full min-h-[440px] flex-col items-center justify-center text-center">
            <div className="mb-8 flex h-40 w-40 items-center justify-center rounded-[36px] border border-[rgba(255,255,255,0.6)] bg-[rgba(255,255,255,0.42)] shadow-[var(--shadow)] backdrop-blur">
              <div className="h-20 w-20 rounded-full border border-[var(--line)] bg-[rgba(36,22,15,0.06)]" />
            </div>
            <p className="section-kicker">Currently playing</p>
            <h2 className="mt-4 text-3xl font-semibold text-[var(--text)]">
              The room is waiting for the first song.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              Add a track from the search bar. Once the room has its first song, this panel turns
              into the live player for everyone.
            </p>
          </div>
        </div>
        <div id="qbeat-youtube-player" className="hidden" />
      </section>
    );
  }

  const derivedPosition = playbackState ? derivePlaybackPosition(playbackState) : currentTime;
  const isPlaying = playbackState?.is_playing ?? false;
  const displayDuration = duration || currentTrack.duration_seconds || 0;
  const handleJump = (deltaSeconds: number) => {
    const currentPosition = playerRef.current?.getCurrentTime() ?? derivedPosition;
    const nextPosition = Math.max(0, Math.min(currentPosition + deltaSeconds, Math.max(displayDuration, 0)));

    setCurrentTime(nextPosition);

    if (playerRef.current && readyRef.current) {
      playerRef.current.seekTo(nextPosition, true);
    }

    if (isHost) {
      void onSeek(nextPosition);
    }
  };

  return (
    <section className="glass-panel overflow-hidden rounded-[40px]">
      <div className="relative isolate overflow-hidden rounded-[40px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,98,61,0.18),transparent_24%),radial-gradient(circle_at_85%_18%,rgba(20,117,110,0.15),transparent_24%),linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,248,239,0.82))]" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="badge-chip bg-[rgba(239,98,61,0.1)] text-[var(--accent-strong)]">
              Currently Playing
            </span>
            <span className="badge-chip">{currentTrack.provider}</span>
            <span className="badge-chip">{isPlaying ? "Live" : "Paused"}</span>
          </div>

          <div className="mt-8 flex flex-col items-center text-center">
            <div className="relative w-full max-w-[320px] sm:max-w-[380px] lg:max-w-[420px]">
              <div className="absolute inset-4 rounded-[40px] bg-[rgba(239,98,61,0.16)] blur-3xl" />
              <div className="relative overflow-hidden rounded-[40px] border border-[rgba(255,255,255,0.58)] bg-[rgba(255,255,255,0.36)] p-3 shadow-[var(--shadow)] backdrop-blur">
                <Image
                  src={currentTrack.thumbnail_url}
                  alt={currentTrack.title}
                  width={420}
                  height={420}
                  className="aspect-square w-full rounded-[30px] object-cover"
                />
              </div>
            </div>

            <div className="mt-6 flex w-full max-w-3xl flex-col items-center space-y-3">
              <h2 className="text-3xl font-semibold leading-tight text-[var(--text)] sm:text-4xl lg:text-5xl">
                {currentTrack.title}
              </h2>
              <p className="text-base text-[var(--text-muted)] sm:text-lg">{currentTrack.artist}</p>
              <p className="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                {isHost
                  ? "You are controlling the live playback state for everyone in the room."
                  : "The host is controlling playback while the room votes on what comes next."}
              </p>

              {currentTrack.provider !== "youtube" ? (
                <div className="mt-2 rounded-[22px] border border-[var(--line)] bg-white/70 px-4 py-3 text-sm text-[var(--text-muted)]">
                  This build currently renders playback only through the YouTube player.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative border-t border-[var(--line)] bg-[rgba(255,255,255,0.56)] px-6 py-5 backdrop-blur sm:px-8">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
                <span>{formatTime(derivedPosition)}</span>
                <span>{formatTime(displayDuration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(displayDuration, Math.ceil(derivedPosition), 1)}
                value={Math.min(derivedPosition, Math.max(displayDuration, 1))}
                step="1"
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setCurrentTime(nextValue);
                  if (playerRef.current && readyRef.current) {
                    playerRef.current.seekTo(nextValue, true);
                  }
                }}
                onMouseUp={(event) => {
                  if (!isHost) {
                    return;
                  }

                  void onSeek(Number((event.target as HTMLInputElement).value));
                }}
                onTouchEnd={(event) => {
                  if (!isHost) {
                    return;
                  }

                  void onSeek(Number((event.target as HTMLInputElement).value));
                }}
                disabled={!isHost}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[rgba(36,22,15,0.12)] accent-[var(--accent)] disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => handleJump(-10)}
                  className={`flex h-12 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
                    isHost
                      ? "border border-[var(--line-strong)] bg-white/50 text-[var(--text)] hover:border-[var(--accent)] hover:bg-white/80"
                      : "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--text-muted)]"
                  }`}
                >
                  -10s
                </button>

                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() =>
                    void onTogglePlayback(isPlaying ? "pause" : "resume", playerRef.current?.getCurrentTime() ?? 0)
                  }
                  className={`flex h-14 min-w-[9rem] items-center justify-center rounded-full px-6 text-sm font-semibold transition ${
                    isHost
                      ? "bg-[var(--text)] text-white shadow-[var(--shadow-soft)] hover:bg-[var(--accent-strong)]"
                      : "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--text-muted)]"
                  }`}
                >
                  {isPlaying ? "Pause Room" : "Play Room"}
                </button>

                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => handleJump(10)}
                  className={`flex h-12 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
                    isHost
                      ? "border border-[var(--line-strong)] bg-white/50 text-[var(--text)] hover:border-[var(--accent)] hover:bg-white/80"
                      : "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--text-muted)]"
                  }`}
                >
                  +10s
                </button>

                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => void onSkip()}
                  className={`flex h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition ${
                    isHost
                      ? "border border-[var(--line-strong)] bg-transparent text-[var(--text)] hover:border-[var(--accent)] hover:bg-white/40"
                      : "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--text-muted)]"
                  }`}
                >
                  Skip Track
                </button>
              </div>

              <div className="flex items-center justify-center gap-4 lg:justify-end">
                <span className="text-sm font-medium text-[var(--text-muted)]">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="h-2 w-36 cursor-pointer appearance-none rounded-full bg-[rgba(36,22,15,0.12)] accent-[var(--accent)]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="qbeat-youtube-player" className="hidden" />
    </section>
  );
}
