import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ProgressSnapshot, JournalEntry, Habit, HabitCompletion, Goal } from '@/types'
import { getWeekStart, toDateString } from '@/lib/utils'
import { ReviewClient } from '@/components/review/ReviewClient'

export const revalidate = 0

export default async function ReviewPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now = new Date()
  const weekStart = toDateString(getWeekStart(now))

  const weekEnd = new Date(getWeekStart(now))
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = toDateString(weekEnd)

  const prevWeekStart = new Date(getWeekStart(now))
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekStartStr = toDateString(prevWeekStart)
  const prevWeekEnd = new Date(prevWeekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() + 6)
  const prevWeekEndStr = toDateString(prevWeekEnd)

  const [snapshotsRes, journalRes, habitsRes, completionsRes, goalsRes, weekExpRes, prevWeekExpRes] = await Promise.all([
    supabase.from('progress_snapshots').select('*').eq('week_start', weekStart),
    supabase
      .from('journal_entries')
      .select('*')
      .in('type', ['weekly_review', 'monthly_review', 'daily_brief', 'note'])
      .order('date', { ascending: false })
      .limit(20),
    supabase.from('habits').select('*').eq('active', true),
    supabase
      .from('habit_completions')
      .select('*')
      .gte('completed_date', weekStart)
      .lte('completed_date', weekEndStr),
    supabase.from('goals').select('*').eq('status', 'active').order('deadline', { ascending: true }),
    supabase
      .from('finance_entries')
      .select('amount')
      .gte('date', weekStart)
      .lte('date', weekEndStr)
      .lt('amount', 0),
    supabase
      .from('finance_entries')
      .select('amount')
      .gte('date', prevWeekStartStr)
      .lte('date', prevWeekEndStr)
      .lt('amount', 0),
  ])

  const snapshots = (snapshotsRes.data ?? []) as ProgressSnapshot[]
  const journals = (journalRes.data ?? []) as JournalEntry[]
  const habits = (habitsRes.data ?? []) as Habit[]
  const completions = (completionsRes.data ?? []) as HabitCompletion[]
  const goals = (goalsRes.data ?? []) as Goal[]
  const weekExpenses = Math.abs((weekExpRes.data ?? []).reduce((s, e) => s + e.amount, 0))
  const prevWeekExpenses = Math.abs((prevWeekExpRes.data ?? []).reduce((s, e) => s + e.amount, 0))

  const weekNumber = getWeekNumber()

  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Uke {weekNumber}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Review</h1>
      </div>

      <ReviewClient
        snapshots={snapshots}
        journals={journals}
        habits={habits}
        completions={completions}
        goals={goals}
        weekStart={weekStart}
        weekEnd={weekEndStr}
        weekExpenses={weekExpenses}
        prevWeekExpenses={prevWeekExpenses}
        userId={user?.id ?? ''}
      />
    </div>
  )
}

function getWeekNumber(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
