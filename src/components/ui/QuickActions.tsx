'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import type { Goal } from '@/types'

type ActionType = 'trening' | 'utgift' | 'maal' | 'prioritet' | 'notat' | null

const ACTIONS = [
  { type: 'notat' as const, icon: '\u{1F4DD}', label: 'Notat' },
  { type: 'prioritet' as const, icon: '\u2B50', label: 'Prioritet' },
  { type: 'maal' as const, icon: '\u{1F3AF}', label: 'Oppdater m\u00E5l' },
  { type: 'utgift' as const, icon: '\u{1F4B8}', label: 'Logg utgift' },
  { type: 'trening' as const, icon: '\u{1F3CB}\uFE0F', label: 'Logg trening' },
]

const TRAINING_TYPES = ['Styrke', 'Cardio', 'Zone 2', 'HYROX', 'Padel', 'Annet']

const EXPENSE_CATEGORIES = [
  'Bolig', 'Mat', 'Transport', 'Trening', 'Underholdning',
  'Kl\u00E6r', 'Helse', 'Abonnementer', 'Annet',
]

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function QuickActions() {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const [userId, setUserId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  const [saving, setSaving] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? '89b04d8f-09a6-4fe7-9efe-5d0843d63519')
    })
  }, [])

  if (pathname === '/login' || !userId) return null

  function openAction(type: ActionType) {
    setMenuOpen(false)
    setActiveAction(type)
  }

  function closeAll() {
    setMenuOpen(false)
    setActiveAction(null)
  }

  return (
    <>
      {/* Backdrop for menu */}
      {menuOpen && (
        <div
          ref={backdropRef}
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* FAB + Menu */}
      <div className="fixed bottom-[132px] right-4 md:bottom-[72px] md:right-6 z-50 flex flex-col items-end gap-2">
        {/* Action buttons */}
        {menuOpen && ACTIONS.map((action, i) => (
          <button
            key={action.type}
            onClick={() => openAction(action.type)}
            className="flex items-center gap-2 bg-white rounded-full pl-3 pr-4 py-2.5 shadow-md text-sm font-medium text-gray-800 transition-all"
            style={{
              animation: `fab-item-in 200ms ${i * 40}ms both`,
            }}
          >
            <span className="text-base">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}

        {/* FAB button */}
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform"
          style={{ backgroundColor: '#0c3230' }}
        >
          <span
            className="text-2xl font-light leading-none transition-transform duration-200"
            style={{
              color: '#b8f04a',
              transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
          >
            +
          </span>
        </button>
      </div>

      {/* Bottom sheet overlay */}
      {activeAction && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeAll() }}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {activeAction === 'trening' && (
              <TrainingForm userId={userId} onDone={() => { closeAll(); toast('Trening logget!', 'success'); router.refresh() }} onCancel={closeAll} saving={saving} setSaving={setSaving} />
            )}
            {activeAction === 'utgift' && (
              <ExpenseForm userId={userId} onDone={() => { closeAll(); toast('Utgift lagret!', 'success'); router.refresh() }} onCancel={closeAll} saving={saving} setSaving={setSaving} />
            )}
            {activeAction === 'maal' && (
              <GoalUpdateForm userId={userId} onDone={() => { closeAll(); toast('M\u00E5l oppdatert!', 'success'); router.refresh() }} onCancel={closeAll} saving={saving} setSaving={setSaving} />
            )}
            {activeAction === 'prioritet' && (
              <PriorityForm userId={userId} onDone={() => { closeAll(); toast('Prioritet lagt til!', 'success'); router.refresh() }} onCancel={closeAll} saving={saving} setSaving={setSaving} />
            )}
            {activeAction === 'notat' && (
              <NoteForm userId={userId} onDone={() => { closeAll(); toast('Notat lagret!', 'success'); router.refresh() }} onCancel={closeAll} saving={saving} setSaving={setSaving} />
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fab-item-in {
          from { opacity: 0; transform: translateY(8px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 250ms ease-out;
        }
      `}</style>
    </>
  )
}

/* ---- Mini Forms ---- */

interface FormProps {
  userId: string
  onDone: () => void
  onCancel: () => void
  saving: boolean
  setSaving: (v: boolean) => void
}

function TrainingForm({ userId, onDone, onCancel, saving, setSaving }: FormProps) {
  const [type, setType] = useState('Styrke')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit() {
    if (!duration) return
    setSaving(true)
    const supabase = createClient()
    const today = toDateString(new Date())

    // Insert training log
    await supabase.from('training_log').insert({
      user_id: userId,
      date: today,
      type,
      duration_minutes: parseInt(duration),
      notes: notes.trim() || null,
    })

    // Try to auto-complete a matching habit
    const { data: habits } = await supabase
      .from('habits')
      .select('id, title')
      .eq('user_id', userId)
      .eq('active', true)

    if (habits) {
      const typeLower = type.toLowerCase()
      const match = habits.find((h) =>
        h.title.toLowerCase().includes(typeLower) ||
        h.title.toLowerCase().includes('trening') ||
        h.title.toLowerCase().includes('tr\u00E6ning')
      )
      if (match) {
        await supabase.from('habit_completions').upsert({
          habit_id: match.id,
          completed_date: today,
        })
      }
    }

    setSaving(false)
    onDone()
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F3CB}\uFE0F'} Logg trening</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          >
            {TRAINING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Varighet (minutter)</label>
          <input
            type="number"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="45"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notater (valgfritt)</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="F.eks. overkropp, tung \u00F8kt..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-5">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Avbryt</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !duration}
          className="text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}

function ExpenseForm({ userId, onDone, onCancel, saving, setSaving }: FormProps) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Mat')
  const [description, setDescription] = useState('')

  async function handleSubmit() {
    if (!amount) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('finance_entries').insert({
      user_id: userId,
      date: toDateString(new Date()),
      amount: -Math.abs(parseFloat(amount)),
      category: category.toLowerCase(),
      description: description.trim() || null,
      source: 'manual',
    })
    setSaving(false)
    onDone()
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F4B8}'} Logg utgift</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Bel\u00F8p (kr)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="350"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Kategori</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          >
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Beskrivelse (valgfritt)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="F.eks. lunsj, taxi..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-5">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Avbryt</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !amount}
          className="text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}

function GoalUpdateForm({ userId, onDone, onCancel, saving, setSaving }: FormProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState('')
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('category')
      .then(({ data }) => {
        const g = (data ?? []) as Goal[]
        setGoals(g)
        if (g.length > 0) setSelectedGoalId(g[0].id)
        setLoading(false)
      })
  }, [userId])

  const selectedGoal = goals.find((g) => g.id === selectedGoalId)

  async function handleSubmit() {
    if (!selectedGoalId || !newValue) return
    setSaving(true)
    const supabase = createClient()
    const numValue = parseFloat(newValue)

    // Log progress
    await supabase.from('goal_progress_log').insert({
      goal_id: selectedGoalId,
      value: numValue,
    })

    // Update current_value on the goal
    await supabase
      .from('goals')
      .update({ current_value: numValue, updated_at: new Date().toISOString() })
      .eq('id', selectedGoalId)

    setSaving(false)
    onDone()
  }

  if (loading) {
    return (
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F3AF}'} Oppdater m\u00E5l</h3>
        <p className="text-sm text-gray-400">Laster m\u00E5l...</p>
      </div>
    )
  }

  if (goals.length === 0) {
    return (
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F3AF}'} Oppdater m\u00E5l</h3>
        <p className="text-sm text-gray-500 mb-4">Ingen aktive m\u00E5l funnet.</p>
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Lukk</button>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F3AF}'} Oppdater m\u00E5l</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">M\u00E5l</label>
          <select
            value={selectedGoalId}
            onChange={(e) => setSelectedGoalId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title} {g.unit ? `(${g.current_value}/${g.target_value} ${g.unit})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">
            Ny verdi {selectedGoal?.unit ? `(${selectedGoal.unit})` : ''}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={selectedGoal ? String(selectedGoal.current_value) : '0'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
            autoFocus
          />
        </div>
      </div>
      <div className="flex items-center justify-between mt-5">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Avbryt</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !newValue}
          className="text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}

function PriorityForm({ userId, onDone, onCancel, saving, setSaving }: FormProps) {
  const [title, setTitle] = useState('')

  async function handleSubmit() {
    if (!title.trim()) return
    setSaving(true)
    const supabase = createClient()
    const today = toDateString(new Date())

    // Get max sort_order for today
    const { data: existing } = await supabase
      .from('daily_priorities')
      .select('sort_order')
      .eq('user_id', userId)
      .eq('date', today)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

    await supabase.from('daily_priorities').insert({
      user_id: userId,
      date: today,
      title: title.trim(),
      sort_order: nextOrder,
    })

    setSaving(false)
    onDone()
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u2B50'} Ny prioritet</h3>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Hva er viktig i dag?</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="F.eks. Fullfør presentasjon..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230]"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) handleSubmit() }}
        />
      </div>
      <div className="flex items-center justify-between mt-5">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Avbryt</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}

function NoteForm({ userId, onDone, onCancel, saving, setSaving }: FormProps) {
  const [content, setContent] = useState('')

  async function handleSubmit() {
    if (!content.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('journal_entries').insert({
      user_id: userId,
      date: toDateString(new Date()),
      type: 'note',
      content: content.trim(),
    })
    setSaving(false)
    onDone()
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-4">{'\u{1F4DD}'} Notat</h3>
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">Skriv et notat</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tanker, refleksjoner, ideer..."
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#0c3230] resize-none"
          autoFocus
        />
      </div>
      <div className="flex items-center justify-between mt-5">
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">Avbryt</button>
        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          className="text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}
