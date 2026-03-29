'use client'

import { useState } from 'react'
import type { Goal, Milestone } from '@/types'
import { CATEGORIES, CATEGORY_MAP, type Category } from '@/types'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useClaudeAPI, ClaudeResponseLight } from '@/components/ui/ClaudeResponse'

const PROGRESS_COLORS: Record<string, string> = {
  business: 'bg-blue-500',
  physical: 'bg-teal-500',
  mental: 'bg-purple-500',
  finance: 'bg-amber-500',
  family: 'bg-pink-500',
  lifestyle: 'bg-orange-500',
  brand: 'bg-indigo-500',
}

interface GoalSuggestion {
  title: string
  category: Category
  description: string
  target_value: number | null
  unit: string | null
  deadline: string
  milestones: Array<{ title: string; target_date: string }>
}

interface GoalsClientProps {
  goals: Goal[]
  milestones: Milestone[]
  userId: string
  visionText: string
  existingGoalsSummary: string
}

const EMPTY_FORM = { title: '', description: '', category: 'business' as Category, target_value: '', unit: '', deadline: '' }

export function GoalsClient({ goals: initialGoals, milestones: initialMilestones, userId, visionText, existingGoalsSummary }: GoalsClientProps) {
  const [goals, setGoals] = useState(initialGoals)
  const [milestones, setMilestones] = useState(initialMilestones)
  const [filter, setFilter] = useState<Category | 'all'>('all')
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null)
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showNewGoal, setShowNewGoal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [suggestion, setSuggestion] = useState<GoalSuggestion | null>(null)
  const [approvingSuggestion, setApprovingSuggestion] = useState(false)

  // Detail editing state
  const [editingDetail, setEditingDetail] = useState<string | null>(null)
  const [detailForm, setDetailForm] = useState({ title: '', description: '', deadline: '' })

  // Milestone form state
  const [addingMilestoneFor, setAddingMilestoneFor] = useState<string | null>(null)
  const [milestoneForm, setMilestoneForm] = useState({ title: '', target_date: '' })

  const claude = useClaudeAPI()
  const supabase = createClient()

  const filtered = filter === 'all'
    ? goals.filter((g) => !g.parent_goal_id)
    : goals.filter((g) => !g.parent_goal_id && g.category === filter)

  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    goals: filtered.filter((g) => g.category === cat.id),
  })).filter((c) => c.goals.length > 0)

  async function saveProgress(goal: Goal) {
    const val = parseFloat(editValue)
    if (isNaN(val)) return
    setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, current_value: val } : g))
    setEditingGoal(null)
    await supabase.from('goals').update({ current_value: val }).eq('id', goal.id)
  }

  async function createGoal() {
    if (!form.title) return
    setCreating(true)

    const targetValue = form.target_value ? parseFloat(form.target_value) : null

    const { data: goalData } = await supabase.from('goals').insert({
      user_id: userId,
      title: form.title,
      description: form.description || null,
      category: form.category,
      target_value: targetValue,
      unit: form.unit || null,
      deadline: form.deadline || null,
      status: 'active',
      current_value: 0,
    }).select().single()

    if (goalData) {
      const newGoal = goalData as Goal
      setGoals(prev => [...prev, newGoal])
      setShowNewGoal(false)
      setForm(EMPTY_FORM)
      setExpandedGoal(newGoal.id)
    }
    setCreating(false)
  }

  async function suggestGoal() {
    setSuggestion(null)
    const response = await claude.call('goal_suggestion', {
      vision: visionText,
      existingGoals: existingGoalsSummary,
    })

    if (response) {
      try {
        const json = response.match(/\{[\s\S]*\}/)
        if (json) {
          const parsed = JSON.parse(json[0]) as GoalSuggestion
          setSuggestion(parsed)
        }
      } catch {
        // Show raw response if parsing fails
      }
    }
  }

  async function approveSuggestion() {
    if (!suggestion) return
    setApprovingSuggestion(true)

    const { data: goalData } = await supabase.from('goals').insert({
      user_id: userId,
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      target_value: suggestion.target_value,
      unit: suggestion.unit,
      deadline: suggestion.deadline,
      status: 'active',
      current_value: 0,
    }).select().single()

    if (goalData) {
      const newGoal = goalData as Goal
      setGoals(prev => [...prev, newGoal])

      if (suggestion.milestones?.length > 0) {
        const toInsert = suggestion.milestones.map((m, i) => ({
          goal_id: newGoal.id,
          title: m.title,
          target_date: m.target_date || null,
          sort_order: i,
          completed: false,
        }))
        const { data: msData } = await supabase.from('milestones').insert(toInsert).select()
        if (msData) setMilestones(prev => [...prev, ...(msData as Milestone[])])
      }

      setExpandedGoal(newGoal.id)
    }

    setSuggestion(null)
    claude.reset()
    setApprovingSuggestion(false)
  }

  // --- CRUD: Goal detail editing ---

  function startEditDetail(goal: Goal) {
    setEditingDetail(goal.id)
    setDetailForm({
      title: goal.title,
      description: goal.description ?? '',
      deadline: goal.deadline ?? '',
    })
  }

  async function saveDetail(goalId: string) {
    if (!detailForm.title.trim()) return
    const updates = {
      title: detailForm.title.trim(),
      description: detailForm.description.trim() || undefined,
      deadline: detailForm.deadline || undefined,
    }
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...updates } : g))
    setEditingDetail(null)
    await supabase.from('goals').update(updates).eq('id', goalId)
  }

  async function updateGoalStatus(goalId: string, status: Goal['status']) {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status } : g))
    await supabase.from('goals').update({ status }).eq('id', goalId)
  }

  async function deleteGoal(goalId: string) {
    if (!window.confirm('Er du sikker på at du vil slette dette målet?')) return
    // Remove milestones locally
    setMilestones(prev => prev.filter(m => m.goal_id !== goalId))
    setGoals(prev => prev.filter(g => g.id !== goalId))
    setExpandedGoal(null)
    // Delete milestones then goal in DB
    await supabase.from('milestones').delete().eq('goal_id', goalId)
    await supabase.from('goals').delete().eq('id', goalId)
  }

  // --- CRUD: Milestone management ---

  async function toggleMilestone(milestone: Milestone) {
    const newCompleted = !milestone.completed
    const completedAt = newCompleted ? new Date().toISOString() : null
    setMilestones(prev =>
      prev.map(m => m.id === milestone.id ? { ...m, completed: newCompleted, completed_at: completedAt ?? undefined } : m)
    )
    await supabase.from('milestones').update({
      completed: newCompleted,
      completed_at: completedAt,
    }).eq('id', milestone.id)
  }

  async function addMilestone(goalId: string) {
    if (!milestoneForm.title.trim()) return
    const goalMilestones = milestones.filter(m => m.goal_id === goalId)
    const sortOrder = goalMilestones.length

    const { data } = await supabase.from('milestones').insert({
      goal_id: goalId,
      title: milestoneForm.title.trim(),
      target_date: milestoneForm.target_date || null,
      sort_order: sortOrder,
      completed: false,
    }).select().single()

    if (data) {
      setMilestones(prev => [...prev, data as Milestone])
    }
    setMilestoneForm({ title: '', target_date: '' })
    setAddingMilestoneFor(null)
  }

  async function deleteMilestone(milestoneId: string) {
    if (!window.confirm('Slette denne milepælen?')) return
    setMilestones(prev => prev.filter(m => m.id !== milestoneId))
    await supabase.from('milestones').delete().eq('id', milestoneId)
  }

  // --- Status helpers ---

  function getStatusLabel(status: Goal['status']) {
    switch (status) {
      case 'active': return 'Aktiv'
      case 'completed': return 'Fullført'
      case 'paused': return 'Pause'
      case 'abandoned': return 'Avbrutt'
    }
  }

  function getStatusStyle(status: Goal['status']) {
    switch (status) {
      case 'active': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'completed': return 'bg-gray-100 text-gray-600 border-gray-200'
      case 'paused': return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'abandoned': return 'bg-red-50 text-red-600 border-red-200'
    }
  }

  return (
    <div>
      {/* Filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
          style={filter === 'all' ? { backgroundColor: '#0c3230' } : {}}
        >
          Alle
        </button>
        {CATEGORIES.map((cat) => {
          const hasGoals = goals.some((g) => g.category === cat.id && !g.parent_goal_id)
          if (!hasGoals) return null
          return (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === cat.id ? `${cat.bg} ${cat.color} border ${cat.border}` : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-400'}`}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      <div className="space-y-6">
        {byCategory.map((cat) => (
          <div key={cat.id}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${cat.color} mb-2`}>{cat.label}</p>
            <div className="space-y-3">
              {cat.goals.map((goal) => {
                const pct = goal.target_value
                  ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
                  : null
                const goalMilestones = milestones.filter((m) => m.goal_id === goal.id)
                const isExpanded = expandedGoal === goal.id
                const isEditing = editingGoal === goal.id
                const isEditingDetails = editingDetail === goal.id
                const meta = CATEGORY_MAP[goal.category]

                return (
                  <div key={goal.id} className={`bg-white border rounded-xl overflow-hidden ${cat.border}`}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <button
                          onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                          className="flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-semibold ${goal.status === 'completed' ? 'line-through text-gray-400' : goal.status === 'paused' ? 'text-gray-500' : 'text-gray-900'}`}>
                              {goal.title}
                            </p>
                            {goal.status !== 'active' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${getStatusStyle(goal.status)}`}>
                                {getStatusLabel(goal.status)}
                              </span>
                            )}
                          </div>
                          {goal.description && (
                            <p className="text-xs text-gray-500 mt-0.5">{goal.description}</p>
                          )}
                        </button>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Quick status buttons */}
                          {goal.status === 'active' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); updateGoalStatus(goal.id, 'completed') }}
                                title="Merk som fullført"
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); updateGoalStatus(goal.id, 'paused') }}
                                title="Sett på pause"
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-300 transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                  <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                                </svg>
                              </button>
                            </>
                          )}
                          {goal.status === 'paused' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); updateGoalStatus(goal.id, 'active') }}
                              title="Gjenoppta"
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-emerald-600 hover:border-emerald-300 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </button>
                          )}
                          {goal.status === 'completed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); updateGoalStatus(goal.id, 'active') }}
                              title="Gjenåpne"
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.06-.179zm-1.224-7.776a.75.75 0 00-1.06.178A5.5 5.5 0 014.688 8.576a.75.75 0 001.06.178 4 4 0 016.26-5.088l.312.311H9.887a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V1.093a.75.75 0 00-1.5 0v2.033l-.312-.311a6.982 6.982 0 00-.371-.167z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          <div className="text-right ml-1">
                            {pct !== null && (
                              <span className={`text-xs font-medium ${meta.color}`}>{pct}%</span>
                            )}
                            {goal.deadline && (
                              <p className="text-xs text-gray-400">{formatDate(goal.deadline)}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {goal.target_value && (
                        <div className="mb-2">
                          <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                            {isEditing ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  autoFocus
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveProgress(goal)
                                    if (e.key === 'Escape') setEditingGoal(null)
                                  }}
                                  className="w-28 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-gray-500"
                                />
                                <span>{goal.unit}</span>
                                <button onClick={() => saveProgress(goal)} className="text-xs text-white px-2 py-0.5 rounded" style={{ backgroundColor: '#0c3230' }}>Lagre</button>
                                <button onClick={() => setEditingGoal(null)} className="text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingGoal(goal.id); setEditValue(String(goal.current_value)) }}
                                className="hover:text-gray-800 transition-colors"
                              >
                                {goal.current_value.toLocaleString('nb-NO')} {goal.unit}
                              </button>
                            )}
                            <span>{goal.target_value.toLocaleString('nb-NO')} {goal.unit}</span>
                          </div>
                          <ProgressBar
                            value={goal.current_value}
                            max={goal.target_value}
                            colorClass={PROGRESS_COLORS[goal.category]}
                          />
                        </div>
                      )}
                    </div>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div className={`border-t ${cat.border}`}>
                        {/* Goal detail editing */}
                        <div className={`px-4 py-3 ${cat.bg}`}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Detaljer</p>

                          {isEditingDetails ? (
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Tittel</label>
                                <input
                                  type="text"
                                  value={detailForm.title}
                                  onChange={e => setDetailForm(f => ({ ...f, title: e.target.value }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-gray-400"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Beskrivelse</label>
                                <textarea
                                  value={detailForm.description}
                                  onChange={e => setDetailForm(f => ({ ...f, description: e.target.value }))}
                                  rows={2}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-gray-400 resize-none"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 mb-1 block">Frist</label>
                                <input
                                  type="date"
                                  value={detailForm.deadline}
                                  onChange={e => setDetailForm(f => ({ ...f, deadline: e.target.value }))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-gray-400"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveDetail(goal.id)}
                                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                                  style={{ backgroundColor: '#0c3230' }}
                                >
                                  Lagre
                                </button>
                                <button
                                  onClick={() => setEditingDetail(null)}
                                  className="px-4 py-2 rounded-lg text-xs text-gray-500 border border-gray-200 bg-white"
                                >
                                  Avbryt
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <button
                                onClick={() => startEditDetail(goal)}
                                className="text-xs font-medium hover:underline"
                                style={{ color: '#3dbfb5' }}
                              >
                                Rediger detaljer
                              </button>
                            </div>
                          )}

                          {/* Status actions */}
                          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-200/60">
                            {goal.status === 'active' && (
                              <>
                                <button
                                  onClick={() => updateGoalStatus(goal.id, 'completed')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                >
                                  Fullført
                                </button>
                                <button
                                  onClick={() => updateGoalStatus(goal.id, 'paused')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                                >
                                  Pause
                                </button>
                              </>
                            )}
                            {goal.status === 'paused' && (
                              <button
                                onClick={() => updateGoalStatus(goal.id, 'active')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                              >
                                Gjenoppta
                              </button>
                            )}
                            {goal.status === 'completed' && (
                              <button
                                onClick={() => updateGoalStatus(goal.id, 'active')}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                              >
                                Gjenåpne
                              </button>
                            )}
                            <button
                              onClick={() => deleteGoal(goal.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors ml-auto"
                            >
                              Slett mål
                            </button>
                          </div>
                        </div>

                        {/* Milestones section */}
                        <div className={`px-4 pb-4 pt-0 border-t ${cat.border} ${cat.bg}`}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Milepæler</p>

                          {goalMilestones.length > 0 ? (
                            <div className="space-y-1.5">
                              {goalMilestones.map((m) => (
                                <div key={m.id} className="flex items-center gap-2 group">
                                  <button
                                    onClick={() => toggleMilestone(m)}
                                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                      m.completed
                                        ? 'border-gray-900 bg-gray-900'
                                        : 'border-gray-300 hover:border-gray-500'
                                    }`}
                                  >
                                    {m.completed && (
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-xs ${m.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                      {m.title}
                                    </span>
                                    {m.target_date && (
                                      <span className="text-xs text-gray-400 ml-2">{formatDate(m.target_date)}</span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => deleteMilestone(m.id)}
                                    className="w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Slett milepæl"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">Ingen milepæler ennå</p>
                          )}

                          {/* Add milestone form */}
                          {addingMilestoneFor === goal.id ? (
                            <div className="mt-3 flex flex-col sm:flex-row gap-2">
                              <input
                                autoFocus
                                type="text"
                                placeholder="Milepæltittel"
                                value={milestoneForm.title}
                                onChange={e => setMilestoneForm(f => ({ ...f, title: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') addMilestone(goal.id)
                                  if (e.key === 'Escape') setAddingMilestoneFor(null)
                                }}
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-gray-400"
                              />
                              <input
                                type="date"
                                value={milestoneForm.target_date}
                                onChange={e => setMilestoneForm(f => ({ ...f, target_date: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-gray-400"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => addMilestone(goal.id)}
                                  disabled={!milestoneForm.title.trim()}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                                  style={{ backgroundColor: '#0c3230' }}
                                >
                                  Legg til
                                </button>
                                <button
                                  onClick={() => { setAddingMilestoneFor(null); setMilestoneForm({ title: '', target_date: '' }) }}
                                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 bg-white"
                                >
                                  Avbryt
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setAddingMilestoneFor(goal.id); setMilestoneForm({ title: '', target_date: '' }) }}
                              className="mt-3 text-xs font-medium hover:underline"
                              style={{ color: '#3dbfb5' }}
                            >
                              + Legg til milepæl
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expand/collapse toggle (only show when NOT expanded, for quick access) */}
                    {!isExpanded && (
                      <button
                        onClick={() => setExpandedGoal(goal.id)}
                        className={`w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors border-t ${cat.border}`}
                      >
                        {goalMilestones.length > 0
                          ? `▼ ${goalMilestones.length} milepæler`
                          : '▼ Vis detaljer'}
                      </button>
                    )}

                    {isExpanded && (
                      <button
                        onClick={() => { setExpandedGoal(null); setEditingDetail(null); setAddingMilestoneFor(null) }}
                        className={`w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors border-t ${cat.border}`}
                      >
                        ▲ Skjul
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={() => setShowNewGoal(v => !v)}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          + Nytt mål
        </button>
        <button
          onClick={suggestGoal}
          disabled={claude.loading}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-colors border disabled:opacity-50"
          style={{ borderColor: '#0c3230', color: '#0c3230' }}
        >
          {claude.loading ? 'Claude tenker...' : 'Foreslå mål med Claude'}
        </button>
      </div>

      {/* Claude suggestion */}
      {suggestion && (
        <div className="mt-3 bg-white border-2 rounded-2xl p-4 space-y-3" style={{ borderColor: '#b8f04a' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#3dbfb5' }}>Claude foreslår</p>
          <div>
            <p className="text-sm font-bold text-gray-900">{suggestion.title}</p>
            {suggestion.description && <p className="text-xs text-gray-600 mt-1">{suggestion.description}</p>}
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            {suggestion.category && <span className="capitalize">{CATEGORY_MAP[suggestion.category]?.label ?? suggestion.category}</span>}
            {suggestion.target_value && <span>{suggestion.target_value} {suggestion.unit}</span>}
            {suggestion.deadline && <span>Frist: {suggestion.deadline}</span>}
          </div>
          {suggestion.milestones?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500">Milepæler:</p>
              {suggestion.milestones.map((m, i) => (
                <p key={i} className="text-xs text-gray-600">• {m.title} ({m.target_date})</p>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={approveSuggestion}
              disabled={approvingSuggestion}
              className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
            >
              {approvingSuggestion ? 'Oppretter...' : 'Godkjenn og opprett'}
            </button>
            <button
              onClick={() => { setSuggestion(null); claude.reset() }}
              className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200"
            >
              Avvis
            </button>
          </div>
        </div>
      )}

      {/* Show raw Claude response if no suggestion parsed */}
      {!suggestion && claude.response && (
        <ClaudeResponseLight response={claude.response} loading={false} error={claude.error} />
      )}

      {/* Manual new goal form */}
      {showNewGoal && (
        <div className="mt-3 bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Nytt mål</p>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tittel</label>
            <input type="text" placeholder="Hva vil du oppnå?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Beskrivelse</label>
            <input type="text" placeholder="Mer kontekst..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Kategori</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Frist</label>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Målverdi</label>
              <input type="number" placeholder="f.eks. 1000000" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Enhet</label>
              <input type="text" placeholder="kr, kg, %..." value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createGoal} disabled={creating || !form.title}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}>
              {creating ? 'Oppretter...' : 'Opprett mål'}
            </button>
            <button onClick={() => { setShowNewGoal(false); setForm(EMPTY_FORM) }}
              className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200">Avbryt</button>
          </div>
        </div>
      )}
    </div>
  )
}
