import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { CascadeGoal } from '@/types'
import { CascadeGoalsClient } from '@/components/goals/CascadeGoalsClient'

export const revalidate = 0

export default async function GoalsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: goalsData } = await supabase
    .from('cascade_goals')
    .select('*')
    .order('time_horizon')
    .order('category')

  const goals = (goalsData ?? []) as CascadeGoal[]

  return (
    <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <CascadeGoalsClient goals={goals} userId={user?.id ?? ''} />
    </div>
  )
}
