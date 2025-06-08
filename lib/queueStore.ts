// lib/queueStore.ts
type Song = {
  id: string;
  name: string;
  artist: string;
  image: string;
};

// In-memory queue object: key = roomId, value = list of songs
export const roomQueues: Record<string, Song[]> = {};
