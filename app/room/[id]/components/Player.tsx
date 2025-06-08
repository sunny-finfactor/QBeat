"use client";

import { useState, useEffect, useRef } from 'react';

// YouTube IFrame API types
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: {
      Player: new (
        elementId: string,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: {
            autoplay?: number;
            controls?: number;
            disablekb?: number;
            enablejsapi?: number;
            fs?: number;
            modestbranding?: number;
            rel?: number;
          };
          events?: {
            onStateChange?: (event: { data: number }) => void;
            onReady?: () => void;
          };
        }
      ) => {
        loadVideoById: (videoId: string) => void;
        seekTo: (seconds: number, allowSeekAhead: boolean) => void;
        playVideo: () => void;
        pauseVideo: () => void;
        setVolume: (volume: number) => void;
        getCurrentTime: () => number;
        destroy: () => void;
      };
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
  }
}

type Song = {
  id: string;
  name: string;
  artist: string;
  image: string;
  preview_url?: string;
  votes?: number;
  youtubeId: string;
};

interface PlayerProps {
  queue: Song[];
  isAdmin: boolean;
  roomId: string;
}

export default function Player({ queue, isAdmin, roomId }: PlayerProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const playerRef = useRef<YT.Player | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isPlayerReady = useRef(false);

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if the API is already loaded
    if (window.YT && window.YT.Player) {
      initializePlayer();
      return;
    }

    // Load the IFrame Player API code asynchronously
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    // Create YouTube player when API is ready
    window.onYouTubeIframeAPIReady = initializePlayer;

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  const initializePlayer = () => {
    if (!playerRef.current) {
      playerRef.current = new window.YT.Player('youtube-player', {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              handleNext();
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
          },
          onReady: () => {
            console.log('YouTube player is ready');
            isPlayerReady.current = true;
            if (playerRef.current) {
              playerRef.current.setVolume(volume);
            }
          }
        }
      });
    }
  };

  useEffect(() => {
    // Set up SSE connection
    const eventSource = new EventSource(`/api/rooms/${roomId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        if (type === 'playback-state') {
          if (data.currentSongId) {
            const song = queue.find(s => s.id === data.currentSongId);
            if (song && song.youtubeId && playerRef.current && isPlayerReady.current) {
              setCurrentSong(song);
              setIsPlaying(data.isPlaying);
              if (data.isPlaying) {
                playerRef.current.loadVideoById(song.youtubeId);
                playerRef.current.seekTo(data.currentTime, true);
                playerRef.current.playVideo();
              } else {
                playerRef.current.pauseVideo();
              }
            }
          }
        } else if (type === 'queue-update') {
          if (data.queue.length > 0 && !currentSong) {
            setCurrentSong(data.queue[0]);
          }
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
  }, [roomId, queue, currentSong]);

  useEffect(() => {
    if (playerRef.current && isPlayerReady.current) {
      playerRef.current.setVolume(volume);
    }
  }, [volume]);

  const handlePlayPause = async () => {
    if (!isAdmin || !currentSong) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isPlaying ? 'pause-song' : 'resume-song',
          data: { songId: currentSong.id }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update playback state');
      }
    } catch (error) {
      console.error('Error updating playback state:', error);
    }
  };

  const handleNext = async () => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'next-song'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to skip to next song');
      }
    } catch (error) {
      console.error('Error skipping to next song:', error);
    }
  };

  const handlePrevious = async () => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'previous-song'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to go to previous song');
      }
    } catch (error) {
      console.error('Error going to previous song:', error);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
  };

  const handleTimeUpdate = async () => {
    if (!playerRef.current || !isAdmin || !isPlayerReady.current) return;

    try {
      const currentTime = playerRef.current.getCurrentTime();
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seek-song',
          data: { time: currentTime }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update playback time');
      }
    } catch (error) {
      console.error('Error updating playback time:', error);
    }
  };

  if (!currentSong) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <img
              src={currentSong.image}
              alt={currentSong.name}
              className="w-16 h-16 rounded-lg shadow-md"
            />
            <div>
              <h3 className="font-semibold text-[#4B164C]">{currentSong.name}</h3>
              <p className="text-sm text-gray-600">{currentSong.artist}</p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            {isAdmin && (
              <button
                onClick={handlePrevious}
                className="p-2 text-[#4B164C] hover:text-[#DD88CF] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={handlePlayPause}
                className="p-2 text-[#4B164C] hover:text-[#DD88CF] transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={handleNext}
                className="p-2 text-[#4B164C] hover:text-[#DD88CF] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <svg className="w-5 h-5 text-[#4B164C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.728-2.728" />
            </svg>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 accent-[#DD88CF]"
            />
          </div>
        </div>
      </div>

      {/* Hidden YouTube player */}
      <div id="youtube-player" className="hidden"></div>
    </div>
  );
}
