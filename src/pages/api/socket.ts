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
      socket.on('join', ({ roomCode, userName }: { roomCode: string; userName: string }) => {
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

        // Send library (placeholder - will be from R2)
        socket.emit('library', getLibrary())

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

// Placeholder library - will be loaded from R2
function getLibrary(): Track[] {
  return [
    {
      id: '1',
      title: 'Sunset Vibes',
      artist: 'MixMaster',
      duration: 260,
      url: '/music/sunset-vibes.mp3',
      addedBy: 'System',
    },
    {
      id: '2',
      title: 'Chill Beats',
      artist: 'LofiGang',
      duration: 225,
      url: '/music/chill-beats.mp3',
      addedBy: 'System',
    },
    {
      id: '3',
      title: 'Night Drive',
      artist: 'SynthWave',
      duration: 312,
      url: '/music/night-drive.mp3',
      addedBy: 'System',
    },
    {
      id: '4',
      title: 'Morning Coffee',
      artist: 'LofiGang',
      duration: 198,
      url: '/music/morning-coffee.mp3',
      addedBy: 'System',
    },
    {
      id: '5',
      title: 'Electric Dreams',
      artist: 'SynthWave',
      duration: 285,
      url: '/music/electric-dreams.mp3',
      addedBy: 'System',
    },
    {
      id: '6',
      title: 'Summer Breeze',
      artist: 'ChillHop',
      duration: 243,
      url: '/music/summer-breeze.mp3',
      addedBy: 'System',
    },
  ]
}
