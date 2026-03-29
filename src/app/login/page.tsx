'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError('Noe gikk galt. Sjekk e-postadressen og prøv igjen.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0c3230' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: 'rgba(184,240,74,0.5)' }}
          >
            Life OS
          </span>
          <h1 className="text-2xl font-semibold text-white mt-2">
            Logg inn
          </h1>
        </div>

        <div
          className="rounded-xl p-6 border"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          {sent ? (
            <div className="text-center py-4">
              <div
                className="text-3xl mb-4"
                style={{ color: '#b8f04a' }}
              >
                ✓
              </div>
              <p className="text-white text-sm font-medium mb-1">
                Sjekk e-posten din for innloggingslenken
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {email}
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-6 text-xs underline"
                style={{ color: 'rgba(255,255,255,0.4)' }}
              >
                Bruk en annen e-post
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  E-post
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.no"
                  required
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white placeholder-white/30 outline-none focus:ring-1"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#3dbfb5'
                    e.currentTarget.style.boxShadow = '0 0 0 1px #3dbfb5'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{
                  backgroundColor: '#b8f04a',
                  color: '#0c3230',
                }}
              >
                {loading ? 'Sender...' : 'Send innloggingslenke'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
