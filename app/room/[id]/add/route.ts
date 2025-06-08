import { redis } from "@/lib/redis"; // import your redis client
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  const song = await req.json();

  // Push to queue
  await redis.rpush(`queue:${params.roomId}`, JSON.stringify(song));

  // Notify subscribers
  await redis.publish(`room:${params.roomId}:queueUpdate`, "new-song");

  return NextResponse.json({ success: true });
}
