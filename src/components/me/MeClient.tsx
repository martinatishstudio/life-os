'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency, formatDate, toDateString } from '@/lib/utils'
import { CATEGORIES } from '@/types'
import type {
  Category,
  ContextModule,
  ContextModuleField,
  ContextSnapshot,
  ProgressSnapshot,
  Habit,
  HabitCompletion,
  FinanceEntry,
  FinanceTarget,
  LifeEntry,
} from '@/types'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts'

// =============================================================================
// Constants & Helpers
// =============================================================================

type SectionId = 'coach' | 'trender' | 'helse' | 'okonomi' | 'data' | 'vaner' | 'innstillinger'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'coach', label: 'Coach-profil' },
  { id: 'trender', label: 'Trender' },
  { id: 'helse', label: 'Helse' },
  { id: 'okonomi', label: '\u00d8konomi' },
  { id: 'data', label: 'Mine data' },
  { id: 'vaner', label: 'Vaner' },
  { id: 'innstillinger', label: 'Innstillinger' },
]

const CATEGORY_COLORS: Record<Category, string> = {
  business: '#3B82F6',
  physical: '#14B8A6',
  mental: '#A855F7',
  finance: '#F59E0B',
  family: '#EC4899',
  lifestyle: '#F97316',
  brand: '#6366F1',
}

const CATEGORY_LABELS: Record<Category, string> = {
  business: 'Business',
  physical: 'Fysisk',
  mental: 'Mentalt',
  finance: '\u00d8konomi',
  family: 'Familie',
  lifestyle: 'Livsstil',
  brand: 'Brand',
}

const EXPENSE_CATEGORIES = [
  'bolig', 'mat', 'transport', 'trening', 'spise_ute', 'shopping',
  'abonnementer', 'underholdning', 'reise', 'helse', 'gave', 'diverse',
]

const WORKOUT_TYPES = ['styrke', 'zone2', 'hyrox', 'padel', 'annet']

const FREQ_DAYS: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365 }
const HEATMAP_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const DAY_LABELS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'L\u00f8', 'S\u00f8']

const USER_ID_FALLBACK = '89b04d8f-09a6-4fe7-9efe-5d0843d63519'

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function relativeDate(dateStr: string): string {
  const days = daysSince(dateStr)
  if (days === 0) return 'I dag'
  if (days === 1) return 'I g\u00e5r'
  if (days < 7) return `${days} dager siden`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return `${w} ${w === 1 ? 'uke' : 'uker'} siden`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    return `${m} ${m === 1 ? 'm\u00e5ned' : 'm\u00e5neder'} siden`
  }
  return formatDate(dateStr)
}

function statusColor(mod: ContextModule, snap: ContextSnapshot | undefined): string {
  if (!snap) return '#d1d5db'
  const days = daysSince(snap.created_at)
  const freq = FREQ_DAYS[mod.update_frequency] ?? 30
  if (days <= freq * 0.75) return '#b8f04a'
  if (days <= freq) return '#f0c74a'
  return '#f07070'
}

function isOverdue(mod: ContextModule, snap: ContextSnapshot | undefined): boolean {
  if (!snap) return true
  return daysSince(snap.created_at) > (FREQ_DAYS[mod.update_frequency] ?? 30) * 0.75
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getWeekStart(d: Date): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return toDateStr(monday)
}

// =============================================================================
// Props
// =============================================================================

interface MeClientProps {
  userId: string
  userEmail: string
  modules: ContextModule[]
  fields: ContextModuleField[]
  snapshots: ContextSnapshot[]
  scores: ProgressSnapshot[]
  habits: Habit[]
  completions: HabitCompletion[]
  financeEntries: FinanceEntry[]
  financeTargets: FinanceTarget[]
}

// =============================================================================
// Types for bank import
// =============================================================================

interface ParsedBankRow {
  date: string
  amount: number
  description: string
}

interface CategorizedBankRow extends ParsedBankRow {
  category: string
  is_necessary: boolean
  simplified_title: string
  userOverrideCategory?: string
  approved: boolean
}

// =============================================================================
// Main Component
// =============================================================================

export function MeClient({
  userId,
  userEmail,
  modules,
  fields,
  snapshots,
  scores,
  habits: initialHabits,
  completions,
  financeEntries: initialFinanceEntries,
  financeTargets: initialFinanceTargets,
}: MeClientProps) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const effectiveUserId = userId || USER_ID_FALLBACK

  const [activeSection, setActiveSection] = useState<SectionId>('coach')
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    coach: null, trender: null, helse: null, okonomi: null, data: null, vaner: null, innstillinger: null,
  })

  const [habits, setHabits] = useState(initialHabits)
  const [financeEntries, setFinanceEntries] = useState(initialFinanceEntries)
  const [financeTargets, setFinanceTargets] = useState(initialFinanceTargets)

  const fieldsByModule = useMemo(() => {
    const map: Record<string, ContextModuleField[]> = {}
    for (const f of fields) {
      if (!map[f.module_id]) map[f.module_id] = []
      map[f.module_id].push(f)
    }
    return map
  }, [fields])

  const latestSnapshotByModule = useMemo(() => {
    const map: Record<string, ContextSnapshot> = {}
    for (const s of snapshots) {
      if (!map[s.module_id]) map[s.module_id] = s
    }
    return map
  }, [snapshots])

  const allSnapshotsByModule = useMemo(() => {
    const map: Record<string, ContextSnapshot[]> = {}
    for (const s of snapshots) {
      if (!map[s.module_id]) map[s.module_id] = []
      map[s.module_id].push(s)
    }
    return map
  }, [snapshots])

  function scrollToSection(id: SectionId) {
    setActiveSection(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0c3230' }}>Meg</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(12,50,48,0.5)' }}>{userEmail}</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => scrollToSection(s.id)}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0"
            style={activeSection === s.id
              ? { backgroundColor: '#0c3230', color: '#b8f04a' }
              : { backgroundColor: 'rgba(12,50,48,0.06)', color: '#0c3230' }
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <div ref={el => { sectionRefs.current.coach = el }}>
        <CoachProfilSection
          modules={modules}
          fieldsByModule={fieldsByModule}
          latestSnapshotByModule={latestSnapshotByModule}
          allSnapshotsByModule={allSnapshotsByModule}
          supabase={supabase}
          toast={toast}
          onSaved={() => router.refresh()}
        />
      </div>

      <div ref={el => { sectionRefs.current.trender = el }}>
        <TrenderSection scores={scores} habits={habits} completions={completions} />
      </div>

      <div ref={el => { sectionRefs.current.helse = el }}>
        <HelseSection userId={effectiveUserId} supabase={supabase} toast={toast} />
      </div>

      <div ref={el => { sectionRefs.current.okonomi = el }}>
        <OkonomiSection
          userId={effectiveUserId}
          financeEntries={financeEntries}
          financeTargets={financeTargets}
          supabase={supabase}
          toast={toast}
          onEntriesChange={setFinanceEntries}
          onTargetsChange={setFinanceTargets}
        />
      </div>

      <div ref={el => { sectionRefs.current.data = el }}>
        <MineDataSection userId={effectiveUserId} supabase={supabase} toast={toast} />
      </div>

      <div ref={el => { sectionRefs.current.vaner = el }}>
        <VanerSection
          userId={effectiveUserId}
          habits={habits}
          supabase={supabase}
          toast={toast}
          onHabitsChange={setHabits}
        />
      </div>

      <div ref={el => { sectionRefs.current.innstillinger = el }}>
        <InnstillingerSection userEmail={userEmail} supabase={supabase} />
      </div>
    </div>
  )
}

// =============================================================================
// Section wrapper
// =============================================================================

