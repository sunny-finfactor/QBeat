"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Player from "./components/Player";
import Search from "./components/Search";
import Queue from "./components/Queue";
import { Song } from "@/app/types";

export default function RoomPage({ params }: { params: { id: string } }) {
  const [queue, setQueue] = useState<Song[]>([]);
  const [playedSongs, setPlayedSongs] = useState<Song[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const response = await fetch(`/api/rooms/${params.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch room');
        }

        const data = await response.json();
        setQueue(data.queue);
        setPlayedSongs(data.playedSongs || []);
        setIsAdmin(data.isAdmin);
      } catch (error) {
        console.error('Error fetching room:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoom();
  }, [params.id]);

  useEffect(() => {
    // Set up SSE connection
    const eventSource = new EventSource(`/api/rooms/${params.id}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        if (type === 'queue-update') {
          setQueue(data.queue);
          setPlayedSongs(data.playedSongs || []);
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
  }, [params.id]);

  const handleAddSong = async (song: Song) => {
    try {
      const response = await fetch(`/api/rooms/${params.id}`, {
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

      const { queue } = await response.json();
      setQueue(queue);
    } catch (error) {
      console.error('Error adding song:', error);
    }
  };

  const handleVote = async (songId: string, vote: number) => {
    try {
      const response = await fetch(`/api/rooms/${params.id}`, {
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

  const handleQueueUpdate = (newQueue: Song[], newPlayedSongs: Song[]) => {
    setQueue(newQueue);
    setPlayedSongs(newPlayedSongs);
  };

  const handleReplaySong = async (songId: string) => {
    try {
      const response = await fetch(`/api/rooms/${params.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'replay-song',
          data: { songId }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to replay song');
      }

      const { queue } = await response.json();
      setQueue(queue);
    } catch (error) {
      console.error('Error replaying song:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#4B164C]"></div>
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Section */}
          <div className="lg:col-span-1">
            <Search onAddSong={handleAddSong} roomId={params.id} />
          </div>

          {/* Queue Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-[#4B164C] mb-6">Queue</h2>
              <Queue queue={queue} roomId={params.id} isAdmin={isAdmin} />
            </div>

            {/* Played Songs Section */}
            {playedSongs.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
                <h2 className="text-2xl font-bold text-[#4B164C] mb-6">Played Songs</h2>
                <div className="space-y-4">
                  {playedSongs.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <img
                          src={song.image}
                          alt={song.name}
                          className="w-12 h-12 rounded-lg"
                        />
                        <div>
                          <h3 className="font-medium text-[#4B164C]">{song.name}</h3>
                          <p className="text-sm text-gray-500">{song.artist}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleReplaySong(song.id)}
                        className="p-2 text-[#4B164C] hover:text-[#DD88CF] transition-colors"
                      >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player */}
      <Player
        queue={queue}
        isAdmin={isAdmin}
        roomId={params.id}
        onQueueUpdate={handleQueueUpdate}
      />
    </div>
  );
}
