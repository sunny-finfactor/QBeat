import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

type RoomEvent = {
  type: 'queue-update' | 'playback-state';
  data: any;
};

export async function subscribeToRoom(roomId: string, onMessage: (event: RoomEvent) => void) {
  const channel = `room:${roomId}`;
  
  // Subscribe to Redis channel
  const subscriber = redis.subscribe(channel);
  
  // Handle messages
  subscriber.on('message', (event) => {
    try {
      const message = event.message as string;
      const parsedEvent = JSON.parse(message) as RoomEvent;
      onMessage(parsedEvent);
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  });

  return () => {
    subscriber.unsubscribe();
  };
}

export async function publishToRoom(roomId: string, event: RoomEvent) {
  const channel = `room:${roomId}`;
  await redis.publish(channel, JSON.stringify(event));
} 