'use client'

import { useState } from 'react'
import type { ProgressSnapshot, JournalEntry } from '@/types'
import { CATEGORIES } from '@/types'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

interface WeeklyReviewProps {
  snapshots: ProgressSnapshot[]
  journals: JournalEntry[]
  weekStart: string
}

export function WeeklyReview({ snapshots: initialSnapshots, journals, weekStart }: WeeklyReviewProps) {
  const [snapshots, setSnapshots] = useState(initialSnapshots)
  const [review, setReview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function updateScore(category: string, score: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSnapshots((prev) => {
      const existing = prev.find((s) => s.category === category)
      if (existing) {
        return prev.map((s) => s.category === category ? { ...s, score } : s)
      }
      return [...prev, {
        id: crypto.randomUUID(),
        user_id: user.id,
        category,
        score,
        week_start: weekStart,
        created_at: new Date().toISOString(),
      } as ProgressSnapshot]
    })

    await supabase.from('progress_snapshots').upsert({
      user_id: user.id,
      category,
      score,
      week_start: weekStart,
    }, { onConflict: 'user_id,category,week_start' })
  }

  async function generateReview() {
    setLoading(true)
    try {
      const scoresText = CATEGORIES.map((cat) => {
        const snap = snapshots.find((s) => s.category === cat.id)
        return `${cat.label}: ${snap?.score ?? 0}/100`
      }).join(', ')

      const message = `Ukesreview for uke som starter ${weekStart}.

Kategoriscorer: ${scoresText}

Gi meg en ukesreview. Hva gikk bra? Hva trenger oppmerksomhet? Hva bør jeg prioritere neste uke? Vær direkte og konkret.`

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      setReview(data.response)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('journal_entries').insert({
          user_id: user.id,
          date: weekStart,
          type: 'weekly_review',
          content: message,
          ai_response: data.response,
        })
      }
    } catch {
      setReview('Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Score input per category */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Score per kategori</h2>
        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const snap = snapshots.find((s) => s.category === cat.id)
            const score = snap?.score ?? 0

            return (
              <div key={cat.id} className="flex items-center gap-3">
                <span className={`text-xs font-medium w-20 flex-shrink-0 ${cat.color}`}>{cat.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={score}
                  onChange={(e) => updateScore(cat.id, Number(e.target.value))}
                  className="flex-1 accent-gray-900"
                />
                <span className="text-sm font-semibold text-gray-900 w-8 text-right">{score}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Generate review */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Claude sin review</h2>
          <button
            onClick={generateReview}
            disabled={loading}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Genererer...' : 'Generer review'}
          </button>
        </div>

        {review ? (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{review}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">
            Sett ukesscorer og trykk &quot;Generer review&quot; for å få Claudes analyse.
          </p>
        )}
      </div>

      {/* Previous reviews */}
      {journals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tidligere reviews</h2>
          <div className="space-y-3">
            {journals.map((j) => (
              <div key={j.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-400 mb-2">{formatDate(j.date)}</p>
                {j.ai_response && (
                  <p className="text-sm text-gray-700 leading-relaxed">{j.ai_response}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
