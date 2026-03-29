import { createServerSupabaseClient } from '@/lib/supabase-server'
import { CATEGORIES, type Category } from '@/types'
import type { Goal, Habit, HabitCompletion, ProgressSnapshot, DailyPriority } from '@/types'
import { CategoryCard } from '@/components/dashboard/CategoryCard'
import { WeekChart } from '@/components/dashboard/WeekChart'
import { DailyBrief } from '@/components/dashboard/DailyBrief'
import { TodayPriorities } from '@/components/dashboard/TodayPriorities'
import { getWeekStart, toDateString } from '@/lib/utils'

export const revalidate = 0

async function getDashboardData() {
  const supabase = await createServerSupabaseClient()

  const today = toDateString(new Date())
  const weekStart = toDateString(getWeekStart())

  const [userRes, goalsRes, habitsRes, completionsRes, snapshotsRes, prioritiesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('goals').select('*').eq('status', 'active'),
    supabase.from('habits').select('*').eq('active', true),
    supabase.from('habit_completions').select('*').eq('completed_date', today),
    supabase.from('progress_snapshots').select('*').eq('week_start', weekStart),
    supabase.from('daily_priorities').select('*').eq('date', today).order('sort_order'),
  ])

  return {
    userId: userRes.data.user?.id ?? '',
    goals: (goalsRes.data ?? []) as Goal[],
    habits: (habitsRes.data ?? []) as Habit[],
    completions: (completionsRes.data ?? []) as HabitCompletion[],
    snapshots: (snapshotsRes.data ?? []) as ProgressSnapshot[],
    priorities: (prioritiesRes.data ?? []) as DailyPriority[],
    today,
  }
}

export default async function DashboardPage() {
  const { userId, goals, habits, completions, snapshots, priorities, today } = await getDashboardData()

  const completedHabitIds = new Set(completions.map((c) => c.habit_id))

  const categoryStats = CATEGORIES.map((cat) => {
    const catGoals = goals.filter((g) => g.category === cat.id)
    const catHabits = habits.filter((h) => h.category === cat.id)
    const catCompleted = catHabits.filter((h) => completedHabitIds.has(h.id)).length
    const snap = snapshots.find((s) => s.category === cat.id)

    return {
      category: cat.id as Category,
      score: snap?.score ?? 0,
      goalCount: catGoals.length,
      completedHabits: catCompleted,
      totalHabits: catHabits.length,
    }
  })

  const todayHabits = habits.filter((h) => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') {
      const day = new Date(today + 'T12:00:00').getDay()
      return day >= 1 && day <= 5
    }
    return false
  })

  const todayCompletedCount = todayHabits.filter((h) => completedHabitIds.has(h.id)).length
  const overallScore = categoryStats.length > 0
    ? Math.round(categoryStats.reduce((sum, c) => sum + c.score, 0) / categoryStats.length)
    : 0

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium capitalize">
          {dateLabel}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Oversikt</h1>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{overallScore}</p>
          <p className="text-xs text-gray-500 mt-0.5">Ukesscore</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {todayCompletedCount}/{todayHabits.length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Vaner i dag</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{goals.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Aktive mål</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <TodayPriorities priorities={priorities} today={today} userId={userId} />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Ukens balanse</h2>
          <WeekChart snapshots={snapshots} />
        </div>
      </div>

      {/* Category cards */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Kategorier</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categoryStats.map((stat) => (
            <CategoryCard key={stat.category} {...stat} />
          ))}
        </div>
      </div>

      {/* Daily brief — fetches fresh data from Supabase on click */}
      <DailyBrief />
    </div>
  )
}
