import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Synchrony - Listen Together',
  description: 'Free, real-time synchronized music listening. No ads. No subscriptions.',
  keywords: ['music', 'sync', 'listen together', 'jam', 'collaborative'],
  authors: [{ name: 'Synchrony' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#0a0f1a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
