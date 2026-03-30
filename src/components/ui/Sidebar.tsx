'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const navItems = [
  { href: '/', label: 'Oversikt', icon: '◎', mobile: true },
  { href: '/chat', label: 'Coach', icon: '◆', mobile: true },
  { href: '/vision', label: 'Visjon', icon: '◈', mobile: false },
  { href: '/goals', label: 'Mål', icon: '◉', mobile: true },
  { href: '/daily', label: 'Daglig', icon: '◐', mobile: true },
  { href: '/finance', label: 'Økonomi', icon: '◑', mobile: false },
  { href: '/trends', label: 'Trender', icon: '◓', mobile: false },
  { href: '/review', label: 'Review', icon: '◒', mobile: true },
  { href: '/settings', label: 'Innstillinger', icon: '⚙', mobile: false },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (pathname === '/login') return null

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 min-h-screen fixed left-0 top-0 z-30" style={{ backgroundColor: '#0c3230' }}>
        <div className="px-5 py-6 border-b border-white/10">
          <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'rgba(184,240,74,0.5)' }}>Life OS</span>
          <p className="text-sm font-semibold text-white mt-1">Martin Jakobsen</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={active
                  ? { backgroundColor: 'rgba(184,240,74,0.12)', color: '#b8f04a', fontWeight: 600 }
                  : { color: 'rgba(255,255,255,0.45)' }
                }
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)' }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <p className="text-xs" style={{ color: 'rgba(184,240,74,0.45)' }}>2036 visjon</p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.35)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)' }}
          >
            Logg ut
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav — only show key items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/10" style={{ backgroundColor: '#0c3230' }}>
        {navItems.filter(item => item.mobile).map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-center transition-colors"
              style={{ color: active ? '#b8f04a' : 'rgba(255,255,255,0.4)' }}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] leading-none font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
