import { NextResponse } from 'next/server'

// Fetch music library from GitHub Releases
const GITHUB_REPO = 'DIVAXADI/synchrony'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN // Optional, for higher rate limits

interface GitHubAsset {
  id: number
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  assets: GitHubAsset[]
}

export async function GET() {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    }

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v1.0.0-music`,
      { headers }
    )

    if (!response.ok) {
      // Return empty library if release not found
      return NextResponse.json({ library: [] })
    }

    const release: GitHubRelease = await response.json()

    // Filter only audio files
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']
    const library = release.assets
      .filter(asset => audioExtensions.some(ext => asset.name.toLowerCase().endsWith(ext)))
      .map((asset, index) => ({
        id: asset.id.toString(),
        title: asset.name.replace(/\.[^/.]+$/, ''), // Remove file extension
        artist: 'Unknown Artist',
        duration: 0, // Will be calculated on client side
        url: asset.browser_download_url,
        addedBy: 'System',
      }))

    return NextResponse.json({ library })
  } catch (error) {
    console.error('Error fetching library:', error)
    return NextResponse.json({ library: [] })
  }
}
