'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
// Claude API used for brief generation via fetch
import { CATEGORY_MAP, type Category } from '@/types'
import type { Habit, HabitCompletion, CascadeGoal } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityItem {
  id: string
  text: string
  created_at: string
}

interface SmartDashboardProps {
  userId: string
  today: string
  hasTodayBrief: boolean
  todayBrief: string | null
  todayBriefId: string | null
  habits: Habit[]
  completions: HabitCompletion[]
  totalTodayHabits: number
  streak: number
  quarterGoals: CascadeGoal[]
  coachHealthPct: number
  activities: ActivityItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_DOT_COLOR: Record<Category, string> = {
  business: '#3b82f6',
  physical: '#14b8a6',
  mental: '#a78bfa',
  finance: '#f5c070',
  family: '#f0a0c0',
  lifestyle: '#f0a07a',
  brand: '#6366f1',
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'God morgen'
  if (h < 17) return 'God ettermiddag'
  return 'God kveld'
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'akkurat nå'
  if (diffMin < 60) return `${diffMin} min siden`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ${diffH === 1 ? 'time' : 'timer'} siden`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'i går'
  if (diffD < 7) return `${diffD} dager siden`
  const diffW = Math.floor(diffD / 7)
  return `${diffW} ${diffW === 1 ? 'uke' : 'uker'} siden`
}

function daysUntil(deadline: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(deadline + 'T00:00:00')
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function getOnTrackStatus(goal: CascadeGoal): 'ahead' | 'on_track' | 'behind' {
  if (!goal.target_value || goal.target_value === 0) return 'on_track'
  const progressPct = (goal.current_value / goal.target_value) * 100

  const start = goal.start_date ? new Date(goal.start_date) : new Date(goal.created_at)
  const end = goal.deadline ? new Date(goal.deadline) : new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  const elapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  const timePct = Math.min(100, (elapsed / totalDays) * 100)

  if (progressPct >= timePct) return 'ahead'
  if (progressPct >= timePct - 10) return 'on_track'
  return 'behind'
}

const STATUS_DOT_COLOR: Record<'ahead' | 'on_track' | 'behind', string> = {
  ahead: '#22c55e',
  on_track: '#eab308',
  behind: '#ef4444',
}

// Simple markdown renderer
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listItems: string[] = []
  let key = 0

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-outside pl-4 space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{renderInline(item)}</li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  function renderInline(t: string): React.ReactNode {
    const parts: React.ReactNode[] = []
    let remaining = t
    let inlineKey = 0
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) parts.push(<span key={inlineKey++}>{remaining.slice(0, boldMatch.index)}</span>)
        parts.push(<strong key={inlineKey++} className="font-semibold">{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else {
        parts.push(<span key={inlineKey++}>{remaining}</span>)
        break
      }
    }
    return <>{parts}</>
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, ''))
    } else {
      flushList()
      if (trimmed === '') {
        elements.push(<div key={key++} className="h-2" />)
      } else if (trimmed.startsWith('###')) {
        elements.push(<p key={key++} className="text-sm font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else if (trimmed.startsWith('##')) {
        elements.push(<p key={key++} className="text-sm font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else if (trimmed.startsWith('#')) {
        elements.push(<p key={key++} className="text-base font-bold mt-3 mb-1">{renderInline(trimmed.replace(/^#+\s*/, ''))}</p>)
      } else {
        elements.push(<p key={key++} className="text-sm leading-relaxed">{renderInline(trimmed)}</p>)
      }
    }
  }
  flushList()
  return elements
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  )
}

function HabitProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? (completed / total) * 100 : 0
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#b8f04a' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SmartDashboard({
  userId,
  today,
  hasTodayBrief,
  todayBrief,
  todayBriefId,
  habits,
  completions: initialCompletions,
  totalTodayHabits,
  streak,
  quarterGoals,
  coachHealthPct,
  activities,
}: SmartDashboardProps) {
  const supabase = createClient()

  // Brief state
  const [briefText, setBriefText] = useState<string | null>(todayBrief)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)

  // Habits state
  const [completionSet, setCompletionSet] = useState<Set<string>>(
    new Set(initialCompletions.map((c) => c.habit_id))
  )
  const [activeTab, setActiveTab] = useState<'morning' | 'anytime' | 'evening'>('morning')

  // Determine which habits are for today
  const todayHabits = habits.filter((h) => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') {
      const day = new Date(today + 'T12:00:00').getDay()
      return day >= 1 && day <= 5
    }
    return false
  })

  const habitsByTime: Record<string, Habit[]> = {
    morning: todayHabits.filter((h) => h.time_of_day === 'morning'),
    anytime: todayHabits.filter((h) => !h.time_of_day || h.time_of_day === 'anytime'),
    evening: todayHabits.filter((h) => h.time_of_day === 'evening'),
  }

  const currentCompleted = todayHabits.filter((h) => completionSet.has(h.id)).length

  // Auto-generate brief if missing
  useEffect(() => {
    if (!hasTodayBrief && !briefText && !briefLoading) {
      generateBrief()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generateBrief = useCallback(async () => {
    setBriefLoading(true)
    setBriefError(null)
    try {
      // Fetch fresh data for the brief
      const [habitsRes, completionsRes, goalsRes, cascadeRes, milestonesRes, prioritiesRes, snapshotsRes] = await Promise.all([
        supabase.from('habits').select('*').eq('active', true),
        supabase.from('habit_completions').select('*').eq('completed_date', today),
        supabase.from('goals').select('*').eq('status', 'active').order('deadline'),
        supabase.from('cascade_goals').select('*').eq('status', 'active').in('time_horizon', ['quarter', 'month']).order('deadline'),
        supabase.from('milestones').select('*').eq('completed', false).order('target_date'),
        supabase.from('daily_priorities').select('*').eq('date', today).order('sort_order'),
        supabase.from('progress_snapshots').select('*').order('week_start', { ascending: false }).limit(7),
      ])

      const hList = habitsRes.data ?? []
      const cList = completionsRes.data ?? []
      const gList = goalsRes.data ?? []
      const cgList = (cascadeRes.data ?? []) as CascadeGoal[]
      const mList = milestonesRes.data ?? []
      const pList = prioritiesRes.data ?? []
      const sList = snapshotsRes.data ?? []

      const completedIds = new Set(cList.map((c: { habit_id: string }) => c.habit_id))
      const completedHabits = hList.filter((h: { id: string }) => completedIds.has(h.id)).map((h: { title: string }) => h.title).join(', ')
      const pendingHabits = hList.filter((h: { id: string }) => !completedIds.has(h.id)).map((h: { title: string }) => h.title).join(', ')

      const goalsText = gList.slice(0, 12).map((g: { title: string; target_value?: number; current_value: number; deadline?: string }) => {
        const pct = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : null
        const deadline = g.deadline ? ` (frist: ${g.deadline})` : ''
        return `${g.title}${pct !== null ? ` — ${pct}%` : ''}${deadline}`
      }).join('\n')

      const cascadeGoalsText = cgList.map((g) => {
        const pct = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : null
        const status = getOnTrackStatus(g)
        const statusLabel = status === 'ahead' ? 'foran' : status === 'on_track' ? 'på sporet' : 'bak skjema'
        const deadline = g.deadline ? ` (frist: ${g.deadline})` : ''
        return `[${g.time_horizon}] ${g.title}${pct !== null ? ` ${pct}%` : ''} (${statusLabel})${deadline}`
      }).join('\n')

      const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const upcomingMilestones = mList
        .filter((m: { target_date?: string }) => m.target_date && m.target_date <= thirtyDays)
        .map((m: { title: string; target_date?: string }) => `${m.title} (${m.target_date})`)
        .join('\n')

      const prioritiesText = pList.length > 0
        ? pList.map((p: { completed: boolean; title: string }) => `${p.completed ? '✓' : '○'} ${p.title}`).join('\n')
        : 'Ingen satt'

      const scoresText = sList.length > 0
        ? sList.map((s: { category: string; score: number }) => {
            const cat = CATEGORY_MAP[s.category as Category]
            return cat ? `${cat.label}: ${s.score}/100` : null
          }).filter(Boolean).join(', ')
        : 'Ikke satt'

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'daily_brief',
          data: {
            completedHabits: completedHabits || 'Ingen',
            pendingHabits: pendingHabits || 'Ingen',
            goals: goalsText || 'Ingen aktive mål',
            cascadeGoals: cascadeGoalsText || 'Ingen aktive kvartalsmål',
            milestones: upcomingMilestones || 'Ingen innen 30 dager',
            priorities: prioritiesText,
            scores: scoresText,
          },
        }),
      })
      if (!res.ok) throw new Error('API-feil')
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const text = json.response as string
      setBriefText(text)

      // Save as journal_entry
      await supabase.from('journal_entries').upsert(
        {
          id: todayBriefId ?? undefined,
          user_id: userId,
          date: today,
          type: 'daily_brief',
          content: 'Auto-generert daglig brief',
          ai_response: text,
        },
        { onConflict: 'id' }
      )
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : 'Noe gikk galt')
    } finally {
      setBriefLoading(false)
    }
  }, [supabase, today, userId, todayBriefId])

  // Toggle habit completion
  async function toggleHabit(habitId: string) {
    const isCompleted = completionSet.has(habitId)
    const next = new Set(completionSet)
    if (isCompleted) {
      next.delete(habitId)
      setCompletionSet(next)
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('completed_date', today)
    } else {
      next.add(habitId)
      setCompletionSet(next)
      await supabase.from('habit_completions').insert({ habit_id: habitId, completed_date: today })
    }
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const tabs: { key: 'morning' | 'anytime' | 'evening'; label: string }[] = [
    { key: 'morning', label: 'Morgen' },
    { key: 'anytime', label: 'Dag' },
    { key: 'evening', label: 'Kveld' },
  ]

  return (
    <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          {getGreeting()}, Martin
        </h1>
      </div>

      {/* Daily Brief */}
      <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: '#f7f9f7' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Daglig brief</p>
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            {briefLoading ? 'Genererer...' : 'Oppdater brief'}
          </button>
        </div>

        {briefLoading && (
          <div className="flex items-center gap-2 py-3">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '300ms' }} />
            </div>
            <span className="text-sm text-gray-500">Claude tenker...</span>
          </div>
        )}

        {briefError && <p className="text-sm text-red-500 py-2">{briefError}</p>}

        {briefText && !briefLoading && (
          <div className="text-gray-800">{renderMarkdown(briefText)}</div>
        )}

        {!briefText && !briefLoading && !briefError && (
          <p className="text-sm text-gray-400 italic">Ingen brief generert ennå.</p>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Habits i dag"
          value={`${currentCompleted}/${totalTodayHabits}`}
          sub={<HabitProgressBar completed={currentCompleted} total={totalTodayHabits} />}
        />
        <MetricCard label="Streak" value={<span>{streak} dager 🔥</span>} />
        <MetricCard
          label="Mål som haster"
          value={quarterGoals.filter((g) => getOnTrackStatus(g) === 'behind').length}
          sub={<p className="text-xs text-gray-500">{quarterGoals.filter((g) => getOnTrackStatus(g) === 'behind').length > 0 ? 'kvartalsmål bak skjema' : 'ingen haster'}</p>}
        />
        <MetricCard
          label="Coach-helse"
          value={`${coachHealthPct}%`}
          sub={<p className="text-xs text-gray-500">Profil oppdatert</p>}
        />
      </div>

      {/* Today's Habits */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Dagens vaner</h2>

        {/* Tab buttons */}
        <div className="flex gap-2 mb-3">
          {tabs.map((tab) => {
            const count = habitsByTime[tab.key]?.length ?? 0
            const done = habitsByTime[tab.key]?.filter((h) => completionSet.has(h.id)).length ?? 0
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'text-white'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={activeTab === tab.key ? { backgroundColor: '#0c3230' } : undefined}
              >
                {tab.label} ({done}/{count})
              </button>
            )
          })}
        </div>

        {/* Habit list */}
        <ul className="space-y-1">
          {(habitsByTime[activeTab] ?? []).map((habit) => {
            const done = completionSet.has(habit.id)
            return (
              <li key={habit.id} className="flex items-center gap-2.5 py-1.5 px-1 -mx-1 rounded-lg hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => toggleHabit(habit.id)}
                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    done ? 'border-transparent' : 'border-gray-300 hover:border-[#0c3230]'
                  }`}
                  style={done ? { backgroundColor: '#0c3230' } : undefined}
                >
                  {done && (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`text-sm ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {habit.title}
                </span>
                <span
                  className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_DOT_COLOR[habit.category] ?? '#6b7280' }}
                />
              </li>
            )
          })}
          {(habitsByTime[activeTab] ?? []).length === 0 && (
            <p className="text-sm text-gray-400 italic py-2">Ingen vaner i denne perioden</p>
          )}
        </ul>
      </div>

      {/* Focus Areas (Quarter Goals) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Fokusområder</h2>
        {quarterGoals.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Ingen aktive kvartalsmål</p>
        ) : (
          <ul className="space-y-3">
            {quarterGoals.map((goal) => {
              const pct = goal.target_value ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0
              const remaining = goal.deadline ? daysUntil(goal.deadline) : null
              const status = getOnTrackStatus(goal)
              return (
                <li key={goal.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CATEGORY_DOT_COLOR[goal.category] ?? '#6b7280' }}
                    />
                    <span className="text-sm font-medium text-gray-800 flex-1">{goal.title}</span>
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      title={status === 'ahead' ? 'Foran skjema' : status === 'on_track' ? 'På sporet' : 'Bak skjema'}
                      style={{ backgroundColor: STATUS_DOT_COLOR[status] }}
                    />
                    {remaining !== null && (
                      <span className="text-xs text-gray-500">{remaining} dager igjen</span>
                    )}
                  </div>
                  {goal.target_value ? (
                    <div className="ml-4">
                      <div className="w-full h-1.5 rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: CATEGORY_DOT_COLOR[goal.category] ?? '#6b7280' }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {goal.current_value}{goal.unit ? ` ${goal.unit}` : ''} / {goal.target_value}{goal.unit ? ` ${goal.unit}` : ''} ({pct}%)
                      </p>
                    </div>
                  ) : (
                    <div className="ml-4">
                      <p className="text-xs text-gray-400">Ingen tallmål satt</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Activity Feed */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Siste aktivitet</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Ingen aktivitet ennå</p>
        ) : (
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{a.text}</p>
                  <p className="text-xs text-gray-400">{relativeTime(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
