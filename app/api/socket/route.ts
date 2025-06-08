import { NextResponse } from 'next/server';
import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

export type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

type Song = {
  id: string;
  name: string;
  artist: string;
  image: string;
  preview_url?: string;
  votes?: number;
};

type PlaybackState = {
  currentSongId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdate: number;
};

let io: SocketIOServer;
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Connection pool to track active connections
const connectionPool = new Map<string, Set<string>>();

// Helper functions for Redis operations
async function getRoomQueue(roomId: string): Promise<Song[]> {
  const queue = await redis.get<Song[]>(`room:${roomId}:queue`);
  return queue || [];
}

async function setRoomQueue(roomId: string, queue: Song[]): Promise<void> {
  await redis.set(`room:${roomId}:queue`, queue);
}

async function getRoomPlaybackState(roomId: string): Promise<PlaybackState> {
  const state = await redis.get<PlaybackState>(`room:${roomId}:playback`);
  return state || {
    currentSongId: null,
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now()
  };
}

async function setRoomPlaybackState(roomId: string, state: PlaybackState): Promise<void> {
  await redis.set(`room:${roomId}:playback`, state);
}

export async function GET(req: Request) {
  try {
    if (!io) {
      const httpServer = (global as any).httpServer;
      if (!httpServer) {
        throw new Error('HTTP server not initialized');
      }

      io = new SocketIOServer(httpServer, {
        path: '/api/socketio',
        addTrailingSlash: false,
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
        // Add performance optimizations
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        maxHttpBufferSize: 1e8,
        connectTimeout: 45000,
        // Add WebSocket specific options
        wsEngine: 'ws',
        allowEIO3: true,
        allowUpgrades: true,
        perMessageDeflate: {
          threshold: 2048
        }
      });

      io.on('connection', async (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('join-room', async (roomId: string) => {
          try {
            // Clean up any existing connections for this socket
            for (const [room, connections] of connectionPool.entries()) {
              if (connections.has(socket.id)) {
                connections.delete(socket.id);
                if (connections.size === 0) {
                  connectionPool.delete(room);
                }
              }
            }

            // Add to new room
            socket.join(roomId);
            if (!connectionPool.has(roomId)) {
              connectionPool.set(roomId, new Set());
            }
            connectionPool.get(roomId)?.add(socket.id);
            
            console.log(`Client ${socket.id} joined room: ${roomId}`);
            
            // Get room state from Redis
            const queue = await getRoomQueue(roomId);
            const playbackState = await getRoomPlaybackState(roomId);

            // Send current state to the new user
            socket.emit('queue-update', queue);
            socket.emit('playback-state-update', playbackState);
          } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'Failed to join room');
          }
        });

        socket.on('leave-room', async (roomId: string) => {
          try {
            socket.leave(roomId);
            const connections = connectionPool.get(roomId);
            if (connections) {
              connections.delete(socket.id);
              if (connections.size === 0) {
                connectionPool.delete(roomId);
                // Clean up room data in Redis
                await redis.del(`room:${roomId}:queue`);
                await redis.del(`room:${roomId}:playback`);
              }
            }
            console.log(`Client ${socket.id} left room: ${roomId}`);
          } catch (error) {
            console.error('Error leaving room:', error);
          }
        });

        socket.on('add-song', async (data: { roomId: string; song: any }) => {
          try {
            const queue = await getRoomQueue(data.roomId);
            queue.push({ ...data.song, votes: 0 });
            await setRoomQueue(data.roomId, queue);

            // If this is the first song, set it as current
            const playbackState = await getRoomPlaybackState(data.roomId);
            if (queue.length === 1 && playbackState) {
              playbackState.currentSongId = data.song.id;
              await setRoomPlaybackState(data.roomId, playbackState);
              io.to(data.roomId).emit('playback-state-update', playbackState);
            }

            io.to(data.roomId).emit('queue-update', queue);
          } catch (error) {
            console.error('Error adding song:', error);
            socket.emit('error', 'Failed to add song');
          }
        });

        socket.on('vote-song', async (data: { roomId: string; songId: string; vote: number }) => {
          try {
            const queue = await getRoomQueue(data.roomId);
            const updatedQueue = queue.map((song: any) => 
              song.id === data.songId 
                ? { ...song, votes: (song.votes || 0) + data.vote }
                : song
            ).sort((a: any, b: any) => (b.votes || 0) - (a.votes || 0));
            
            await setRoomQueue(data.roomId, updatedQueue);
            io.to(data.roomId).emit('queue-update', updatedQueue);
          } catch (error) {
            console.error('Error voting for song:', error);
            socket.emit('error', 'Failed to vote for song');
          }
        });

        // Playback control events
        socket.on('play-song', async (data: { roomId: string; songId: string }) => {
          try {
            const playbackState = {
              currentSongId: data.songId,
              isPlaying: true,
              currentTime: 0,
              lastUpdate: Date.now()
            };
            await setRoomPlaybackState(data.roomId, playbackState);
            io.to(data.roomId).emit('playback-state-update', playbackState);
          } catch (error) {
            console.error('Error playing song:', error);
            socket.emit('error', 'Failed to play song');
          }
        });

        socket.on('pause-song', async (data: { roomId: string }) => {
          try {
            const playbackState = await getRoomPlaybackState(data.roomId);
            if (playbackState) {
              playbackState.isPlaying = false;
              playbackState.lastUpdate = Date.now();
              await setRoomPlaybackState(data.roomId, playbackState);
              io.to(data.roomId).emit('playback-state-update', playbackState);
            }
          } catch (error) {
            console.error('Error pausing song:', error);
            socket.emit('error', 'Failed to pause song');
          }
        });

        socket.on('resume-song', async (data: { roomId: string }) => {
          try {
            const playbackState = await getRoomPlaybackState(data.roomId);
            if (playbackState) {
              playbackState.isPlaying = true;
              playbackState.lastUpdate = Date.now();
              await setRoomPlaybackState(data.roomId, playbackState);
              io.to(data.roomId).emit('playback-state-update', playbackState);
            }
          } catch (error) {
            console.error('Error resuming song:', error);
            socket.emit('error', 'Failed to resume song');
          }
        });

        socket.on('seek-song', async (data: { roomId: string; time: number }) => {
          try {
            const playbackState = await getRoomPlaybackState(data.roomId);
            if (playbackState) {
              playbackState.currentTime = data.time;
              playbackState.lastUpdate = Date.now();
              await setRoomPlaybackState(data.roomId, playbackState);
              io.to(data.roomId).emit('playback-state-update', playbackState);
            }
          } catch (error) {
            console.error('Error seeking song:', error);
            socket.emit('error', 'Failed to seek song');
          }
        });

        socket.on('next-song', async (data: { roomId: string }) => {
          try {
            const queue = await getRoomQueue(data.roomId);
            const currentState = await getRoomPlaybackState(data.roomId);
            if (queue.length > 0 && currentState) {
              const currentIndex = queue.findIndex(song => song.id === currentState.currentSongId);
              const nextSong = queue[currentIndex + 1];
              if (nextSong) {
                const playbackState = {
                  currentSongId: nextSong.id,
                  isPlaying: true,
                  currentTime: 0,
                  lastUpdate: Date.now()
                };
                await setRoomPlaybackState(data.roomId, playbackState);
                io.to(data.roomId).emit('playback-state-update', playbackState);
              }
            }
          } catch (error) {
            console.error('Error playing next song:', error);
            socket.emit('error', 'Failed to play next song');
          }
        });

        socket.on('disconnect', async () => {
          try {
            // Clean up connections
            for (const [room, connections] of connectionPool.entries()) {
              if (connections.has(socket.id)) {
                connections.delete(socket.id);
                if (connections.size === 0) {
                  connectionPool.delete(room);
                  // Clean up room data in Redis
                  await redis.del(`room:${room}:queue`);
                  await redis.del(`room:${room}:playback`);
                }
              }
            }
            console.log('Client disconnected:', socket.id);
          } catch (error) {
            console.error('Error during disconnect:', error);
          }
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return NextResponse.json({ error: 'Failed to initialize socket' }, { status: 500 });
  }
} 