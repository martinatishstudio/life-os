import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ContextModule, ContextModuleField, ContextSnapshot, ProgressSnapshot, Habit, HabitCompletion, FinanceEntry, FinanceTarget } from '@/types'
import { MeClient } from '@/components/me/MeClient'
import { toDateString } from '@/lib/utils'

export const revalidate = 0

export default async function MePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? ''
  const userEmail = user?.email ?? ''

  const ninetyDaysAgo = toDateString(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))

  const [
    modulesRes, fieldsRes, snapshotsRes,
    scoresRes, habitsRes, completionsRes,
    financeRes, targetsRes,
  ] = await Promise.all([
    supabase.from('context_modules').select('*').order('sort_order'),
    supabase.from('context_module_fields').select('*').order('sort_order'),
    supabase.from('context_snapshots').select('*').order('created_at', { ascending: false }),
    supabase.from('progress_snapshots').select('*').order('week_start', { ascending: false }).limit(52),
    supabase.from('habits').select('*').order('category'),
    supabase.from('habit_completions').select('*').gte('completed_date', ninetyDaysAgo),
    supabase.from('finance_entries').select('*').gte('date', ninetyDaysAgo).order('date', { ascending: false }),
    supabase.from('finance_targets').select('*'),
  ])

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <MeClient
        userId={userId}
        userEmail={userEmail}
        modules={(modulesRes.data ?? []) as ContextModule[]}
        fields={(fieldsRes.data ?? []) as ContextModuleField[]}
        snapshots={(snapshotsRes.data ?? []) as ContextSnapshot[]}
        scores={(scoresRes.data ?? []) as ProgressSnapshot[]}
        habits={(habitsRes.data ?? []) as Habit[]}
        completions={(completionsRes.data ?? []) as HabitCompletion[]}
        financeEntries={(financeRes.data ?? []) as FinanceEntry[]}
        financeTargets={(targetsRes.data ?? []) as FinanceTarget[]}
      />
    </div>
  )
}
