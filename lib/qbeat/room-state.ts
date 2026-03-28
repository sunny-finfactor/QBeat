import type {
  PlaybackState,
  RoomSections,
  RoomSnapshot,
  RoomTrack,
  RoomTrackStatus,
  RoomSummary,
} from "@/app/types";

const QUEUE_ORDER: RoomTrackStatus[] = [
  "currently_playing",
  "up_next",
  "queued",
  "played",
];

function byDateAsc(a: string, b: string) {
  return new Date(a).getTime() - new Date(b).getTime();
}

function byDateDesc(a: string, b: string) {
  return new Date(b).getTime() - new Date(a).getTime();
}

export function sortRoomTracks(tracks: RoomTrack[]) {
  return [...tracks].sort((left, right) => {
    if (left.status !== right.status) {
      return QUEUE_ORDER.indexOf(left.status) - QUEUE_ORDER.indexOf(right.status);
    }

    if (left.status === "played" || right.status === "played") {
      return byDateDesc(left.finished_at ?? left.added_at, right.finished_at ?? right.added_at);
    }

    if (left.status === "currently_playing" || right.status === "currently_playing") {
      return byDateDesc(left.started_at ?? left.added_at, right.started_at ?? right.added_at);
    }

    if (left.vote_count !== right.vote_count) {
      return right.vote_count - left.vote_count;
    }

    return byDateAsc(left.added_at, right.added_at);
  });
}

export function buildRoomSections(tracks: RoomTrack[]): RoomSections {
  const ordered = sortRoomTracks(tracks);

  return {
    currentTrack: ordered.find((track) => track.status === "currently_playing") ?? null,
    upNextTrack: ordered.find((track) => track.status === "up_next") ?? null,
    queuedTracks: ordered.filter((track) => track.status === "queued"),
    playedTracks: ordered.filter((track) => track.status === "played"),
  };
}

export function derivePlaybackPosition(playbackState: PlaybackState | null) {
  if (!playbackState) {
    return 0;
  }

  if (!playbackState.is_playing) {
    return playbackState.position_seconds;
  }

  const anchorTime = new Date(playbackState.sync_anchor_at).getTime();
  const elapsedSeconds = Math.max(0, (Date.now() - anchorTime) / 1000);

  return playbackState.position_seconds + elapsedSeconds;
}

export function buildSnapshot(
  room: RoomSummary,
  tracks: RoomTrack[],
  playbackState: PlaybackState,
  votedTrackIds: string[],
  role: RoomSnapshot["role"],
): RoomSnapshot {
  return {
    room,
    tracks: sortRoomTracks(tracks),
    playbackState,
    votedTrackIds,
    role,
  };
}

export function canVoteForTrack(track: RoomTrack, votedTrackIds: string[]) {
  if (!["up_next", "queued"].includes(track.status)) {
    return false;
  }

  return !votedTrackIds.includes(track.id);
}
