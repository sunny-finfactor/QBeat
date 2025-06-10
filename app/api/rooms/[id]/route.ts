import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface PlaybackState {
  currentSongId: string | null;
  isPlaying: boolean;
  currentTime: number;
  lastUpdate: number;
}

interface Song {
  id: string;
  name: string;
  artist: string;
  image: string;
  youtubeId: string;
  votes?: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const roomId = params.id;
    
    // Check if room exists by looking for queue or playback state
    const queue = await redis.get(`room:${roomId}:queue`) as Song[] || [];
    const playedSongs = await redis.get(`room:${roomId}:playedSongs`) as Song[] || [];
    const playbackState = await redis.get(`room:${roomId}:playbackState`) as PlaybackState || {
      currentSongId: null,
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    if (!queue && !playbackState) {
      return NextResponse.json(
        { error: 'Room not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      queue,
      playedSongs,
      playbackState,
      isAdmin: true // You can implement proper admin check here
    });
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json(
      { error: 'Failed to fetch room' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, data } = body;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    const roomId = params.id;
    const queue = (await redis.get(`room:${roomId}:queue`)) as Song[] || [];
    const playedSongs = (await redis.get(`room:${roomId}:playedSongs`)) as Song[] || [];
    const playbackState = (await redis.get(`room:${roomId}:playbackState`)) as PlaybackState || {
      currentSongId: null,
      isPlaying: false,
      currentTime: 0,
      lastUpdate: Date.now()
    };

    switch (action) {
      case 'create-room': {
        // Initialize room state
        await redis.set(`room:${roomId}:queue`, []);
        await redis.set(`room:${roomId}:playedSongs`, []);
        await redis.set(`room:${roomId}:playbackState`, {
          currentSongId: null,
          isPlaying: false,
          currentTime: 0,
          lastUpdate: Date.now()
        });
        return NextResponse.json({ success: true });
      }

      case 'add-song': {
        if (!data?.song) {
          return NextResponse.json({ error: 'Song data is required' }, { status: 400 });
        }

        const newQueue = [...queue, { ...data.song, votes: 0 }];
        await redis.set(`room:${roomId}:queue`, newQueue);

        // If this is the first song, set it as current
        if (newQueue.length === 1) {
          const newPlaybackState = {
            ...playbackState,
            currentSongId: data.song.id,
            isPlaying: true,
            lastUpdate: Date.now()
          };
          await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
          return NextResponse.json({ queue: newQueue, playbackState: newPlaybackState });
        }

        return NextResponse.json({ queue: newQueue });
      }

      case 'vote-song': {
        if (!data?.songId) {
          return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
        }

        // Don't allow voting for the currently playing song
        if (data.songId === playbackState.currentSongId) {
          return NextResponse.json({ error: 'Cannot vote for currently playing song' }, { status: 400 });
        }

        const newQueue = queue.map(song => 
          song.id === data.songId 
            ? { ...song, votes: (song.votes || 0) + 1 }
            : song
        ).sort((a, b) => (b.votes || 0) - (a.votes || 0));

        await redis.set(`room:${roomId}:queue`, newQueue);
        return NextResponse.json({ queue: newQueue });
      }

      case 'remove-song': {
        if (!data?.songId) {
          return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
        }

        // Don't allow removing the currently playing song
        if (data.songId === playbackState.currentSongId) {
          return NextResponse.json({ error: 'Cannot remove currently playing song' }, { status: 400 });
        }

        const newQueue = queue.filter(song => song.id !== data.songId);
        await redis.set(`room:${roomId}:queue`, newQueue);
        return NextResponse.json({ queue: newQueue });
      }

      case 'next-song': {
        // Move current song to played songs if it exists
        if (playbackState.currentSongId) {
          const currentSong = queue.find(song => song.id === playbackState.currentSongId);
          if (currentSong) {
            const newPlayedSongs = [...playedSongs, currentSong];
            await redis.set(`room:${roomId}:playedSongs`, newPlayedSongs);
          }
        }

        // Get the next song (highest voted song in queue)
        const nextSong = queue[0];
        if (nextSong) {
          const newQueue = queue.slice(1); // Remove the next song from queue
          await redis.set(`room:${roomId}:queue`, newQueue);

          const newPlaybackState = {
            ...playbackState,
            currentSongId: nextSong.id,
            isPlaying: true,
            currentTime: 0,
            lastUpdate: Date.now()
          };
          await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
          return NextResponse.json({ 
            queue: newQueue, 
            playedSongs: playedSongs,
            playbackState: newPlaybackState 
          });
        }

        return NextResponse.json({ error: 'No next song available' }, { status: 400 });
      }

      case 'previous-song': {
        // Move current song back to queue if it exists
        if (playbackState.currentSongId) {
          const currentSong = queue.find(song => song.id === playbackState.currentSongId);
          if (currentSong) {
            const newQueue = [currentSong, ...queue];
            await redis.set(`room:${roomId}:queue`, newQueue);
          }
        }

        // Get the last played song
        const previousSong = playedSongs[playedSongs.length - 1];
        if (previousSong) {
          const newPlayedSongs = playedSongs.slice(0, -1); // Remove the last played song
          await redis.set(`room:${roomId}:playedSongs`, newPlayedSongs);

          const newPlaybackState = {
            ...playbackState,
            currentSongId: previousSong.id,
            isPlaying: true,
            currentTime: 0,
            lastUpdate: Date.now()
          };
          await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
          return NextResponse.json({ 
            queue: queue,
            playedSongs: newPlayedSongs,
            playbackState: newPlaybackState 
          });
        }

        return NextResponse.json({ error: 'No previous song available' }, { status: 400 });
      }

      case 'replay-song': {
        if (!data?.songId) {
          return NextResponse.json({ error: 'Song ID is required' }, { status: 400 });
        }

        // Find the song in played songs
        const songToReplay = playedSongs.find(song => song.id === data.songId);
        if (!songToReplay) {
          return NextResponse.json({ error: 'Song not found in played songs' }, { status: 404 });
        }

        // Add the song back to queue
        const newQueue = [...queue, { ...songToReplay, votes: 0 }];
        await redis.set(`room:${roomId}:queue`, newQueue);

        return NextResponse.json({ queue: newQueue });
      }

      case 'pause-song': {
        const newPlaybackState = {
          ...playbackState,
          isPlaying: false,
          lastUpdate: Date.now()
        };
        await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
        return NextResponse.json({ playbackState: newPlaybackState });
      }

      case 'resume-song': {
        const newPlaybackState = {
          ...playbackState,
          isPlaying: true,
          lastUpdate: Date.now()
        };
        await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
        return NextResponse.json({ playbackState: newPlaybackState });
      }

      case 'seek-song': {
        if (typeof data?.time !== 'number') {
          return NextResponse.json({ error: 'Time is required' }, { status: 400 });
        }

        const newPlaybackState = {
          ...playbackState,
          currentTime: data.time,
          lastUpdate: Date.now()
        };
        await redis.set(`room:${roomId}:playbackState`, newPlaybackState);
        return NextResponse.json({ playbackState: newPlaybackState });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error handling room action:', error);
    return NextResponse.json(
      { error: 'Failed to handle room action' },
      { status: 500 }
    );
  }
} 