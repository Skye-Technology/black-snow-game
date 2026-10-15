import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Black Snow',
  description: 'A bullet-time noir shooter prototype',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
