'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { CascadeGoal, Category, TimeHorizon, Reward } from '@/types'
import { CATEGORIES, CATEGORY_MAP, TIME_HORIZON_ORDER } from '@/types'
import { createClient } from '@/lib/supabase'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

// ─── Constants ──────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TimeHorizon, string> = {
  day: 'Dag',
  week: 'Uke',
  month: 'Mnd',
  quarter: 'Kvartal',
  '1y': 'År',
  '3y': '3 år',
  '5y': '5 år',
  vision_10y: 'Visjon',
}

const TAB_ORDER: TimeHorizon[] = [
  'day', 'week', 'month', 'quarter', '1y', '3y', '5y', 'vision_10y',
]

const PROGRESS_COLORS: Record<string, string> = {
  business: 'bg-blue-500',
  physical: 'bg-teal-500',
  mental: 'bg-purple-500',
  finance: 'bg-amber-500',
  family: 'bg-pink-500',
  lifestyle: 'bg-orange-500',
  brand: 'bg-indigo-500',
}

const BORDER_COLORS: Record<string, string> = {
  business: 'border-l-blue-500',
  physical: 'border-l-teal-500',
  mental: 'border-l-purple-500',
  finance: 'border-l-amber-500',
  family: 'border-l-pink-500',
  lifestyle: 'border-l-orange-500',
  brand: 'border-l-indigo-500',
}

const DOT_COLORS: Record<string, string> = {
  business: 'bg-blue-500',
  physical: 'bg-teal-500',
  mental: 'bg-purple-500',
  finance: 'bg-amber-500',
  family: 'bg-pink-500',
  lifestyle: 'bg-orange-500',
  brand: 'bg-indigo-500',
}

type StatusFilter = 'all' | 'active' | 'completed' | 'paused'
type ViewMode = 'liste' | 'tidslinje'

interface GoalFormData {
  title: string
  description: string
  category: Category
  time_horizon: TimeHorizon
  parent_id: string
  target_value: string
  unit: string
  deadline: string
}

