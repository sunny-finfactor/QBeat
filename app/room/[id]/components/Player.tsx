"use client";

import { useState, useEffect, useRef } from 'react';
import { Song } from '@/app/types';

interface PlayerProps {
  queue: Song[];
  isAdmin: boolean;
  roomId: string;
  onQueueUpdate?: (queue: Song[], playedSongs: Song[]) => void;
}

export default function Player({ queue, isAdmin, roomId, onQueueUpdate }: PlayerProps) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef<YT.Player | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isPlayerReady = useRef(false);
  const currentSongRef = useRef<Song | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
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
              startProgressTracking();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
              stopProgressTracking();
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

  // Handle playback state updates
  useEffect(() => {
    const eventSource = new EventSource(`/api/rooms/${roomId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);

        if (type === 'playback-state') {
          if (data.currentSongId) {
            const song = queue.find(s => s.id === data.currentSongId);
            if (song && song.youtubeId && playerRef.current && isPlayerReady.current) {
              // Only update if it's a different song
              if (currentSongRef.current?.id !== song.id) {
                setCurrentSong(song);
                currentSongRef.current = song;
                playerRef.current.loadVideoById(song.youtubeId);
                if (data.isPlaying) {
                  playerRef.current.seekTo(data.currentTime || 0, true);
                  playerRef.current.playVideo();
                } else {
                  playerRef.current.pauseVideo();
                }
              } else if (data.isPlaying !== isPlaying) {
                // Only update play/pause state if the song is the same
                if (data.isPlaying) {
                  playerRef.current.playVideo();
                } else {
                  playerRef.current.pauseVideo();
                }
              }
              setIsPlaying(data.isPlaying);
            }
          }
        } else if (type === 'queue-update') {
          // Update the queue and check if we need to play the next song
          if (data.queue.length > 0) {
            const nextSong = data.queue[0];
            if (nextSong && nextSong.id !== currentSongRef.current?.id) {
              setCurrentSong(nextSong);
              currentSongRef.current = nextSong;
              if (playerRef.current && isPlayerReady.current) {
                playerRef.current.loadVideoById(nextSong.youtubeId);
                playerRef.current.playVideo();
                setIsPlaying(true);
              }
            }
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
  }, [roomId, queue]);

  const startProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    progressIntervalRef.current = setInterval(() => {
      if (playerRef.current && isPlayerReady.current) {
        const currentTime = playerRef.current.getCurrentTime();
        setCurrentTime(currentTime);
      }
    }, 1000);
  };

  const stopProgressTracking = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleProgressChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin || !playerRef.current || !isPlayerReady.current) return;

    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime, true);

    try {
      const response = await fetch(`/api/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seek-song',
          data: { time: newTime }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update playback time');
      }
    } catch (error) {
      console.error('Error updating playback time:', error);
    }
  };

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

      const { queue, playedSongs, playbackState } = await response.json();
      
      // Update the queue and played songs in the parent component
      if (onQueueUpdate) {
        onQueueUpdate(queue, playedSongs);
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

  if (!currentSong) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col space-y-4">
          {/* Progress Bar */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 w-12">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleProgressChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#DD88CF]"
              disabled={!isAdmin}
            />
            <span className="text-sm text-gray-500 w-12">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between">
            {/* Current Song Info */}
            <div className="flex items-center space-x-4">
              {currentSong && (
                <>
                  <img
                    src={currentSong.image}
                    alt={currentSong.name}
                    className="w-16 h-16 rounded-lg shadow-md"
                  />
                  <div>
                    <h3 className="font-semibold text-[#4B164C]">{currentSong.name}</h3>
                    <p className="text-sm text-gray-600">{currentSong.artist}</p>
                  </div>
                </>
              )}
            </div>

            {/* Player Controls */}
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

            {/* Volume Control */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setVolume(volume === 0 ? 100 : 0)}
                className="p-2 text-[#4B164C] hover:text-[#DD88CF] transition-colors"
              >
                {volume === 0 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : volume < 50 ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.728-2.728" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.728-2.728" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="w-24 accent-[#DD88CF]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden YouTube player */}
      <div id="youtube-player" className="hidden"></div>
    </div>
  );
}
