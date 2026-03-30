import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Goal, Habit, HabitCompletion, ContextModule, ContextSnapshot } from '@/types'
import { SmartDashboard } from '@/components/dashboard/SmartDashboard'
import { toDateString } from '@/lib/utils'

export const revalidate = 0

// ---------------------------------------------------------------------------
// Streak calculation: count consecutive days backwards from yesterday
// where at least 1 habit was completed
// ---------------------------------------------------------------------------
async function calculateStreak(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<number> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data } = await supabase
    .from('habit_completions')
    .select('completed_date')
    .gte('completed_date', toDateString(ninetyDaysAgo))
    .order('completed_date', { ascending: false })

  if (!data || data.length === 0) return 0

  const dateSet = new Set(data.map((d: { completed_date: string }) => d.completed_date))
  const todayStr = toDateString(new Date())

  // Start from today. If today has completions, count it; otherwise start from yesterday.
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!dateSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (dateSet.has(toDateString(cursor))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

// ---------------------------------------------------------------------------
// Coach health: % of context modules with up-to-date snapshots
// ---------------------------------------------------------------------------
function calcCoachHealth(
  modules: ContextModule[],
  snapshots: ContextSnapshot[]
): number {
  if (modules.length === 0) return 100

  const FREQ_DAYS: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365 }
  const now = Date.now()
  let upToDate = 0

  for (const mod of modules) {
    const snap = snapshots.find((s) => s.module_id === mod.id)
    if (!snap) continue
    const age = Math.floor((now - new Date(snap.created_at).getTime()) / (1000 * 60 * 60 * 24))
    const maxAge = FREQ_DAYS[mod.update_frequency] ?? 30
    if (age <= maxAge) upToDate++
  }

  return Math.round((upToDate / modules.length) * 100)
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------
async function getDashboardData() {
  const supabase = await createServerSupabaseClient()
  const today = toDateString(new Date())

  const [
    userRes,
    briefRes,
    habitsRes,
    completionsRes,
    goalsRes,
    recentHabitCompletionsRes,
    recentJournalsRes,
    recentGoalLogsRes,
    contextModulesRes,
    contextSnapshotsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('journal_entries')
      .select('*')
      .eq('type', 'daily_brief')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.from('habits').select('*').eq('active', true),
    supabase.from('habit_completions').select('*').eq('completed_date', today),
    supabase.from('goals').select('*').eq('status', 'active').order('deadline', { ascending: true, nullsFirst: false }),
    // Recent habit completions with habit title via join
    supabase
      .from('habit_completions')
      .select('id, created_at, habit_id, habits(title)')
      .order('created_at', { ascending: false })
      .limit(5),
    // Recent journal entries
    supabase
      .from('journal_entries')
      .select('id, type, created_at')
      .order('created_at', { ascending: false })
      .limit(3),
    // Recent goal progress logs with goal title
    supabase
      .from('goal_progress_log')
      .select('id, logged_at, goal_id, goals(title)')
      .order('logged_at', { ascending: false })
      .limit(3),
    // Context modules
    supabase.from('context_modules').select('*').order('sort_order'),
    // Latest context snapshot per module (get all, we'll pick latest per module)
    supabase.from('context_snapshots').select('*').order('created_at', { ascending: false }),
  ])

  const streak = await calculateStreak(supabase)

  const userId = userRes.data.user?.id ?? ''
  const habits = (habitsRes.data ?? []) as Habit[]
  const completions = (completionsRes.data ?? []) as HabitCompletion[]
  const goals = (goalsRes.data ?? []) as Goal[]

  // Brief
  const briefEntry = briefRes.data?.[0]
  const hasTodayBrief = !!briefEntry?.ai_response
  const todayBrief = briefEntry?.ai_response ?? null
  const todayBriefId = briefEntry?.id ?? null

  // Today's habits (daily + weekdays on weekdays)
  const todayHabits = habits.filter((h) => {
    if (h.frequency === 'daily') return true
    if (h.frequency === 'weekdays') {
      const day = new Date(today + 'T12:00:00').getDay()
      return day >= 1 && day <= 5
    }
    return false
  })
  // Urgent goals: deadline within 14 days
  const fourteenDaysOut = new Date()
  fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14)
  const fourteenStr = toDateString(fourteenDaysOut)
  const urgentGoals = goals.filter((g) => g.deadline && g.deadline <= fourteenStr)

  // Coach health
  const modules = (contextModulesRes.data ?? []) as ContextModule[]
  const allSnapshots = (contextSnapshotsRes.data ?? []) as ContextSnapshot[]
  // Pick latest snapshot per module
  const latestSnapshots: ContextSnapshot[] = []
  const seenModules = new Set<string>()
  for (const snap of allSnapshots) {
    if (!seenModules.has(snap.module_id)) {
      seenModules.add(snap.module_id)
      latestSnapshots.push(snap)
    }
  }
  const coachHealthPct = calcCoachHealth(modules, latestSnapshots)

  // Activity feed
  type ActivityItem = { id: string; text: string; created_at: string }
  const activityItems: ActivityItem[] = []

  // Habit completions
  for (const hc of recentHabitCompletionsRes.data ?? []) {
    const habitData = hc.habits as unknown as { title: string } | null
    const title = habitData?.title ?? 'Ukjent vane'
    activityItems.push({ id: hc.id, text: `Fullf\u00f8rte ${title}`, created_at: hc.created_at })
  }

  // Journal entries
  const TYPE_LABELS: Record<string, string> = {
    daily_brief: 'Daglig brief',
    weekly_review: 'Ukentlig gjennomgang',
    monthly_review: 'M\u00e5nedlig gjennomgang',
    note: 'Notat',
  }
  for (const je of recentJournalsRes.data ?? []) {
    const label = TYPE_LABELS[je.type] ?? je.type
    activityItems.push({ id: je.id, text: `${label} skrevet`, created_at: je.created_at })
  }

  // Goal progress logs
  for (const gp of recentGoalLogsRes.data ?? []) {
    const goalData = gp.goals as unknown as { title: string } | null
    const title = goalData?.title ?? 'Ukjent m\u00e5l'
    activityItems.push({ id: gp.id, text: `Oppdaterte ${title}`, created_at: gp.logged_at })
  }

  // Sort by time desc, take top 5
  activityItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const activities = activityItems.slice(0, 5)

  return {
    userId,
    today,
    hasTodayBrief,
    todayBrief,
    todayBriefId,
    habits,
    completions,
    totalTodayHabits: todayHabits.length,
    streak,
    urgentGoalCount: urgentGoals.length,
    urgentGoals,
    coachHealthPct,
    activities,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <SmartDashboard {...data} />
}
