import { redis } from '@/lib/redis';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { trackId } = await req.json();
  const key = `room:${params.id}:queue`;

  // Increment vote (score) of matching song
  const items = await redis.zrange<string[]>(key, 0, -1, { withScores: false });

for (const item of items) {
  const song = JSON.parse(item);
  if (song.id === trackId) {
    await redis.zincrby(key, 1, item as string);
    break;
  }
}

  return NextResponse.json({ success: true });
}
