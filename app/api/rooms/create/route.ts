import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function generateRoomCode(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export async function POST() {
  try {
    // Generate a unique room code
    const roomCode = generateRoomCode();

    // Initialize room state in Redis
    await redis.set(`room:${roomCode}:queue`, []);
    await redis.set(`room:${roomCode}:playbackState`, {
      currentSongId: null,
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    });

    return NextResponse.json({ roomCode });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: 'Failed to create room' },
      { status: 500 }
    );
  }
} 