'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { CascadeGoal, Category, TimeHorizon } from '@/types'
import { CATEGORIES, TIME_HORIZON_LABELS, TIME_HORIZON_ORDER } from '@/types'
import { createClient } from '@/lib/supabase'

// ─── Constants ──────────────────────────────────────────────────────────────

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

type ViewMode = 'cascade' | 'category'
type StatusFilter = 'all' | 'active' | 'completed' | 'paused'

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
  time_horizon: 'vision_10y',
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

function daysRemaining(deadline: string | undefined): number | null {
  if (!deadline) return null
  const diff = new Date(deadline).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getProgressPct(goal: CascadeGoal, goalsMap: Map<string, CascadeGoal[]>): number {
  if (goal.status === 'completed') return 100
  if (goal.target_value && goal.target_value > 0) {
    return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
  }
  // Calculate from children
  const children = goalsMap.get(goal.id) ?? []
  if (children.length === 0) return 0
  const childPcts = children.map(c => getProgressPct(c, goalsMap))
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

function getOnTrackStatus(goal: CascadeGoal, goalsMap: Map<string, CascadeGoal[]>): TrackStatus {
  const timePct = getTimeElapsedPct(goal)
  if (timePct === null) return null
  const progressPct = getProgressPct(goal, goalsMap)
  const diff = progressPct - timePct
  if (diff >= 0) return 'green'
  if (diff >= -10) return 'yellow'
  return 'red'
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

function formatDaysRemaining(days: number): string {
  if (days < 0) return `${Math.abs(days)}d over`
  if (days === 0) return 'I dag'
  if (days === 1) return '1 dag igjen'
  return `${days}d igjen`
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

function ConfettiDots({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full animate-ping"
          style={{
            backgroundColor: ['#b8f04a', '#3dbfb5', '#f0b84a', '#f04a6e', '#4a7cf0'][i % 5],
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            animationDelay: `${i * 80}ms`,
            animationDuration: '600ms',
          }}
        />
      ))}
    </div>
  )
}

// ─── Goal Card ──────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: CascadeGoal
  goalsMap: Map<string, CascadeGoal[]>
  isHighlighted: boolean
  isSelected: boolean
  onSelect: (id: string) => void
  onEdit: (goal: CascadeGoal) => void
  onUpdateProgress: (goal: CascadeGoal) => void
  onComplete: (goal: CascadeGoal) => void
  onDelete: (goal: CascadeGoal) => void
  onBreakdown?: (goal: CascadeGoal) => void
  compact?: boolean
}

function GoalCard({
  goal,
  goalsMap,
  isHighlighted,
  isSelected,
  onSelect,
  onEdit,
  onUpdateProgress,
  onComplete,
  onDelete,
  onBreakdown,
  compact,
}: GoalCardProps) {
  const [showActions, setShowActions] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const pct = getProgressPct(goal, goalsMap)
  const trackStatus = getOnTrackStatus(goal, goalsMap)
  const days = daysRemaining(goal.deadline)
  const handleComplete = () => {
    setCelebrating(true)
    setTimeout(() => {
      onComplete(goal)
      setCelebrating(false)
    }, 700)
  }

  return (
    <div
      className={`relative bg-white rounded-xl border border-l-4 p-3 cursor-pointer transition-all
        ${BORDER_COLORS[goal.category] ?? 'border-l-gray-400'}
        ${isSelected ? 'ring-2 ring-[#3dbfb5] border-[#3dbfb5]' : 'border-gray-200'}
        ${isHighlighted ? 'bg-teal-50/50' : ''}
        ${goal.status === 'completed' ? 'opacity-60' : ''}
        ${goal.status === 'paused' ? 'opacity-50' : ''}
      `}
      onClick={() => onSelect(goal.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <ConfettiDots show={celebrating} />

      {/* Top row */}
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

        {/* Action buttons */}
        <div className={`flex items-center gap-1 shrink-0 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 md:opacity-0'}`}>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(goal) }}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Rediger"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {goal.status === 'active' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleComplete() }}
              className="p-1 text-gray-400 hover:text-emerald-600 rounded"
              title="Fullfør"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          {goal.status === 'active' && goal.time_horizon !== 'day' && onBreakdown && (
            <button
              onClick={(e) => { e.stopPropagation(); onBreakdown(goal) }}
              className="p-1 text-gray-400 hover:text-[#3dbfb5] rounded"
              title="Bryt ned med Claude"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(goal) }}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="Slett"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress row */}
      {(goal.target_value || (goalsMap.get(goal.id)?.length ?? 0) > 0) && (
        <div className="mt-2">
          <MiniProgress pct={pct} category={goal.category} />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-gray-400">
              {goal.target_value
                ? `${goal.current_value}${goal.unit ? ` ${goal.unit}` : ''} / ${goal.target_value}${goal.unit ? ` ${goal.unit}` : ''}`
                : `${pct}% fra undermål`
              }
            </span>
            {goal.target_value && goal.status === 'active' && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateProgress(goal) }}
                className="text-[10px] text-[#3dbfb5] font-medium hover:underline"
              >
                Oppdater
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom meta */}
      {days !== null && (
        <div className="mt-1.5">
          <span className={`text-[10px] font-medium ${days < 0 ? 'text-red-500' : days < 7 ? 'text-amber-600' : 'text-gray-400'}`}>
            {formatDaysRemaining(days)}
          </span>
        </div>
      )}

      {/* Status badge for non-active */}
      {goal.status !== 'active' && (
        <span className={`absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded
          ${goal.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : ''}
          ${goal.status === 'paused' ? 'bg-yellow-50 text-yellow-600' : ''}
          ${goal.status === 'abandoned' ? 'bg-red-50 text-red-500' : ''}
        `}>
          {goal.status === 'completed' ? 'Fullført' : goal.status === 'paused' ? 'Pauset' : 'Forlatt'}
        </span>
      )}
    </div>
  )
}