function SectionWrapper({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-black/5 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <h2 className="text-base font-semibold" style={{ color: '#0c3230' }}>{title}</h2>
        <span
          className="text-xs transition-transform"
          style={{ color: 'rgba(12,50,48,0.4)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          \u25bc
        </span>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  )
}

// =============================================================================
// SECTION 1: Coach-profil (unchanged)
// =============================================================================

function CoachProfilSection({
  modules,
  fieldsByModule,
  latestSnapshotByModule,
  allSnapshotsByModule,
  supabase,
  toast,
  onSaved,
}: {
  modules: ContextModule[]
  fieldsByModule: Record<string, ContextModuleField[]>
  latestSnapshotByModule: Record<string, ContextSnapshot>
  allSnapshotsByModule: Record<string, ContextSnapshot[]>
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onSaved: () => void
}) {
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)
  const [editorValues, setEditorValues] = useState<Record<string, string | number | string[]>>({})
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [checkinMode, setCheckinMode] = useState(false)
  const [checkinStep, setCheckinStep] = useState(0)

  const profileHealth = useMemo(() => {
    if (modules.length === 0) return 0
    const upToDate = modules.filter(m => {
      const snap = latestSnapshotByModule[m.id]
      if (!snap) return false
      return daysSince(snap.created_at) <= (FREQ_DAYS[m.update_frequency] ?? 30)
    }).length
    return Math.round((upToDate / modules.length) * 100)
  }, [modules, latestSnapshotByModule])

  const modulesNeedingUpdate = useMemo(
    () => modules.filter(m => isOverdue(m, latestSnapshotByModule[m.id])),
    [modules, latestSnapshotByModule]
  )

  function expandModule(moduleId: string) {
    if (expandedModuleId === moduleId && !checkinMode) {
      setExpandedModuleId(null)
      return
    }
    const snap = latestSnapshotByModule[moduleId]
    setEditorValues(snap ? { ...snap.values } : {})
    setShowHistory(false)
    setExpandedModuleId(moduleId)
  }

  async function saveModuleSnapshot(moduleId: string) {
    setSaving(true)
    const { error } = await supabase.from('context_snapshots').insert({
      module_id: moduleId,
      values: editorValues,
    })
    setSaving(false)
    if (error) { toast('Kunne ikke lagre', 'error'); return }
    toast('Modul oppdatert', 'success')
    setExpandedModuleId(null)
    onSaved()
  }

  function startCheckin() {
    if (modulesNeedingUpdate.length === 0) {
      toast('Alle moduler er oppdatert', 'info')
      return
    }
    setCheckinMode(true)
    setCheckinStep(0)
    const firstMod = modulesNeedingUpdate[0]
    const snap = latestSnapshotByModule[firstMod.id]
    setEditorValues(snap ? { ...snap.values } : {})
    setExpandedModuleId(firstMod.id)
  }

  async function checkinNext() {
    const currentModId = modulesNeedingUpdate[checkinStep]?.id
    if (currentModId) {
      setSaving(true)
      const { error } = await supabase.from('context_snapshots').insert({
        module_id: currentModId,
        values: editorValues,
      })
      setSaving(false)
      if (error) { toast('Kunne ikke lagre', 'error'); return }
    }
    const nextStep = checkinStep + 1
    if (nextStep >= modulesNeedingUpdate.length) {
      setCheckinMode(false)
      setExpandedModuleId(null)
      toast('Check-in fullf\u00f8rt!', 'success')
      onSaved()
      return
    }
    setCheckinStep(nextStep)
    const nextMod = modulesNeedingUpdate[nextStep]
    const snap = latestSnapshotByModule[nextMod.id]
    setEditorValues(snap ? { ...snap.values } : {})
    setExpandedModuleId(nextMod.id)
  }

  function checkinBack() {
    if (checkinStep <= 0) return
    const prevStep = checkinStep - 1
    setCheckinStep(prevStep)
    const prevMod = modulesNeedingUpdate[prevStep]
    const snap = latestSnapshotByModule[prevMod.id]
    setEditorValues(snap ? { ...snap.values } : {})
    setExpandedModuleId(prevMod.id)
  }

  const healthColor = profileHealth > 80 ? '#b8f04a' : profileHealth > 50 ? '#f0c74a' : '#f07070'

  return (
    <SectionWrapper title="Coach-profil">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'rgba(12,50,48,0.6)' }}>Profil {profileHealth}% oppdatert</span>
          {modulesNeedingUpdate.length > 0 && (
            <button
              onClick={startCheckin}
              className="text-xs font-medium px-3 py-1 rounded-full"
              style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
            >
              M\u00e5nedlig check-in
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-black/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${profileHealth}%`, backgroundColor: healthColor }}
          />
        </div>
      </div>

      {checkinMode && (
        <div className="text-sm font-medium" style={{ color: '#3dbfb5' }}>
          Steg {checkinStep + 1} av {modulesNeedingUpdate.length}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {modules.map(mod => {
          const snap = latestSnapshotByModule[mod.id]
          const color = statusColor(mod, snap)
          const isExpanded = expandedModuleId === mod.id

          return (
            <div key={mod.id} className={`${isExpanded ? 'col-span-2' : ''}`}>
              <button
                onClick={() => !checkinMode && expandModule(mod.id)}
                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors ${
                  isExpanded ? 'border-[#3dbfb5]/30 bg-[#3dbfb5]/5' : 'border-black/5 bg-white hover:border-black/10'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{mod.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium truncate" style={{ color: '#0c3230' }}>{mod.title}</span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(12,50,48,0.4)' }}>
                      {snap ? relativeDate(snap.created_at) : 'Ikke utfylt'}
                    </p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-3 px-1">
                  <ModuleFieldEditor
                    fields={fieldsByModule[mod.id] ?? []}
                    values={editorValues}
                    onChange={setEditorValues}
                  />
                  {checkinMode ? (
                    <div className="flex gap-2">
                      {checkinStep > 0 && (
                        <button
                          onClick={checkinBack}
                          className="px-4 py-2 rounded-xl text-sm font-medium border border-black/10"
                          style={{ color: '#0c3230' }}
                        >
                          Tilbake
                        </button>
                      )}
                      <button
                        onClick={checkinNext}
                        disabled={saving}
                        className="flex-1 px-4 py-2 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
                      >
                        {saving ? 'Lagrer...' : checkinStep < modulesNeedingUpdate.length - 1 ? 'Neste' : 'Fullf\u00f8r'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveModuleSnapshot(mod.id)}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
                      >
                        {saving ? 'Lagrer...' : 'Lagre'}
                      </button>
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-xs font-medium"
                        style={{ color: '#3dbfb5' }}
                      >
                        {showHistory ? 'Skjul historikk' : 'Se historikk'}
                      </button>
                      <button
                        onClick={() => setExpandedModuleId(null)}
                        className="ml-auto text-xs"
                        style={{ color: 'rgba(12,50,48,0.4)' }}
                      >
                        Lukk
                      </button>
                    </div>
                  )}

                  {showHistory && !checkinMode && (
                    <div className="space-y-2 pt-2 border-t border-black/5">
                      <p className="text-xs font-medium" style={{ color: 'rgba(12,50,48,0.5)' }}>Historikk</p>
                      {(allSnapshotsByModule[mod.id] ?? []).slice(0, 5).map(s => (
                        <div key={s.id} className="text-xs p-2.5 rounded-lg bg-black/[0.02] space-y-1">
                          <span style={{ color: 'rgba(12,50,48,0.5)' }}>{formatDate(s.created_at)}</span>
                          <div className="space-y-0.5">
                            {Object.entries(s.values).map(([key, val]) => (
                              <div key={key} style={{ color: '#0c3230' }}>
                                <span className="font-medium">{key}:</span>{' '}
                                {Array.isArray(val) ? val.join(', ') : String(val)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionWrapper>
  )
}

// =============================================================================
// Module field editor
// =============================================================================

function ModuleFieldEditor({
  fields,
  values,
  onChange,
}: {
  fields: ContextModuleField[]
  values: Record<string, string | number | string[]>
  onChange: (v: Record<string, string | number | string[]>) => void
}) {
  function update(slug: string, val: string | number | string[]) {
    onChange({ ...values, [slug]: val })
  }

  return (
    <div className="space-y-3">
      {fields.map(f => (
        <div key={f.id}>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>
            {f.label}
          </label>
          {f.field_type === 'text' && (
            <input
              type="text"
              value={String(values[f.slug] ?? '')}
              onChange={e => update(f.slug, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
              style={{ color: '#0c3230' }}
            />
          )}
          {f.field_type === 'textarea' && (
            <textarea
              value={String(values[f.slug] ?? '')}
              onChange={e => update(f.slug, e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5] resize-none"
              style={{ color: '#0c3230' }}
            />
          )}
          {f.field_type === 'number' && (
            <input
              type="number"
              value={values[f.slug] !== undefined ? Number(values[f.slug]) : ''}
              onChange={e => update(f.slug, e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
              style={{ color: '#0c3230' }}
            />
          )}
          {f.field_type === 'select' && (
            <select
              value={String(values[f.slug] ?? '')}
              onChange={e => update(f.slug, e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
              style={{ color: '#0c3230' }}
            >
              <option value="">Velg...</option>
              {(f.options ?? []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          )}
          {f.field_type === 'multi_select' && (
            <div className="flex flex-wrap gap-2">
              {(f.options ?? []).map(opt => {
                const selected = Array.isArray(values[f.slug]) && (values[f.slug] as string[]).includes(opt)
                return (
                  <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const current = Array.isArray(values[f.slug]) ? [...(values[f.slug] as string[])] : []
                        if (selected) {
                          update(f.slug, current.filter(v => v !== opt))
                        } else {
                          update(f.slug, [...current, opt])
                        }
                      }}
                      className="rounded"
                    />
                    <span style={{ color: '#0c3230' }}>{opt}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// SECTION 2: Trender (unchanged)
// =============================================================================

function TrenderSection({
  scores,
  habits,
  completions,
}: {
  scores: ProgressSnapshot[]
  habits: Habit[]
  completions: HabitCompletion[]
}) {
  const [timeRange, setTimeRange] = useState<'4w' | '3m' | '12m'>('3m')

  const chartData = useMemo(() => {
    const now = new Date()
    let cutoff: Date
    if (timeRange === '4w') cutoff = new Date(now.getTime() - 28 * 86400000)
    else if (timeRange === '3m') cutoff = new Date(now.getTime() - 90 * 86400000)
    else cutoff = new Date(now.getTime() - 365 * 86400000)
    const cutoffStr = toDateStr(cutoff)

    const filtered = scores.filter(s => s.week_start >= cutoffStr)
    const weekMap = new Map<string, Record<string, number>>()
    for (const s of filtered) {
      if (!weekMap.has(s.week_start)) weekMap.set(s.week_start, {})
      weekMap.get(s.week_start)![s.category] = s.score
    }
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, cats]) => ({
        week: new Date(week).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
        ...cats,
      }))
  }, [scores, timeRange])

  const heatmapData = useMemo(() => {
    const now = new Date()
    const weeks: { date: string; count: number; total: number }[][] = []
    const activeHabits = habits.filter(h => h.active)
    const totalPerDay = activeHabits.length
    const completionMap = new Map<string, number>()
    for (const c of completions) {
      completionMap.set(c.completed_date, (completionMap.get(c.completed_date) ?? 0) + 1)
    }
    const startDate = new Date(now)
    const dayOfWeek = startDate.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startDate.setDate(startDate.getDate() + mondayOffset - 11 * 7)
    startDate.setHours(0, 0, 0, 0)
    for (let w = 0; w < 12; w++) {
      const weekDays: { date: string; count: number; total: number }[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate.getTime() + (w * 7 + d) * 86400000)
        const dateStr = toDateStr(date)
        const count = completionMap.get(dateStr) ?? 0
        weekDays.push({ date: dateStr, count, total: totalPerDay })
      }
      weeks.push(weekDays)
    }
    return weeks
  }, [habits, completions])

  const monthLabels = useMemo(() => {
    if (heatmapData.length === 0) return []
    const labels: { label: string; col: number }[] = []
    let lastMonth = -1
    for (let w = 0; w < heatmapData.length; w++) {
      const month = new Date(heatmapData[w][0].date).getMonth()
      if (month !== lastMonth) {
        labels.push({
          label: new Date(heatmapData[w][0].date).toLocaleDateString('nb-NO', { month: 'short' }),
          col: w,
        })
        lastMonth = month
      }
    }
    return labels
  }, [heatmapData])

  return (
    <SectionWrapper title="Trender">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium" style={{ color: 'rgba(12,50,48,0.6)' }}>Kategori-scores</p>
          <div className="flex gap-1">
            {(['4w', '3m', '12m'] as const).map(r => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={timeRange === r
                  ? { backgroundColor: '#0c3230', color: '#b8f04a' }
                  : { backgroundColor: 'rgba(12,50,48,0.06)', color: '#0c3230' }
                }
              >
                {r === '4w' ? '4 uker' : r === '3m' ? '3 mnd' : '12 mnd'}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,50,48,0.06)" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'rgba(12,50,48,0.4)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(12,50,48,0.4)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0c3230', border: 'none', borderRadius: 12, padding: '8px 12px',
                  }}
                  labelStyle={{ color: '#b8f04a', fontSize: 12 }}
                  itemStyle={{ fontSize: 11 }}
                />
                {(Object.keys(CATEGORY_COLORS) as Category[]).map(cat => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CATEGORY_COLORS[cat]}
                    strokeWidth={2}
                    dot={false}
                    name={CATEGORY_LABELS[cat]}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm py-8 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>Ingen score-data enn\u00e5</p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium mb-3" style={{ color: 'rgba(12,50,48,0.6)' }}>Vane-aktivitet (12 uker)</p>
        {heatmapData.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="flex mb-1 ml-7">
              {monthLabels.map((ml, i) => (
                <span
                  key={i}
                  className="text-[10px]"
                  style={{
                    color: 'rgba(12,50,48,0.4)',
                    marginLeft: i === 0 ? `${ml.col * 16}px` : `${(ml.col - (monthLabels[i - 1]?.col ?? 0) - 1) * 16}px`,
                  }}
                >
                  {ml.label}
                </span>
              ))}
            </div>
            <div className="flex gap-0.5">
              <div className="flex flex-col gap-0.5 mr-1">
                {DAY_LABELS.map((d, i) => (
                  <span
                    key={i}
                    className="text-[9px] leading-none flex items-center justify-end"
                    style={{ width: 20, height: 14, color: 'rgba(12,50,48,0.35)' }}
                  >
                    {i % 2 === 0 ? d : ''}
                  </span>
                ))}
              </div>
              {heatmapData.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => {
                    const ratio = day.total > 0 ? day.count / day.total : 0
                    let colorIdx = 0
                    if (ratio > 0 && ratio <= 0.25) colorIdx = 1
                    else if (ratio > 0.25 && ratio <= 0.5) colorIdx = 2
                    else if (ratio > 0.5 && ratio <= 0.75) colorIdx = 3
                    else if (ratio > 0.75) colorIdx = 4
                    const isFuture = new Date(day.date) > new Date()
                    return (
                      <div
                        key={di}
                        className="rounded-sm"
                        style={{
                          width: 14, height: 14,
                          backgroundColor: isFuture ? 'transparent' : HEATMAP_COLORS[colorIdx],
                          border: isFuture ? '1px solid rgba(12,50,48,0.06)' : 'none',
                        }}
                        title={`${day.date}: ${day.count}/${day.total}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm py-8 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>Ingen vane-data enn\u00e5</p>
        )}
      </div>
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 3: Helse-data (NEW)
// =============================================================================

function HelseSection({
  userId,
  supabase,
  toast,
}: {
  userId: string
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [saving, setSaving] = useState(false)
  const [lastWeekData, setLastWeekData] = useState<LifeEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  // Form state
  const [sleep, setSleep] = useState('')
  const [workoutCount, setWorkoutCount] = useState('')
  const [workoutTypes, setWorkoutTypes] = useState<string[]>([])
  const [recovery, setRecovery] = useState('')
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [protein, setProtein] = useState('')

  // Whoop import
  const [showWhoopImport, setShowWhoopImport] = useState(false)
  const [whoopRows, setWhoopRows] = useState<{ date: string; sleep: number; rem: number; deep: number; hrv: number; recovery: number; strain: number }[]>([])
  const [importingWhoop, setImportingWhoop] = useState(false)

  const weekStart = getWeekStart(new Date())

  // Load last week's data and pre-fill
  const loadLastWeekData = useCallback(async () => {
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekStr = toDateStr(prevWeekStart)

    const { data } = await supabase
      .from('life_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('category', 'physical')
      .gte('date', prevWeekStr)
      .lte('date', weekStart)
      .order('date', { ascending: false })

    if (data && data.length > 0) {
      setLastWeekData(data as LifeEntry[])
      // Pre-fill from last week
      const sleepEntry = data.find((e: LifeEntry) => e.entry_type === 'sleep')
      const workoutEntry = data.find((e: LifeEntry) => e.entry_type === 'workout')
      const recoveryEntry = data.find((e: LifeEntry) => e.entry_type === 'metric' && e.title?.toLowerCase().includes('recovery'))
      const weightEntry = data.find((e: LifeEntry) => e.entry_type === 'metric' && e.title?.toLowerCase().includes('vekt'))
      const fatEntry = data.find((e: LifeEntry) => e.entry_type === 'metric' && e.title?.toLowerCase().includes('fett'))
      const proteinEntry = data.find((e: LifeEntry) => e.entry_type === 'metric' && e.title?.toLowerCase().includes('protein'))

      if (sleepEntry?.value) setSleep(String(sleepEntry.value))
      if (workoutEntry?.value) setWorkoutCount(String(workoutEntry.value))
      if (workoutEntry?.metadata && Array.isArray((workoutEntry.metadata as Record<string, unknown>).types)) {
        setWorkoutTypes((workoutEntry.metadata as Record<string, unknown>).types as string[])
      }
      if (recoveryEntry?.value) setRecovery(String(recoveryEntry.value))
      if (weightEntry?.value) setWeight(String(weightEntry.value))
      if (fatEntry?.value) setBodyFat(String(fatEntry.value))
      if (proteinEntry?.value) setProtein(String(proteinEntry.value))
    }
    setLoaded(true)
  }, [supabase, userId, weekStart])

  useEffect(() => {
    if (!loaded) loadLastWeekData()
  }, [loaded, loadLastWeekData])

  async function saveHealthData() {
    setSaving(true)
    const entries: Array<{
      user_id: string; category: string; entry_type: string; title: string;
      value: number | null; unit: string; date: string; metadata?: Record<string, unknown>; source: string
    }> = []

    if (sleep) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'sleep',
        title: 'S\u00f8vn snitt', value: Number(sleep), unit: 'timer',
        date: weekStart, source: 'manual',
      })
    }
    if (workoutCount) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'workout',
        title: 'Treninger denne uken', value: Number(workoutCount), unit: 'count',
        date: weekStart, metadata: { types: workoutTypes }, source: 'manual',
      })
    }
    if (recovery) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Recovery snitt', value: Number(recovery), unit: 'score',
        date: weekStart, source: 'manual',
      })
    }
    if (weight) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Vekt', value: Number(weight), unit: 'kg',
        date: weekStart, source: 'manual',
      })
    }
    if (bodyFat) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Fettprosent', value: Number(bodyFat), unit: '%',
        date: weekStart, source: 'manual',
      })
    }
    if (protein) {
      entries.push({
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Protein snitt', value: Number(protein), unit: 'g',
        date: weekStart, source: 'manual',
      })
    }

    if (entries.length === 0) {
      toast('Fyll inn minst ett felt', 'error')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('life_entries').insert(entries)
    setSaving(false)
    if (error) {
      toast('Kunne ikke lagre', 'error')
      return
    }
    toast(`${entries.length} helse-m\u00e5linger lagret`, 'success')
  }

  function handleWhoopFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      const rows = lines.slice(1).map(line => {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
        return {
          date: parts[0] ?? '',
          sleep: Number(parts[1]) || 0,
          rem: Number(parts[2]) || 0,
          deep: Number(parts[3]) || 0,
          hrv: Number(parts[4]) || 0,
          recovery: Number(parts[5]) || 0,
          strain: Number(parts[6]) || 0,
        }
      }).filter(r => r.date)
      setWhoopRows(rows)
    }
    reader.readAsText(file)
  }

  async function importWhoop() {
    if (whoopRows.length === 0) return
    setImportingWhoop(true)
    const entries = whoopRows.flatMap(r => [
      {
        user_id: userId, category: 'physical', entry_type: 'sleep',
        title: 'S\u00f8vn (Whoop)', value: r.sleep, unit: 'timer',
        date: r.date, metadata: { rem: r.rem, deep: r.deep }, source: 'whoop',
      },
      {
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'HRV', value: r.hrv, unit: 'ms',
        date: r.date, source: 'whoop',
      },
      {
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Recovery (Whoop)', value: r.recovery, unit: 'score',
        date: r.date, source: 'whoop',
      },
      {
        user_id: userId, category: 'physical', entry_type: 'metric',
        title: 'Strain', value: r.strain, unit: 'score',
        date: r.date, source: 'whoop',
      },
    ])

    const { error } = await supabase.from('life_entries').insert(entries)
    setImportingWhoop(false)
    if (error) {
      toast('Whoop-import feilet', 'error')
      return
    }
    toast(`${whoopRows.length} dager importert fra Whoop`, 'success')
    setWhoopRows([])
    setShowWhoopImport(false)
  }

  return (
    <SectionWrapper title="Helse-data">
      <p className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
        Legg til denne ukens data (uke fra {weekStart})
        {lastWeekData.length > 0 && ' \u2014 forrige ukes verdier er forhåndsutfylt'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>S\u00f8vn (snitt timer/natt)</label>
          <input
            type="number"
            step="0.1"
            value={sleep}
            onChange={e => setSleep(e.target.value)}
            placeholder="7.5"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Treninger (antall)</label>
          <input
            type="number"
            value={workoutCount}
            onChange={e => setWorkoutCount(e.target.value)}
            placeholder="4"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(12,50,48,0.6)' }}>Treningstyper</label>
        <div className="flex flex-wrap gap-2">
          {WORKOUT_TYPES.map(t => {
            const selected = workoutTypes.includes(t)
            return (
              <button
                key={t}
                onClick={() => setWorkoutTypes(selected ? workoutTypes.filter(x => x !== t) : [...workoutTypes, t])}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                style={selected
                  ? { backgroundColor: '#3dbfb5', color: '#0c3230', borderColor: '#3dbfb5' }
                  : { borderColor: 'rgba(12,50,48,0.1)', color: '#0c3230' }
                }
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Recovery (snitt 0-100)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={recovery}
            onChange={e => setRecovery(e.target.value)}
            placeholder="65"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Vekt (kg)</label>
          <input
            type="number"
            step="0.1"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            placeholder="85"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Fettprosent (%, valgfritt)</label>
          <input
            type="number"
            step="0.1"
            value={bodyFat}
            onChange={e => setBodyFat(e.target.value)}
            placeholder="15"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Protein (snitt g/dag)</label>
          <input
            type="number"
            value={protein}
            onChange={e => setProtein(e.target.value)}
            placeholder="180"
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white focus:outline-none focus:border-[#3dbfb5]"
            style={{ color: '#0c3230' }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={saveHealthData}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-medium"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Lagrer...' : 'Lagre helse-data'}
        </button>
        <button
          onClick={() => setShowWhoopImport(!showWhoopImport)}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-black/10"
          style={{ color: '#0c3230' }}
        >
          Whoop CSV
        </button>
      </div>

      {showWhoopImport && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <p className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
            Forventet format: dato, s\u00f8vntimer, REM, dyp s\u00f8vn, HRV, recovery, strain (CSV med header)
          </p>
          <input type="file" accept=".csv" onChange={handleWhoopFile} className="text-sm" />
          {whoopRows.length > 0 && (
            <>
              <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {whoopRows.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex gap-3" style={{ color: '#0c3230' }}>
                    <span>{r.date}</span>
                    <span>S\u00f8vn: {r.sleep}t</span>
                    <span>Recovery: {r.recovery}%</span>
                    <span>Strain: {r.strain}</span>
                  </div>
                ))}
                {whoopRows.length > 5 && (
                  <p style={{ color: 'rgba(12,50,48,0.4)' }}>...og {whoopRows.length - 5} dager til</p>
                )}
              </div>
              <button
                onClick={importWhoop}
                disabled={importingWhoop}
                className="w-full py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: importingWhoop ? 0.6 : 1 }}
              >
                {importingWhoop ? 'Importerer...' : `Importer ${whoopRows.length} dager`}
              </button>
            </>
          )}
        </div>
      )}
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 4: \u00d8konomi (upgraded with smart bank import)
// =============================================================================

function OkonomiSection({
  userId,
  financeEntries,
  financeTargets,
  supabase,
  toast,
  onEntriesChange,
  onTargetsChange,
}: {
  userId: string
  financeEntries: FinanceEntry[]
  financeTargets: FinanceTarget[]
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onEntriesChange: (entries: FinanceEntry[]) => void
  onTargetsChange: (targets: FinanceTarget[]) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [showBankImport, setShowBankImport] = useState(false)
  const [showBudgetEdit, setShowBudgetEdit] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [analyzingFinance, setAnalyzingFinance] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add form state
  const [addDate, setAddDate] = useState(toDateString(new Date()))
  const [addAmount, setAddAmount] = useState('')
  const [addIsExpense, setAddIsExpense] = useState(true)
  const [addCategory, setAddCategory] = useState('')
  const [addDescription, setAddDescription] = useState('')

  // Smart bank import state
  const [bankParsedRows, setBankParsedRows] = useState<ParsedBankRow[]>([])
  const [categorizedRows, setCategorizedRows] = useState<CategorizedBankRow[]>([])
  const [categorizingAI, setCategorizingAI] = useState(false)
  const [importingBank, setImportingBank] = useState(false)
  const [showRecurring, setShowRecurring] = useState(false)
  const [recurringCandidates, setRecurringCandidates] = useState<CategorizedBankRow[]>([])

  // Monthly metrics
  const metrics = useMemo(() => {
    const now = new Date()
    const monthStart = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
    const monthEnd = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    const thisMonth = financeEntries.filter(e => e.date >= monthStart && e.date <= monthEnd)
    const income = thisMonth.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const expenses = Math.abs(thisMonth.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0))
    const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0
    const totalBudget = financeTargets
      .filter(t => t.target_type === 'expense_limit' && t.monthly_budget)
      .reduce((s, t) => s + (t.monthly_budget ?? 0), 0)
    return { income, expenses, savingsRate, totalBudget }
  }, [financeEntries, financeTargets])

  const spendingByCategory = useMemo(() => {
    const now = new Date()
    const monthStart = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
    const monthEnd = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    const thisMonth = financeEntries.filter(e => e.date >= monthStart && e.date <= monthEnd && e.amount < 0)
    const catMap = new Map<string, number>()
    for (const e of thisMonth) {
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + Math.abs(e.amount))
    }
    const budgetMap = new Map<string, number>()
    for (const t of financeTargets) {
      if (t.monthly_budget) budgetMap.set(t.category, t.monthly_budget)
    }
    return Array.from(catMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amount]) => ({
        category: cat, utgifter: amount, budsjett: budgetMap.get(cat) ?? 0,
      }))
  }, [financeEntries, financeTargets])

  async function handleAddEntry() {
    if (!addAmount || !addCategory) {
      toast('Fyll inn bel\u00f8p og kategori', 'error')
      return
    }
    setSaving(true)
    const amount = addIsExpense ? -Math.abs(Number(addAmount)) : Math.abs(Number(addAmount))
    const { data, error } = await supabase.from('finance_entries').insert({
      user_id: userId, date: addDate, amount, category: addCategory,
      description: addDescription || null, source: 'manual',
    }).select().single()
    setSaving(false)
    if (error) { toast('Kunne ikke lagre', 'error'); return }
    onEntriesChange([data as FinanceEntry, ...financeEntries])
    setShowAddForm(false)
    setAddAmount('')
    setAddCategory('')
    setAddDescription('')
    toast('Transaksjon lagt til', 'success')
  }

  // Smart bank CSV import
  function handleBankCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      const rows: ParsedBankRow[] = lines.slice(1).map(line => {
        const parts = line.split(/[,;]/).map(p => p.trim().replace(/^"|"$/g, ''))
        return {
          date: parts[0] ?? '',
          amount: Number(parts[1]?.replace(/\s/g, '').replace(',', '.')) || 0,
          description: parts[2] ?? parts[3] ?? '',
        }
      }).filter(r => r.date && r.amount !== 0)
      setBankParsedRows(rows)
      setCategorizedRows([])
    }
    reader.readAsText(file)
  }

  async function categorizeWithAI() {
    if (bankParsedRows.length === 0) return
    setCategorizingAI(true)

    try {
      // First check vendor_mappings for known vendors
      const { data: mappings } = await supabase.from('vendor_mappings').select('*')
      const vendorMap = new Map<string, { category: string; is_necessary: boolean }>()
      if (mappings) {
        for (const m of mappings) {
          vendorMap.set(m.vendor_pattern.toLowerCase(), { category: m.category, is_necessary: m.is_necessary })
        }
      }

      // Split rows into known and unknown
      const knownRows: CategorizedBankRow[] = []
      const unknownRows: ParsedBankRow[] = []

      for (const row of bankParsedRows) {
        const descLower = row.description.toLowerCase()
        let found = false
        for (const [pattern, mapping] of vendorMap.entries()) {
          if (descLower.includes(pattern)) {
            knownRows.push({
              ...row,
              category: mapping.category,
              is_necessary: mapping.is_necessary,
              simplified_title: row.description,
              approved: false,
            })
            found = true
            break
          }
        }
        if (!found) unknownRows.push(row)
      }

      let aiCategorized: CategorizedBankRow[] = []

      if (unknownRows.length > 0) {
        const rowsText = unknownRows.map(r => `${r.date} | ${r.amount} | ${r.description}`).join('\n')
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Her er bankutskriftet til Martin. Kategoriser hver transaksjon. Bruk disse kategoriene: bolig, mat, transport, trening, spise_ute, shopping, abonnementer, underholdning, reise, helse, gave, diverse. Marker ogs\u00e5 om du tror den er 'n\u00f8dvendig' eller 'un\u00f8dvendig'. Returner KUN JSON (ingen annen tekst): [{"original_description": "...", "category": "...", "is_necessary": true/false, "simplified_title": "..."}]\n\nTransaksjoner:\n${rowsText}`,
          }),
        })
        const data = await res.json()
        const responseText = data.response ?? ''

        try {
          const jsonMatch = responseText.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              original_description: string; category: string; is_necessary: boolean; simplified_title: string
            }>
            aiCategorized = unknownRows.map((row, i) => ({
              ...row,
              category: parsed[i]?.category ?? 'diverse',
              is_necessary: parsed[i]?.is_necessary ?? false,
              simplified_title: parsed[i]?.simplified_title ?? row.description,
              approved: false,
            }))
          }
        } catch {
          // Fallback if JSON parsing fails
          aiCategorized = unknownRows.map(row => ({
            ...row, category: 'diverse', is_necessary: false,
            simplified_title: row.description, approved: false,
          }))
        }
      }

      // Combine known + AI categorized, sorted by date
      const allRows = [...knownRows, ...aiCategorized].sort((a, b) => a.date.localeCompare(b.date))
      setCategorizedRows(allRows)
    } catch {
      toast('AI-kategorisering feilet', 'error')
    }
    setCategorizingAI(false)
  }

  function updateRowCategory(idx: number, newCategory: string) {
    setCategorizedRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, userOverrideCategory: newCategory } : r
    ))
  }

  function approveRow(idx: number) {
    setCategorizedRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, approved: true } : r
    ))
  }

  function approveAll() {
    setCategorizedRows(prev => prev.map(r => ({ ...r, approved: true })))
  }

  async function confirmBankImport() {
    const approved = categorizedRows.filter(r => r.approved)
    if (approved.length === 0) {
      toast('Godkjenn minst \u00e9n rad', 'error')
      return
    }
    setImportingBank(true)

    // Insert into life_entries
    const lifeEntries = approved.map(r => ({
      user_id: userId,
      category: r.userOverrideCategory ?? r.category,
      entry_type: r.amount > 0 ? 'income' : 'expense',
      title: r.simplified_title,
      value: Math.abs(r.amount),
      unit: 'kr',
      date: r.date,
      metadata: { original_description: r.description, is_necessary: r.is_necessary },
      source: 'csv_import',
      ai_categorized: true,
    }))

    const { error } = await supabase.from('life_entries').insert(lifeEntries)

    // Also insert into finance_entries for backwards compat
    const finEntries = approved.map(r => ({
      user_id: userId,
      date: r.date,
      amount: r.amount,
      category: r.userOverrideCategory ?? r.category,
      description: r.simplified_title,
      source: 'csv_import',
    }))

    const { data: finData } = await supabase.from('finance_entries').insert(finEntries).select()

    // Save corrections to vendor_mappings
    const corrections = approved.filter(r => r.userOverrideCategory && r.userOverrideCategory !== r.category)
    for (const c of corrections) {
      await supabase.from('vendor_mappings').upsert({
        vendor_pattern: c.description.toLowerCase().slice(0, 50),
        category: c.userOverrideCategory!,
        is_necessary: c.is_necessary,
      }, { onConflict: 'vendor_pattern' })
    }

    setImportingBank(false)
    if (error) {
      toast('Import feilet', 'error')
      return
    }

    if (finData) {
      onEntriesChange([...(finData as FinanceEntry[]), ...financeEntries])
    }

    // Detect recurring transactions
    detectRecurring(approved)

    setCategorizedRows([])
    setBankParsedRows([])
    toast(`${approved.length} transaksjoner importert`, 'success')
  }

  function detectRecurring(rows: CategorizedBankRow[]) {
    // Group by simplified_title + similar amount
    const descMap = new Map<string, CategorizedBankRow[]>()
    for (const r of rows) {
      const key = r.simplified_title.toLowerCase()
      if (!descMap.has(key)) descMap.set(key, [])
      descMap.get(key)!.push(r)
    }
    const candidates = Array.from(descMap.values())
      .filter(group => group.length >= 2)
      .map(group => group[0])
    if (candidates.length > 0) {
      setRecurringCandidates(candidates)
      setShowRecurring(true)
    }
  }

  async function markAsRecurring(row: CategorizedBankRow) {
    await supabase.from('life_entries').update({ recurrence: 'monthly' })
      .eq('user_id', userId)
      .eq('title', row.simplified_title)
      .eq('source', 'csv_import')
    setRecurringCandidates(prev => prev.filter(r => r.simplified_title !== row.simplified_title))
    toast(`"${row.simplified_title}" markert som fast utgift`, 'success')
  }

  async function analyzeWithClaude() {
    setAnalyzingFinance(true)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Analyser \u00f8konomien min denne m\u00e5neden. Her er dataen:\n\nInntekt: ${formatCurrency(metrics.income)}\nUtgifter: ${formatCurrency(metrics.expenses)}\nSparerate: ${metrics.savingsRate}%\n\nUtgifter per kategori:\n${spendingByCategory.map(c => `${c.category}: ${formatCurrency(c.utgifter)}${c.budsjett ? ` (budsjett: ${formatCurrency(c.budsjett)})` : ''}`).join('\n')}`,
          type: 'finance_analysis',
        }),
      })
      const data = await res.json()
      setAnalysisResult(data.response ?? data.error ?? 'Ingen respons')
    } catch {
      setAnalysisResult('Kunne ikke koble til Claude')
    }
    setAnalyzingFinance(false)
  }

  async function updateTarget(target: FinanceTarget, updates: Partial<FinanceTarget>) {
    const { error } = await supabase.from('finance_targets').update(updates).eq('id', target.id)
    if (error) { toast('Kunne ikke oppdatere', 'error'); return }
    onTargetsChange(financeTargets.map(t => t.id === target.id ? { ...t, ...updates } : t))
    toast('Budsjett oppdatert', 'success')
  }

  return (
    <SectionWrapper title="\u00d8konomi">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Inntekt', value: formatCurrency(metrics.income), color: '#b8f04a' },
          { label: 'Utgifter', value: formatCurrency(metrics.expenses), color: '#f07070' },
          { label: 'Sparerate', value: `${metrics.savingsRate}%`, color: metrics.savingsRate >= 20 ? '#b8f04a' : '#f0c74a' },
          { label: 'Budsjett', value: metrics.totalBudget > 0 ? `${Math.round((metrics.expenses / metrics.totalBudget) * 100)}%` : '\u2013', color: metrics.totalBudget > 0 && metrics.expenses <= metrics.totalBudget ? '#b8f04a' : '#f0c74a' },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-black/5 bg-white p-3.5">
            <p className="text-[11px] mb-1" style={{ color: 'rgba(12,50,48,0.45)' }}>{m.label}</p>
            <p className="text-lg font-bold" style={{ color: '#0c3230' }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Spending bar chart */}
      {spendingByCategory.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spendingByCategory} layout="vertical" margin={{ left: 60, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(12,50,48,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'rgba(12,50,48,0.4)' }} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#0c3230' }} width={56} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  backgroundColor: '#0c3230', border: 'none', borderRadius: 12, padding: '8px 12px',
                }}
                labelStyle={{ color: '#b8f04a', fontSize: 12 }}
                itemStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="utgifter" fill="#3dbfb5" radius={[0, 4, 4, 0]} name="Utgifter" />
              <Bar dataKey="budsjett" fill="rgba(12,50,48,0.12)" radius={[0, 4, 4, 0]} name="Budsjett" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setShowAddForm(!showAddForm); setShowBankImport(false); setShowBudgetEdit(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          Legg til manuelt
        </button>
        <button
          onClick={() => { setShowBankImport(!showBankImport); setShowAddForm(false); setShowBudgetEdit(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-black/10"
          style={{ color: '#0c3230' }}
        >
          Smart bankimport
        </button>
        <button
          onClick={analyzeWithClaude}
          disabled={analyzingFinance}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: '#3dbfb5', color: '#0c3230', opacity: analyzingFinance ? 0.6 : 1 }}
        >
          {analyzingFinance ? 'Analyserer...' : 'Analyser med Claude'}
        </button>
        <button
          onClick={() => { setShowBudgetEdit(!showBudgetEdit); setShowAddForm(false); setShowBankImport(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-black/10"
          style={{ color: '#0c3230' }}
        >
          Rediger budsjett
        </button>
      </div>

      {/* Manual add form */}
      {showAddForm && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Dato</label>
              <input
                type="date"
                value={addDate}
                onChange={e => setAddDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
                style={{ color: '#0c3230' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Bel\u00f8p</label>
              <input
                type="number"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
                style={{ color: '#0c3230' }}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAddIsExpense(true)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
              style={addIsExpense
                ? { backgroundColor: '#f07070', color: 'white', borderColor: '#f07070' }
                : { borderColor: 'rgba(12,50,48,0.1)', color: '#0c3230' }
              }
            >
              Utgift
            </button>
            <button
              onClick={() => setAddIsExpense(false)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border"
              style={!addIsExpense
                ? { backgroundColor: '#b8f04a', color: '#0c3230', borderColor: '#b8f04a' }
                : { borderColor: 'rgba(12,50,48,0.1)', color: '#0c3230' }
              }
            >
              Inntekt
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Kategori</label>
            <select
              value={addCategory}
              onChange={e => setAddCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
              style={{ color: '#0c3230' }}
            >
              <option value="">Velg kategori...</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Beskrivelse</label>
            <input
              type="text"
              value={addDescription}
              onChange={e => setAddDescription(e.target.value)}
              placeholder="Valgfritt"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
              style={{ color: '#0c3230' }}
            />
          </div>
          <button
            onClick={handleAddEntry}
            disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Lagrer...' : 'Lagre'}
          </button>
        </div>
      )}

      {/* Smart bank import */}
      {showBankImport && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <p className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
            Last opp bankutskrift (CSV). Forventet format: dato, bel\u00f8p, beskrivelse
          </p>
          <input type="file" accept=".csv" onChange={handleBankCsvFile} className="text-sm" />

          {bankParsedRows.length > 0 && categorizedRows.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: '#0c3230' }}>
                {bankParsedRows.length} transaksjoner funnet
              </p>
              <div className="text-xs space-y-1 max-h-24 overflow-y-auto">
                {bankParsedRows.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex gap-2" style={{ color: '#0c3230' }}>
                    <span>{r.date}</span>
                    <span className={r.amount < 0 ? 'text-red-500' : 'text-green-600'}>
                      {formatCurrency(r.amount)}
                    </span>
                    <span className="truncate">{r.description}</span>
                  </div>
                ))}
                {bankParsedRows.length > 3 && (
                  <p style={{ color: 'rgba(12,50,48,0.4)' }}>...og {bankParsedRows.length - 3} til</p>
                )}
              </div>
              <button
                onClick={categorizeWithAI}
                disabled={categorizingAI}
                className="w-full py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#3dbfb5', color: '#0c3230', opacity: categorizingAI ? 0.6 : 1 }}
              >
                {categorizingAI ? 'AI kategoriserer...' : 'Kategoriser med AI'}
              </button>
            </div>
          )}

          {/* Categorized review table */}
          {categorizedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium" style={{ color: '#0c3230' }}>
                  Gjennomg\u00e5 kategorisering
                </p>
                <button
                  onClick={approveAll}
                  className="text-xs font-medium px-3 py-1 rounded-full"
                  style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
                >
                  Godkjenn alle
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {categorizedRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs"
                    style={{
                      borderColor: row.approved ? 'rgba(184,240,74,0.4)' : 'rgba(12,50,48,0.08)',
                      backgroundColor: row.approved ? 'rgba(184,240,74,0.05)' : 'white',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: '#0c3230' }}>{row.simplified_title}</p>
                      <p style={{ color: 'rgba(12,50,48,0.4)' }}>
                        {row.date} \u00b7 {formatCurrency(row.amount)} \u00b7 {row.is_necessary ? 'N\u00f8dvendig' : 'Un\u00f8dvendig'}
                      </p>
                    </div>
                    <select
                      value={row.userOverrideCategory ?? row.category}
                      onChange={e => updateRowCategory(idx, e.target.value)}
                      className="px-2 py-1 rounded border border-black/10 bg-white text-xs"
                      style={{ color: '#0c3230', maxWidth: 110 }}
                    >
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {!row.approved && (
                      <button
                        onClick={() => approveRow(idx)}
                        className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
                      >
                        OK
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={confirmBankImport}
                disabled={importingBank || categorizedRows.filter(r => r.approved).length === 0}
                className="w-full py-2 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: '#0c3230', color: '#b8f04a',
                  opacity: importingBank || categorizedRows.filter(r => r.approved).length === 0 ? 0.6 : 1,
                }}
              >
                {importingBank
                  ? 'Importerer...'
                  : `Importer ${categorizedRows.filter(r => r.approved).length} godkjente transaksjoner`
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* Recurring detection */}
      {showRecurring && recurringCandidates.length > 0 && (
        <div className="space-y-2 p-4 rounded-xl border border-[#3dbfb5]/20 bg-[#3dbfb5]/5">
          <p className="text-xs font-medium" style={{ color: '#0c3230' }}>Faste utgifter oppdaget</p>
          <p className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
            Disse transaksjonene virker som de g\u00e5r igjen m\u00e5nedlig. Marker som faste utgifter?
          </p>
          {recurringCandidates.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="flex-1 font-medium" style={{ color: '#0c3230' }}>{r.simplified_title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>{formatCurrency(Math.abs(r.amount))}/mnd</span>
              <button
                onClick={() => markAsRecurring(r)}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
              >
                Fast utgift
              </button>
            </div>
          ))}
          <button
            onClick={() => setShowRecurring(false)}
            className="text-xs" style={{ color: 'rgba(12,50,48,0.4)' }}
          >
            Lukk
          </button>
        </div>
      )}

      {/* Budget editing */}
      {showBudgetEdit && (
        <div className="space-y-2 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <p className="text-xs font-medium mb-2" style={{ color: 'rgba(12,50,48,0.6)' }}>Budsjett per kategori</p>
          {financeTargets.length === 0 && (
            <p className="text-xs" style={{ color: 'rgba(12,50,48,0.4)' }}>Ingen budsjett satt enn\u00e5</p>
          )}
          {financeTargets.map(t => (
            <BudgetRow key={t.id} target={t} onUpdate={updateTarget} />
          ))}
        </div>
      )}

      {/* Claude analysis */}
      {analysisResult && (
        <div
          className="p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed"
          style={{ backgroundColor: 'rgba(61,191,181,0.08)', color: '#0c3230', border: '1px solid rgba(61,191,181,0.2)' }}
        >
          {analysisResult}
        </div>
      )}
    </SectionWrapper>
  )
}

function BudgetRow({
  target,
  onUpdate,
}: {
  target: FinanceTarget
  onUpdate: (target: FinanceTarget, updates: Partial<FinanceTarget>) => void
}) {
  const [monthly, setMonthly] = useState(String(target.monthly_budget ?? ''))
  const [yearly, setYearly] = useState(String(target.yearly_target ?? ''))
  const [dirty, setDirty] = useState(false)

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 font-medium truncate" style={{ color: '#0c3230' }}>{target.category}</span>
      <input
        type="number"
        value={monthly}
        onChange={e => { setMonthly(e.target.value); setDirty(true) }}
        placeholder="Mnd"
        className="w-20 px-2 py-1 rounded border border-black/10 bg-white text-xs"
        style={{ color: '#0c3230' }}
      />
      <input
        type="number"
        value={yearly}
        onChange={e => { setYearly(e.target.value); setDirty(true) }}
        placeholder="\u00c5rlig"
        className="w-20 px-2 py-1 rounded border border-black/10 bg-white text-xs"
        style={{ color: '#0c3230' }}
      />
      <span className="text-[10px]" style={{ color: 'rgba(12,50,48,0.4)' }}>{target.target_type}</span>
      {dirty && (
        <button
          onClick={() => {
            onUpdate(target, {
              monthly_budget: monthly ? Number(monthly) : undefined,
              yearly_target: yearly ? Number(yearly) : undefined,
            })
            setDirty(false)
          }}
          className="text-[10px] font-medium"
          style={{ color: '#3dbfb5' }}
        >
          Lagre
        </button>
      )}
    </div>
  )
}

// =============================================================================
// SECTION 5: Mine data (NEW)
// =============================================================================

interface DataSectionGroup {
  key: string
  label: string
  color: string
  entryTypes: string[]
  renderSummary: (entries: LifeEntry[]) => string
  renderDetail: (entries: LifeEntry[]) => React.ReactNode
  addFields: { label: string; entryType: string; defaultUnit: string; category: string }[]
}

function MineDataSection({
  userId,
  supabase,
  toast,
}: {
  userId: string
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [entries, setEntries] = useState<LifeEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)

  // Add form
  const [addTitle, setAddTitle] = useState('')
  const [addValue, setAddValue] = useState('')
  const [addUnit, setAddUnit] = useState('')
  const [addDate, setAddDate] = useState(toDateString(new Date()))
  const [addEntryType, setAddEntryType] = useState('')
  const [addCategory, setAddCategory] = useState('')
  const [saving, setSaving] = useState(false)

  const loadEntries = useCallback(async () => {
    const thirtyDaysAgo = toDateStr(new Date(Date.now() - 30 * 86400000))
    const { data } = await supabase
      .from('life_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false })
    if (data) setEntries(data as LifeEntry[])
    setLoaded(true)
  }, [supabase, userId])

  useEffect(() => {
    if (!loaded) loadEntries()
  }, [loaded, loadEntries])

  const groups: DataSectionGroup[] = useMemo(() => [
    {
      key: 'finance',
      label: '\u00d8konomi',
      color: '#F59E0B',
      entryTypes: ['expense', 'income', 'recurring_expense'],
      renderSummary: (ents) => {
        const expenses = ents.filter(e => e.entry_type === 'expense')
        const total = expenses.reduce((s, e) => s + (e.value ?? 0), 0)
        const fixed = ents.filter(e => e.recurrence === 'monthly')
        const fixedTotal = fixed.reduce((s, e) => s + (e.value ?? 0), 0)
        return `${formatCurrency(total)} siste 30 dager${fixed.length > 0 ? ` \u00b7 ${formatCurrency(fixedTotal)} faste` : ''}`
      },
      renderDetail: (ents) => {
        const expenses = ents.filter(e => e.entry_type === 'expense').slice(0, 15)
        const fixed = ents.filter(e => e.recurrence === 'monthly')
        return (
          <div className="space-y-2">
            {fixed.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.5)' }}>Faste utgifter</p>
                {fixed.map(e => (
                  <div key={e.id} className="flex justify-between text-xs py-0.5">
                    <span style={{ color: '#0c3230' }}>{e.title}</span>
                    <span style={{ color: '#f07070' }}>{formatCurrency(e.value ?? 0)}/mnd</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.5)' }}>Siste transaksjoner</p>
              {expenses.map(e => (
                <div key={e.id} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: '#0c3230' }}>{e.title}</span>
                  <span style={{ color: 'rgba(12,50,48,0.5)' }}>{e.date} \u00b7 {formatCurrency(e.value ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      },
      addFields: [
        { label: 'Utgift', entryType: 'expense', defaultUnit: 'kr', category: 'finance' },
        { label: 'Inntekt', entryType: 'income', defaultUnit: 'kr', category: 'finance' },
      ],
    },
    {
      key: 'health',
      label: 'Helse',
      color: '#14B8A6',
      entryTypes: ['sleep', 'workout', 'metric'],
      renderSummary: (ents) => {
        const sleepEnts = ents.filter(e => e.entry_type === 'sleep')
        const avgSleep = sleepEnts.length > 0 ? (sleepEnts.reduce((s, e) => s + (e.value ?? 0), 0) / sleepEnts.length).toFixed(1) : null
        const workouts = ents.filter(e => e.entry_type === 'workout')
        const totalWorkouts = workouts.reduce((s, e) => s + (e.value ?? 0), 0)
        const recoveryEnts = ents.filter(e => e.entry_type === 'metric' && e.title?.toLowerCase().includes('recovery'))
        const avgRecovery = recoveryEnts.length > 0 ? Math.round(recoveryEnts.reduce((s, e) => s + (e.value ?? 0), 0) / recoveryEnts.length) : null
        const weightEnts = ents.filter(e => e.entry_type === 'metric' && e.title?.toLowerCase().includes('vekt'))
        const latestWeight = weightEnts[0]?.value

        const parts: string[] = []
        if (avgSleep) parts.push(`S\u00f8vn: ${avgSleep}t`)
        if (totalWorkouts) parts.push(`${totalWorkouts} treninger`)
        if (avgRecovery) parts.push(`Recovery: ${avgRecovery}%`)
        if (latestWeight) parts.push(`${latestWeight}kg`)
        return parts.join(' \u00b7 ') || 'Ingen data'
      },
      renderDetail: (ents) => (
        <div className="space-y-1">
          {ents.slice(0, 20).map(e => (
            <div key={e.id} className="flex justify-between text-xs py-0.5">
              <span style={{ color: '#0c3230' }}>{e.title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>
                {e.date} \u00b7 {e.value}{e.unit ? ` ${e.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      ),
      addFields: [
        { label: 'Trening', entryType: 'workout', defaultUnit: 'min', category: 'physical' },
        { label: 'S\u00f8vn', entryType: 'sleep', defaultUnit: 'timer', category: 'physical' },
        { label: 'M\u00e5ling', entryType: 'metric', defaultUnit: '', category: 'physical' },
      ],
    },
    {
      key: 'family',
      label: 'Familie',
      color: '#EC4899',
      entryTypes: ['relationship'],
      renderSummary: (ents) => {
        if (ents.length === 0) return 'Ingen registrert'
        const people = new Set(ents.map(e => e.title))
        return `${ents.length} kontaktpunkter \u00b7 ${people.size} person${people.size !== 1 ? 'er' : ''}`
      },
      renderDetail: (ents) => (
        <div className="space-y-1">
          {ents.slice(0, 15).map(e => (
            <div key={e.id} className="flex justify-between text-xs py-0.5">
              <span style={{ color: '#0c3230' }}>{e.title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>
                {e.date}{e.value ? ` \u00b7 ${e.value} ${e.unit ?? 'min'}` : ''}
              </span>
            </div>
          ))}
        </div>
      ),
      addFields: [
        { label: 'Kontakt', entryType: 'relationship', defaultUnit: 'min', category: 'family' },
      ],
    },
    {
      key: 'learning',
      label: 'Utvikling',
      color: '#A855F7',
      entryTypes: ['learning'],
      renderSummary: (ents) => {
        if (ents.length === 0) return 'Ingen registrert'
        const totalPages = ents.reduce((s, e) => s + (e.value ?? 0), 0)
        return `${ents.length} oppf\u00f8ringer${totalPages > 0 ? ` \u00b7 ${totalPages} sider` : ''}`
      },
      renderDetail: (ents) => (
        <div className="space-y-1">
          {ents.slice(0, 15).map(e => (
            <div key={e.id} className="flex justify-between text-xs py-0.5">
              <span style={{ color: '#0c3230' }}>{e.title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>
                {e.date}{e.value ? ` \u00b7 ${e.value} ${e.unit ?? 'sider'}` : ''}
              </span>
            </div>
          ))}
        </div>
      ),
      addFields: [
        { label: 'Bok/l\u00e6ring', entryType: 'learning', defaultUnit: 'sider', category: 'mental' },
      ],
    },
    {
      key: 'experiences',
      label: 'Opplevelser',
      color: '#F97316',
      entryTypes: ['experience'],
      renderSummary: (ents) => ents.length > 0 ? `${ents.length} opplevelse${ents.length !== 1 ? 'r' : ''}` : 'Ingen registrert',
      renderDetail: (ents) => (
        <div className="space-y-1">
          {ents.slice(0, 15).map(e => (
            <div key={e.id} className="flex justify-between text-xs py-0.5">
              <span style={{ color: '#0c3230' }}>{e.title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>{e.date}</span>
            </div>
          ))}
        </div>
      ),
      addFields: [
        { label: 'Opplevelse', entryType: 'experience', defaultUnit: '', category: 'lifestyle' },
      ],
    },
    {
      key: 'business',
      label: 'Business',
      color: '#3B82F6',
      entryTypes: ['milestone'],
      renderSummary: (ents) => ents.length > 0 ? `${ents.length} milep\u00e6l${ents.length !== 1 ? 'er' : ''}` : 'Ingen registrert',
      renderDetail: (ents) => (
        <div className="space-y-1">
          {ents.slice(0, 15).map(e => (
            <div key={e.id} className="flex justify-between text-xs py-0.5">
              <span style={{ color: '#0c3230' }}>{e.title}</span>
              <span style={{ color: 'rgba(12,50,48,0.5)' }}>{e.date}</span>
            </div>
          ))}
        </div>
      ),
      addFields: [
        { label: 'Milep\u00e6l', entryType: 'milestone', defaultUnit: '', category: 'business' },
      ],
    },
  ], [])

  const entriesByGroup = useMemo(() => {
    const map: Record<string, LifeEntry[]> = {}
    for (const g of groups) {
      map[g.key] = entries.filter(e =>
        g.entryTypes.includes(e.entry_type) ||
        (g.key === 'health' && e.category === 'physical')
      )
    }
    return map
  }, [entries, groups])

  async function handleAddEntry() {
    if (!addTitle.trim()) { toast('Skriv inn en tittel', 'error'); return }
    setSaving(true)
    const { error } = await supabase.from('life_entries').insert({
      user_id: userId,
      category: addCategory,
      entry_type: addEntryType,
      title: addTitle.trim(),
      value: addValue ? Number(addValue) : null,
      unit: addUnit || null,
      date: addDate,
      source: 'manual',
    })
    setSaving(false)
    if (error) { toast('Kunne ikke lagre', 'error'); return }
    toast('Oppf\u00f8ring lagt til', 'success')
    setAddTitle('')
    setAddValue('')
    setAddingTo(null)
    loadEntries()
  }

  function startAdd(groupKey: string, field: { label: string; entryType: string; defaultUnit: string; category: string }) {
    setAddingTo(groupKey)
    setAddEntryType(field.entryType)
    setAddUnit(field.defaultUnit)
    setAddCategory(field.category)
    setAddDate(toDateString(new Date()))
    setAddTitle('')
    setAddValue('')
  }

  if (!loaded) {
    return (
      <SectionWrapper title="Mine data">
        <p className="text-sm py-4 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>Laster...</p>
      </SectionWrapper>
    )
  }

  return (
    <SectionWrapper title="Mine data">
      <p className="text-xs mb-2" style={{ color: 'rgba(12,50,48,0.5)' }}>
        Oversikt over alle life_entries siste 30 dager
      </p>

      {groups.map(g => {
        const groupEntries = entriesByGroup[g.key] ?? []
        const isExpanded = expandedGroup === g.key

        return (
          <div key={g.key} className="rounded-xl border border-black/5 overflow-hidden">
            <button
              onClick={() => setExpandedGroup(isExpanded ? null : g.key)}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
              <span className="text-sm font-medium flex-1" style={{ color: '#0c3230' }}>{g.label}</span>
              <span className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
                {g.renderSummary(groupEntries)}
              </span>
              <span
                className="text-[10px] transition-transform"
                style={{ color: 'rgba(12,50,48,0.3)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                \u25bc
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-3 space-y-3">
                {groupEntries.length > 0 ? g.renderDetail(groupEntries) : (
                  <p className="text-xs py-2" style={{ color: 'rgba(12,50,48,0.3)' }}>Ingen data enn\u00e5</p>
                )}

                {/* Add buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {g.addFields.map(f => (
                    <button
                      key={f.entryType}
                      onClick={() => startAdd(g.key, f)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-black/10"
                      style={{ color: '#0c3230' }}
                    >
                      + {f.label}
                    </button>
                  ))}
                </div>

                {/* Inline add form */}
                {addingTo === g.key && (
                  <div className="space-y-2 p-3 rounded-lg border border-black/5 bg-black/[0.02]">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={addTitle}
                        onChange={e => setAddTitle(e.target.value)}
                        placeholder="Tittel"
                        className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      />
                      <input
                        type="date"
                        value={addDate}
                        onChange={e => setAddDate(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={addValue}
                        onChange={e => setAddValue(e.target.value)}
                        placeholder="Verdi (valgfritt)"
                        className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      />
                      <input
                        type="text"
                        value={addUnit}
                        onChange={e => setAddUnit(e.target.value)}
                        placeholder="Enhet"
                        className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddEntry}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
                      >
                        {saving ? 'Lagrer...' : 'Lagre'}
                      </button>
                      <button
                        onClick={() => setAddingTo(null)}
                        className="text-xs"
                        style={{ color: 'rgba(12,50,48,0.4)' }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 6: Vaner (unchanged)
// =============================================================================

function VanerSection({
  userId,
  habits,
  supabase,
  toast,
  onHabitsChange,
}: {
  userId: string
  habits: Habit[]
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onHabitsChange: (habits: Habit[]) => void
}) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPaused, setShowPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('physical')
  const [newFrequency, setNewFrequency] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [newTimeOfDay, setNewTimeOfDay] = useState<'morning' | 'anytime' | 'evening'>('morning')

  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState<Category>('physical')
  const [editFrequency, setEditFrequency] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [editTimeOfDay, setEditTimeOfDay] = useState<'morning' | 'anytime' | 'evening'>('morning')

  const activeHabits = habits.filter(h => h.active)
  const pausedHabits = habits.filter(h => !h.active)

  const grouped = useMemo(() => {
    const map = new Map<Category, Habit[]>()
    for (const h of activeHabits) {
      if (!map.has(h.category)) map.set(h.category, [])
      map.get(h.category)!.push(h)
    }
    return map
  }, [activeHabits])

  function startEdit(h: Habit) {
    setEditingId(h.id)
    setEditTitle(h.title)
    setEditCategory(h.category)
    setEditFrequency(h.frequency)
    setEditTimeOfDay((h.time_of_day as 'morning' | 'anytime' | 'evening') ?? 'anytime')
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const { error } = await supabase.from('habits').update({
      title: editTitle, category: editCategory, frequency: editFrequency, time_of_day: editTimeOfDay,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast('Kunne ikke oppdatere', 'error'); return }
    onHabitsChange(habits.map(h => h.id === id ? { ...h, title: editTitle, category: editCategory, frequency: editFrequency, time_of_day: editTimeOfDay } : h))
    setEditingId(null)
    toast('Vane oppdatert', 'success')
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from('habits').update({ active }).eq('id', id)
    if (error) { toast('Kunne ikke oppdatere', 'error'); return }
    onHabitsChange(habits.map(h => h.id === id ? { ...h, active } : h))
    toast(active ? 'Vane aktivert' : 'Vane pauset', 'success')
  }

  async function deleteHabit(id: string) {
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (error) { toast('Kunne ikke slette', 'error'); return }
    onHabitsChange(habits.filter(h => h.id !== id))
    setDeleteConfirm(null)
    toast('Vane slettet', 'success')
  }

  async function createHabit() {
    if (!newTitle.trim()) { toast('Skriv inn et navn', 'error'); return }
    setSaving(true)
    const { data, error } = await supabase.from('habits').insert({
      user_id: userId, title: newTitle.trim(), category: newCategory,
      frequency: newFrequency, time_of_day: newTimeOfDay, target_count: 1, active: true,
    }).select().single()
    setSaving(false)
    if (error) { toast('Kunne ikke opprette', 'error'); return }
    onHabitsChange([...habits, data as Habit])
    setShowNewForm(false)
    setNewTitle('')
    toast('Ny vane opprettet', 'success')
  }

  const freqLabel: Record<string, string> = { daily: 'Daglig', weekdays: 'Hverdager', weekly: 'Ukentlig' }
  const timeLabel: Record<string, string> = { morning: 'Morgen', anytime: 'N\u00e5r som helst', evening: 'Kveld' }

  return (
    <SectionWrapper title="Vaner">
      {Array.from(grouped.entries()).map(([cat, catHabits]) => (
        <div key={cat}>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
            <span className="text-xs font-medium" style={{ color: 'rgba(12,50,48,0.5)' }}>{CATEGORY_LABELS[cat]}</span>
          </div>
          <div className="space-y-1.5">
            {catHabits.map(h => (
              <div key={h.id}>
                {editingId === h.id ? (
                  <div className="p-3 rounded-xl border border-[#3dbfb5]/30 bg-[#3dbfb5]/5 space-y-2.5">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
                      style={{ color: '#0c3230' }}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select value={editCategory} onChange={e => setEditCategory(e.target.value as Category)}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <select value={editFrequency} onChange={e => setEditFrequency(e.target.value as 'daily' | 'weekdays' | 'weekly')}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                        <option value="daily">Daglig</option>
                        <option value="weekdays">Hverdager</option>
                        <option value="weekly">Ukentlig</option>
                      </select>
                      <select value={editTimeOfDay} onChange={e => setEditTimeOfDay(e.target.value as 'morning' | 'anytime' | 'evening')}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                        <option value="morning">Morgen</option>
                        <option value="anytime">N\u00e5r som helst</option>
                        <option value="evening">Kveld</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(h.id)} disabled={saving}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-medium"
                        style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}>Lagre</button>
                      <button onClick={() => setEditingId(null)} className="text-xs" style={{ color: 'rgba(12,50,48,0.4)' }}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/5 bg-white">
                    <span className="text-sm flex-1" style={{ color: '#0c3230' }}>{h.title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(12,50,48,0.06)', color: 'rgba(12,50,48,0.5)' }}>{freqLabel[h.frequency]}</span>
                    {h.time_of_day && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(12,50,48,0.06)', color: 'rgba(12,50,48,0.5)' }}>{timeLabel[h.time_of_day]}</span>
                    )}
                    <button onClick={() => startEdit(h)} className="text-xs" style={{ color: '#3dbfb5' }}>Rediger</button>
                    <button onClick={() => toggleActive(h.id, false)} className="text-xs" style={{ color: 'rgba(12,50,48,0.35)' }}>Pause</button>
                    {deleteConfirm === h.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteHabit(h.id)} className="text-xs font-medium" style={{ color: '#f07070' }}>Bekreft</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs" style={{ color: 'rgba(12,50,48,0.4)' }}>Nei</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(h.id)} className="text-xs" style={{ color: 'rgba(12,50,48,0.25)' }}>Slett</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {activeHabits.length === 0 && (
        <p className="text-sm py-4 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>Ingen aktive vaner</p>
      )}

      {pausedHabits.length > 0 && (
        <div>
          <button onClick={() => setShowPaused(!showPaused)} className="text-xs font-medium" style={{ color: 'rgba(12,50,48,0.45)' }}>
            {showPaused ? 'Skjul' : 'Vis'} {pausedHabits.length} pauset{pausedHabits.length !== 1 ? 'e' : ''} vane{pausedHabits.length !== 1 ? 'r' : ''}
          </button>
          {showPaused && (
            <div className="mt-2 space-y-1.5">
              {pausedHabits.map(h => (
                <div key={h.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-black/5 bg-black/[0.02]">
                  <span className="text-sm flex-1" style={{ color: 'rgba(12,50,48,0.45)' }}>{h.title}</span>
                  <button onClick={() => toggleActive(h.id, true)} className="text-xs font-medium" style={{ color: '#3dbfb5' }}>Aktiver</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setShowNewForm(!showNewForm)}
        className="px-3.5 py-1.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}>Ny vane</button>
      {showNewForm && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Navn</label>
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="f.eks. Kalddusjing"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white" style={{ color: '#0c3230' }} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Kategori</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value as Category)}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Frekvens</label>
              <select value={newFrequency} onChange={e => setNewFrequency(e.target.value as 'daily' | 'weekdays' | 'weekly')}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                <option value="daily">Daglig</option>
                <option value="weekdays">Hverdager</option>
                <option value="weekly">Ukentlig</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Tid</label>
              <select value={newTimeOfDay} onChange={e => setNewTimeOfDay(e.target.value as 'morning' | 'anytime' | 'evening')}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white" style={{ color: '#0c3230' }}>
                <option value="morning">Morgen</option>
                <option value="anytime">N\u00e5r som helst</option>
                <option value="evening">Kveld</option>
              </select>
            </div>
          </div>
          <button onClick={createHabit} disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Oppretter...' : 'Opprett vane'}
          </button>
        </div>
      )}
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 7: Innstillinger (unchanged)
// =============================================================================

function InnstillingerSection({
  userEmail,
  supabase,
}: {
  userEmail: string
  supabase: ReturnType<typeof createClient>
}) {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const coachRules = `Du er Martin sitt personlige accountability-system. Du kjenner hans 10\u00e5rsvisjon, m\u00e5l og daglige rutiner. Din jobb er \u00e5 holde ham p\u00e5 sporet, v\u00e6re direkte og \u00e6rlig, og hjelpe ham med \u00e5 prioritere det som faktisk beveger n\u00e5len mot visjonen hans.

Regler:
\u2022 Snakk norsk (bokm\u00e5l), direkte og konsist
\u2022 Ikke bruk bindestreker som tegnsetting
\u2022 V\u00e6r \u00e6rlig, ogs\u00e5 n\u00e5r ting ikke g\u00e5r bra
\u2022 Fokuser alltid p\u00e5: hva er det viktigste \u00e5 gj\u00f8re N\u00c5 for \u00e5 komme n\u00e6rmere visjonen?
\u2022 Koble daglige handlinger til langsiktige m\u00e5l
\u2022 Ikke v\u00e6r en cheerleader, v\u00e6r en coach`

  return (
    <SectionWrapper title="Innstillinger" defaultOpen={false}>
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Innlogget som</p>
          <p className="text-sm" style={{ color: '#0c3230' }}>{userEmail}</p>
        </div>
        <button onClick={handleLogout}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border"
          style={{ borderColor: '#f07070', color: '#f07070' }}>Logg ut</button>
      </div>

      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Coaching-regler</p>
        <div className="p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
          style={{ backgroundColor: 'rgba(12,50,48,0.03)', color: 'rgba(12,50,48,0.7)', border: '1px solid rgba(12,50,48,0.06)' }}>
          {coachRules}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Installer som app</p>
        <div className="p-3 rounded-xl text-xs leading-relaxed space-y-1"
          style={{ backgroundColor: 'rgba(12,50,48,0.03)', color: 'rgba(12,50,48,0.6)', border: '1px solid rgba(12,50,48,0.06)' }}>
          <p><strong>iOS:</strong> \u00c5pne i Safari, trykk p\u00e5 del-ikonet, velg &quot;Legg til p\u00e5 Hjem-skjerm&quot;</p>
          <p><strong>Android:</strong> \u00c5pne i Chrome, trykk p\u00e5 menyen (tre prikker), velg &quot;Legg til p\u00e5 startskjerm&quot;</p>
          <p><strong>Desktop:</strong> Klikk p\u00e5 installer-ikonet i adressefeltet (Chrome/Edge)</p>
        </div>
      </div>
    </SectionWrapper>
  )
}
