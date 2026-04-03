'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Habit, HabitCompletion, CascadeGoal, Category } from '@/types'
import { CATEGORIES, CATEGORY_MAP } from '@/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface TodayReward {
  id: string
  title: string
  goal_id: string
  cascade_goals: {
    id: string
    title: string
    current_value: number
    target_value: number | null
    unit: string | null
    category: string
  } | null
}

interface WeekEntry {
  category: string
  entry_type: string
  value: number | null
  unit: string | null
}

interface TodayClientProps {
  userId: string
  today: string
  habits: Habit[]
  completions: HabitCompletion[]
  dayGoals: CascadeGoal[]
  weekGoals: CascadeGoal[]
  streak: number
  weekHabitsDone: number
  weeklyTarget: number
  hasTodayBrief: boolean
  todayBrief: string | null
  todayBriefId: string | null
  showWeeklyReview: boolean
  weeklyReviewOverdue: boolean
  weeklyOverdueDays: number
  showMonthlyReview: boolean
  monthlyReviewOverdue: boolean
  monthlyOverdueDays: number
  weekStartStr: string
  weekEndStr: string
  rewards: TodayReward[]
  weekEntries: WeekEntry[]
}

// ---------------------------------------------------------------------------
// Simple markdown renderer
// ---------------------------------------------------------------------------
function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Headers
    if (trimmed.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(`<h3 class="text-sm font-semibold mt-3 mb-1">${trimmed.slice(3)}</h3>`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(`<h2 class="text-base font-semibold mt-3 mb-1">${trimmed.slice(2)}</h2>`)
      continue
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { result.push('<ul class="list-disc pl-4 space-y-0.5">'); inList = true }
      result.push(`<li class="text-sm">${applyInline(trimmed.slice(2))}</li>`)
      continue
    }

    // Empty line
    if (trimmed === '') {
      if (inList) { result.push('</ul>'); inList = false }
      continue
    }

    // Paragraph
    if (inList) { result.push('</ul>'); inList = false }
    result.push(`<p class="text-sm mb-1">${applyInline(trimmed)}</p>`)
  }

  if (inList) result.push('</ul>')
  return result.join('\n')
}

function applyInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

// ---------------------------------------------------------------------------
// Norwegian date helpers
// ---------------------------------------------------------------------------
const NB_DAYS = ['sondag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lordag']
const NB_MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
]

