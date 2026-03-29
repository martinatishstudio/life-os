'use client'

import { useClaudeAPI, ClaudeResponseDark } from '@/components/ui/ClaudeResponse'
import { createClient } from '@/lib/supabase'
import { CATEGORIES } from '@/types'

export function DailyBrief() {
  const claude = useClaudeAPI()
  const supabase = createClient()

  async function generateBrief() {
    const today = new Date().toISOString().split('T')[0]

    // Fetch ALL fresh data from Supabase at click-time
    const [habitsRes, completionsRes, goalsRes, milestonesRes, prioritiesRes, snapshotsRes] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true),
      supabase.from('habit_completions').select('*').eq('completed_date', today),
      supabase.from('goals').select('*').eq('status', 'active').order('deadline'),
      supabase.from('milestones').select('*').eq('completed', false).order('target_date'),
      supabase.from('daily_priorities').select('*').eq('date', today).order('sort_order'),
      supabase.from('progress_snapshots').select('*').order('week_start', { ascending: false }).limit(7),
    ])

    const habits = habitsRes.data ?? []
    const completions = completionsRes.data ?? []
    const goals = goalsRes.data ?? []
    const milestones = milestonesRes.data ?? []
    const priorities = prioritiesRes.data ?? []
    const snapshots = snapshotsRes.data ?? []

    const completedIds = new Set(completions.map((c: { habit_id: string }) => c.habit_id))

    const completedHabits = habits
      .filter((h: { id: string }) => completedIds.has(h.id))
      .map((h: { title: string }) => h.title)
      .join(', ')

    const pendingHabits = habits
      .filter((h: { id: string }) => !completedIds.has(h.id))
      .map((h: { title: string }) => h.title)
      .join(', ')

    const goalsText = goals.slice(0, 12).map((g: { title: string; target_value?: number; current_value: number; deadline?: string }) => {
      const pct = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : null
      const deadline = g.deadline ? ` (frist: ${g.deadline})` : ''
      return `${g.title}${pct !== null ? ` — ${pct}%` : ''}${deadline}`
    }).join('\n')

    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const upcomingMilestones = milestones
      .filter((m: { target_date?: string }) => m.target_date && m.target_date <= thirtyDays)
      .map((m: { title: string; target_date?: string }) => `${m.title} (${m.target_date})`)
      .join('\n')

    const prioritiesText = priorities.length > 0
      ? priorities.map((p: { completed: boolean; title: string }) => `${p.completed ? '✓' : '○'} ${p.title}`).join('\n')
      : 'Ingen satt'

    const scoresText = snapshots.length > 0
      ? CATEGORIES.map(cat => {
          const snap = snapshots.find((s: { category: string }) => s.category === cat.id)
          return snap ? `${cat.label}: ${(snap as { score: number }).score}/100` : null
        }).filter(Boolean).join(', ')
      : 'Ikke satt'

    await claude.call('daily_brief', {
      completedHabits: completedHabits || 'Ingen',
      pendingHabits: pendingHabits || 'Ingen',
      goals: goalsText || 'Ingen aktive mål',
      milestones: upcomingMilestones || 'Ingen innen 30 dager',
      priorities: prioritiesText,
      scores: scoresText,
    })
  }

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: '#0c3230' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-white">Daglig brief</p>
        <button
          onClick={generateBrief}
          disabled={claude.loading}
          className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
        >
          {claude.loading ? 'Tenker...' : claude.response ? 'Oppdater' : 'Generer brief'}
        </button>
      </div>

      {!claude.response && !claude.loading && !claude.error && (
        <p className="text-sm italic mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Trykk for Claudes analyse av dagen din.
        </p>
      )}

      <ClaudeResponseDark
        response={claude.response}
        loading={claude.loading}
        error={claude.error}
      />
    </div>
  )
}
