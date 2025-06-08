// app/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleCreateRoom = async () => {
    try {
      setError('');
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      router.push(`/room/${data.roomCode}`);
    } catch (error) {
      setError('Failed to create room. Please try again.');
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      const response = await fetch(`/api/rooms/${roomCode}`);

      if (!response.ok) {
        throw new Error('Room not found');
      }

      router.push(`/room/${roomCode}`);
    } catch (error) {
      setError('Room not found. Please check the code and try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-[#4B164C] mb-2">QBeat</h1>
          <p className="text-gray-600">Create or join a room to start listening together</p>
        </div>

        <div className="space-y-6">
          <button
            onClick={handleCreateRoom}
            className="w-full bg-[#DD88CF] hover:bg-[#4B164C] text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Room</span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-1">
                Room Code
              </label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#DD88CF] focus:border-transparent outline-none transition-all duration-200"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#F8E7F6] hover:bg-[#DD88CF] text-[#4B164C] hover:text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Join Room
            </button>
          </form>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
