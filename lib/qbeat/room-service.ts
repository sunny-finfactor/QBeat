import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  JoinedRoomResult,
  PlaybackState,
  RoomSnapshot,
  RoomSummary,
  RoomTrack,
  SearchSong,
} from "@/app/types";
import { buildSnapshot, buildRoomSections } from "@/lib/qbeat/room-state";

const ROOM_SELECT = "id, code, status, host_user_id, created_at, updated_at, last_activity_at";
const TRACK_SELECT =
  "id, room_id, provider, provider_track_id, title, artist, thumbnail_url, duration_seconds, status, vote_count, added_by, added_at, started_at, finished_at";
const PLAYBACK_SELECT =
  "room_id, current_track_id, is_playing, position_seconds, sync_anchor_at, updated_at, updated_by";

function toMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

export async function createRoom(client: SupabaseClient, nickname: string) {
  const { data, error } = await client.rpc("create_room", { p_nickname: nickname }).single();

  if (error || !data) {
    throw new Error(toMessage(error, "Room creation failed."));
  }

  return data as JoinedRoomResult;
}

export async function joinRoom(client: SupabaseClient, roomCode: string, nickname: string) {
  const { data, error } = await client
    .rpc("join_room", { p_code: roomCode, p_nickname: nickname })
    .single();

  if (error || !data) {
    throw new Error(toMessage(error, "Room join failed."));
  }

  return data as JoinedRoomResult;
}

export async function fetchRoomSnapshot(
  client: SupabaseClient,
  roomId: string,
  userId: string,
  role: RoomSnapshot["role"],
) {
  const [roomResult, tracksResult, playbackResult, votesResult] = await Promise.all([
    client.from("rooms").select(ROOM_SELECT).eq("id", roomId).single(),
    client.from("room_tracks").select(TRACK_SELECT).eq("room_id", roomId),
    client.from("playback_state").select(PLAYBACK_SELECT).eq("room_id", roomId).single(),
    client.from("track_votes").select("room_track_id").eq("room_id", roomId).eq("user_id", userId),
  ]);

  if (roomResult.error || !roomResult.data) {
    throw new Error(toMessage(roomResult.error, "Failed to load room."));
  }

  if (tracksResult.error) {
    throw new Error(toMessage(tracksResult.error, "Failed to load room tracks."));
  }

  if (playbackResult.error || !playbackResult.data) {
    throw new Error(toMessage(playbackResult.error, "Failed to load playback state."));
  }

  if (votesResult.error) {
    throw new Error(toMessage(votesResult.error, "Failed to load vote state."));
  }

  return buildSnapshot(
    roomResult.data as RoomSummary,
    (tracksResult.data ?? []) as RoomTrack[],
    playbackResult.data as PlaybackState,
    (votesResult.data ?? []).map((vote) => vote.room_track_id),
    role,
  );
}

export function withOptimisticTrack(snapshot: RoomSnapshot, song: SearchSong, userId: string) {
  const sections = buildRoomSections(snapshot.tracks);
  const now = new Date().toISOString();
  const status = !sections.currentTrack
    ? "currently_playing"
    : !sections.upNextTrack
      ? "up_next"
      : "queued";
  const optimisticTrack: RoomTrack = {
    id: `optimistic-${song.provider}-${song.providerTrackId}-${Date.now()}`,
    room_id: snapshot.room.id,
    provider: song.provider,
    provider_track_id: song.providerTrackId,
    title: song.title,
    artist: song.artist,
    thumbnail_url: song.thumbnailUrl,
    duration_seconds: song.durationSeconds,
    status,
    vote_count: 0,
    added_by: userId,
    added_at: now,
    started_at: status === "currently_playing" ? now : null,
    finished_at: null,
  };

  const nextPlaybackState =
    status === "currently_playing"
      ? {
          ...snapshot.playbackState,
          current_track_id: optimisticTrack.id,
          is_playing: true,
          position_seconds: 0,
          sync_anchor_at: now,
          updated_at: now,
          updated_by: userId,
        }
      : snapshot.playbackState;

  return buildSnapshot(
    snapshot.room,
    [...snapshot.tracks, optimisticTrack],
    nextPlaybackState,
    snapshot.votedTrackIds,
    snapshot.role,
  );
}

export function withOptimisticVote(snapshot: RoomSnapshot, roomTrackId: string) {
  if (snapshot.votedTrackIds.includes(roomTrackId)) {
    return snapshot;
  }

  return buildSnapshot(
    snapshot.room,
    snapshot.tracks.map((track) =>
      track.id === roomTrackId ? { ...track, vote_count: track.vote_count + 1 } : track,
    ),
    snapshot.playbackState,
    [...snapshot.votedTrackIds, roomTrackId],
    snapshot.role,
  );
}

export function withOptimisticRemoval(snapshot: RoomSnapshot, roomTrackId: string) {
  return buildSnapshot(
    snapshot.room,
    snapshot.tracks.filter((track) => track.id !== roomTrackId),
    snapshot.playbackState,
    snapshot.votedTrackIds.filter((trackId) => trackId !== roomTrackId),
    snapshot.role,
  );
}
