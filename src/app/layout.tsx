import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/ui/Sidebar'
import { ToastProvider } from '@/components/ui/Toast'
import { QuickActions } from '@/components/ui/QuickActions'
import { CoachChat } from '@/components/chat/CoachChat'

export const metadata: Metadata = {
  title: 'Life OS',
  description: 'Martin Jakobsen sitt personlige livsoperativsystem',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Life OS',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0c3230',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb">
      <body>
        <ToastProvider>
          <Sidebar />
          <main className="md:ml-52 min-h-screen pb-20 md:pb-0">
            {children}
          </main>
          <QuickActions />
          <CoachChat />
        </ToastProvider>
      </body>
    </html>
  )
}