const EMPTY_FORM: GoalFormData = {
  title: '',
  description: '',
  category: 'business',
  time_horizon: 'quarter',
  parent_id: '',
  target_value: '',
  unit: '',
  deadline: '',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getParentHorizon(horizon: TimeHorizon): TimeHorizon | null {
  const idx = TIME_HORIZON_ORDER.indexOf(horizon)
  return idx > 0 ? TIME_HORIZON_ORDER[idx - 1] : null
}

function getChildHorizon(horizon: TimeHorizon): TimeHorizon | null {
  const idx = TIME_HORIZON_ORDER.indexOf(horizon)
  return idx < TIME_HORIZON_ORDER.length - 1 ? TIME_HORIZON_ORDER[idx + 1] : null
}

function daysRemaining(deadline: string | undefined): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDaysRemaining(days: number): string {
  if (days < 0) return `${Math.abs(days)}d forfalt`
  if (days === 0) return 'I dag'
  if (days === 1) return '1 dag igjen'
  return `${days}d igjen`
}

function getProgressPct(goal: CascadeGoal, childrenMap: Map<string, CascadeGoal[]>): number {
  if (goal.status === 'completed') return 100
  if (goal.target_value && goal.target_value > 0) {
    return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
  }
  const children = childrenMap.get(goal.id) ?? []
  if (children.length === 0) return 0
  const childPcts = children.map(c => getProgressPct(c, childrenMap))
  return Math.round(childPcts.reduce((a, b) => a + b, 0) / childPcts.length)
}

function getTimeElapsedPct(goal: CascadeGoal): number | null {
  if (!goal.deadline) return null
  const start = goal.start_date ? new Date(goal.start_date).getTime() : new Date(goal.created_at).getTime()
  const end = new Date(goal.deadline).getTime()
  const now = Date.now()
  if (end <= start) return 100
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

type TrackStatus = 'green' | 'yellow' | 'red' | null

function getOnTrackStatus(goal: CascadeGoal, childrenMap: Map<string, CascadeGoal[]>): TrackStatus {
  const timePct = getTimeElapsedPct(goal)
  if (timePct === null) return null
  const progressPct = getProgressPct(goal, childrenMap)
  if (progressPct >= timePct) return 'green'
  if (progressPct >= timePct * 0.8) return 'yellow'
  return 'red'
}

function getBreadcrumbChain(goalId: string, goalsById: Map<string, CascadeGoal>): CascadeGoal[] {
  const chain: CascadeGoal[] = []
  let current = goalsById.get(goalId)
  while (current) {
    chain.unshift(current)
    current = current.parent_id ? goalsById.get(current.parent_id) : undefined
  }
  return chain
}

function getDescendantIds(goalId: string, childrenMap: Map<string, CascadeGoal[]>): Set<string> {
  const result = new Set<string>()
  const stack = childrenMap.get(goalId) ?? []
  for (const child of stack) {
    result.add(child.id)
    const nested = getDescendantIds(child.id, childrenMap)
    nested.forEach(id => result.add(id))
  }
  return result
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function OnTrackDot({ status }: { status: TrackStatus }) {
  if (!status) return null
  const colors = { green: 'bg-emerald-400', yellow: 'bg-yellow-400', red: 'bg-red-400' }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />
}

function MiniProgress({ pct, category }: { pct: number; category: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all duration-300 ${PROGRESS_COLORS[category] ?? 'bg-gray-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Goal Card ──────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: CascadeGoal
  childrenMap: Map<string, CascadeGoal[]>
  isExpanded: boolean
  onSelect: (id: string) => void
  compact?: boolean
}

function GoalCard({ goal, childrenMap, isExpanded, onSelect, compact }: GoalCardProps) {
  const pct = getProgressPct(goal, childrenMap)
  const trackStatus = getOnTrackStatus(goal, childrenMap)
  const days = daysRemaining(goal.deadline)
  const cat = CATEGORY_MAP[goal.category]

  return (
    <div
      className={`bg-white rounded-xl border border-l-4 p-3 cursor-pointer transition-all
        ${BORDER_COLORS[goal.category] ?? 'border-l-gray-400'}
        ${isExpanded ? 'ring-2 ring-[#3dbfb5] border-[#3dbfb5]' : 'border-gray-200 hover:border-gray-300'}
        ${goal.status === 'completed' ? 'opacity-60' : ''}
        ${goal.status === 'paused' ? 'opacity-50' : ''}
      `}
      onClick={() => onSelect(goal.id)}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${DOT_COLORS[goal.category]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-medium leading-tight ${goal.status === 'completed' ? 'line-through' : ''}`}>
              {goal.title}
            </span>
            <OnTrackDot status={trackStatus} />
          </div>
          {!compact && goal.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{goal.description}</p>
          )}
        </div>

        {/* Right side info */}
        <div className="flex items-center gap-2 shrink-0">
          {goal.target_value != null && goal.target_value > 0 && (
            <span className="text-xs text-gray-500">
              {goal.current_value}/{goal.target_value}{goal.unit ? ` ${goal.unit}` : ''}
            </span>
          )}
          {days !== null && (
            <span className={`text-xs ${days < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {formatDaysRemaining(days)}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(goal.target_value != null && goal.target_value > 0) && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <MiniProgress pct={pct} category={goal.category} />
          </div>
          <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
        </div>
      )}

      {/* Category badge */}
      {!compact && cat && (
        <div className="mt-2">
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
            {cat.label}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────

interface BreadcrumbProps {
  chain: CascadeGoal[]
  currentId: string
  onNavigate: (goalId: string, horizon: TimeHorizon) => void
}

function Breadcrumb({ chain, currentId, onNavigate }: BreadcrumbProps) {
  if (chain.length <= 1) return null
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 mb-3">
      {chain.map((g, i) => {
        const isCurrent = g.id === currentId
        return (
          <span key={g.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">&rarr;</span>}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!isCurrent) onNavigate(g.id, g.time_horizon)
              }}
              className={`hover:underline ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {TAB_LABELS[g.time_horizon]}: {g.title}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ─── Detail Panel ───────────────────────────────────────────────────────────

interface DetailPanelProps {
  goal: CascadeGoal
  childrenMap: Map<string, CascadeGoal[]>
  goalsById: Map<string, CascadeGoal>
  allGoals: CascadeGoal[]
  userId: string
  rewards: Reward[]
  onClose: () => void
  onNavigate: (goalId: string, horizon: TimeHorizon) => void
  onRefresh: () => void
}

function DetailPanel({ goal, childrenMap, goalsById, userId, rewards, onClose, onNavigate, onRefresh }: DetailPanelProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const goalReward = rewards.find(r => r.goal_id === goal.id)
  const [showRewardForm, setShowRewardForm] = useState(false)
  const [rewardTitle, setRewardTitle] = useState('')
  const [rewardDesc, setRewardDesc] = useState('')
  const [rewardCost, setRewardCost] = useState('')
  const [rewardSaving, setRewardSaving] = useState(false)

  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
  const [targetValue, setTargetValue] = useState(goal.target_value?.toString() ?? '')
  const [unit, setUnit] = useState(goal.unit ?? '')
  const [currentValue, setCurrentValue] = useState(goal.current_value.toString())
  const [deadline, setDeadline] = useState(goal.deadline ?? '')
  const [status, setStatus] = useState(goal.status)
  const [saving, setSaving] = useState(false)
  const [updatingProgress, setUpdatingProgress] = useState(false)

  // Claude breakdown
  const [breakingDown, setBreakingDown] = useState(false)
  const [suggestions, setSuggestions] = useState<{ title: string; description: string; target_value?: number; unit?: string }[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [creatingSuggestions, setCreatingSuggestions] = useState(false)

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const chain = useMemo(() => getBreadcrumbChain(goal.id, goalsById), [goal.id, goalsById])
  const children = useMemo(() => childrenMap.get(goal.id) ?? [], [goal.id, childrenMap])

  // Group children by time_horizon
  const childrenByHorizon = useMemo(() => {
    const map = new Map<TimeHorizon, CascadeGoal[]>()
    for (const child of children) {
      const list = map.get(child.time_horizon) ?? []
      list.push(child)
      map.set(child.time_horizon, list)
    }
    return map
  }, [children])

  // Reset form when goal changes
  useEffect(() => {
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setTargetValue(goal.target_value?.toString() ?? '')
    setUnit(goal.unit ?? '')
    setCurrentValue(goal.current_value.toString())
    setDeadline(goal.deadline ?? '')
    setStatus(goal.status)
    setSuggestions([])
    setSelectedSuggestions(new Set())
  }, [goal])

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('cascade_goals')
      .update({
        title,
        description: description || null,
        target_value: targetValue ? parseFloat(targetValue) : null,
        unit: unit || null,
        deadline: deadline || null,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id)

    setSaving(false)
    if (error) {
      toast('Kunne ikke lagre endringer', 'error')
    } else {
      toast('Lagret', 'success')
      onRefresh()
    }
  }

  const handleUpdateProgress = async () => {
    const newValue = parseFloat(currentValue)
    if (isNaN(newValue)) return
    setUpdatingProgress(true)

    await supabase.from('cascade_goal_progress').insert({
      goal_id: goal.id,
      value: newValue,
    })
    await supabase
      .from('cascade_goals')
      .update({ current_value: newValue, updated_at: new Date().toISOString() })
      .eq('id', goal.id)

    setUpdatingProgress(false)
    toast('Fremgang oppdatert', 'success')
    onRefresh()
  }

  const handleBreakdown = async () => {
    setBreakingDown(true)
    setSuggestions([])
    setSelectedSuggestions(new Set())

    const childHorizon = getChildHorizon(goal.time_horizon)
    const existingChildren = children.map(c => c.title).join(', ')

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cascade_breakdown',
          data: {
            goal: `${goal.title}${goal.description ? ` - ${goal.description}` : ''}`,
            category: goal.category,
            timeHorizon: TAB_LABELS[goal.time_horizon],
            targetLevel: childHorizon ? TAB_LABELS[childHorizon] : 'Dag',
            existingChildren: existingChildren || 'Ingen',
            context: goal.deadline ? `Frist: ${goal.deadline}` : 'Ingen frist satt',
          },
        }),
      })

      const result = await res.json()
      const responseText = result.response || result.content || ''

      // Try to parse JSON array from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          setSuggestions(parsed)
        }
      }
    } catch {
      toast('Kunne ikke generere forslag', 'error')
    }

    setBreakingDown(false)
  }

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleCreateSuggestions = async () => {
    if (selectedSuggestions.size === 0) return
    setCreatingSuggestions(true)

    const childHorizon = getChildHorizon(goal.time_horizon) ?? 'day'
    const toCreate = Array.from(selectedSuggestions).map(idx => suggestions[idx])

    for (const s of toCreate) {
      await supabase.from('cascade_goals').insert({
        user_id: userId,
        category: goal.category,
        time_horizon: childHorizon,
        title: s.title,
        description: s.description || null,
        target_value: s.target_value ?? null,
        current_value: 0,
        unit: s.unit || null,
        parent_id: goal.id,
        status: 'active',
      })
    }

    setCreatingSuggestions(false)
    setSuggestions([])
    setSelectedSuggestions(new Set())
    toast(`${toCreate.length} mål opprettet`, 'success')
    onRefresh()
  }

  const handleDelete = async () => {
    const descendants = getDescendantIds(goal.id, childrenMap)

    if (descendants.size > 0) {
      // Reparent children to this goal's parent
      for (const child of children) {
        await supabase
          .from('cascade_goals')
          .update({ parent_id: goal.parent_id || null, updated_at: new Date().toISOString() })
          .eq('id', child.id)
      }
    }

    await supabase.from('cascade_goals').delete().eq('id', goal.id)
    setShowDeleteConfirm(false)
    toast('Mål slettet', 'success')
    onClose()
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-[#3dbfb5] p-4 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Breadcrumb */}
      <Breadcrumb chain={chain} currentId={goal.id} onNavigate={onNavigate} />

      {/* Editable fields */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Tittel</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Beskrivelse</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent resize-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Målverdi</label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Enhet</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
              placeholder="kr, kg..."
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Frist</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
            />
          </div>
        </div>

        {/* Progress update */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Nåværende verdi</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
            />
            <button
              onClick={handleUpdateProgress}
              disabled={updatingProgress}
              className="px-3 py-2 text-sm font-medium bg-[#0c3230] text-white rounded-lg hover:bg-[#0a2a28] transition-colors disabled:opacity-50"
            >
              {updatingProgress ? '...' : 'Oppdater'}
            </button>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CascadeGoal['status'])}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent bg-white"
          >
            <option value="active">Aktiv</option>
            <option value="completed">Fullført</option>
            <option value="paused">Pauset</option>
            <option value="abandoned">Forlatt</option>
          </select>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 text-sm font-medium bg-[#3dbfb5] text-white rounded-lg hover:bg-[#2fa99f] transition-colors disabled:opacity-50"
        >
          {saving ? 'Lagrer...' : 'Lagre endringer'}
        </button>
      </div>

      {/* Children */}
      {children.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Undermål ({children.length})
          </h4>
          {Array.from(childrenByHorizon.entries()).map(([horizon, goals]) => (
            <div key={horizon} className="mb-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase mb-1.5">{TAB_LABELS[horizon]}</p>
              <div className="space-y-1.5">
                {goals.map(child => (
                  <div
                    key={child.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigate(child.id, child.time_horizon)
                    }}
                    className={`flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors ${child.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[child.category]}`} />
                    <span className={`text-xs font-medium flex-1 min-w-0 truncate ${child.status === 'completed' ? 'line-through' : ''}`}>
                      {child.title}
                    </span>
                    {child.target_value != null && child.target_value > 0 && (
                      <div className="w-16">
                        <MiniProgress pct={getProgressPct(child, childrenMap)} category={child.category} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Claude breakdown */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={handleBreakdown}
          disabled={breakingDown}
          className="w-full py-2 text-sm font-medium border border-[#3dbfb5] text-[#3dbfb5] rounded-lg hover:bg-[#3dbfb5]/5 transition-colors disabled:opacity-50"
        >
          {breakingDown ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-[#3dbfb5]/30 border-t-[#3dbfb5] rounded-full animate-spin" />
              Claude tenker...
            </span>
          ) : (
            'Bryt ned med Claude'
          )}
        </button>

        {suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-gray-500">Foreslåtte undermål:</p>
            {suggestions.map((s, idx) => (
              <label
                key={idx}
                className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors
                  ${selectedSuggestions.has(idx) ? 'border-[#3dbfb5] bg-[#3dbfb5]/5' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedSuggestions.has(idx)}
                  onChange={() => toggleSuggestion(idx)}
                  className="mt-0.5 rounded border-gray-300 text-[#3dbfb5] focus:ring-[#3dbfb5]"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.title}</p>
                  {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                  {s.target_value != null && (
                    <p className="text-xs text-gray-400 mt-0.5">Mål: {s.target_value}{s.unit ? ` ${s.unit}` : ''}</p>
                  )}
                </div>
              </label>
            ))}
            <button
              onClick={handleCreateSuggestions}
              disabled={selectedSuggestions.size === 0 || creatingSuggestions}
              className="w-full py-2 text-sm font-medium bg-[#0c3230] text-white rounded-lg hover:bg-[#0a2a28] transition-colors disabled:opacity-50"
            >
              {creatingSuggestions ? 'Oppretter...' : `Opprett valgte (${selectedSuggestions.size})`}
            </button>
          </div>
        )}
      </div>

      {/* Reward */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        {goalReward ? (
          <div className="flex items-start gap-2">
            <span className="text-base">🎁</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-[#0c3230]">{goalReward.title}</p>
              {goalReward.description && (
                <p className="text-xs text-[#0c3230]/60 mt-0.5">{goalReward.description}</p>
              )}
              {goalReward.estimated_cost != null && (
                <p className="text-xs text-[#0c3230]/40 mt-0.5">{goalReward.estimated_cost.toLocaleString('nb-NO')} kr</p>
              )}
              {goal.status === 'completed' && !goalReward.unlocked && (
                <button
                  onClick={async () => {
                    await supabase.from('rewards').update({ unlocked: true, unlocked_at: new Date().toISOString() }).eq('id', goalReward.id)
                    toast('Belønning låst opp!', 'success')
                    onRefresh()
                  }}
                  className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
                >
                  Lås opp belønningen!
                </button>
              )}
              {goalReward.unlocked && (
                <p className="text-xs font-medium mt-1" style={{ color: '#3dbfb5' }}>Opplåst!</p>
              )}
            </div>
          </div>
        ) : showRewardForm ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#0c3230]/50">Legg til belønning</p>
            <input
              value={rewardTitle}
              onChange={e => setRewardTitle(e.target.value)}
              placeholder="Belønning (f.eks. Ny klokke)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#3dbfb5]"
              autoFocus
            />
            <input
              value={rewardDesc}
              onChange={e => setRewardDesc(e.target.value)}
              placeholder="Beskrivelse (valgfritt)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#3dbfb5]"
            />
            <input
              type="number"
              value={rewardCost}
              onChange={e => setRewardCost(e.target.value)}
              placeholder="Estimert kostnad i kr (valgfritt)"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#3dbfb5]"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!rewardTitle.trim()) return
                  setRewardSaving(true)
                  await supabase.from('rewards').insert({
                    goal_id: goal.id,
                    title: rewardTitle.trim(),
                    description: rewardDesc.trim() || null,
                    estimated_cost: rewardCost ? parseFloat(rewardCost) : null,
                  })
                  setRewardSaving(false)
                  setShowRewardForm(false)
                  setRewardTitle('')
                  setRewardDesc('')
                  setRewardCost('')
                  toast('Belønning lagt til!', 'success')
                  onRefresh()
                }}
                disabled={rewardSaving || !rewardTitle.trim()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
              >
                {rewardSaving ? 'Lagrer...' : 'Lagre'}
              </button>
              <button
                onClick={() => setShowRewardForm(false)}
                className="text-xs text-[#0c3230]/50 hover:text-[#0c3230]"
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRewardForm(true)}
            className="text-xs text-[#3dbfb5] hover:underline flex items-center gap-1"
          >
            <span>🎁</span> Legg til belønning
          </button>
        )}
      </div>

      {/* Delete */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          Slett mål
        </button>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Slett mål"
        message={
          children.length > 0
            ? `Dette målet har ${children.length} undermål. Undermålene flyttes til forelderen. Er du sikker?`
            : 'Er du sikker på at du vil slette dette målet?'
        }
        confirmLabel="Slett"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        variant="danger"
      />
    </div>
  )
}

// ─── Add Goal Modal ─────────────────────────────────────────────────────────

interface AddGoalModalProps {
  open: boolean
  onClose: () => void
  userId: string
  defaultHorizon: TimeHorizon
  allGoals: CascadeGoal[]
  onRefresh: () => void
}

function AddGoalModal({ open, onClose, userId, defaultHorizon, allGoals, onRefresh }: AddGoalModalProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [form, setForm] = useState<GoalFormData>({ ...EMPTY_FORM, time_horizon: defaultHorizon })
  const [saving, setSaving] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, time_horizon: defaultHorizon })
    }
  }, [open, defaultHorizon])

  const parentHorizon = getParentHorizon(form.time_horizon)
  const possibleParents = useMemo(() => {
    if (!parentHorizon) return []
    return allGoals.filter(g => g.time_horizon === parentHorizon && (form.category === g.category || !form.parent_id))
  }, [allGoals, parentHorizon, form.category, form.parent_id])

  const filteredParents = useMemo(() => {
    return possibleParents.filter(g => g.category === form.category)
  }, [possibleParents, form.category])

  const handleSuggest = async () => {
    setSuggesting(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cascade_breakdown',
          data: {
            goal: `Nytt mål for ${CATEGORY_MAP[form.category]?.label ?? form.category}`,
            category: form.category,
            timeHorizon: TAB_LABELS[form.time_horizon],
            targetLevel: TAB_LABELS[form.time_horizon],
            existingChildren: 'Ingen, dette er et nytt mål',
            context: form.parent_id
              ? `Foreldremål: ${allGoals.find(g => g.id === form.parent_id)?.title ?? ''}`
              : 'Ingen foreldremål',
          },
        }),
      })

      const result = await res.json()
      const responseText = result.response || result.content || ''
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0]
          setForm(prev => ({
            ...prev,
            title: first.title || prev.title,
            description: first.description || prev.description,
            target_value: first.target_value?.toString() ?? prev.target_value,
            unit: first.unit || prev.unit,
          }))
        }
      }
    } catch {
      toast('Kunne ikke generere forslag', 'error')
    }
    setSuggesting(false)
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) return
    setSaving(true)

    const { error } = await supabase.from('cascade_goals').insert({
      user_id: userId,
      category: form.category,
      time_horizon: form.time_horizon,
      title: form.title.trim(),
      description: form.description || null,
      target_value: form.target_value ? parseFloat(form.target_value) : null,
      current_value: 0,
      unit: form.unit || null,
      deadline: form.deadline || null,
      parent_id: form.parent_id || null,
      status: 'active',
    })

    setSaving(false)
    if (error) {
      toast('Kunne ikke opprette mål', 'error')
    } else {
      toast('Mål opprettet', 'success')
      onClose()
      onRefresh()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Nytt mål</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* Time horizon */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Tidshorisont</label>
            <select
              value={form.time_horizon}
              onChange={(e) => setForm(prev => ({ ...prev, time_horizon: e.target.value as TimeHorizon, parent_id: '' }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] bg-white"
            >
              {TAB_ORDER.map(h => (
                <option key={h} value={h}>{TAB_LABELS[h]}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Kategori</label>
            <select
              value={form.category}
              onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value as Category, parent_id: '' }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] bg-white"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Tittel *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              placeholder="Hva vil du oppnå?"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Beskrivelse</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] resize-none"
            />
          </div>

          {/* Target + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Målverdi</label>
              <input
                type="number"
                value={form.target_value}
                onChange={(e) => setForm(prev => ({ ...prev, target_value: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Enhet</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                placeholder="kr, kg, stk..."
              />
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Frist</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm(prev => ({ ...prev, deadline: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
            />
          </div>

          {/* Parent goal */}
          {filteredParents.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Foreldremål</label>
              <select
                value={form.parent_id}
                onChange={(e) => setForm(prev => ({ ...prev, parent_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] bg-white"
              >
                <option value="">Ingen</option>
                {filteredParents.map(g => (
                  <option key={g.id} value={g.id}>{TAB_LABELS[g.time_horizon]}: {g.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Suggest button */}
          <button
            onClick={handleSuggest}
            disabled={suggesting}
            className="w-full py-2 text-sm font-medium border border-[#3dbfb5] text-[#3dbfb5] rounded-lg hover:bg-[#3dbfb5]/5 transition-colors disabled:opacity-50"
          >
            {suggesting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-[#3dbfb5]/30 border-t-[#3dbfb5] rounded-full animate-spin" />
                Claude tenker...
              </span>
            ) : (
              'Foreslå med Claude'
            )}
          </button>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            className="w-full py-2.5 text-sm font-semibold bg-[#3dbfb5] text-white rounded-lg hover:bg-[#2fa99f] transition-colors disabled:opacity-50"
          >
            {saving ? 'Oppretter...' : 'Opprett mål'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Timeline View ──────────────────────────────────────────────────────────

interface TimelineViewProps {
  goals: CascadeGoal[]
  childrenMap: Map<string, CascadeGoal[]>
  onSelect: (goalId: string, horizon: TimeHorizon) => void
}

function TimelineView({ goals, childrenMap, onSelect }: TimelineViewProps) {
  const goalsWithDeadline = useMemo(() => {
    return goals
      .filter(g => g.deadline && g.status === 'active')
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
  }, [goals])

  // Group by month
  const byMonth = useMemo(() => {
    const map = new Map<string, CascadeGoal[]>()
    for (const g of goalsWithDeadline) {
      const d = new Date(g.deadline!)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const list = map.get(key) ?? []
      list.push(g)
      map.set(key, list)
    }
    return map
  }, [goalsWithDeadline])

  if (goalsWithDeadline.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        Ingen aktive mål med frist å vise i tidslinjen.
      </div>
    )
  }

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200" />

      {Array.from(byMonth.entries()).map(([monthKey, monthGoals]) => {
        const [year, month] = monthKey.split('-')
        const monthLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })

        return (
          <div key={monthKey} className="mb-6">
            {/* Month marker */}
            <div className="flex items-center gap-2 mb-3 -ml-6">
              <div className="w-5 h-5 rounded-full bg-[#0c3230] flex items-center justify-center shrink-0">
                <div className="w-2 h-2 rounded-full bg-[#b8f04a]" />
              </div>
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide capitalize">{monthLabel}</span>
            </div>

            {/* Goals for this month */}
            <div className="space-y-2 ml-2">
              {monthGoals.map(goal => {
                const days = daysRemaining(goal.deadline)
                const pct = getProgressPct(goal, childrenMap)
                const cat = CATEGORY_MAP[goal.category]
                const deadlineDate = new Date(goal.deadline!)

                return (
                  <div
                    key={goal.id}
                    onClick={() => onSelect(goal.id, goal.time_horizon)}
                    className={`p-3 rounded-xl border-l-4 border bg-white cursor-pointer hover:border-gray-300 transition-colors
                      ${BORDER_COLORS[goal.category]} border-gray-200`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{goal.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {cat && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                              {cat.label}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {TAB_LABELS[goal.time_horizon]}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">
                          {deadlineDate.getDate()}. {deadlineDate.toLocaleDateString('nb-NO', { month: 'short' })}
                        </p>
                        {days !== null && (
                          <p className={`text-[10px] mt-0.5 ${days < 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {formatDaysRemaining(days)}
                          </p>
                        )}
                      </div>
                    </div>
                    {goal.target_value != null && goal.target_value > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1">
                          <MiniProgress pct={pct} category={goal.category} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface MapClientProps {
  goals: CascadeGoal[]
  userId: string
  rewards: Reward[]
}

export function MapClient({ goals, userId, rewards }: MapClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusId = searchParams.get('focus')

  const [selectedHorizon, setSelectedHorizon] = useState<TimeHorizon>('quarter')
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('liste')

  const tabsRef = useRef<HTMLDivElement>(null)
  const goalRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Build maps
  const { childrenMap, goalsById } = useMemo(() => {
    const cm = new Map<string, CascadeGoal[]>()
    const gm = new Map<string, CascadeGoal>()
    for (const g of goals) {
      gm.set(g.id, g)
      if (g.parent_id) {
        const list = cm.get(g.parent_id) ?? []
        list.push(g)
        cm.set(g.parent_id, list)
      }
    }
    return { childrenMap: cm, goalsById: gm }
  }, [goals])

  // Focus handling
  useEffect(() => {
    if (focusId) {
      const goal = goalsById.get(focusId)
      if (goal) {
        setSelectedHorizon(goal.time_horizon)
        setExpandedGoalId(focusId)
        // Scroll to goal after render
        requestAnimationFrame(() => {
          const el = goalRefs.current.get(focusId)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }
  }, [focusId, goalsById])

  // Filtered goals
  const filteredGoals = useMemo(() => {
    return goals.filter(g => {
      if (g.time_horizon !== selectedHorizon) return false
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false
      if (statusFilter === 'active' && g.status !== 'active') return false
      if (statusFilter === 'completed' && g.status !== 'completed') return false
      if (statusFilter === 'paused' && (g.status !== 'paused' && g.status !== 'abandoned')) return false
      return true
    })
  }, [goals, selectedHorizon, categoryFilter, statusFilter])

  const activeCount = useMemo(() => goals.filter(g => g.status === 'active').length, [goals])

  const handleSelectGoal = useCallback((id: string) => {
    setExpandedGoalId(prev => prev === id ? null : id)
  }, [])

  const handleNavigate = useCallback((goalId: string, horizon: TimeHorizon) => {
    setSelectedHorizon(horizon)
    setExpandedGoalId(goalId)
    setCategoryFilter('all')
    setStatusFilter('all')
    requestAnimationFrame(() => {
      const el = goalRefs.current.get(goalId)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const handleRefresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleTimelineSelect = useCallback((goalId: string, horizon: TimeHorizon) => {
    setViewMode('liste')
    setSelectedHorizon(horizon)
    setExpandedGoalId(goalId)
    requestAnimationFrame(() => {
      const el = goalRefs.current.get(goalId)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kart</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activeCount} aktive mål</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('liste')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'liste' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setViewMode('tidslinje')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'tidslinje' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Tidslinje
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="w-9 h-9 flex items-center justify-center bg-[#3dbfb5] text-white rounded-xl hover:bg-[#2fa99f] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      {viewMode === 'liste' ? (
        <>
          {/* Horizon tabs */}
          <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide -mx-1 px-1">
            {TAB_ORDER.map(h => (
              <button
                key={h}
                onClick={() => {
                  setSelectedHorizon(h)
                  setExpandedGoalId(null)
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                  selectedHorizon === h
                    ? 'bg-[#0c3230] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {TAB_LABELS[h]}
              </button>
            ))}
          </div>

          {/* Category filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              Alle
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors shrink-0 ${
                  categoryFilter === c.id
                    ? `${c.bg} ${c.color} ring-1 ${c.border}`
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#3dbfb5]"
            >
              <option value="all">Alle statuser</option>
              <option value="active">Aktive</option>
              <option value="completed">Fullførte</option>
              <option value="paused">Pauset</option>
            </select>
            <span className="text-xs text-gray-400">
              {filteredGoals.length} mål
            </span>
          </div>

          {/* Goals list */}
          {filteredGoals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 mb-3">Ingen mål på dette nivået ennå.</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-sm font-medium text-[#3dbfb5] hover:underline"
              >
                Opprett nytt mål
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredGoals.map(goal => (
                <div
                  key={goal.id}
                  ref={(el) => {
                    if (el) goalRefs.current.set(goal.id, el)
                  }}
                >
                  <GoalCard
                    goal={goal}
                    childrenMap={childrenMap}
                    isExpanded={expandedGoalId === goal.id}
                    onSelect={handleSelectGoal}
                  />

                  {/* Detail panel */}
                  {expandedGoalId === goal.id && (
                    <DetailPanel
                      goal={goal}
                      childrenMap={childrenMap}
                      goalsById={goalsById}
                      allGoals={goals}
                      userId={userId}
                      rewards={rewards}
                      onClose={() => setExpandedGoalId(null)}
                      onNavigate={handleNavigate}
                      onRefresh={handleRefresh}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <TimelineView
          goals={goals}
          childrenMap={childrenMap}
          onSelect={handleTimelineSelect}
        />
      )}

      {/* Add Goal Modal */}
      <AddGoalModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        userId={userId}
        defaultHorizon={selectedHorizon}
        allGoals={goals}
        onRefresh={handleRefresh}
      />
    </div>
  )
}
