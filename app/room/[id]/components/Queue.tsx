"use client";

import { useState } from 'react';
import { Song } from '@/app/types';

interface QueueProps {
  queue: Song[];
  roomId: string;
  isAdmin: boolean;
}

export default function Queue({ queue, roomId, isAdmin }: QueueProps) {
  const [votingSongId, setVotingSongId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVote = async (songId: string) => {
    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote-song',
          data: { songId }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to vote for song');
      }
    } catch (error) {
      console.error('Error voting for song:', error);
    }
  };

  const handleRemove = async (songId: string) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove-song',
          data: { songId }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to remove song');
      }
    } catch (error) {
      console.error('Error removing song:', error);
    }
  };

  if (queue.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No songs in queue</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[calc(100vh-24rem)] overflow-y-auto">
      {queue.map((song) => (
        <div
          key={song.id}
          className="flex items-center justify-between p-4 bg-[#F8E7F6] rounded-lg hover:bg-[#DD88CF] hover:text-white transition-colors duration-200"
        >
          <div className="flex items-center space-x-4">
            <img
              src={song.image}
              alt={song.name}
              className="w-12 h-12 rounded-lg"
            />
            <div>
              <h3 className="font-medium">{song.name}</h3>
              <p className="text-sm opacity-75">{song.artist}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleVote(song.id)}
              className="p-2 text-[#4B164C] hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <span className="text-sm font-medium">{song.votes || 0}</span>
            {isAdmin && (
              <button
                onClick={() => handleRemove(song.id)}
                className="p-2 text-[#4B164C] hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
