import { Server as SocketIOServer } from 'socket.io'
import type { NextApiRequest, NextApiResponse } from 'next'

// Global variable to store Socket.IO server
let io: SocketIOServer

// In-memory storage for rooms (use Redis in production)
const rooms = new Map<string, RoomData>()

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

interface RoomData {
  listeners: Set<string>
  isPlaying: boolean
  currentTime: number
  currentTrack: Track | null
  queue: Track[]
  messages: Message[]
  host: string | null
}

export const config = {
  api: {
    bodyParser: false,
  },
}

// Fetch library from GitHub Releases
async function getLibrary(): Promise<Track[]> {
  const GITHUB_REPO = 'DIVAXADI/synchrony'

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v1.0.0-music`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
        next: { revalidate: 60 } // Cache for 60 seconds
      }
    )

    if (!response.ok) {
      return []
    }

    const release = await response.json()

    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
    return release.assets
      .filter((asset: any) => audioExtensions.some(ext => asset.name.toLowerCase().endsWith(ext)))
      .map((asset: any) => ({
        id: asset.id.toString(),
        title: asset.name.replace(/\.[^/.]+$/, ''),
        artist: 'Unknown Artist',
        duration: 0,
        url: asset.browser_download_url,
        addedBy: 'System',
      }))
  } catch (error) {
    console.error('Error fetching library:', error)
    return []
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!io) {
    // @ts-ignore - Next.js specific
    io = new SocketIOServer(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    })

    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id)

      // Join room
      socket.on('join', async ({ roomCode, userName }: { roomCode: string; userName: string }) => {
        socket.join(roomCode)

        // Initialize room if it doesn't exist
        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, {
            listeners: new Set(),
            isPlaying: false,
            currentTime: 0,
            currentTrack: null,
            queue: [],
            messages: [],
            host: socket.id,
          })
        }

        const room = rooms.get(roomCode)!
        room.listeners.add(socket.id)

        // Send current room state to new listener
        socket.emit('room-state', {
          isPlaying: room.isPlaying,
          currentTime: room.currentTime,
          currentTrack: room.currentTrack,
          queue: room.queue,
          listeners: room.listeners.size,
        })

        // Send library from GitHub Releases
        const library = await getLibrary()
        socket.emit('library', library)

        // Notify others
        socket.to(roomCode).emit('message', {
          id: Date.now().toString(),
          user: 'System',
          text: `${userName} joined the room`,
          timestamp: Date.now(),
        })

        // Update listener count
        io.to(roomCode).emit('room-state', {
          listeners: room.listeners.size,
        })

        console.log(`User ${userName} joined room ${roomCode}`)
      })

      // Handle playback control
      socket.on('playback', ({ isPlaying }: { isPlaying: boolean }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room || room.host !== socket.id) return

        room.isPlaying = isPlaying
        io.to(roomCode).emit('sync', {
          currentTime: room.currentTime,
          isPlaying,
        })
      })

      // Handle seek
      socket.on('seek', ({ time }: { time: number }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room || room.host !== socket.id) return

        room.currentTime = time
        io.to(roomCode).emit('sync', {
          currentTime: time,
          isPlaying: room.isPlaying,
        })
      })

      // Handle sync updates
      socket.on('sync', (data: { currentTime: number; isPlaying: boolean }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room) return

        room.currentTime = data.currentTime
        room.isPlaying = data.isPlaying
      })

      // Add to queue
      socket.on('add-to-queue', ({ track, userName }: { track: Track; userName: string }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room) return

        const newTrack = { ...track, addedBy: userName }
        room.queue.push(newTrack)

        // If no track playing, start this one
        if (!room.currentTrack) {
          room.currentTrack = room.queue.shift()!
          room.isPlaying = true
          room.currentTime = 0
        }

        io.to(roomCode).emit('room-state', {
          isPlaying: room.isPlaying,
          currentTrack: room.currentTrack,
          queue: room.queue,
        })
      })

      // Remove from queue
      socket.on('remove-from-queue', ({ trackId }: { trackId: string }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room) return

        room.queue = room.queue.filter(t => t.id !== trackId)
        io.to(roomCode).emit('room-state', { queue: room.queue })
      })

      // Next track
      socket.on('next', () => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room || room.host !== socket.id) return

        if (room.queue.length > 0) {
          room.currentTrack = room.queue.shift()!
          room.currentTime = 0
        } else {
          room.currentTrack = null
          room.isPlaying = false
          room.currentTime = 0
        }

        io.to(roomCode).emit('room-state', {
          isPlaying: room.isPlaying,
          currentTime: room.currentTime,
          currentTrack: room.currentTrack,
          queue: room.queue,
        })
      })

      // Chat message
      socket.on('message', ({ text, userName }: { text: string; userName: string }) => {
        const roomCode = Array.from(socket.rooms).find(r => r.startsWith('SYNC'))
        if (!roomCode) return

        const room = rooms.get(roomCode)
        if (!room) return

        const message: Message = {
          id: Date.now().toString(),
          user: userName,
          text,
          timestamp: Date.now(),
        }

        room.messages.push(message)
        io.to(roomCode).emit('message', message)
      })

      // Disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)

        // Find and clean up rooms
        rooms.forEach((room, roomCode) => {
          if (room.listeners.has(socket.id)) {
            room.listeners.delete(socket.id)

            // Transfer host if needed
            if (room.host === socket.id && room.listeners.size > 0) {
              room.host = Array.from(room.listeners)[0]
            }

            // Update listener count
            io.to(roomCode).emit('room-state', {
              listeners: room.listeners.size,
            })

            // Delete empty rooms
            if (room.listeners.size === 0) {
              rooms.delete(roomCode)
            }
          }
        })
      })
    })

    console.log('Socket.IO server initialized')
  }

  res.end()
}
