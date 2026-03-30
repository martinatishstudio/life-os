import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Habit, HabitCompletion, DailyPriority, TrainingLog, CascadeGoal } from '@/types'
import { HabitList } from '@/components/habits/HabitList'
import { TodayPriorities } from '@/components/dashboard/TodayPriorities'
import { DailyBriefButton } from '@/components/daily/DailyBriefButton'
import { TrainingLogSection } from '@/components/daily/TrainingLogSection'
import { DailyCascadeGoals } from '@/components/daily/DailyCascadeGoals'
import { toDateString } from '@/lib/utils'

export const revalidate = 0

function computeStreaks(habits: Habit[], completions: HabitCompletion[], today: string): Record<string, number> {
  const byHabit: Record<string, Set<string>> = {}
  for (const c of completions) {
    if (!byHabit[c.habit_id]) byHabit[c.habit_id] = new Set()
    byHabit[c.habit_id].add(c.completed_date)
  }

  const streaks: Record<string, number> = {}
  for (const habit of habits) {
    const dates = byHabit[habit.id]
    if (!dates) { streaks[habit.id] = 0; continue }

    let streak = 0
    const current = new Date(today + 'T12:00:00')
    while (true) {
      const dateStr = toDateString(current)
      if (dates.has(dateStr)) {
        streak++
        current.setDate(current.getDate() - 1)
      } else {
        break
      }
    }
    streaks[habit.id] = streak
  }
  return streaks
}

export default async function DailyPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? ''
  const today = toDateString(new Date())
  const ninetyDaysAgo = toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))

  const [habitsRes, completionsRes, allCompletionsRes, prioritiesRes, trainingRes, cascadeRes] = await Promise.all([
    supabase.from('habits').select('*').order('time_of_day').order('category'),
    supabase.from('habit_completions').select('*').eq('completed_date', today),
    supabase.from('habit_completions').select('habit_id, completed_date').gte('completed_date', ninetyDaysAgo),
    supabase.from('daily_priorities').select('*').eq('date', today).order('sort_order'),
    supabase.from('training_log').select('*').order('date', { ascending: false }).limit(7),
    supabase
      .from('cascade_goals')
      .select('*')
      .in('time_horizon', ['quarter', 'month', 'week', 'day'])
      .eq('status', 'active')
      .order('time_horizon')
      .order('category'),
  ])

  const allHabits = (habitsRes.data ?? []) as Habit[]
  const habits = allHabits.filter((h) => h.active)
  const completions = (completionsRes.data ?? []) as HabitCompletion[]
  const allCompletions = (allCompletionsRes.data ?? []) as HabitCompletion[]
  const priorities = (prioritiesRes.data ?? []) as DailyPriority[]
  const trainingLogs = (trainingRes.data ?? []) as TrainingLog[]
  const cascadeGoals = (cascadeRes.data ?? []) as CascadeGoal[]

  const morning = habits.filter((h) => h.time_of_day === 'morning')
  const anytime = habits.filter((h) => h.time_of_day === 'anytime')
  const evening = habits.filter((h) => h.time_of_day === 'evening')
  const pausedHabits = allHabits.filter((h) => !h.active)

  const completedIdsList = completions.map((c) => c.habit_id)
  const streaks = computeStreaks(habits, allCompletions, today)

  const todayHabits = habits.filter((h) => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') {
      const day = new Date(today + 'T12:00:00').getDay()
      return day >= 1 && day <= 5
    }
    return false
  })
  const completedCount = todayHabits.filter((h) => completedIdsList.includes(h.id)).length

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Daglig</h1>
        <div className="flex items-center gap-3 mt-2">
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className="bg-gray-900 h-2 rounded-full transition-all"
              style={{ width: `${todayHabits.length > 0 ? Math.round((completedCount / todayHabits.length) * 100) : 0}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 flex-shrink-0">{completedCount}/{todayHabits.length}</p>
        </div>
      </div>

      <DailyBriefButton />

      <div className="space-y-6 mt-6">
        <TodayPriorities priorities={priorities} today={today} userId={userId} />

        <DailyCascadeGoals goals={cascadeGoals} today={today} />

        {morning.length > 0 && (
          <HabitList title="Morgen" habits={morning} completedIds={completedIdsList} today={today} streaks={streaks} userId={userId} />
        )}
        {anytime.length > 0 && (
          <HabitList title="Dag" habits={anytime} completedIds={completedIdsList} today={today} streaks={streaks} userId={userId} />
        )}
        {evening.length > 0 && (
          <HabitList title="Kveld" habits={evening} completedIds={completedIdsList} today={today} streaks={streaks} userId={userId} />
        )}

        {pausedHabits.length > 0 && (
          <HabitList title="Pauset" habits={pausedHabits} completedIds={completedIdsList} today={today} streaks={streaks} userId={userId} isPausedSection />
        )}

        <HabitList title="" habits={[]} completedIds={completedIdsList} today={today} streaks={streaks} userId={userId} showAddOnly />

        <TrainingLogSection logs={trainingLogs} />
      </div>
    </div>
  )
}
