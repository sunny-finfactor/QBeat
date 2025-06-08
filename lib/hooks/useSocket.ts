import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function useSocket(roomId: string) {
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000; // Start with 1 second
  const [isConnecting, setIsConnecting] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (socketInstance?.connected) {
      socketRef.current = socketInstance;
      setIsConnecting(false);
      setIsConnected(true);
      return;
    }

    if (!socketInstance) {
      socketInstance = io({
        path: '/api/socketio',
        addTrailingSlash: false,
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: reconnectDelay,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        // Add WebSocket specific options
        forceNew: true,
        multiplex: false,
      });

      socketInstance.on('connect', () => {
        console.log('Socket connected');
        reconnectAttempts.current = 0;
        setIsConnecting(false);
        setIsConnected(true);
        setError(null);
      });

      socketInstance.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        reconnectAttempts.current++;
        setError('Connection error. Retrying...');
        
        if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          setError('Failed to connect. Please refresh the page.');
          socketInstance?.disconnect();
        }
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, try to reconnect
          socketInstance?.connect();
        }
      });

      socketInstance.on('error', (error) => {
        console.error('Socket error:', error);
        setError(error.message || 'An error occurred');
      });
    }

    socketRef.current = socketInstance;
  }, []);

  useEffect(() => {
    connect();

    if (socketRef.current) {
      socketRef.current.emit('join-room', roomId);
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', roomId);
      }
    };
  }, [roomId, connect]);

  const addSong = useCallback((song: any) => {
    if (socketRef.current) {
      socketRef.current.emit('add-song', { roomId, song });
    }
  }, [roomId]);

  const voteSong = useCallback((songId: string, vote: number) => {
    if (socketRef.current) {
      socketRef.current.emit('vote-song', { roomId, songId, vote });
    }
  }, [roomId]);

  return {
    socket: socketRef.current,
    addSong,
    voteSong,
    isConnecting,
    isConnected,
    error,
  };
} 