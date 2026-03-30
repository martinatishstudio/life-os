export type Category = 'business' | 'physical' | 'mental' | 'finance' | 'family' | 'lifestyle' | 'brand'

export const CATEGORIES: { id: Category; label: string; color: string; bg: string; border: string }[] = [
  { id: 'business', label: 'Business', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'physical', label: 'Fysisk', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' },
  { id: 'mental', label: 'Mentalt', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'finance', label: 'Økonomi', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'family', label: 'Familie', color: 'text-pink-700', bg: 'bg-pink-50', border: 'border-pink-200' },
  { id: 'lifestyle', label: 'Livsstil', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'brand', label: 'Brand', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<Category, typeof CATEGORIES[0]>

export interface Vision {
  id: string
  user_id: string
  title: string
  description: string
  target_year: number
  created_at: string
  updated_at: string
}

export interface VisionCategory {
  id: string
  vision_id: string
  category: Category
  description: string
  target_state: string
}

export interface Goal {
  id: string
  user_id: string
  category: Category
  title: string
  description?: string
  target_value?: number
  current_value: number
  unit?: string
  deadline?: string
  status: 'active' | 'completed' | 'paused' | 'abandoned'
  parent_goal_id?: string
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  goal_id: string
  title: string
  description?: string
  target_date?: string
  completed: boolean
  completed_at?: string
  sort_order: number
}

export interface Habit {
  id: string
  user_id: string
  category: Category
  title: string
  frequency: 'daily' | 'weekly' | 'weekdays'
  target_count: number
  time_of_day?: 'morning' | 'evening' | 'anytime'
  active: boolean
  created_at: string
}

export interface HabitCompletion {
  id: string
  habit_id: string
  completed_date: string
  notes?: string
  created_at: string
}

export interface FinanceEntry {
  id: string
  user_id: string
  date: string
  amount: number
  category: string
  description?: string
  source?: string
  created_at: string
}

export interface FinanceTarget {
  id: string
  user_id: string
  category: string
  monthly_budget?: number
  yearly_target?: number
  target_type: 'savings' | 'investment' | 'expense_limit'
}

export interface DailyPriority {
  id: string
  user_id: string
  date: string
  title: string
  category?: Category
  completed: boolean
  sort_order: number
}

export interface JournalEntry {
  id: string
  user_id: string
  date: string
  type: 'daily_brief' | 'weekly_review' | 'monthly_review' | 'note'
  content: string
  ai_response?: string
  created_at: string
}

export interface ProgressSnapshot {
  id: string
  user_id: string
  category: Category
  score: number
  week_start: string
  notes?: string
  created_at: string
}

export interface ContextModule {
  id: string
  user_id: string
  slug: string
  title: string
  description: string
  icon: string
  sort_order: number
  update_frequency: 'monthly' | 'quarterly' | 'yearly'
  created_at: string
}

export interface ContextModuleField {
  id: string
  module_id: string
  slug: string
  label: string
  field_type: 'text' | 'textarea' | 'number' | 'select' | 'multi_select'
  options: string[] | null
  sort_order: number
}

export interface ContextSnapshot {
  id: string
  module_id: string
  values: Record<string, string | number | string[]>
  created_at: string
}

export interface GoalProgressLog {
  id: string
  goal_id: string
  value: number
  logged_at: string
}

export interface TrainingLog {
  id: string
  user_id: string
  date: string
  type: string
  duration_minutes: number | null
  notes: string | null
  metrics: Record<string, unknown> | null
  created_at: string
}

export type TimeHorizon = 'vision_10y' | '5y' | '3y' | '1y' | 'quarter' | 'month' | 'week' | 'day'

export const TIME_HORIZON_LABELS: Record<TimeHorizon, string> = {
  vision_10y: 'Visjon (10 år)',
  '5y': '5 år',
  '3y': '3 år',
  '1y': '1 år',
  quarter: 'Kvartal',
  month: 'Måned',
  week: 'Uke',
  day: 'Dag',
}

export const TIME_HORIZON_ORDER: TimeHorizon[] = [
  'vision_10y', '5y', '3y', '1y', 'quarter', 'month', 'week', 'day',
]

export interface CascadeGoal {
  id: string
  user_id: string
  category: Category
  time_horizon: TimeHorizon
  title: string
  description?: string
  target_value?: number
  current_value: number
  unit?: string
  start_date?: string
  deadline?: string
  parent_id?: string
  status: 'active' | 'completed' | 'paused' | 'abandoned'
  created_at: string
  updated_at: string
  // Populated via joins or client-side
  children?: CascadeGoal[]
  parent?: CascadeGoal
}

export interface CascadeGoalProgress {
  id: string
  goal_id: string
  value: number
  note?: string
  logged_at: string
}
