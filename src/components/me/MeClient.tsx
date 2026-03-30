'use client'

import { useState, useMemo, useRef } from 'react'
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
} from '@/types'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts'

// =============================================================================
// Constants & Helpers
// =============================================================================

type SectionId = 'coach' | 'trender' | 'okonomi' | 'vaner' | 'innstillinger'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'coach', label: 'Coach-profil' },
  { id: 'trender', label: 'Trender' },
  { id: 'okonomi', label: 'Økonomi' },
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
  finance: 'Økonomi',
  family: 'Familie',
  lifestyle: 'Livsstil',
  brand: 'Brand',
}

const FREQ_DAYS: Record<string, number> = { monthly: 30, quarterly: 90, yearly: 365 }
const HEATMAP_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const DAY_LABELS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']

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

  const [activeSection, setActiveSection] = useState<SectionId>('coach')
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    coach: null, trender: null, okonomi: null, vaner: null, innstillinger: null,
  })

  // Local mutable state for data that changes via CRUD
  const [habits, setHabits] = useState(initialHabits)
  const [financeEntries, setFinanceEntries] = useState(initialFinanceEntries)
  const [financeTargets, setFinanceTargets] = useState(initialFinanceTargets)

  // Derived data
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

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0c3230' }}>Meg</h1>
        <p className="text-sm mt-0.5" style={{ color: 'rgba(12,50,48,0.5)' }}>{userEmail}</p>
      </div>

      {/* Section tabs */}
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

      {/* Sections */}
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
        <TrenderSection
          scores={scores}
          habits={habits}
          completions={completions}
        />
      </div>

      <div ref={el => { sectionRefs.current.okonomi = el }}>
        <OkonomiSection
          userId={userId}
          financeEntries={financeEntries}
          financeTargets={financeTargets}
          supabase={supabase}
          toast={toast}
          onEntriesChange={setFinanceEntries}
          onTargetsChange={setFinanceTargets}
        />
      </div>

      <div ref={el => { sectionRefs.current.vaner = el }}>
        <VanerSection
          userId={userId}
          habits={habits}
          supabase={supabase}
          toast={toast}
          onHabitsChange={setHabits}
        />
      </div>

      <div ref={el => { sectionRefs.current.innstillinger = el }}>
        <InnstillingerSection
          userEmail={userEmail}
          supabase={supabase}
        />
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
          ▼
        </span>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </section>
  )
}

