import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Vision, VisionCategory, Milestone } from '@/types'
import { VisionClient } from '@/components/vision/VisionClient'

export const revalidate = 0

export default async function VisionPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: visionData } = await supabase.from('vision').select('*').single()
  const vision = visionData as Vision | null

  const { data: visionCats } = vision
    ? await supabase.from('vision_categories').select('*').eq('vision_id', vision.id)
    : { data: [] }

  const { data: timelineData } = await supabase
    .from('milestones')
    .select('*')
    .eq('goal_id', '90000000-0000-0000-0000-000000000001')
    .order('target_date')

  const categories = (visionCats ?? []) as VisionCategory[]
  const timeline = (timelineData ?? []) as Milestone[]

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">10-årsvisjon</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">
          {vision?.title ?? 'Martin 2036'}
        </h1>
      </div>

      <VisionClient vision={vision} categories={categories} timeline={timeline} userId={user?.id ?? ''} />
    </div>
  )
}
