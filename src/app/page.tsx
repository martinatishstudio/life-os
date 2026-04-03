import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Habit, HabitCompletion, CascadeGoal, JournalEntry } from '@/types'

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
import { TodayClient } from '@/components/today/TodayClient'
import { toDateString } from '@/lib/utils'

export const revalidate = 0

export default async function TodayPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? ''
  const today = toDateString(new Date())

  // Calculate week boundaries (Monday to Sunday)
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const weekStartStr = toDateString(weekStart)
  const weekEndStr = toDateString(weekEnd)

  // Month boundaries
  const monthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1))
  const monthEnd = toDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const ninetyDaysAgo = toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))

  const [
    briefRes,
    habitsRes,
    completionsRes,
    allCompletionsRes,
    dayGoalsRes,
    weeklyReviewRes,
    monthlyReviewRes,
    rewardsRes,
    weekEntriesRes,
  ] = await Promise.all([
    // Today's brief
    supabase.from('journal_entries').select('*')
      .eq('type', 'daily_brief').eq('date', today)
      .order('created_at', { ascending: false }).limit(1),
    // Active habits
    supabase.from('habits').select('*').eq('active', true),
    // Today's completions
    supabase.from('habit_completions').select('*').eq('completed_date', today),
    // All completions for streak
    supabase.from('habit_completions').select('habit_id, completed_date')
      .gte('completed_date', ninetyDaysAgo),
    // Day cascade goals
    supabase.from('cascade_goals').select('*')
      .eq('time_horizon', 'day').eq('status', 'active')
      .gte('deadline', today).lte('start_date', today),
    // This week's weekly review (check if done)
    supabase.from('journal_entries').select('id')
      .eq('type', 'weekly_review')
      .gte('date', weekStartStr).lte('date', weekEndStr).limit(1),
    // This month's monthly review
    supabase.from('journal_entries').select('id')
      .eq('type', 'monthly_review')
      .gte('date', monthStart).lte('date', monthEnd).limit(1),
    // Rewards near unlock (with parent goal data)
    supabase.from('rewards').select('*, cascade_goals(id, title, current_value, target_value, unit, category)')
      .eq('unlocked', false),
    // Life entries this week (for week summary)
    supabase.from('life_entries').select('category, entry_type, value, unit')
      .gte('date', weekStartStr).lte('date', weekEndStr),
  ])

  // Calculate streak
  const allCompletions = (allCompletionsRes.data ?? []) as { habit_id: string; completed_date: string }[]
  const dateSet = new Set(allCompletions.map(d => d.completed_date))
  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1)
  while (dateSet.has(toDateString(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  // Week habit count
  const weekCompletions = allCompletions.filter(c => c.completed_date >= weekStartStr && c.completed_date <= weekEndStr)
  const habits = (habitsRes.data ?? []) as Habit[]
  const activeHabits = habits.filter(h => h.active)
  // Approximate weekly target: daily habits * 7 + weekday habits * 5
  const weeklyTarget = activeHabits.reduce((acc, h) => {
    if (h.frequency === 'daily') return acc + 7
    if (h.frequency === 'weekdays') return acc + 5
    return acc + 1
  }, 0)
  const weekHabitsDone = weekCompletions.length

  // Overdue review check
  const isSunday = now.getDay() === 0
  const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate()
  const hasWeeklyReview = (weeklyReviewRes.data ?? []).length > 0
  const hasMonthlyReview = (monthlyReviewRes.data ?? []).length > 0

  // Check for OVERDUE reviews (past deadline but not done)
  const lastWeekStart = new Date(weekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)

  let weeklyReviewOverdue = false
  let weeklyOverdueDays = 0
  if (!hasWeeklyReview) {
    const { data: lastWeekReview } = await supabase.from('journal_entries').select('id')
      .eq('type', 'weekly_review')
      .gte('date', toDateString(lastWeekStart))
      .lte('date', toDateString(new Date(weekStart.getTime() - 86400000))).limit(1)

    if ((lastWeekReview ?? []).length === 0 && !isSunday) {
      weeklyReviewOverdue = true
      weeklyOverdueDays = dayOfWeek === 0 ? 0 : dayOfWeek
    }
  }

  const showWeeklyReview = isSunday || weeklyReviewOverdue

  // Monthly review: show on last day of month or if overdue into next month
  let monthlyReviewOverdue = false
  let monthlyOverdueDays = 0
  if (!hasMonthlyReview && now.getDate() <= 3 && now.getMonth() > 0) {
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const { data: lastMonthReview } = await supabase.from('journal_entries').select('id')
      .eq('type', 'monthly_review')
      .gte('date', toDateString(lastMonthStart))
      .lte('date', toDateString(lastMonthEnd)).limit(1)
    if ((lastMonthReview ?? []).length === 0) {
      monthlyReviewOverdue = true
      monthlyOverdueDays = now.getDate()
    }
  }
  const showMonthlyReview = isLastDayOfMonth || monthlyReviewOverdue

  const briefEntry = (briefRes.data ?? [])[0] as JournalEntry | undefined

  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
      <TodayClient
        userId={userId}
        today={today}
        habits={habits}
        completions={(completionsRes.data ?? []) as HabitCompletion[]}
        dayGoals={(dayGoalsRes.data ?? []) as CascadeGoal[]}
        streak={streak}
        weekHabitsDone={weekHabitsDone}
        weeklyTarget={weeklyTarget}
        rewards={(rewardsRes.data ?? []) as TodayReward[]}
        weekEntries={(weekEntriesRes.data ?? []) as WeekEntry[]}
        hasTodayBrief={!!briefEntry?.ai_response}
        todayBrief={briefEntry?.ai_response ?? null}
        todayBriefId={briefEntry?.id ?? null}
        showWeeklyReview={showWeeklyReview && !hasWeeklyReview}
        weeklyReviewOverdue={weeklyReviewOverdue}
        weeklyOverdueDays={weeklyOverdueDays}
        showMonthlyReview={showMonthlyReview && !hasMonthlyReview}
        monthlyReviewOverdue={monthlyReviewOverdue}
        monthlyOverdueDays={monthlyOverdueDays}
        weekStartStr={weekStartStr}
        weekEndStr={weekEndStr}
      />
    </div>
  )
}
