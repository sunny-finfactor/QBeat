import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

interface PlaybackState {
  currentSongId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdate: number;
}

interface Song {
  id: string;
  name: string;
  artist: string;
  image: string;
  youtubeId: string;
  votes?: number;
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(request: NextRequest) {
  const id = request.nextUrl.pathname.split('/')[3];
  let isStreamActive = true;
  let lastQueueHash = '';
  let lastPlaybackStateHash = '';

  // Set up SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial state
      try {
        const queue = await redis.get(`room:${id}:queue`) || [];
        const playbackState = await redis.get(`room:${id}:playbackState`) || {
          currentSongId: null,
          isPlaying: false,
          currentTime: 0,
          lastUpdate: Date.now()
        };

        if (isStreamActive) {
          lastQueueHash = JSON.stringify(queue);
          lastPlaybackStateHash = JSON.stringify(playbackState);

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'queue-update',
            data: { queue }
          })}\n\n`));

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'playback-state',
            data: playbackState
          })}\n\n`));
        }
      } catch (error) {
        console.error('Error sending initial state:', error);
        if (isStreamActive) {
          controller.close();
        }
        return;
      }

      // Set up polling interval
      const pollInterval = setInterval(async () => {
        if (!isStreamActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const queue = await redis.get(`room:${id}:queue`) || [];
          const playbackState = await redis.get(`room:${id}:playbackState`) || {
            currentSongId: null,
            isPlaying: false,
            currentTime: 0,
            lastUpdate: Date.now()
          };

          const currentQueueHash = JSON.stringify(queue);
          const currentPlaybackStateHash = JSON.stringify(playbackState);

          // Only send updates if there are changes
          if (isStreamActive && currentQueueHash !== lastQueueHash) {
            lastQueueHash = currentQueueHash;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'queue-update',
              data: { queue }
            })}\n\n`));
          }

          if (isStreamActive && currentPlaybackStateHash !== lastPlaybackStateHash) {
            lastPlaybackStateHash = currentPlaybackStateHash;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'playback-state',
              data: playbackState
            })}\n\n`));
          }
        } catch (error) {
          console.error('Error polling for updates:', error);
          if (isStreamActive) {
            controller.close();
          }
        }
      }, 2000); // Poll every 2 seconds instead of every second

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        isStreamActive = false;
        clearInterval(pollInterval);
        if (controller.desiredSize !== null) {
          controller.close();
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 