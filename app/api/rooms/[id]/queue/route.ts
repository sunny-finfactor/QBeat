import { NextResponse } from 'next/server';

// Temporary in-memory storage for queues
const roomQueues = new Map<string, any[]>();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const queue = roomQueues.get(id) || [];
  return NextResponse.json(queue);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const song = await request.json();

  // Get current queue or initialize empty array
  const queue = roomQueues.get(id) || [];
  
  // Add song to queue
  queue.push({ ...song, votes: 0 });
  
  // Update queue
  roomQueues.set(id, queue);

  return NextResponse.json(queue);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { songId, vote } = await request.json();

  // Get current queue
  const queue = roomQueues.get(id) || [];
  
  // Update votes for the song
  const updatedQueue = queue.map((song: any) => 
    song.id === songId 
      ? { ...song, votes: (song.votes || 0) + vote }
      : song
  ).sort((a: any, b: any) => (b.votes || 0) - (a.votes || 0));

  // Update queue
  roomQueues.set(id, updatedQueue);

  return NextResponse.json(updatedQueue);
} 