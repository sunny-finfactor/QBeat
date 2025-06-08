import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';

export type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

let io: SocketIOServer;

// Store queues in memory (temporary solution)
const roomQueues = new Map<string, any[]>();

export const initSocket = (res: NextApiResponseWithSocket) => {
  if (!res.socket.server.io) {
    io = new SocketIOServer(res.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    res.socket.server.io = io;

    io.on('connection', (socket) => {
      console.log('Client connected');

      socket.on('join-room', (roomId: string) => {
        socket.join(roomId);
        console.log(`Client joined room: ${roomId}`);
        // Send current queue to the new user
        const queue = roomQueues.get(roomId) || [];
        socket.emit('queue-update', queue);
      });

      socket.on('leave-room', (roomId: string) => {
        socket.leave(roomId);
        console.log(`Client left room: ${roomId}`);
      });

      socket.on('add-song', (data: { roomId: string; song: any }) => {
        const queue = roomQueues.get(data.roomId) || [];
        queue.push({ ...data.song, votes: 0 });
        roomQueues.set(data.roomId, queue);
        io.to(data.roomId).emit('queue-update', queue);
      });

      socket.on('vote-song', (data: { roomId: string; songId: string; vote: number }) => {
        const queue = roomQueues.get(data.roomId) || [];
        const updatedQueue = queue.map((song: any) => 
          song.id === data.songId 
            ? { ...song, votes: (song.votes || 0) + data.vote }
            : song
        ).sort((a: any, b: any) => (b.votes || 0) - (a.votes || 0));
        
        roomQueues.set(data.roomId, updatedQueue);
        io.to(data.roomId).emit('queue-update', updatedQueue);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });
    });
  }
  return res.socket.server.io;
}; 