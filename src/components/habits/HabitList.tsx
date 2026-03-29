'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Habit, Category } from '@/types'
import { CATEGORY_MAP, CATEGORIES } from '@/types'
import { createClient } from '@/lib/supabase'

interface HabitListProps {
  title: string
  habits: Habit[]
  completedIds: string[]
  today: string
  streaks: Record<string, number>
  userId: string
  isPausedSection?: boolean
  showAddOnly?: boolean
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daglig' },
  { value: 'weekly', label: 'Ukentlig' },
  { value: 'weekdays', label: 'Hverdager' },
]

const TIME_OPTIONS = [
  { value: 'morning', label: 'Morgen' },
  { value: 'anytime', label: 'Dag' },
  { value: 'evening', label: 'Kveld' },
]

type HabitFormData = {
  title: string
  category: Category
  frequency: 'daily' | 'weekly' | 'weekdays'
  target_count: number
  time_of_day: 'morning' | 'anytime' | 'evening'
}

const DEFAULT_FORM: HabitFormData = {
  title: '',
  category: 'physical',
  frequency: 'daily',
  target_count: 1,
  time_of_day: 'morning',
}

function HabitForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: HabitFormData
  onSave: (data: HabitFormData) => void
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<HabitFormData>(initial)

  return (
    <div className="p-4 space-y-3">
      <input
        autoFocus
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="Navn på vane..."
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0c3230] transition-colors"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && form.title.trim()) onSave(form)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0c3230]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select
          value={form.frequency}
          onChange={(e) => setForm({ ...form, frequency: e.target.value as HabitFormData['frequency'] })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0c3230]"
        >
          {FREQUENCY_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          value={form.time_of_day}
          onChange={(e) => setForm({ ...form, time_of_day: e.target.value as HabitFormData['time_of_day'] })}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0c3230]"
        >
          {TIME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Mål/uke:</label>
          <input
            type="number"
            min={1}
            max={7}
            value={form.target_count}
            onChange={(e) => setForm({ ...form, target_count: parseInt(e.target.value) || 1 })}
            className="w-16 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#0c3230]"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="text-xs text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Avbryt
        </button>
        <button
          onClick={() => form.title.trim() && onSave(form)}
          disabled={saving || !form.title.trim()}
          className="text-xs bg-[#0c3230] text-white px-4 py-1.5 rounded-lg hover:bg-[#0a2826] transition-colors disabled:opacity-50"
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}

export function HabitList({
  title,
  habits,
  completedIds: initialCompleted,
  today,
  streaks,
  userId,
  isPausedSection,
  showAddOnly,
}: HabitListProps) {
  const [completedIds, setCompletedIds] = useState(() => new Set(initialCompleted))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function toggleHabit(habit: Habit) {
    const isCompleted = completedIds.has(habit.id)

    if (isCompleted) {
      setCompletedIds((prev) => {
        const next = new Set(prev)
        next.delete(habit.id)
        return next
      })
      await supabase
        .from('habit_completions')
        .delete()
        .eq('habit_id', habit.id)
        .eq('completed_date', today)
    } else {
      setCompletedIds((prev) => new Set([...prev, habit.id]))
      await supabase.from('habit_completions').upsert({
        habit_id: habit.id,
        completed_date: today,
      })
    }
  }

  async function handleAdd(data: HabitFormData) {
    setSaving(true)
    await supabase.from('habits').insert({
      user_id: userId,
      title: data.title.trim(),
      category: data.category,
      frequency: data.frequency,
      target_count: data.target_count,
      time_of_day: data.time_of_day,
      active: true,
    })
    setSaving(false)
    setShowAdd(false)
    router.refresh()
  }

  async function handleEdit(habitId: string, data: HabitFormData) {
    setSaving(true)
    await supabase
      .from('habits')
      .update({
        title: data.title.trim(),
        category: data.category,
        frequency: data.frequency,
        target_count: data.target_count,
        time_of_day: data.time_of_day,
      })
      .eq('id', habitId)
    setSaving(false)
    setEditingId(null)
    router.refresh()
  }

  async function handleTogglePause(habit: Habit) {
    await supabase
      .from('habits')
      .update({ active: !habit.active })
      .eq('id', habit.id)
    router.refresh()
  }

  async function handleDelete(habit: Habit) {
    if (!window.confirm('Er du sikker på at du vil slette denne vanen?')) return
    await supabase.from('habit_completions').delete().eq('habit_id', habit.id)
    await supabase.from('habits').delete().eq('id', habit.id)
    router.refresh()
  }

  // Show only the add button/form
  if (showAddOnly) {
    return (
      <div>
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full text-sm text-[#0c3230] font-medium py-3 border-2 border-dashed border-gray-200 rounded-xl hover:border-[#0c3230] hover:bg-[#0c3230]/5 transition-colors"
          >
            + Legg til habit
          </button>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-3">Ny vane</p>
            <HabitForm
              initial={DEFAULT_FORM}
              onSave={handleAdd}
              onCancel={() => setShowAdd(false)}
              saving={saving}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</p>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {habits.map((habit) => {
          const completed = completedIds.has(habit.id)
          const meta = CATEGORY_MAP[habit.category]
          const streak = streaks[habit.id] ?? 0
          const isEditing = editingId === habit.id

          if (isEditing) {
            return (
              <div key={habit.id}>
                <HabitForm
                  initial={{
                    title: habit.title,
                    category: habit.category,
                    frequency: habit.frequency,
                    target_count: habit.target_count,
                    time_of_day: (habit.time_of_day as HabitFormData['time_of_day']) ?? 'anytime',
                  }}
                  onSave={(data) => handleEdit(habit.id, data)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
                <div className="flex gap-2 px-4 pb-3">
                  <button
                    onClick={() => handleTogglePause(habit)}
                    className="text-xs text-amber-600 hover:text-amber-700 transition-colors"
                  >
                    {habit.active ? 'Pause' : 'Aktiver'}
                  </button>
                  <button
                    onClick={() => handleDelete(habit)}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                  >
                    Slett
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={habit.id}
              className={`flex items-center gap-3 px-4 py-3 first:rounded-t-xl last:rounded-b-xl ${isPausedSection ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => !isPausedSection && toggleHabit(habit)}
                disabled={isPausedSection}
                className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                  completed ? 'bg-[#0c3230] border-[#0c3230]' : 'border-gray-300'
                } ${isPausedSection ? 'cursor-default' : 'hover:border-[#0c3230]'}`}
              >
                {completed && (
                  <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${completed ? 'line-through text-gray-400' : isPausedSection ? 'text-gray-400' : 'text-gray-800'}`}>
                  {habit.title}
                </p>
                {habit.target_count > 1 && (
                  <p className="text-xs text-gray-400">{habit.target_count}x per uke</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {streak > 1 && !isPausedSection && (
                  <span className="text-xs text-orange-500 font-medium">{streak}d</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
                  {meta.label}
                </span>
                <button
                  onClick={() => setEditingId(habit.id)}
                  className="p-1 text-gray-300 hover:text-[#0c3230] transition-colors"
                  title="Rediger"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