// =============================================================================
// SECTION 1: Coach-profil
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

  // Profile health
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
    if (error) {
      toast('Kunne ikke lagre', 'error')
      return
    }
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
      if (error) {
        toast('Kunne ikke lagre', 'error')
        return
      }
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
      {/* Profile health bar */}
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

      {/* Check-in progress */}
      {checkinMode && (
        <div className="text-sm font-medium" style={{ color: '#3dbfb5' }}>
          Steg {checkinStep + 1} av {modulesNeedingUpdate.length}
        </div>
      )}

      {/* Module grid */}
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
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium truncate" style={{ color: '#0c3230' }}>
                        {mod.title}
                      </span>
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(12,50,48,0.4)' }}>
                      {snap ? relativeDate(snap.created_at) : 'Ikke utfylt'}
                    </p>
                  </div>
                </div>
              </button>

              {/* Expanded editor */}
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

                  {/* Snapshot history */}
                  {showHistory && !checkinMode && (
                    <div className="space-y-2 pt-2 border-t border-black/5">
                      <p className="text-xs font-medium" style={{ color: 'rgba(12,50,48,0.5)' }}>Historikk</p>
                      {(allSnapshotsByModule[mod.id] ?? []).slice(0, 5).map(s => (
                        <div
                          key={s.id}
                          className="text-xs p-2.5 rounded-lg bg-black/[0.02] space-y-1"
                        >
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
// SECTION 2: Trender
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

  // Category score line chart data
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

  // Habit heatmap (12 weeks)
  const heatmapData = useMemo(() => {
    const now = new Date()
    const weeks: { date: string; count: number; total: number }[][] = []
    const activeHabits = habits.filter(h => h.active)
    const totalPerDay = activeHabits.length

    // Build completion count map
    const completionMap = new Map<string, number>()
    for (const c of completions) {
      completionMap.set(c.completed_date, (completionMap.get(c.completed_date) ?? 0) + 1)
    }

    // Go back 12 weeks, align to Monday
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

  // Month labels for heatmap
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
      {/* Score chart */}
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
          <p className="text-sm py-8 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>
            Ingen score-data enn\u00e5
          </p>
        )}
      </div>

      {/* Habit heatmap */}
      <div>
        <p className="text-sm font-medium mb-3" style={{ color: 'rgba(12,50,48,0.6)' }}>Vane-aktivitet (12 uker)</p>
        {heatmapData.length > 0 ? (
          <div className="overflow-x-auto">
            {/* Month labels */}
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
              {/* Day labels */}
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
              {/* Grid */}
              {heatmapData.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => {
                    const ratio = day.total > 0 ? day.count / day.total : 0
                    let colorIdx = 0
                    if (ratio > 0 && ratio <= 0.25) colorIdx = 1
                    else if (ratio > 0.25 && ratio <= 0.5) colorIdx = 2
                    else if (ratio > 0.5 && ratio <= 0.75) colorIdx = 3
                    else if (ratio > 0.75) colorIdx = 4

                    // Don't color future days
                    const isFuture = new Date(day.date) > new Date()

                    return (
                      <div
                        key={di}
                        className="rounded-sm"
                        style={{
                          width: 14,
                          height: 14,
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
          <p className="text-sm py-8 text-center" style={{ color: 'rgba(12,50,48,0.3)' }}>
            Ingen vane-data enn\u00e5
          </p>
        )}
      </div>
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 3: Økonomi
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
  const [showCsvImport, setShowCsvImport] = useState(false)
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

  // CSV import state
  const [csvRows, setCsvRows] = useState<{ date: string; amount: number; category: string; description: string }[]>([])
  const [importingCsv, setImportingCsv] = useState(false)

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

  // Spending by category (bar chart)
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
        category: cat,
        utgifter: amount,
        budsjett: budgetMap.get(cat) ?? 0,
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
      user_id: userId,
      date: addDate,
      amount,
      category: addCategory,
      description: addDescription || null,
      source: 'manual',
    }).select().single()
    setSaving(false)
    if (error) {
      toast('Kunne ikke lagre', 'error')
      return
    }
    onEntriesChange([data as FinanceEntry, ...financeEntries])
    setShowAddForm(false)
    setAddAmount('')
    setAddCategory('')
    setAddDescription('')
    toast('Transaksjon lagt til', 'success')
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      // Skip header
      const rows = lines.slice(1).map(line => {
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''))
        return {
          date: parts[0] ?? '',
          amount: Number(parts[1]) || 0,
          category: parts[2] ?? '',
          description: parts[3] ?? '',
        }
      }).filter(r => r.date && r.amount !== 0)
      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  async function importCsv() {
    if (csvRows.length === 0) return
    setImportingCsv(true)
    const inserts = csvRows.map(r => ({
      user_id: userId,
      date: r.date,
      amount: r.amount,
      category: r.category,
      description: r.description || null,
      source: 'csv_import',
    }))
    const { data, error } = await supabase.from('finance_entries').insert(inserts).select()
    setImportingCsv(false)
    if (error) {
      toast('Import feilet', 'error')
      return
    }
    onEntriesChange([...(data as FinanceEntry[]), ...financeEntries])
    setCsvRows([])
    setShowCsvImport(false)
    toast(`${data?.length ?? 0} rader importert`, 'success')
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
    const { error } = await supabase
      .from('finance_targets')
      .update(updates)
      .eq('id', target.id)
    if (error) {
      toast('Kunne ikke oppdatere', 'error')
      return
    }
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
          onClick={() => { setShowAddForm(!showAddForm); setShowCsvImport(false); setShowBudgetEdit(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
        >
          Legg til manuelt
        </button>
        <button
          onClick={() => { setShowCsvImport(!showCsvImport); setShowAddForm(false); setShowBudgetEdit(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-black/10"
          style={{ color: '#0c3230' }}
        >
          Importer CSV
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
          onClick={() => { setShowBudgetEdit(!showBudgetEdit); setShowAddForm(false); setShowCsvImport(false) }}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-black/10"
          style={{ color: '#0c3230' }}
        >
          Rediger budsjett
        </button>
      </div>

      {/* Add manual entry form */}
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
            <input
              type="text"
              value={addCategory}
              onChange={e => setAddCategory(e.target.value)}
              placeholder="f.eks. mat, transport, l\u00f8nn"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
              style={{ color: '#0c3230' }}
            />
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

      {/* CSV import */}
      {showCsvImport && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <p className="text-xs" style={{ color: 'rgba(12,50,48,0.5)' }}>
            Forventet format: date, amount, category, description (CSV med header)
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleCsvFile}
            className="text-sm"
          />
          {csvRows.length > 0 && (
            <>
              <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {csvRows.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex gap-2" style={{ color: '#0c3230' }}>
                    <span>{r.date}</span>
                    <span className={r.amount < 0 ? 'text-red-500' : 'text-green-600'}>
                      {formatCurrency(r.amount)}
                    </span>
                    <span>{r.category}</span>
                  </div>
                ))}
                {csvRows.length > 5 && (
                  <p style={{ color: 'rgba(12,50,48,0.4)' }}>...og {csvRows.length - 5} rader til</p>
                )}
              </div>
              <button
                onClick={importCsv}
                disabled={importingCsv}
                className="w-full py-2 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: importingCsv ? 0.6 : 1 }}
              >
                {importingCsv ? 'Importerer...' : `Importer ${csvRows.length} rader`}
              </button>
            </>
          )}
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
// SECTION 4: Vaner
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

  // New habit form state
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState<Category>('physical')
  const [newFrequency, setNewFrequency] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [newTimeOfDay, setNewTimeOfDay] = useState<'morning' | 'anytime' | 'evening'>('morning')

  // Edit state
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState<Category>('physical')
  const [editFrequency, setEditFrequency] = useState<'daily' | 'weekdays' | 'weekly'>('daily')
  const [editTimeOfDay, setEditTimeOfDay] = useState<'morning' | 'anytime' | 'evening'>('morning')

  const activeHabits = habits.filter(h => h.active)
  const pausedHabits = habits.filter(h => !h.active)

  // Group by category
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
      title: editTitle,
      category: editCategory,
      frequency: editFrequency,
      time_of_day: editTimeOfDay,
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
      user_id: userId,
      title: newTitle.trim(),
      category: newCategory,
      frequency: newFrequency,
      time_of_day: newTimeOfDay,
      target_count: 1,
      active: true,
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
      {/* Active habits grouped by category */}
      {Array.from(grouped.entries()).map(([cat, catHabits]) => (
        <div key={cat}>
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
            />
            <span className="text-xs font-medium" style={{ color: 'rgba(12,50,48,0.5)' }}>
              {CATEGORY_LABELS[cat]}
            </span>
          </div>
          <div className="space-y-1.5">
            {catHabits.map(h => (
              <div key={h.id}>
                {editingId === h.id ? (
                  /* Edit mode */
                  <div className="p-3 rounded-xl border border-[#3dbfb5]/30 bg-[#3dbfb5]/5 space-y-2.5">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
                      style={{ color: '#0c3230' }}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value as Category)}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      >
                        {CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      <select
                        value={editFrequency}
                        onChange={e => setEditFrequency(e.target.value as 'daily' | 'weekdays' | 'weekly')}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      >
                        <option value="daily">Daglig</option>
                        <option value="weekdays">Hverdager</option>
                        <option value="weekly">Ukentlig</option>
                      </select>
                      <select
                        value={editTimeOfDay}
                        onChange={e => setEditTimeOfDay(e.target.value as 'morning' | 'anytime' | 'evening')}
                        className="px-2 py-1.5 rounded-lg border border-black/10 text-xs bg-white"
                        style={{ color: '#0c3230' }}
                      >
                        <option value="morning">Morgen</option>
                        <option value="anytime">N\u00e5r som helst</option>
                        <option value="evening">Kveld</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(h.id)}
                        disabled={saving}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-medium"
                        style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
                      >
                        Lagre
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs"
                        style={{ color: 'rgba(12,50,48,0.4)' }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-black/5 bg-white">
                    <span className="text-sm flex-1" style={{ color: '#0c3230' }}>{h.title}</span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(12,50,48,0.06)', color: 'rgba(12,50,48,0.5)' }}
                    >
                      {freqLabel[h.frequency]}
                    </span>
                    {h.time_of_day && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(12,50,48,0.06)', color: 'rgba(12,50,48,0.5)' }}
                      >
                        {timeLabel[h.time_of_day]}
                      </span>
                    )}
                    <button onClick={() => startEdit(h)} className="text-xs" style={{ color: '#3dbfb5' }}>
                      Rediger
                    </button>
                    <button onClick={() => toggleActive(h.id, false)} className="text-xs" style={{ color: 'rgba(12,50,48,0.35)' }}>
                      Pause
                    </button>
                    {deleteConfirm === h.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteHabit(h.id)} className="text-xs font-medium" style={{ color: '#f07070' }}>
                          Bekreft
                        </button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs" style={{ color: 'rgba(12,50,48,0.4)' }}>
                          Nei
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(h.id)} className="text-xs" style={{ color: 'rgba(12,50,48,0.25)' }}>
                        Slett
                      </button>
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

      {/* Paused habits */}
      {pausedHabits.length > 0 && (
        <div>
          <button
            onClick={() => setShowPaused(!showPaused)}
            className="text-xs font-medium"
            style={{ color: 'rgba(12,50,48,0.45)' }}
          >
            {showPaused ? 'Skjul' : 'Vis'} {pausedHabits.length} pauset{pausedHabits.length !== 1 ? 'e' : ''} vane{pausedHabits.length !== 1 ? 'r' : ''}
          </button>
          {showPaused && (
            <div className="mt-2 space-y-1.5">
              {pausedHabits.map(h => (
                <div key={h.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-black/5 bg-black/[0.02]">
                  <span className="text-sm flex-1" style={{ color: 'rgba(12,50,48,0.45)' }}>{h.title}</span>
                  <button
                    onClick={() => toggleActive(h.id, true)}
                    className="text-xs font-medium"
                    style={{ color: '#3dbfb5' }}
                  >
                    Aktiver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New habit form */}
      <button
        onClick={() => setShowNewForm(!showNewForm)}
        className="px-3.5 py-1.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
      >
        Ny vane
      </button>
      {showNewForm && (
        <div className="space-y-3 p-4 rounded-xl border border-black/5 bg-black/[0.02]">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Navn</label>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="f.eks. Kalddusjing"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm bg-white"
              style={{ color: '#0c3230' }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Kategori</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value as Category)}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white"
                style={{ color: '#0c3230' }}
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Frekvens</label>
              <select
                value={newFrequency}
                onChange={e => setNewFrequency(e.target.value as 'daily' | 'weekdays' | 'weekly')}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white"
                style={{ color: '#0c3230' }}
              >
                <option value="daily">Daglig</option>
                <option value="weekdays">Hverdager</option>
                <option value="weekly">Ukentlig</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'rgba(12,50,48,0.6)' }}>Tid</label>
              <select
                value={newTimeOfDay}
                onChange={e => setNewTimeOfDay(e.target.value as 'morning' | 'anytime' | 'evening')}
                className="w-full px-2 py-2 rounded-lg border border-black/10 text-xs bg-white"
                style={{ color: '#0c3230' }}
              >
                <option value="morning">Morgen</option>
                <option value="anytime">N\u00e5r som helst</option>
                <option value="evening">Kveld</option>
              </select>
            </div>
          </div>
          <button
            onClick={createHabit}
            disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Oppretter...' : 'Opprett vane'}
          </button>
        </div>
      )}
    </SectionWrapper>
  )
}

// =============================================================================
// SECTION 5: Innstillinger
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
      {/* Login info */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Innlogget som</p>
          <p className="text-sm" style={{ color: '#0c3230' }}>{userEmail}</p>
        </div>
        <button
          onClick={handleLogout}
          className="px-3.5 py-1.5 rounded-full text-xs font-medium border"
          style={{ borderColor: '#f07070', color: '#f07070' }}
        >
          Logg ut
        </button>
      </div>

      {/* Coaching rules */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Coaching-regler</p>
        <div
          className="p-3 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
          style={{ backgroundColor: 'rgba(12,50,48,0.03)', color: 'rgba(12,50,48,0.7)', border: '1px solid rgba(12,50,48,0.06)' }}
        >
          {coachRules}
        </div>
      </div>

      {/* PWA info */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'rgba(12,50,48,0.5)' }}>Installer som app</p>
        <div
          className="p-3 rounded-xl text-xs leading-relaxed space-y-1"
          style={{ backgroundColor: 'rgba(12,50,48,0.03)', color: 'rgba(12,50,48,0.6)', border: '1px solid rgba(12,50,48,0.06)' }}
        >
          <p><strong>iOS:</strong> \u00c5pne i Safari, trykk p\u00e5 del-ikonet, velg &quot;Legg til p\u00e5 Hjem-skjerm&quot;</p>
          <p><strong>Android:</strong> \u00c5pne i Chrome, trykk p\u00e5 menyen (tre prikker), velg &quot;Legg til p\u00e5 startskjerm&quot;</p>
          <p><strong>Desktop:</strong> Klikk p\u00e5 installer-ikonet i adressefeltet (Chrome/Edge)</p>
        </div>
      </div>
    </SectionWrapper>
  )
}
