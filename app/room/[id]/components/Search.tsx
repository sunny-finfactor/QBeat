'use client';

import { useState, useEffect, useCallback } from 'react';
import { Song } from '@/app/types';

interface SearchProps {
  roomId: string;
  onAddSong: (song: Song) => Promise<void>;
}

export default function Search({ roomId, onAddSong }: SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const searchSongs = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error('Failed to search songs');
      }
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setError('Failed to search songs. Please try again.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchSongs(query);
    }, 500); // 500ms delay

    return () => clearTimeout(timeoutId);
  }, [query, searchSongs]);

  const handleAddSong = async (song: Song) => {
    try {
      await onAddSong(song);
      // Clear search results after adding
      setResults([]);
      setQuery('');
    } catch (error) {
      setError('Failed to add song. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for songs..."
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#DD88CF] focus:border-transparent outline-none transition-all duration-200"
        />
        {isLoading && (
          <div className="px-4 py-2 text-[#4B164C] font-semibold">
            Searching...
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((song) => (
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
              <button
                onClick={() => handleAddSong(song)}
                className="p-2 text-[#4B164C] hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 