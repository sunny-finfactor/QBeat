// app/room/[id]/subscribe/route.ts
// import { redis } from "@/lib/redis";
import { Redis } from "ioredis";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("roomId");
  if (!roomId) {
    return new Response("Missing roomId", { status: 400 });
  }
  const channel = `room:${roomId}:queue`;

  // Create a new Redis client for Pub/Sub
  const subscriber: Redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Subscribe to the channel
        await subscriber.subscribe(channel);
        console.log(`Subscribed to channel: ${channel}`);

        // Handle messages
        subscriber.on("message", (channel: string, message: string) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ channel, message })}\n\n`)
            );
          } catch (error) {
            console.error("Error encoding message:", error);
          }
        });

        // Handle errors
        subscriber.on("error", (error: Error) => {
          console.error("Redis subscriber error:", error);
          controller.error(error);
        });

        // Handle client disconnect
        req.signal.addEventListener("abort", () => {
          subscriber.unsubscribe(channel);
          subscriber.quit();
          console.log(`Unsubscribed from channel: ${channel}`);
          controller.close();
        });
      } catch (error) {
        console.error("Subscription error:", error);
        subscriber.quit();
        controller.error(error);
      }
    },
    cancel() {
      // Clean up when the stream is canceled
      subscriber.unsubscribe(channel);
      subscriber.quit();
      console.log(`Stream canceled, unsubscribed from channel: ${channel}`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}