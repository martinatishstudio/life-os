'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CascadeGoal, Category } from '@/types'
import { createClient } from '@/lib/supabase'

interface DailyCascadeGoalsProps {
  goals: CascadeGoal[]
  today: string
}

const CATEGORY_DOT_COLORS: Record<Category, string> = {
  business: '#1d4ed8',
  physical: '#0d9488',
  mental: '#7c3aed',
  finance: '#d97706',
  family: '#db2777',
  lifestyle: '#ea580c',
  brand: '#4f46e5',
}

function progressPercent(goal: CascadeGoal): number {
  if (!goal.target_value || goal.target_value === 0) return 0
  return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
}

function onTrackColor(goal: CascadeGoal): string {
  if (!goal.target_value || !goal.deadline) return '#22c55e'
  const pct = progressPercent(goal)
  const now = new Date()
  const start = goal.start_date ? new Date(goal.start_date) : new Date(goal.created_at)
  const end = new Date(goal.deadline)
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.max(0, (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const expectedPct = Math.min(100, (elapsedDays / totalDays) * 100)

  if (pct >= expectedPct * 0.8) return '#22c55e'
  if (pct >= expectedPct * 0.5) return '#eab308'
  return '#ef4444'
}

function GoalProgressBar({ goal }: { goal: CascadeGoal }) {
  const pct = progressPercent(goal)
  const trackColor = onTrackColor(goal)

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: trackColor }}
        />
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
        {goal.current_value}{goal.unit ? ` ${goal.unit}` : ''} / {goal.target_value}{goal.unit ? ` ${goal.unit}` : ''}
      </span>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: trackColor }}
        title={trackColor === '#22c55e' ? 'På sporet' : trackColor === '#eab308' ? 'Litt bak' : 'Bak skjema'}
      />
    </div>
  )
}

function QuarterSection({ goals }: { goals: CascadeGoal[] }) {
  const [open, setOpen] = useState(false)

  if (goals.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full"
      >
        <h2 className="text-sm font-semibold text-gray-700">Kvartalsfokus</h2>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {goals.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_DOT_COLORS[g.category] }}
                />
                <span className="text-sm text-gray-800">{g.title}</span>
              </div>
              {g.target_value != null && g.target_value > 0 && (
                <div className="ml-4">
                  <GoalProgressBar goal={g} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WeekGoalItem({ goal, onUpdate }: { goal: CascadeGoal; onUpdate: (id: string, value: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(goal.current_value))

  function handleSave() {
    const num = parseFloat(inputValue)
    if (!isNaN(num) && num !== goal.current_value) {
      onUpdate(goal.id, num)
    }
    setEditing(false)
  }

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: CATEGORY_DOT_COLORS[goal.category] }}
        />
        <span className="flex-1 text-sm text-gray-800">{goal.title}</span>
        {goal.target_value != null && goal.target_value > 0 && !editing && (
          <button
            onClick={() => { setInputValue(String(goal.current_value)); setEditing(true) }}
            className="text-xs text-[#0c3230] hover:text-[#0a2826] font-medium transition-colors"
          >
            Oppdater
          </button>
        )}
      </div>
      {goal.target_value != null && goal.target_value > 0 && (
        <div className="ml-4">
          {editing ? (
            <div className="flex items-center gap-2 mt-1.5">
              <input
                autoFocus
                type="number"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setEditing(false)
                }}
                className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-[#0c3230] transition-colors tabular-nums"
              />
              {goal.unit && <span className="text-xs text-gray-400">{goal.unit}</span>}
              <button
                onClick={handleSave}
                className="text-xs bg-[#0c3230] text-white px-2 py-1 rounded-lg hover:bg-[#0a2826] transition-colors"
              >
                Lagre
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <GoalProgressBar goal={goal} />
          )}
        </div>
      )}
    </div>
  )
}

function WeekSection({
  goals,
  onUpdate,
}: {
  goals: CascadeGoal[]
  onUpdate: (id: string, value: number) => void
}) {
  if (goals.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Denne ukens mål</h2>
      <div className="space-y-1">
        {goals.map((g) => (
          <WeekGoalItem key={g.id} goal={g} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  )
}

function DaySection({
  goals,
  onComplete,
}: {
  goals: CascadeGoal[]
  onComplete: (id: string) => void
}) {
  if (goals.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Dagens mål</h2>
      <ul className="space-y-1">
        {goals.map((g) => {
          return (
            <li key={g.id} className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-gray-50 px-1 -mx-1 transition-colors">
              <button
                onClick={() => onComplete(g.id)}
                className="w-4 h-4 rounded border border-gray-300 hover:border-[#0c3230] flex-shrink-0 flex items-center justify-center transition-colors"
              >
                {/* empty, clicking completes */}
              </button>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CATEGORY_DOT_COLORS[g.category] }}
              />
              <span className="flex-1 text-sm text-gray-800">{g.title}</span>
              {g.target_value != null && g.target_value > 0 && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {g.current_value}/{g.target_value}{g.unit ? ` ${g.unit}` : ''}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function DailyCascadeGoals({ goals: initialGoals }: DailyCascadeGoalsProps) {
  const [goals, setGoals] = useState(initialGoals)
  const router = useRouter()
  const supabase = createClient()

  const quarterGoals = goals.filter((g) => g.time_horizon === 'quarter')
  const monthGoals = goals.filter((g) => g.time_horizon === 'month')
  const weekGoals = goals.filter((g) => g.time_horizon === 'week')
  const dayGoals = goals.filter((g) => g.time_horizon === 'day')

  async function handleUpdateProgress(id: string, value: number) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, current_value: value } : g))
    )

    await Promise.all([
      supabase
        .from('cascade_goals')
        .update({ current_value: value, updated_at: new Date().toISOString() })
        .eq('id', id),
      supabase
        .from('cascade_goal_progress')
        .insert({ goal_id: id, value, logged_at: new Date().toISOString() }),
    ])

    router.refresh()
  }

  async function handleComplete(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id))

    const goal = goals.find((g) => g.id === id)
    const finalValue = goal?.target_value ?? goal?.current_value ?? 0

    await Promise.all([
      supabase
        .from('cascade_goals')
        .update({ status: 'completed', current_value: finalValue, updated_at: new Date().toISOString() })
        .eq('id', id),
      supabase
        .from('cascade_goal_progress')
        .insert({ goal_id: id, value: finalValue, note: 'Fullført', logged_at: new Date().toISOString() }),
    ])

    router.refresh()
  }

  const hasWeekOrDay = weekGoals.length > 0 || dayGoals.length > 0

  if (goals.length === 0) return null

  return (
    <div className="space-y-4">
      <DaySection goals={dayGoals} onComplete={handleComplete} />
      <WeekSection goals={weekGoals} onUpdate={handleUpdateProgress} />
      <QuarterSection goals={[...quarterGoals, ...monthGoals]} />

      {!hasWeekOrDay && (quarterGoals.length > 0 || monthGoals.length > 0) && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-400 italic">
            Ingen uke eller dagsmål satt. Bryt ned kvartalsmålene dine!
          </p>
        </div>
      )}
    </div>
  )
}
