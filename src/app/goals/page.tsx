import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Goal, Milestone, Vision, VisionCategory } from '@/types'
import { GoalsClient } from '@/components/goals/GoalsClient'

export const revalidate = 0

export default async function GoalsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [goalsRes, visionRes, visionCatsRes] = await Promise.all([
    supabase.from('goals').select('*').in('status', ['active', 'completed', 'paused']).order('deadline', { ascending: true, nullsFirst: false }),
    supabase.from('vision').select('*').single(),
    supabase.from('vision_categories').select('*'),
  ])

  const goals = (goalsRes.data ?? []) as Goal[]
  const vision = visionRes.data as Vision | null
  const visionCats = (visionCatsRes.data ?? []) as VisionCategory[]
  const goalIds = goals.map((g) => g.id)

  const { data: milestonesData } = goalIds.length > 0
    ? await supabase.from('milestones').select('*').in('goal_id', goalIds).order('sort_order')
    : { data: [] }

  const milestones = (milestonesData ?? []) as Milestone[]

  // Build context strings for Claude
  const visionText = vision
    ? `${vision.description}\n\nPer livsområde:\n${visionCats.map(c => `${c.category}: ${c.target_state}`).join('\n')}`
    : ''

  const existingGoalsSummary = goals
    .filter(g => !g.parent_goal_id)
    .map(g => {
      const pct = g.target_value ? `${Math.round((g.current_value / g.target_value) * 100)}%` : ''
      return `[${g.category}] ${g.title}${pct ? ` (${pct})` : ''}${g.deadline ? ` — frist: ${g.deadline}` : ''}`
    })
    .join('\n')

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">2026</p>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Mål</h1>
        <p className="text-sm text-gray-500 mt-1">{goals.filter((g) => !g.parent_goal_id).length} aktive mål</p>
      </div>
      <GoalsClient
        goals={goals}
        milestones={milestones}
        userId={user?.id ?? ''}
        visionText={visionText}
        existingGoalsSummary={existingGoalsSummary}
      />
    </div>
  )
}
