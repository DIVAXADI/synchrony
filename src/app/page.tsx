'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [roomCode, setRoomCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const router = useRouter()

  const createRoom = async () => {
    setIsCreating(true)
    // Generate a random room code
    const code = generateRoomCode()
    router.push(`/room/${code}`)
  }

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (roomCode.trim()) {
      router.push(`/room/${roomCode.trim().toUpperCase()}`)
    }
  }

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'SYNC-'
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      {/* Background Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-midnight-600 rounded-full opacity-20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-midnight-500 rounded-full opacity-20 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-2 tracking-tight">
            <span className="text-white">Sync</span>
            <span className="text-midnight-400">hrony</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Listen together. Free. No ads. Forever.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          {/* Create Room Button */}
          <button
            onClick={createRoom}
            disabled={isCreating}
            className="btn-primary w-full text-lg flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Room
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-midnight-700" />
            <span className="text-gray-500 text-sm">or</span>
            <div className="flex-1 h-px bg-midnight-700" />
          </div>

          {/* Join Room Form */}
          <form onSubmit={joinRoom} className="space-y-3">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter room code (e.g. SYNC-A1B2)"
              className="input-field text-center tracking-widest"
              maxLength={9}
            />
            <button
              type="submit"
              disabled={!roomCode.trim()}
              className="btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>No account needed. No ads. No subscriptions.</p>
          <p className="mt-1">Just music, together.</p>
        </div>
      </div>
    </main>
  )
}
