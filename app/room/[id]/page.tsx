"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Player from "./components/Player";
import Search from "./components/Search";
import Queue from "./components/Queue";

type Song = {
  id: string;
  name: string;
  artist: string;
  image: string;
  preview_url?: string;
  votes?: number;
};

export default function RoomPage() {
  const { id } = useParams();
  const [queue, setQueue] = useState<Song[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const response = await fetch(`/api/rooms/${id}`);
        if (!response.ok) {
          throw new Error('Room not found');
        }
        const data = await response.json();
        setQueue(data.queue);
        setIsAdmin(data.isAdmin);
      } catch (error) {
        setError('Failed to load room');
        setTimeout(() => router.push('/'), 2000);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoom();
  }, [id, router]);

  useEffect(() => {
    // Set up SSE connection
    const eventSource = new EventSource(`/api/rooms/${id}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        if (type === 'queue-update') {
          setQueue(data.queue);
        }
      } catch (error) {
        console.error('Error handling SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [id]);

  const handleAddSong = async (song: Song) => {
    try {
      const response = await fetch(`/api/rooms/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add-song',
          data: { song }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add song');
      }
    } catch (err) {
      throw new Error('Failed to add song to queue');
    }
  };

  const handleVote = async (songId: string, vote: number) => {
    try {
      const response = await fetch(`/api/rooms/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote-song',
          data: { songId, vote }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to vote for song');
      }
    } catch (err) {
      throw new Error('Failed to vote for song');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-[#4B164C] mb-4">Oops!</h2>
          <p className="text-gray-600">{error}</p>
          <p className="text-gray-500 mt-2">Redirecting to home...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="text-[#4B164C] hover:text-[#DD88CF] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-[#4B164C]">Room: {id}</h1>
            </div>
            {isAdmin && (
              <span className="px-3 py-1 bg-[#F8E7F6] text-[#4B164C] rounded-full text-sm font-medium">
                Admin
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#4B164C] mb-4">Search Songs</h2>
              <Search onAddSong={handleAddSong} />
            </div>
          </div>

          {/* Queue Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#4B164C] mb-4">Queue</h2>
              <Queue queue={queue} onVote={handleVote} />
            </div>
          </div>
        </div>
      </main>

      {/* Player */}
      <Player queue={queue} isAdmin={isAdmin} roomId={id as string} />
    </div>
  );
}
