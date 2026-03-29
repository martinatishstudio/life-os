'use client'

import { useState } from 'react'
import type { DailyPriority } from '@/types'
import { createClient } from '@/lib/supabase'

interface TodayPrioritiesProps {
  priorities: DailyPriority[]
  today: string
  userId: string
}

export function TodayPriorities({ priorities: initial, today, userId }: TodayPrioritiesProps) {
  const [priorities, setPriorities] = useState(initial)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const supabase = createClient()

  async function togglePriority(p: DailyPriority) {
    const updated = !p.completed
    setPriorities((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, completed: updated } : x))
    )
    await supabase
      .from('daily_priorities')
      .update({ completed: updated })
      .eq('id', p.id)
  }

  async function addPriority() {
    if (!newTitle.trim()) return

    const { data } = await supabase
      .from('daily_priorities')
      .insert({
        user_id: userId,
        date: today,
        title: newTitle.trim(),
        sort_order: priorities.length,
      })
      .select()
      .single()

    if (data) {
      setPriorities((prev) => [...prev, data as DailyPriority])
      setNewTitle('')
      setAdding(false)
    }
  }

  async function deletePriority(id: string) {
    setPriorities((prev) => prev.filter((p) => p.id !== id))
    await supabase.from('daily_priorities').delete().eq('id', id)
  }

  async function movePriority(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= priorities.length) return

    const updated = [...priorities]
    const temp = updated[index]
    updated[index] = updated[swapIndex]
    updated[swapIndex] = temp

    // Update sort_order values
    const reordered = updated.map((p, i) => ({ ...p, sort_order: i }))
    setPriorities(reordered)

    // Persist both swapped items
    await Promise.all([
      supabase.from('daily_priorities').update({ sort_order: reordered[index].sort_order }).eq('id', reordered[index].id),
      supabase.from('daily_priorities').update({ sort_order: reordered[swapIndex].sort_order }).eq('id', reordered[swapIndex].id),
    ])
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Dagens prioriteringer</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-[#0c3230] hover:text-[#0a2826] font-medium transition-colors"
        >
          + Legg til
        </button>
      </div>

      {priorities.length === 0 && !adding && (
        <p className="text-sm text-gray-400 italic">Ingen prioriteringer satt for i dag</p>
      )}

      <ul className="space-y-1">
        {priorities.map((p, index) => (
          <li key={p.id} className="group flex items-center gap-2 py-1.5 rounded-lg hover:bg-gray-50 px-1 -mx-1 transition-colors">
            <button
              onClick={() => togglePriority(p)}
              className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                p.completed
                  ? 'bg-[#0c3230] border-[#0c3230] text-white'
                  : 'border-gray-300 hover:border-[#0c3230]'
              }`}
            >
              {p.completed && (
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <span className={`flex-1 text-sm ${p.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
              {p.title}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => movePriority(index, 'up')}
                disabled={index === 0}
                className="p-1 text-gray-300 hover:text-[#0c3230] disabled:opacity-30 transition-colors"
                title="Flytt opp"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              </button>
              <button
                onClick={() => movePriority(index, 'down')}
                disabled={index === priorities.length - 1}
                className="p-1 text-gray-300 hover:text-[#0c3230] disabled:opacity-30 transition-colors"
                title="Flytt ned"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => deletePriority(p.id)}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                title="Slett"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPriority()
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            placeholder="Ny prioritering..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#0c3230] transition-colors"
          />
          <button
            onClick={addPriority}
            className="text-xs bg-[#0c3230] text-white px-3 py-1.5 rounded-lg hover:bg-[#0a2826] transition-colors"
          >
            Legg til
          </button>
        </div>
      )}
    </div>
  )
}
