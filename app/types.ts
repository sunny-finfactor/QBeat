export type MemberRole = "host" | "listener";

export type RoomStatus = "active" | "expired" | "closed";

export type MusicProvider = "youtube" | "spotify";

export type RoomTrackStatus =
  | "currently_playing"
  | "up_next"
  | "queued"
  | "played";

export interface SearchSong {
  provider: MusicProvider;
  providerTrackId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

export interface RoomSummary {
  id: string;
  code: string;
  status: RoomStatus;
  host_user_id: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

export interface RoomTrack {
  id: string;
  room_id: string;
  provider: MusicProvider;
  provider_track_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  status: RoomTrackStatus;
  vote_count: number;
  added_by: string;
  added_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface PlaybackState {
  room_id: string;
  current_track_id: string | null;
  is_playing: boolean;
  position_seconds: number;
  sync_anchor_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface JoinedRoomResult {
  room_id: string;
  room_code: string;
  role: MemberRole;
}

export interface VoteResult {
  applied: boolean;
  room_id: string;
}

export interface RoomSnapshot {
  room: RoomSummary;
  tracks: RoomTrack[];
  playbackState: PlaybackState;
  votedTrackIds: string[];
  role: MemberRole;
}

export interface RoomSections {
  currentTrack: RoomTrack | null;
  upNextTrack: RoomTrack | null;
  queuedTracks: RoomTrack[];
  playedTracks: RoomTrack[];
}