function formatNorwegianFullDate(d: Date): string {
  const day = NB_DAYS[d.getDay()]
  return `${day} ${d.getDate()}. ${NB_MONTHS[d.getMonth()]}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'God morgen, Martin'
  if (h < 17) return 'God ettermiddag, Martin'
  return 'God kveld, Martin'
}

// ---------------------------------------------------------------------------
// Review Flow sub-component
// ---------------------------------------------------------------------------
interface ReviewFlowProps {
  type: 'weekly' | 'monthly'
  userId: string
  weekStartStr: string
  weekEndStr: string
  onClose: () => void
}

function ReviewFlow({ type, userId, weekStartStr, weekEndStr, onClose }: ReviewFlowProps) {
  const router = useRouter()
  const supabase = createClient()
  const maxSteps = type === 'weekly' ? 4 : 5
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [scores, setScores] = useState<Record<Category, number>>({
    business: 50, physical: 50, mental: 50, finance: 50,
    family: 50, lifestyle: 50, brand: 50,
  })
  const [suggestedGoals, setSuggestedGoals] = useState<{ title: string; category: Category; approved: boolean }[]>([])
  const [saved, setSaved] = useState(false)

  // Step 1: fetch data and get Claude summary
  useEffect(() => {
    if (step !== 1) return
    setLoading(true)

    async function fetchAndSummarize() {
      try {
        const [habitsRes, completionsRes, goalsRes, scoresRes] = await Promise.all([
          supabase.from('habits').select('*').eq('active', true),
          supabase.from('habit_completions').select('*, habits(title)')
            .gte('completed_date', weekStartStr).lte('completed_date', weekEndStr),
          supabase.from('cascade_goals').select('*').eq('status', 'active')
            .in('time_horizon', ['quarter', 'month', 'week']),
          supabase.from('progress_snapshots').select('*')
            .order('created_at', { ascending: false }).limit(7),
        ])

        const habits = habitsRes.data ?? []
        const completions = completionsRes.data ?? []
        const goals = goalsRes.data ?? []
        const snapshots = scoresRes.data ?? []

        const habitStats = habits.map((h: Habit) => {
          const count = completions.filter((c: HabitCompletion) => c.habit_id === h.id).length
          return `${h.title}: ${count} av 7`
        }).join('\n')

        const goalProgress = goals.map((g: CascadeGoal) =>
          `${g.title} (${g.time_horizon}): ${g.current_value}/${g.target_value ?? '?'} ${g.unit ?? ''}`
        ).join('\n')

        const scoreStr = snapshots.map((s: { category: string; score: number }) =>
          `${s.category}: ${s.score}`
        ).join('\n')

        const promptType = type === 'weekly' ? 'weekly_review' : 'weekly_review'
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: promptType,
            data: {
              habitStats,
              goalProgress,
              financeStats: '',
              scores: scoreStr,
            },
          }),
        })
        const json = await res.json()
        const text = json.response ?? ''
        setSummary(text)

        // Try parsing SCORES from the response
        const scoresMatch = text.match(/SCORES:\s*(\{[^}]+\})/)
        if (scoresMatch) {
          try {
            const parsed = JSON.parse(scoresMatch[1])
            setScores(prev => ({ ...prev, ...parsed }))
          } catch { /* ignore parse errors */ }
        }
      } catch (err) {
        console.error('Review fetch error:', err)
        setSummary('Kunne ikke generere review. Prøv igjen.')
      } finally {
        setLoading(false)
      }
    }

    fetchAndSummarize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Step 3: suggest goals
  useEffect(() => {
    if (step !== 3) return
    if (suggestedGoals.length > 0) return
    setLoading(true)

    async function suggestGoals() {
      try {
        const { data: activeGoals } = await supabase.from('cascade_goals').select('*')
          .eq('status', 'active').in('time_horizon', ['month', 'quarter'])

        const goalList = (activeGoals ?? []).map((g: CascadeGoal) => g.title).join(', ')

        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Basert på disse aktive måneds/kvartalsmål: ${goalList || 'Ingen'}\n\nForeslå 3-5 konkrete ukemål for neste uke. Returner KUN JSON:\n[{"title": "...", "category": "business|physical|mental|finance|family|lifestyle|brand"}]`,
          }),
        })
        const json = await res.json()
        const text = json.response ?? ''

        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { title: string; category: Category }[]
          setSuggestedGoals(parsed.map(g => ({ ...g, approved: true })))
        }
      } catch (err) {
        console.error('Goal suggestion error:', err)
      } finally {
        setLoading(false)
      }
    }

    suggestGoals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Save everything on final step
  async function handleSave() {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Save progress snapshots
      const snapshotPromises = Object.entries(scores).map(([cat, score]) =>
        supabase.from('progress_snapshots').upsert({
          user_id: userId,
          category: cat,
          score,
          week_start: weekStartStr,
        }, { onConflict: 'user_id,category,week_start' })
      )

      // Save journal entry
      const journalPromise = supabase.from('journal_entries').insert({
        user_id: userId,
        date: today,
        type: type === 'weekly' ? 'weekly_review' : 'monthly_review',
        content: `Scores: ${JSON.stringify(scores)}`,
        ai_response: summary,
      })

      // Create approved week goals
      const goalPromises = suggestedGoals
        .filter(g => g.approved)
        .map(g => supabase.from('cascade_goals').insert({
          user_id: userId,
          category: g.category,
          time_horizon: 'week' as const,
          title: g.title,
          current_value: 0,
          status: 'active',
          start_date: weekStartStr,
          deadline: weekEndStr,
        }))

      await Promise.all([...snapshotPromises, journalPromise, ...goalPromises])
      setSaved(true)
      router.refresh()
    } catch (err) {
      console.error('Save error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[#3dbfb5]/30 bg-white p-4 space-y-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-2">
        {Array.from({ length: maxSteps }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i + 1 <= step ? 'bg-[#3dbfb5]' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Summary */}
      {step === 1 && (
        <div>
          <h3 className="text-sm font-semibold text-[#0c3230] mb-2">
            {type === 'weekly' ? 'Her er uken din' : 'Her er måneden din'}
          </h3>
          {loading ? (
            <LoadingDots />
          ) : (
            <div
              className="text-[#0c3230]/80"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
            />
          )}
        </div>
      )}

      {/* Step 2: Score sliders */}
      {step === 2 && (
        <div>
          <h3 className="text-sm font-semibold text-[#0c3230] mb-3">Juster scores</h3>
          <div className="space-y-3">
            {CATEGORIES.map(cat => (
              <div key={cat.id} className="flex items-center gap-3">
                <span className="text-xs w-16 text-[#0c3230]/70">{cat.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={scores[cat.id]}
                  onChange={e => setScores(prev => ({ ...prev, [cat.id]: Number(e.target.value) }))}
                  className="flex-1 h-1.5 accent-[#3dbfb5] cursor-pointer"
                />
                <span className="text-xs font-mono w-8 text-right text-[#0c3230]">
                  {scores[cat.id]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Suggested goals */}
      {step === 3 && (
        <div>
          <h3 className="text-sm font-semibold text-[#0c3230] mb-3">
            {type === 'weekly' ? 'Neste uke' : 'Neste maned'}
          </h3>
          {loading ? (
            <LoadingDots />
          ) : suggestedGoals.length === 0 ? (
            <p className="text-sm text-[#0c3230]/60">Ingen forslag generert.</p>
          ) : (
            <div className="space-y-2">
              {suggestedGoals.map((g, i) => (
                <label key={i} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.approved}
                    onChange={() => {
                      const next = [...suggestedGoals]
                      next[i] = { ...next[i], approved: !next[i].approved }
                      setSuggestedGoals(next)
                    }}
                    className="mt-0.5 accent-[#3dbfb5]"
                  />
                  <div>
                    <span className="text-sm text-[#0c3230]">{g.title}</span>
                    <span className="text-xs text-[#0c3230]/50 ml-2">
                      {CATEGORY_MAP[g.category]?.label ?? g.category}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 4 (final for weekly): Done */}
      {step === maxSteps && (
        <div>
          {saved ? (
            <div className="text-center py-4">
              <p className="text-sm font-semibold text-[#0c3230]">Ferdig!</p>
              <p className="text-xs text-[#0c3230]/60 mt-1">Review lagret. Scores oppdatert.</p>
              <button
                onClick={onClose}
                className="mt-3 text-xs text-[#3dbfb5] hover:underline"
              >
                Lukk
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-[#0c3230] mb-3">Alt klart. Lagre review?</p>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 bg-[#0c3230] text-white text-sm rounded-lg hover:bg-[#0c3230]/90 disabled:opacity-50"
              >
                {loading ? 'Lagrer...' : 'Lagre'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      {!saved && (
        <div className="flex justify-between pt-2">
          <button
            onClick={() => step === 1 ? onClose() : setStep(step - 1)}
            className="text-xs text-[#0c3230]/60 hover:text-[#0c3230]"
          >
            {step === 1 ? 'Avbryt' : 'Tilbake'}
          </button>
          {step < maxSteps && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={loading}
              className="text-xs font-semibold text-[#3dbfb5] hover:underline disabled:opacity-50"
            >
              Neste
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading dots
// ---------------------------------------------------------------------------
function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-3">
      <span className="text-sm text-[#0c3230]/60">Claude tenker</span>
      <span className="flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-[#3dbfb5] animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-[#3dbfb5] animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-[#3dbfb5] animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TodayClient
// ---------------------------------------------------------------------------
export function TodayClient(props: TodayClientProps) {
  const {
    userId, today, habits, completions: initialCompletions,
    dayGoals: initialDayGoals, weekGoals,
    streak, weekHabitsDone, weeklyTarget,
    hasTodayBrief, todayBrief: initialBrief, todayBriefId,
    showWeeklyReview, weeklyReviewOverdue, weeklyOverdueDays,
    showMonthlyReview, monthlyReviewOverdue, monthlyOverdueDays,
    weekStartStr, weekEndStr,
    rewards, weekEntries,
  } = props

  const router = useRouter()
  const supabase = createClient()

  // Local state
  const [completions, setCompletions] = useState<HabitCompletion[]>(initialCompletions)
  const [dayGoals, setDayGoals] = useState<CascadeGoal[]>(initialDayGoals)
  const [brief, setBrief] = useState<string | null>(initialBrief)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefId, setBriefId] = useState<string | null>(todayBriefId)
  const [newGoalText, setNewGoalText] = useState('')
  const [reviewMode, setReviewMode] = useState<'weekly' | 'monthly' | null>(null)
  const [activeTab, setActiveTab] = useState<'morning' | 'anytime' | 'evening'>('morning')
  const briefGenerated = useRef(false)

  // Filter habits for today
  const todayHabits = habits.filter(h => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') {
      const dayNum = new Date(today + 'T12:00:00').getDay()
      return dayNum >= 1 && dayNum <= 5
    }
    return false
  })

  const habitsByTime = {
    morning: todayHabits.filter(h => h.time_of_day === 'morning'),
    anytime: todayHabits.filter(h => !h.time_of_day || h.time_of_day === 'anytime'),
    evening: todayHabits.filter(h => h.time_of_day === 'evening'),
  }

  const completedIds = new Set(completions.map(c => c.habit_id))
  const totalDone = todayHabits.filter(h => completedIds.has(h.id)).length
  const totalHabits = todayHabits.length
  const habitPct = totalHabits > 0 ? Math.round((totalDone / totalHabits) * 100) : 0

  // Reward near unlock: find first reward where goal >= 75%
  const nearReward = rewards.find(r => {
    const g = r.cascade_goals
    if (!g || !g.target_value || g.target_value === 0) return false
    return (g.current_value / g.target_value) >= 0.75
  })

  // Week summary from weekEntries
  const weekWorkouts = weekEntries.filter(e => e.entry_type === 'workout').length
  const weekSpent = Math.round(Math.abs(
    weekEntries.filter(e => e.entry_type === 'expense' && e.value).reduce((s, e) => s + (e.value ?? 0), 0)
  ))

  function formatKr(n: number): string {
    if (n >= 1000) return `${Math.round(n / 1000)}K`
    return String(n)
  }

  // Auto-generate brief on mount
  useEffect(() => {
    if (hasTodayBrief || briefGenerated.current) return
    briefGenerated.current = true
    generateBrief()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Generate or regenerate brief
  const generateBrief = useCallback(async () => {
    setBriefLoading(true)
    try {
      // Fetch current data for prompt
      const [habitsRes, goalsRes, scoresRes] = await Promise.all([
        supabase.from('habits').select('*').eq('active', true),
        supabase.from('cascade_goals').select('*').eq('status', 'active')
          .in('time_horizon', ['quarter', 'month', 'week', 'day']),
        supabase.from('progress_snapshots').select('*')
          .order('created_at', { ascending: false }).limit(7),
      ])

      const allHabits = (habitsRes.data ?? []) as Habit[]
      const completed = completions.map(c => c.habit_id)
      const completedHabits = allHabits.filter(h => completed.includes(h.id)).map(h => h.title).join(', ')
      const pendingHabits = allHabits.filter(h => !completed.includes(h.id)).map(h => h.title).join(', ')
      const goals = (goalsRes.data ?? []).map((g: CascadeGoal) =>
        `${g.title} (${g.time_horizon}): ${g.current_value}/${g.target_value ?? '?'} ${g.unit ?? ''}`
      ).join('\n')
      const scoreStr = (scoresRes.data ?? []).map((s: { category: string; score: number }) =>
        `${s.category}: ${s.score}`
      ).join('\n')

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'daily_brief',
          data: {
            habits: '',
            completedHabits: completedHabits || 'Ingen ennå',
            pendingHabits: pendingHabits || 'Ingen',
            goals: goals || 'Ingen aktive mål',
            milestones: '',
            priorities: dayGoals.map(g => g.title).join(', ') || 'Ingen satt',
            scores: scoreStr || 'Ikke satt',
          },
        }),
      })

      const json = await res.json()
      const text = json.response ?? ''
      setBrief(text)

      // Save or update journal entry
      if (briefId) {
        await supabase.from('journal_entries').update({
          ai_response: text,
          content: 'Daglig brief',
        }).eq('id', briefId)
      } else {
        const { data } = await supabase.from('journal_entries').insert({
          user_id: userId,
          date: today,
          type: 'daily_brief',
          content: 'Daglig brief',
          ai_response: text,
        }).select('id').single()
        if (data) setBriefId(data.id)
      }
    } catch (err) {
      console.error('Brief generation error:', err)
      setBrief('Kunne ikke generere brief. Prøv igjen.')
    } finally {
      setBriefLoading(false)
    }
  }, [supabase, userId, today, completions, dayGoals, briefId])

  // Toggle habit completion (optimistic)
  async function toggleHabit(habitId: string) {
    const isCompleted = completedIds.has(habitId)

    if (isCompleted) {
      // Remove completion
      const completion = completions.find(c => c.habit_id === habitId)
      setCompletions(prev => prev.filter(c => c.habit_id !== habitId))
      if (completion) {
        await supabase.from('habit_completions').delete().eq('id', completion.id)
      }
    } else {
      // Add completion
      const optimistic: HabitCompletion = {
        id: `temp-${Date.now()}`,
        habit_id: habitId,
        completed_date: today,
        created_at: new Date().toISOString(),
      }
      setCompletions(prev => [...prev, optimistic])

      const { data } = await supabase.from('habit_completions').insert({
        habit_id: habitId,
        completed_date: today,
      }).select().single()

      if (data) {
        setCompletions(prev =>
          prev.map(c => c.id === optimistic.id ? (data as HabitCompletion) : c)
        )
      }
    }
    router.refresh()
  }

  // Toggle day goal completion
  async function toggleDayGoal(goalId: string) {
    const goal = dayGoals.find(g => g.id === goalId)
    if (!goal) return

    const newStatus = goal.status === 'completed' ? 'active' : 'completed'
    setDayGoals(prev => prev.map(g =>
      g.id === goalId ? { ...g, status: newStatus as CascadeGoal['status'] } : g
    ))

    await supabase.from('cascade_goals').update({ status: newStatus }).eq('id', goalId)
    router.refresh()
  }

  // Add new day goal
  async function addDayGoal() {
    const text = newGoalText.trim()
    if (!text) return

    const optimistic: CascadeGoal = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      category: 'business',
      time_horizon: 'day',
      title: text,
      current_value: 0,
      status: 'active',
      start_date: today,
      deadline: today,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setDayGoals(prev => [...prev, optimistic])
    setNewGoalText('')

    const { data } = await supabase.from('cascade_goals').insert({
      user_id: userId,
      category: 'business',
      time_horizon: 'day',
      title: text,
      current_value: 0,
      status: 'active',
      start_date: today,
      deadline: today,
    }).select().single()

    if (data) {
      setDayGoals(prev =>
        prev.map(g => g.id === optimistic.id ? (data as CascadeGoal) : g)
      )
    }
    router.refresh()
  }

  // Category color helper
  const catColor = (cat: string) => {
    const colors: Record<string, string> = {
      business: '#1d4ed8', physical: '#0d9488', mental: '#7c3aed',
      finance: '#d97706', family: '#db2777', lifestyle: '#ea580c', brand: '#4f46e5',
    }
    return colors[cat] ?? '#6b7280'
  }

  // Tab labels
  const TAB_INFO: Record<string, string> = { morning: 'Morgen', anytime: 'Dag', evening: 'Kveld' }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* 1. HEADER + BRIEF */}
      <header>
        <div className="flex items-start justify-between">
          <h1 className="text-lg font-semibold text-[#0c3230]">{getGreeting()}</h1>
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#0c3230]/5 transition-colors disabled:opacity-30 flex-shrink-0"
            aria-label="Oppdater brief"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0c3230" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={briefLoading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-[#0c3230]/50 mb-2">{formatNorwegianFullDate(new Date())}</p>
        {briefLoading ? (
          <LoadingDots />
        ) : brief ? (
          <div className="rounded-xl bg-[#f7f9f7] p-3 mt-1">
            <div
              className="text-[#0c3230]/80 fade-in"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(brief) }}
            />
          </div>
        ) : null}
      </header>

      {/* 2. OVERDUE REVIEWS */}
      {reviewMode ? (
        <ReviewFlow
          type={reviewMode}
          userId={userId}
          weekStartStr={weekStartStr}
          weekEndStr={weekEndStr}
          onClose={() => { setReviewMode(null); router.refresh() }}
        />
      ) : (
        <>
          {showWeeklyReview && (
            <section className="rounded-xl border-l-4 p-3 flex items-center justify-between bg-red-50/50"
              style={{ borderColor: weeklyReviewOverdue ? '#ef4444' : '#eab308' }}
            >
              <p className={`text-sm font-medium ${weeklyReviewOverdue ? 'text-red-600' : 'text-yellow-600'}`}>
                {weeklyReviewOverdue
                  ? `Ukentlig review forfalt (${weeklyOverdueDays}d)`
                  : 'Ukentlig review klart'
                }
              </p>
              <button onClick={() => setReviewMode('weekly')} className="text-xs font-semibold text-[#3dbfb5] hover:underline ml-3 flex-shrink-0">Start</button>
            </section>
          )}
          {showMonthlyReview && (
            <section className="rounded-xl border-l-4 p-3 flex items-center justify-between bg-red-50/50"
              style={{ borderColor: monthlyReviewOverdue ? '#ef4444' : '#eab308' }}
            >
              <p className={`text-sm font-medium ${monthlyReviewOverdue ? 'text-red-600' : 'text-yellow-600'}`}>
                {monthlyReviewOverdue
                  ? `Månedlig review forfalt (${monthlyOverdueDays}d)`
                  : 'Månedlig review klart'
                }
              </p>
              <button onClick={() => setReviewMode('monthly')} className="text-xs font-semibold text-[#3dbfb5] hover:underline ml-3 flex-shrink-0">Start</button>
            </section>
          )}
        </>
      )}

      {/* 3. VANER — with tabs */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0c3230]/50">Vaner</h2>
          <span className="text-xs text-[#0c3230]/40">{totalDone}/{totalHabits} · {habitPct}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#0c3230]/10 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-[#b8f04a] rounded-full transition-all duration-300" style={{ width: `${habitPct}%` }} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          {(['morning', 'anytime', 'evening'] as const).map(tab => {
            const count = habitsByTime[tab].length
            const doneCount = habitsByTime[tab].filter(h => completedIds.has(h.id)).length
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  activeTab === tab
                    ? 'bg-[#0c3230] text-white'
                    : 'bg-[#0c3230]/5 text-[#0c3230]/60 hover:bg-[#0c3230]/10'
                }`}
              >
                {TAB_INFO[tab]} {count > 0 && `${doneCount}/${count}`}
              </button>
            )
          })}
        </div>

        {/* Habit list */}
        <div className="space-y-0.5">
          {habitsByTime[activeTab].length === 0 ? (
            <p className="text-xs text-[#0c3230]/40 py-2">Ingen vaner i denne kategorien.</p>
          ) : habitsByTime[activeTab].map(habit => {
            const done = completedIds.has(habit.id)
            return (
              <label key={habit.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox" checked={done} onChange={() => toggleHabit(habit.id)}
                  className="w-4 h-4 rounded border-[#0c3230]/20 accent-[#b8f04a] cursor-pointer"
                />
                <span className={`flex-1 text-sm transition-colors ${done ? 'text-[#0c3230]/40 line-through' : 'text-[#0c3230]'}`}>
                  {habit.title}
                </span>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(habit.category) }} />
              </label>
            )
          })}
        </div>
      </section>

      {/* 4. DAGENS MÅL */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0c3230]/50 mb-2">Dagens mål</h2>

        {dayGoals.length > 0 ? (
          <div className="space-y-0.5 mb-2">
            {dayGoals.map(goal => {
              const done = goal.status === 'completed'
              return (
                <label key={goal.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                  <input
                    type="checkbox" checked={done} onChange={() => toggleDayGoal(goal.id)}
                    className="w-4 h-4 rounded border-[#0c3230]/20 accent-[#b8f04a] cursor-pointer"
                  />
                  <span className={`flex-1 text-sm transition-colors ${done ? 'text-[#0c3230]/40 line-through' : 'text-[#0c3230]'}`}>
                    {goal.title}
                  </span>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(goal.category) }} />
                </label>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-[#0c3230]/40 mb-2">Legg til mål for i dag.</p>
        )}

        <input
          type="text"
          value={newGoalText}
          onChange={e => setNewGoalText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addDayGoal()}
          placeholder="Legg til oppgave..."
          className="w-full text-sm px-3 py-2 rounded-lg border border-[#0c3230]/10 bg-white text-[#0c3230] placeholder:text-[#0c3230]/30 focus:outline-none focus:border-[#3dbfb5]"
        />
      </section>

      {/* 5. UKEMÅL (compact) */}
      {weekGoals.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#0c3230]/50 mb-2">Ukemål</h2>
          <div className="space-y-1.5">
            {weekGoals.map(goal => {
              const pct = goal.target_value ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0
              return (
                <button
                  key={goal.id}
                  onClick={() => { window.location.href = `/map?focus=${goal.id}` }}
                  className="w-full text-left flex items-center gap-3 py-1.5 hover:bg-[#0c3230]/5 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor(goal.category) }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0c3230] truncate">{goal.title}</p>
                    {goal.target_value != null && goal.target_value > 0 && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex-1 h-1 bg-[#0c3230]/10 rounded-full overflow-hidden">
                          <div className="h-full bg-[#b8f04a] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-[#0c3230]/50">{goal.current_value}/{goal.target_value} {goal.unit ?? ''}</span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 6. BELØNNING */}
      {nearReward && nearReward.cascade_goals && (
        <button
          onClick={() => { window.location.href = `/map?focus=${nearReward.cascade_goals!.id}` }}
          className="w-full rounded-xl p-3 flex items-center gap-3 text-left transition-colors hover:bg-[#b8f04a]/10"
          style={{ backgroundColor: '#b8f04a15', border: '1px solid #b8f04a40' }}
        >
          <span className="text-lg flex-shrink-0">🎁</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[#0c3230]">
              <span className="font-semibold">{Math.round((nearReward.cascade_goals.current_value / (nearReward.cascade_goals.target_value ?? 1)) * 100)}%</span>
              {' '}av veien til {nearReward.cascade_goals.title}
            </p>
            <p className="text-xs text-[#0c3230]/50 mt-0.5">{nearReward.title}</p>
          </div>
        </button>
      )}

      {/* 7. FOOTER — streak + week summary */}
      <footer className="flex items-center justify-between text-xs text-[#0c3230]/50 pt-2 border-t border-[#0c3230]/5">
        <span>{streak > 0 ? `${streak}d streak` : 'Ingen streak'}</span>
        <span>Uke: {weekHabitsDone}/{weeklyTarget} habits{weekWorkouts > 0 ? ` · ${weekWorkouts} treninger` : ''}{weekSpent > 0 ? ` · ${formatKr(weekSpent)} brukt` : ''}</span>
      </footer>

      {/* Bottom padding for mobile nav */}
      <div className="h-4" />

      {/* Fade-in animation */}
      <style jsx global>{`
        .fade-in { animation: fadeIn 0.3s ease-in; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
