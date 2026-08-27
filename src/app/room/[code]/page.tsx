'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

// Types
interface Track {
  id: string
  title: string
  artist: string
  duration: number
  url: string
  addedBy: string
}

interface Message {
  id: string
  user: string
  text: string
  timestamp: number
}

interface RoomState {
  isPlaying: boolean
  currentTime: number
  currentTrack: Track | null
  queue: Track[]
  listeners: number
}

export default function Room() {
  const params = useParams<{ code: string }>()
  const roomCode = params?.code || ''

  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [userName, setUserName] = useState('')
  const [hasJoined, setHasJoined] = useState(false)
  const [roomState, setRoomState] = useState<RoomState>({
    isPlaying: false,
    currentTime: 0,
    currentTrack: null,
    queue: [],
    listeners: 0
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [library, setLibrary] = useState<Track[]>([])
  const [volume, setVolume] = useState(0.8)
  const [isHost, setIsHost] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      path: '/api/socket',
      transports: ['websocket', 'polling']
    })

    newSocket.on('connect', () => {
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('room-state', (state: RoomState) => {
      setRoomState(state)
    })

    newSocket.on('sync', (data: { currentTime: number; isPlaying: boolean }) => {
      if (audioRef.current) {
        const drift = Math.abs(audioRef.current.currentTime - data.currentTime)
        if (drift > 0.3) {
          audioRef.current.currentTime = data.currentTime
        }
        if (data.isPlaying && audioRef.current.paused) {
          audioRef.current.play()
        } else if (!data.isPlaying && !audioRef.current.paused) {
          audioRef.current.pause()
        }
      }
    })

    newSocket.on('message', (message: Message) => {
      setMessages(prev => [...prev, message])
    })

    newSocket.on('library', (tracks: Track[]) => {
      setLibrary(tracks)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  // Sync playback position
  useEffect(() => {
    if (!socket || !audioRef.current) return

    const interval = setInterval(() => {
      if (audioRef.current && roomState.isPlaying) {
        socket.emit('sync', {
          currentTime: audioRef.current.currentTime,
          isPlaying: roomState.isPlaying
        })
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [socket, roomState.isPlaying])

  // Join room
  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!userName.trim() || !socket) return

    socket.emit('join', { roomCode, userName: userName.trim() })
    setHasJoined(true)

    // First person to join is host
    if (roomState.listeners === 0) {
      setIsHost(true)
    }
  }

  // Playback controls
  const togglePlay = () => {
    if (!socket) return
    socket.emit('playback', { isPlaying: !roomState.isPlaying })
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !audioRef.current || !roomState.currentTrack) return

    const rect = progressRef.current.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const newTime = percent * roomState.currentTrack.duration

    if (socket) {
      socket.emit('seek', { time: newTime })
    }
  }

  const nextTrack = () => {
    if (!socket) return
    socket.emit('next')
  }

  const addToQueue = (track: Track) => {
    if (!socket) return
    socket.emit('add-to-queue', { track, userName })
  }

  const removeFromQueue = (trackId: string) => {
    if (!socket) return
    socket.emit('remove-from-queue', { trackId })
  }

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim() || !socket) return

    socket.emit('message', { text: messageInput.trim(), userName })
    setMessageInput('')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Name entry screen
  if (!hasJoined) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Room {roomCode}</h1>
            <p className="text-gray-400">Enter your name to join</p>
          </div>

          <form onSubmit={joinRoom} className="space-y-4">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your name"
              className="input-field text-center"
              maxLength={20}
              autoFocus
            />
            <button
              type="submit"
              disabled={!userName.trim()}
              className="btn-primary w-full disabled:opacity-50"
            >
              Join Room
            </button>
          </form>
        </div>
      </main>
    )
  }

  // Main room UI
  return (
    <main className="min-h-screen flex flex-col">
      {/* Hidden audio element */}
      {roomState.currentTrack && (
        <audio
          ref={audioRef}
          src={roomState.currentTrack.url}
          onTimeUpdate={(e) => setRoomState(prev => ({ ...prev, currentTime: e.currentTarget.currentTime }))}
          onEnded={nextTrack}
          volume={volume}
        />
      )}

      {/* Header */}
      <header className="glass-effect border-b border-midnight-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              <span className="text-white">Sync</span>
              <span className="text-midnight-400">hrony</span>
            </h1>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400 font-mono">{roomCode}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-400">{isConnected ? 'Synced' : 'Connecting...'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{roomState.listeners} listening</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Now Playing & Queue */}
          <div className="lg:col-span-2 space-y-8">
            {/* Now Playing */}
            <section className="card p-8 glow-border">
              {roomState.currentTrack ? (
                <>
                  <div className="text-center mb-8">
                    <div className="w-32 h-32 mx-auto mb-6 rounded-xl bg-gradient-to-br from-midnight-600 to-midnight-700 flex items-center justify-center">
                      <svg className="w-16 h-16 text-midnight-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-1">{roomState.currentTrack.title}</h2>
                    <p className="text-gray-400">{roomState.currentTrack.artist}</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div
                      ref={progressRef}
                      onClick={seek}
                      className="h-2 bg-midnight-700 rounded-full cursor-pointer overflow-hidden"
                    >
                      <div
                        className="h-full bg-gradient-to-r from-midnight-500 to-midnight-400 rounded-full transition-all duration-100"
                        style={{ width: `${(roomState.currentTime / roomState.currentTrack.duration) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-sm text-gray-500">
                      <span>{formatTime(roomState.currentTime)}</span>
                      <span>{formatTime(roomState.currentTrack.duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-6">
                    <button
                      onClick={togglePlay}
                      disabled={!isHost}
                      className="w-16 h-16 rounded-full bg-midnight-500 hover:bg-midnight-400 flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {roomState.isPlaying ? (
                        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                        </svg>
                      ) : (
                        <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={nextTrack}
                      disabled={!isHost || roomState.queue.length === 0}
                      className="w-12 h-12 rounded-full bg-midnight-700 hover:bg-midnight-600 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="w-24 h-24 mx-auto mb-4 rounded-xl bg-midnight-700 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-400 mb-2">No track playing</h3>
                  <p className="text-gray-500">Add songs from the library to get started</p>
                </div>
              )}
            </section>

            {/* Queue */}
            <section className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-midnight-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Queue
                <span className="text-sm font-normal text-gray-500">({roomState.queue.length} songs)</span>
              </h3>

              {roomState.queue.length > 0 ? (
                <div className="space-y-2">
                  {roomState.queue.map((track, index) => (
                    <div key={track.id} className="flex items-center justify-between p-3 rounded-lg bg-midnight-900 hover:bg-midnight-700 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 font-mono w-6">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <p className="text-white font-medium">{track.title}</p>
                          <p className="text-gray-500 text-sm">{track.artist}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromQueue(track.id)}
                        className="text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">Queue is empty. Add songs from the library.</p>
              )}
            </section>
          </div>

          {/* Right Column - Library & Chat */}
          <div className="space-y-8">
            {/* Library */}
            <section className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-midnight-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Library
              </h3>

              <div className="grid grid-cols-2 gap-3">
                {library.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => addToQueue(track)}
                    className="p-4 rounded-lg bg-midnight-900 hover:bg-midnight-700 text-left transition-all hover:scale-105 group"
                  >
                    <div className="w-full aspect-square mb-2 rounded bg-gradient-to-br from-midnight-600 to-midnight-700 flex items-center justify-center">
                      <svg className="w-8 h-8 text-midnight-400 group-hover:text-midnight-300 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                    </div>
                    <p className="text-white text-sm font-medium truncate">{track.title}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                  </button>
                ))}
              </div>

              {library.length === 0 && (
                <p className="text-gray-500 text-center py-8">No tracks in library yet.</p>
              )}
            </section>

            {/* Chat */}
            <section className="card p-6 flex flex-col h-80">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-midnight-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Chat
              </h3>

              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className="text-midnight-400 font-medium">{msg.user}: </span>
                    <span className="text-gray-300">{msg.text}</span>
                  </div>
                ))}
              </div>

              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="input-field flex-1 text-sm py-2"
                />
                <button type="submit" className="btn-primary py-2 px-4 text-sm">
                  Send
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
