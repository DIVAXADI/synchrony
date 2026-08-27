import { NextResponse } from 'next/server'

// API route to get the music library
// In production, this would fetch from Cloudflare R2

export async function GET() {
  // Placeholder tracks - will be replaced with R2 integration
  const library = [
    {
      id: '1',
      title: 'Sunset Vibes',
      artist: 'MixMaster',
      duration: 260,
      url: process.env.R2_PUBLIC_URL + '/sunset-vibes.mp3',
    },
    {
      id: '2',
      title: 'Chill Beats',
      artist: 'LofiGang',
      duration: 225,
      url: process.env.R2_PUBLIC_URL + '/chill-beats.mp3',
    },
    {
      id: '3',
      title: 'Night Drive',
      artist: 'SynthWave',
      duration: 312,
      url: process.env.R2_PUBLIC_URL + '/night-drive.mp3',
    },
  ]

  return NextResponse.json({ library })
}
