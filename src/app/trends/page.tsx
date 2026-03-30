import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ProgressSnapshot, Habit, HabitCompletion, Goal, GoalProgressLog, FinanceEntry } from '@/types'
import { TrendsClient } from '@/components/trends/TrendsClient'

export const revalidate = 0

export default async function TrendsPage() {
  const supabase = await createServerSupabaseClient()

  const now = new Date()
  const ninetyDaysAgo = new Date(now)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0]

  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0]

  const [
    snapshotsRes,
    habitsRes,
    completionsRes,
    goalsRes,
    progressLogRes,
    financeRes,
  ] = await Promise.all([
    supabase
      .from('progress_snapshots')
      .select('*')
      .order('week_start', { ascending: true }),
    supabase
      .from('habits')
      .select('*')
      .eq('active', true),
    supabase
      .from('habit_completions')
      .select('*')
      .gte('completed_date', ninetyDaysAgoStr)
      .order('completed_date', { ascending: true }),
    supabase
      .from('goals')
      .select('*')
      .eq('status', 'active'),
    supabase
      .from('goal_progress_log')
      .select('*')
      .order('logged_at', { ascending: true }),
    supabase
      .from('finance_entries')
      .select('*')
      .gte('date', twelveMonthsAgoStr)
      .order('date', { ascending: true }),
  ])

  // Also fetch completed goals for the summary cards
  const completedGoalsRes = await supabase
    .from('goals')
    .select('*')
    .eq('status', 'completed')

  return (
    <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Analyse</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Trender</h1>
      </div>
      <TrendsClient
        snapshots={(snapshotsRes.data ?? []) as ProgressSnapshot[]}
        habits={(habitsRes.data ?? []) as Habit[]}
        completions={(completionsRes.data ?? []) as HabitCompletion[]}
        activeGoals={(goalsRes.data ?? []) as Goal[]}
        completedGoals={(completedGoalsRes.data ?? []) as Goal[]}
        goalProgressLog={(progressLogRes.data ?? []) as GoalProgressLog[]}
        financeEntries={(financeRes.data ?? []) as FinanceEntry[]}
      />
    </div>
  )
}
