// Store active rooms in memory (temporary solution)
const activeRooms = new Map<string, {
  createdAt: number;
  lastActive: number;
  creator: string;
}>();

// Clean up rooms that haven't been active for more than 24 hours
export async function cleanupOldRooms() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  for (const [id, room] of activeRooms.entries()) {
    if (now - room.lastActive > oneDay) {
      activeRooms.delete(id);
    }
  }
}

// Get room data
export async function getRoom(id: string) {
  return activeRooms.get(id);
}

// Create a new room
export async function createRoom(id: string, creator: string) {
  const now = Date.now();
  activeRooms.set(id, {
    createdAt: now,
    lastActive: now,
    creator
  });
  return getRoom(id);
}

// Update room's last active timestamp
export async function updateRoomActivity(id: string) {
  const room = activeRooms.get(id);
  if (room) {
    room.lastActive = Date.now();
    activeRooms.set(id, room);
  }
  return room;
} 