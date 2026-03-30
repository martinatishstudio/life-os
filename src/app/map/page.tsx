import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { CascadeGoal } from '@/types'
import { MapClient } from '@/components/map/MapClient'

export const revalidate = 0

export default async function MapPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('cascade_goals')
    .select('*')
    .order('time_horizon')
    .order('category')

  return (
    <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <MapClient goals={(data ?? []) as CascadeGoal[]} userId={user?.id ?? ''} />
    </div>
  )
}
