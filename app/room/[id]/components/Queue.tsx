"use client";

import Image from "next/image";
import type { RoomTrack } from "@/app/types";
import { canVoteForTrack } from "@/lib/qbeat/room-state";

interface QueueProps {
  upNextTrack: RoomTrack | null;
  queuedTracks: RoomTrack[];
  playedTracks: RoomTrack[];
  votedTrackIds: string[];
  isHost: boolean;
  onVote: (roomTrackId: string) => Promise<void>;
  onRemove: (roomTrackId: string) => Promise<void>;
}

interface TrackRowProps {
  track: RoomTrack;
  votedTrackIds: string[];
  isHost: boolean;
  onVote: (roomTrackId: string) => Promise<void>;
  onRemove: (roomTrackId: string) => Promise<void>;
  showVoting: boolean;
}

function formatDuration(durationSeconds: number | null) {
  if (!durationSeconds) {
    return "Unknown";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function TrackRow({
  track,
  votedTrackIds,
  isHost,
  onVote,
  onRemove,
  showVoting,
}: TrackRowProps) {
  const alreadyVoted = votedTrackIds.includes(track.id);
  const canVote = showVoting && canVoteForTrack(track, votedTrackIds);

  return (
    <article className="soft-card rounded-[24px] p-4">
      <div className="flex gap-3">
        <Image
          src={track.thumbnail_url}
          alt={track.title}
          width={52}
          height={52}
          className="h-[52px] w-[52px] rounded-[16px] object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{track.title}</p>
          <p className="truncate text-sm text-[var(--text-muted)]">{track.artist}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {track.provider} · {formatDuration(track.duration_seconds)} · {track.vote_count} votes
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {showVoting ? (
              <button
                type="button"
                onClick={() => onVote(track.id)}
                disabled={!canVote}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                  canVote
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"
                    : "cursor-not-allowed border border-[var(--line)] bg-white text-[var(--text-muted)]"
                }`}
              >
                {alreadyVoted ? "Voted" : "Upvote"}
              </button>
            ) : null}

            {isHost && showVoting ? (
              <button
                type="button"
                onClick={() => onRemove(track.id)}
                className="rounded-full border border-[rgba(194,64,50,0.22)] px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[rgba(194,64,50,0.08)]"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionShell({
  title,
  count,
  description,
  children,
}: {
  title: string;
  count: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[28px] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">{title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function Queue({
  upNextTrack,
  queuedTracks,
  playedTracks,
  votedTrackIds,
  isHost,
  onVote,
  onRemove,
}: QueueProps) {
  return (
    <div className="space-y-4">
      <SectionShell
        title="Up next"
        count={upNextTrack ? "1 song" : "Empty"}
        description="The immediate next song ready to take over after the current track."
      >
        {upNextTrack ? (
          <TrackRow
            track={upNextTrack}
            votedTrackIds={votedTrackIds}
            isHost={isHost}
            onVote={onVote}
            onRemove={onRemove}
            showVoting
          />
        ) : (
          <div className="rounded-[22px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--text-muted)]">
            Nothing is waiting in the up next slot yet.
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Queue"
        count={`${queuedTracks.length} songs`}
        description="The rest of the room queue. Permanent votes decide which one climbs."
      >
        <div className="space-y-3 xl:max-h-[20rem] xl:overflow-y-auto xl:pr-1">
          {queuedTracks.length > 0 ? (
            queuedTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                votedTrackIds={votedTrackIds}
                isHost={isHost}
                onVote={onVote}
                onRemove={onRemove}
                showVoting
              />
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--text-muted)]">
              The queue is empty behind the up next slot.
            </div>
          )}
        </div>
      </SectionShell>

      <SectionShell
        title="Played"
        count={`${playedTracks.length} songs`}
        description="Songs that already passed through this room session."
      >
        <div className="space-y-3 xl:max-h-[16rem] xl:overflow-y-auto xl:pr-1">
          {playedTracks.length > 0 ? (
            playedTracks.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                votedTrackIds={votedTrackIds}
                isHost={false}
                onVote={onVote}
                onRemove={onRemove}
                showVoting={false}
              />
            ))
          ) : (
            <div className="rounded-[22px] border border-dashed border-[var(--line)] px-4 py-5 text-sm text-[var(--text-muted)]">
              Played songs will appear here after the room starts moving.
            </div>
          )}
        </div>
      </SectionShell>
    </div>
  );
}