// ─── Modal ──────────────────────────────────────────────────────────────────

interface GoalModalProps {
  form: GoalFormData
  setForm: (f: GoalFormData) => void
  onSave: () => void
  onClose: () => void
  saving: boolean
  title: string
  goals: CascadeGoal[]
}

function GoalModal({ form, setForm, onSave, onClose, saving, title, goals }: GoalModalProps) {
  const parentHorizon = getParentHorizon(form.time_horizon)
  const possibleParents = parentHorizon
    ? goals.filter(g => g.time_horizon === parentHorizon && g.category === form.category)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-[#0c3230] mb-4">{title}</h2>

        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tittel</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              placeholder="Hva vil du oppnå?"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Beskrivelse (valgfritt)</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] resize-none"
              rows={2}
              placeholder="Utdypende beskrivelse..."
            />
          </div>

          {/* Category + Horizon row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kategori</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value as Category, parent_id: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tidshorisont</label>
              <select
                value={form.time_horizon}
                onChange={e => setForm({ ...form, time_horizon: e.target.value as TimeHorizon, parent_id: '' })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              >
                {TIME_HORIZON_ORDER.map(h => (
                  <option key={h} value={h}>{TIME_HORIZON_LABELS[h]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Parent goal */}
          {possibleParents.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Overordnet mål ({TIME_HORIZON_LABELS[parentHorizon!]})
              </label>
              <select
                value={form.parent_id}
                onChange={e => setForm({ ...form, parent_id: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              >
                <option value="">Ingen</option>
                {possibleParents.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* Target value + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Målverdi (valgfritt)</label>
              <input
                type="number"
                value={form.target_value}
                onChange={e => setForm({ ...form, target_value: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                placeholder="100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Enhet (valgfritt)</label>
              <input
                type="text"
                value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                placeholder="kr, kg, stk..."
              />
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Frist (valgfritt)</label>
            <input
              type="date"
              value={form.deadline}
              onChange={e => setForm({ ...form, deadline: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={onSave}
            disabled={!form.title.trim() || saving}
            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            {saving ? 'Lagrer...' : 'Lagre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Progress Update Modal ──────────────────────────────────────────────────

interface ProgressModalProps {
  goal: CascadeGoal
  onSave: (value: number, note: string) => void
  onClose: () => void
  saving: boolean
}

function ProgressModal({ goal, onSave, onClose, saving }: ProgressModalProps) {
  const [value, setValue] = useState(String(goal.current_value))
  const [note, setNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-t-2xl md:rounded-2xl p-5">
        <h2 className="text-lg font-bold text-[#0c3230] mb-1">Oppdater fremgang</h2>
        <p className="text-sm text-gray-500 mb-4">{goal.title}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Ny verdi {goal.unit ? `(${goal.unit})` : ''}
            </label>
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notat (valgfritt)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
              placeholder="Hva skjedde?"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={() => onSave(Number(value), note)}
            disabled={saving || !value}
            className="flex-1 px-4 py-2.5 text-sm font-bold rounded-lg disabled:opacity-40"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            {saving ? 'Lagrer...' : 'Lagre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirmation ────────────────────────────────────────────────────

interface DeleteModalProps {
  goal: CascadeGoal
  hasChildren: boolean
  onConfirm: (deleteChildren: boolean) => void
  onClose: () => void
  deleting: boolean
}

function DeleteModal({ goal, hasChildren, onConfirm, onClose, deleting }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-t-2xl md:rounded-2xl p-5">
        <h2 className="text-lg font-bold text-[#0c3230] mb-2">Slett mål</h2>
        <p className="text-sm text-gray-600 mb-4">
          Er du sikker på at du vil slette &laquo;{goal.title}&raquo;?
        </p>

        {hasChildren && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-700 font-medium">
              Dette målet har undermål. Du kan slette alt, eller bare fjerne dette målet og beholde undermålene.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {hasChildren && (
            <button
              onClick={() => onConfirm(true)}
              disabled={deleting}
              className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
            >
              {deleting ? 'Sletter...' : 'Slett alt inkludert undermål'}
            </button>
          )}
          <button
            onClick={() => onConfirm(false)}
            disabled={deleting}
            className="w-full px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
          >
            {deleting ? 'Sletter...' : hasChildren ? 'Slett kun dette målet' : 'Slett'}
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Button per Horizon ─────────────────────────────────────────────────

function AddGoalButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#3dbfb5] border border-dashed border-[#3dbfb5]/40 rounded-lg hover:bg-teal-50/50 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M12 4v16m8-8H4" />
      </svg>
      Nytt mål
    </button>
  )
}

// ─── Cascade View ───────────────────────────────────────────────────────────

interface CascadeViewProps {
  goals: CascadeGoal[]
  childrenMap: Map<string, CascadeGoal[]>
  selectedId: string | null
  highlightedIds: Set<string>
  categoryFilter: Category | 'all'
  statusFilter: StatusFilter
  onSelect: (id: string) => void
  onEdit: (goal: CascadeGoal) => void
  onUpdateProgress: (goal: CascadeGoal) => void
  onComplete: (goal: CascadeGoal) => void
  onDelete: (goal: CascadeGoal) => void
  onBreakdown: (goal: CascadeGoal) => void
  onAdd: (horizon: TimeHorizon) => void
}

function CascadeView({
  goals,
  childrenMap,
  selectedId,
  highlightedIds,
  categoryFilter,
  statusFilter,
  onSelect,
  onEdit,
  onUpdateProgress,
  onComplete,
  onDelete,
  onBreakdown,
  onAdd,
}: CascadeViewProps) {
  const filtered = goals.filter(g => {
    if (categoryFilter !== 'all' && g.category !== categoryFilter) return false
    if (statusFilter !== 'all' && g.status !== statusFilter) return false
    return true
  })

  const groupedByHorizon = TIME_HORIZON_ORDER.map(horizon => ({
    horizon,
    label: TIME_HORIZON_LABELS[horizon],
    goals: filtered.filter(g => g.time_horizon === horizon),
  }))

  return (
    <div className="space-y-2">
      {groupedByHorizon.map((group, groupIdx) => {
        const hasGoals = group.goals.length > 0
        return (
          <div key={group.horizon}>
            {/* Connection line */}
            {groupIdx > 0 && (hasGoals || groupedByHorizon[groupIdx - 1].goals.length > 0) && (
              <div className="flex justify-center py-1">
                <div className="w-px h-4 bg-gray-200" />
              </div>
            )}

            {/* Horizon band */}
            <div className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.label}
                </h3>
                <AddGoalButton onClick={() => onAdd(group.horizon)} />
              </div>

              {hasGoals ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.goals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      goalsMap={childrenMap}
                      isHighlighted={highlightedIds.has(goal.id)}
                      isSelected={selectedId === goal.id}
                      onSelect={onSelect}
                      onEdit={onEdit}
                      onUpdateProgress={onUpdateProgress}
                      onComplete={onComplete}
                      onDelete={onDelete}
                      onBreakdown={onBreakdown}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-300 py-2">Ingen mål enda</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Category View ──────────────────────────────────────────────────────────

interface CategoryViewProps {
  goals: CascadeGoal[]
  childrenMap: Map<string, CascadeGoal[]>
  selectedId: string | null
  highlightedIds: Set<string>
  statusFilter: StatusFilter
  onSelect: (id: string) => void
  onEdit: (goal: CascadeGoal) => void
  onUpdateProgress: (goal: CascadeGoal) => void
  onComplete: (goal: CascadeGoal) => void
  onDelete: (goal: CascadeGoal) => void
  onBreakdown: (goal: CascadeGoal) => void
  onAdd: (horizon: TimeHorizon, category: Category) => void
}

function CategoryView({
  goals,
  childrenMap,
  selectedId,
  highlightedIds,
  statusFilter,
  onSelect,
  onEdit,
  onUpdateProgress,
  onComplete,
  onDelete,
  onBreakdown,
  onAdd,
}: CategoryViewProps) {
  const [expandedCat, setExpandedCat] = useState<Category | null>(null)

  const filtered = goals.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false
    return true
  })

  const groupedByCategory = CATEGORIES.map(cat => ({
    category: cat,
    goals: filtered.filter(g => g.category === cat.id),
  }))

  return (
    <div className="space-y-3">
      {groupedByCategory.map(group => {
        if (group.goals.length === 0 && expandedCat !== group.category.id) return null
        const isExpanded = expandedCat === group.category.id

        return (
          <div key={group.category.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setExpandedCat(isExpanded ? null : group.category.id)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${DOT_COLORS[group.category.id]}`} />
                <span className="text-sm font-semibold text-[#0c3230]">{group.category.label}</span>
                <span className="text-xs text-gray-400">{group.goals.length} mål</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 space-y-3">
                {TIME_HORIZON_ORDER.map(horizon => {
                  const horizonGoals = group.goals.filter(g => g.time_horizon === horizon)
                  if (horizonGoals.length === 0) return null

                  return (
                    <div key={horizon}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          {TIME_HORIZON_LABELS[horizon]}
                        </span>
                        <AddGoalButton onClick={() => onAdd(horizon, group.category.id)} />
                      </div>
                      <div className="space-y-2">
                        {horizonGoals.map(goal => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                            goalsMap={childrenMap}
                            isHighlighted={highlightedIds.has(goal.id)}
                            isSelected={selectedId === goal.id}
                            onSelect={onSelect}
                            onEdit={onEdit}
                            onUpdateProgress={onUpdateProgress}
                            onComplete={onComplete}
                            onDelete={onDelete}
                            onBreakdown={onBreakdown}
                            compact
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}

                {group.goals.length === 0 && (
                  <p className="text-xs text-gray-300 py-2">Ingen mål enda</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Breakdown Modal ────────────────────────────────────────────────────────

interface BreakdownSuggestion {
  title: string
  description: string
  target_value: number | null
  unit: string | null
  deadline: string
}

interface BreakdownModalProps {
  goal: CascadeGoal
  childrenMap: Map<string, CascadeGoal[]>
  onSave: (suggestions: BreakdownSuggestion[]) => void
  onClose: () => void
  saving: boolean
}

function BreakdownModal({ goal, childrenMap, onSave, onClose, saving }: BreakdownModalProps) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<BreakdownSuggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const targetHorizonIdx = TIME_HORIZON_ORDER.indexOf(goal.time_horizon) + 1
  const targetHorizon = targetHorizonIdx < TIME_HORIZON_ORDER.length
    ? TIME_HORIZON_ORDER[targetHorizonIdx]
    : null
  const targetLabel = targetHorizon ? TIME_HORIZON_LABELS[targetHorizon] : null

  const existingChildren = childrenMap.get(goal.id) ?? []

  const generateBreakdown = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const existingChildrenText = existingChildren.length > 0
        ? existingChildren.map(c => `${c.title}${c.target_value ? ` (${c.current_value}/${c.target_value} ${c.unit ?? ''})` : ''}`).join('\n')
        : ''

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cascade_breakdown',
          data: {
            goal: `${goal.title}${goal.description ? ` — ${goal.description}` : ''}${goal.target_value ? ` (mål: ${goal.target_value} ${goal.unit ?? ''})` : ''}`,
            category: goal.category,
            timeHorizon: TIME_HORIZON_LABELS[goal.time_horizon],
            targetLevel: targetHorizon ?? 'day',
            existingChildren: existingChildrenText,
            context: goal.deadline ? `Deadline: ${goal.deadline}` : '',
          },
        }),
      })

      if (!res.ok) throw new Error('API feil')
      const json = await res.json()
      if (json.error) throw new Error(json.error)

      // Parse JSON from response
      const text = json.response as string
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) throw new Error('Kunne ikke tolke svar fra Claude')

      const parsed = JSON.parse(jsonMatch[0]) as BreakdownSuggestion[]
      setSuggestions(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noe gikk galt')
    } finally {
      setLoading(false)
    }
  }, [goal, targetHorizon, existingChildren])

  const toggleSelection = (idx: number) => {
    const next = new Set(selected)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setSelected(next)
  }

  const handleSave = () => {
    const selectedSuggestions = suggestions.filter((_, i) => selected.has(i))
    onSave(selectedSuggestions)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl p-5 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-[#0c3230] mb-1">Bryt ned med Claude</h2>
        <p className="text-sm text-gray-500 mb-4">
          {goal.title} → {targetLabel ?? 'undermål'}
        </p>

        {existingChildren.length > 0 && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-500 mb-1">Eksisterende undermål:</p>
            {existingChildren.map(c => (
              <p key={c.id} className="text-xs text-gray-600">• {c.title}</p>
            ))}
          </div>
        )}

        {suggestions.length === 0 && !loading && !error && (
          <button
            onClick={generateBreakdown}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            Generer forslag med Claude
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#3dbfb5', animationDelay: '300ms' }} />
            </div>
            <span className="text-sm text-gray-500">Claude bryter ned målet...</span>
          </div>
        )}

        {error && (
          <div className="mb-3">
            <p className="text-sm text-red-500 mb-2">{error}</p>
            <button onClick={generateBreakdown} className="text-xs text-[#3dbfb5] font-medium hover:underline">
              Prøv igjen
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-gray-500">Velg hvilke du vil opprette:</p>
            {suggestions.map((s, i) => (
              <div
                key={i}
                onClick={() => toggleSelection(i)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  selected.has(i) ? 'border-[#3dbfb5] bg-teal-50/30' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    selected.has(i) ? 'bg-[#0c3230] border-[#0c3230]' : 'border-gray-300'
                  }`}>
                    {selected.has(i) && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{s.title}</p>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                    <div className="flex gap-3 mt-1">
                      {s.target_value && (
                        <span className="text-[10px] text-gray-400">Mål: {s.target_value}{s.unit ? ` ${s.unit}` : ''}</span>
                      )}
                      {s.deadline && (
                        <span className="text-[10px] text-gray-400">Frist: {s.deadline}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={selected.size === 0 || saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
              >
                {saving ? 'Oppretter...' : `Opprett ${selected.size} mål`}
              </button>
              <button
                onClick={generateBreakdown}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Regenerer
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Lukk
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface CascadeGoalsClientProps {
  goals: CascadeGoal[]
  userId: string
}

export function CascadeGoalsClient({ goals: initialGoals, userId }: CascadeGoalsClientProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('cascade')
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<CascadeGoal | null>(null)
  const [form, setForm] = useState<GoalFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Progress modal
  const [progressGoal, setProgressGoal] = useState<CascadeGoal | null>(null)
  const [savingProgress, setSavingProgress] = useState(false)

  // Delete modal
  const [deleteGoal, setDeleteGoal] = useState<CascadeGoal | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Breakdown modal
  const [breakdownGoal, setBreakdownGoal] = useState<CascadeGoal | null>(null)
  const [savingBreakdown, setSavingBreakdown] = useState(false)

  const goals = initialGoals

  // Build children map
  const childrenMap = useMemo(() => {
    const map = new Map<string, CascadeGoal[]>()
    for (const goal of goals) {
      if (goal.parent_id) {
        const existing = map.get(goal.parent_id) ?? []
        existing.push(goal)
        map.set(goal.parent_id, existing)
      }
    }
    return map
  }, [goals])

  // Highlighted IDs (descendants of selected goal)
  const highlightedIds = useMemo(() => {
    if (!selectedGoalId) return new Set<string>()
    return getDescendantIds(selectedGoalId, childrenMap)
  }, [selectedGoalId, childrenMap])

  // Handlers
  const handleSelect = useCallback((id: string) => {
    setSelectedGoalId(prev => prev === id ? null : id)
  }, [])

  const handleAdd = useCallback((horizon: TimeHorizon, category?: Category) => {
    setEditingGoal(null)
    setForm({
      ...EMPTY_FORM,
      time_horizon: horizon,
      category: category ?? (categoryFilter !== 'all' ? categoryFilter : 'business'),
    })
    setShowModal(true)
  }, [categoryFilter])

  const handleEdit = useCallback((goal: CascadeGoal) => {
    setEditingGoal(goal)
    setForm({
      title: goal.title,
      description: goal.description ?? '',
      category: goal.category,
      time_horizon: goal.time_horizon,
      parent_id: goal.parent_id ?? '',
      target_value: goal.target_value != null ? String(goal.target_value) : '',
      unit: goal.unit ?? '',
      deadline: goal.deadline ?? '',
    })
    setShowModal(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) return
    setSaving(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      time_horizon: form.time_horizon,
      parent_id: form.parent_id || null,
      target_value: form.target_value ? Number(form.target_value) : null,
      unit: form.unit.trim() || null,
      deadline: form.deadline || null,
      user_id: userId,
      status: 'active' as const,
      current_value: 0,
    }

    if (editingGoal) {
      await supabase
        .from('cascade_goals')
        .update({
          title: payload.title,
          description: payload.description,
          category: payload.category,
          time_horizon: payload.time_horizon,
          parent_id: payload.parent_id,
          target_value: payload.target_value,
          unit: payload.unit,
          deadline: payload.deadline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingGoal.id)
    } else {
      await supabase.from('cascade_goals').insert(payload)
    }

    setSaving(false)
    setShowModal(false)
    setEditingGoal(null)
    setForm(EMPTY_FORM)
    router.refresh()
  }, [form, editingGoal, userId, supabase, router])

  const handleComplete = useCallback(async (goal: CascadeGoal) => {
    await supabase
      .from('cascade_goals')
      .update({ status: 'completed', current_value: goal.target_value ?? goal.current_value, updated_at: new Date().toISOString() })
      .eq('id', goal.id)
    router.refresh()
  }, [supabase, router])

  const handleSaveProgress = useCallback(async (value: number, note: string) => {
    if (!progressGoal) return
    setSavingProgress(true)

    await supabase.from('cascade_goal_progress').insert({
      goal_id: progressGoal.id,
      value,
      note: note.trim() || null,
    })
    await supabase
      .from('cascade_goals')
      .update({ current_value: value, updated_at: new Date().toISOString() })
      .eq('id', progressGoal.id)

    setSavingProgress(false)
    setProgressGoal(null)
    router.refresh()
  }, [progressGoal, supabase, router])

  const handleDelete = useCallback(async (deleteChildren: boolean) => {
    if (!deleteGoal) return
    setDeleting(true)

    if (deleteChildren) {
      // Delete all descendants first
      const descendantIds = getDescendantIds(deleteGoal.id, childrenMap)
      if (descendantIds.size > 0) {
        await supabase.from('cascade_goals').delete().in('id', Array.from(descendantIds))
      }
    } else {
      // Re-parent children to this goal's parent
      const children = childrenMap.get(deleteGoal.id) ?? []
      if (children.length > 0) {
        await supabase
          .from('cascade_goals')
          .update({ parent_id: deleteGoal.parent_id ?? null })
          .in('id', children.map(c => c.id))
      }
    }

    await supabase.from('cascade_goals').delete().eq('id', deleteGoal.id)

    setDeleting(false)
    setDeleteGoal(null)
    setSelectedGoalId(null)
    router.refresh()
  }, [deleteGoal, childrenMap, supabase, router])

  const handleSaveBreakdown = useCallback(async (suggestions: BreakdownSuggestion[]) => {
    if (!breakdownGoal || suggestions.length === 0) return
    setSavingBreakdown(true)

    const targetHorizonIdx = TIME_HORIZON_ORDER.indexOf(breakdownGoal.time_horizon) + 1
    const targetHorizon = targetHorizonIdx < TIME_HORIZON_ORDER.length
      ? TIME_HORIZON_ORDER[targetHorizonIdx]
      : 'day' as TimeHorizon

    const inserts = suggestions.map(s => ({
      user_id: userId,
      category: breakdownGoal.category,
      time_horizon: targetHorizon,
      title: s.title,
      description: s.description || null,
      target_value: s.target_value,
      current_value: 0,
      unit: s.unit,
      deadline: s.deadline || null,
      parent_id: breakdownGoal.id,
      status: 'active' as const,
    }))

    await supabase.from('cascade_goals').insert(inserts)
    setSavingBreakdown(false)
    setBreakdownGoal(null)
    router.refresh()
  }, [breakdownGoal, userId, supabase, router])

  const activeCount = goals.filter(g => g.status === 'active').length

  return (
    <>
      {/* Header */}
      <div className="mb-5">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Kaskademål</p>
        <h1 className="text-2xl font-bold text-[#0c3230] mt-1">Mål</h1>
        <p className="text-sm text-gray-500 mt-1">{activeCount} aktive mål fordelt over {TIME_HORIZON_ORDER.length} tidshorisonter</p>
      </div>

      {/* View toggle + Status filter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('cascade')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'cascade' ? 'bg-white text-[#0c3230] shadow-sm' : 'text-gray-500'
            }`}
          >
            Kaskade
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'category' ? 'bg-white text-[#0c3230] shadow-sm' : 'text-gray-500'
            }`}
          >
            Kategori
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
        >
          <option value="all">Alle statuser</option>
          <option value="active">Aktive</option>
          <option value="completed">Fullførte</option>
          <option value="paused">Pauset</option>
        </select>
      </div>

      {/* Category filter pills (cascade view only) */}
      {viewMode === 'cascade' && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1 no-scrollbar">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              categoryFilter === 'all'
                ? 'bg-[#0c3230] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Alle
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(categoryFilter === cat.id ? 'all' : cat.id)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-[#0c3230] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Views */}
      {viewMode === 'cascade' ? (
        <CascadeView
          goals={goals}
          childrenMap={childrenMap}
          selectedId={selectedGoalId}
          highlightedIds={highlightedIds}
          categoryFilter={categoryFilter}
          statusFilter={statusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onUpdateProgress={setProgressGoal}
          onComplete={handleComplete}
          onDelete={setDeleteGoal}
          onBreakdown={setBreakdownGoal}
          onAdd={handleAdd}
        />
      ) : (
        <CategoryView
          goals={goals}
          childrenMap={childrenMap}
          selectedId={selectedGoalId}
          highlightedIds={highlightedIds}
          statusFilter={statusFilter}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onUpdateProgress={setProgressGoal}
          onComplete={handleComplete}
          onDelete={setDeleteGoal}
          onBreakdown={setBreakdownGoal}
          onAdd={handleAdd}
        />
      )}

      {/* Modals */}
      {showModal && (
        <GoalModal
          form={form}
          setForm={setForm}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingGoal(null); setForm(EMPTY_FORM) }}
          saving={saving}
          title={editingGoal ? 'Rediger mål' : 'Nytt mål'}
          goals={goals}
        />
      )}

      {progressGoal && (
        <ProgressModal
          goal={progressGoal}
          onSave={handleSaveProgress}
          onClose={() => setProgressGoal(null)}
          saving={savingProgress}
        />
      )}

      {deleteGoal && (
        <DeleteModal
          goal={deleteGoal}
          hasChildren={(childrenMap.get(deleteGoal.id)?.length ?? 0) > 0}
          onConfirm={handleDelete}
          onClose={() => setDeleteGoal(null)}
          deleting={deleting}
        />
      )}

      {breakdownGoal && (
        <BreakdownModal
          goal={breakdownGoal}
          childrenMap={childrenMap}
          onSave={handleSaveBreakdown}
          onClose={() => setBreakdownGoal(null)}
          saving={savingBreakdown}
        />
      )}
    </>
  )
}
