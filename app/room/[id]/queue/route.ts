import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(req: Request, context: Promise<{ params: { id: string } }>) {
  const { params } = await context;
  const roomId = params.id;

  if (!roomId) {
    return NextResponse.json({ error: "Missing roomId" }, { status: 400 });
  }

  const queueRaw = await redis.lrange(`queue:${roomId}`, 0, -1);
  const queue = queueRaw.map((item) => JSON.parse(item));
  return NextResponse.json(queue);
}
