'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { ContextModule, ContextModuleField, ContextSnapshot } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View =
  | { kind: 'overview' }
  | { kind: 'editor'; moduleId: string }
  | { kind: 'checkin'; step: number; modulesToUpdate: string[] }
  | { kind: 'onboarding'; step: number }

type SnapshotMap = Record<string, ContextSnapshot | undefined>
type FieldsByModule = Record<string, ContextModuleField[]>
type AllSnapshotsMap = Record<string, ContextSnapshot[]>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FREQ_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  yearly: 365,
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeDate(dateStr: string): string {
  const days = daysSince(dateStr)
  if (days === 0) return 'I dag'
  if (days === 1) return 'I g\u00e5r'
  if (days < 7) return `${days} dager siden`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} ${weeks === 1 ? 'uke' : 'uker'} siden`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} ${months === 1 ? 'm\u00e5ned' : 'm\u00e5neder'} siden`
  }
  return formatDate(dateStr)
}

function statusColor(mod: ContextModule, snapshot: ContextSnapshot | undefined): string {
  if (!snapshot) return '#d1d5db' // gray
  const days = daysSince(snapshot.created_at)
  const freq = FREQ_DAYS[mod.update_frequency] ?? 30
  if (days <= freq * 0.75) return '#b8f04a' // green
  if (days <= freq) return '#f0c74a' // yellow
  return '#f07070' // red
}

function isOverdue(mod: ContextModule, snapshot: ContextSnapshot | undefined): boolean {
  if (!snapshot) return true
  const days = daysSince(snapshot.created_at)
  const freq = FREQ_DAYS[mod.update_frequency] ?? 30
  return days > freq * 0.75
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsClient() {
  const supabase = createClient()
  const { toast } = useToast()

  // Data state
  const [modules, setModules] = useState<ContextModule[]>([])
  const [fieldsByModule, setFieldsByModule] = useState<FieldsByModule>({})
  const [latestSnapshots, setLatestSnapshots] = useState<SnapshotMap>({})
  const [allSnapshots, setAllSnapshots] = useState<AllSnapshotsMap>({})
  const [loading, setLoading] = useState(true)

  // View state
  const [view, setView] = useState<View>({ kind: 'overview' })

  // Editor state
  const [editorValues, setEditorValues] = useState<Record<string, string | number | string[]>>({})
  const [saving, setSaving] = useState(false)
  const [onboardingStarted, setOnboardingStarted] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  // Check-in state
  const [checkinChanges, setCheckinChanges] = useState<Record<string, 'confirmed' | 'updated'>>({})
  const [checkinEditing, setCheckinEditing] = useState(false)

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [modulesRes, fieldsRes, snapshotsRes] = await Promise.all([
      supabase.from('context_modules').select('*').order('sort_order'),
      supabase.from('context_module_fields').select('*').order('sort_order'),
      supabase.from('context_snapshots').select('*').order('created_at', { ascending: false }),
    ])

    const mods: ContextModule[] = modulesRes.data ?? []
    const fields: ContextModuleField[] = fieldsRes.data ?? []
    const snaps: ContextSnapshot[] = snapshotsRes.data ?? []

    setModules(mods)

    // Group fields by module
    const fbm: FieldsByModule = {}
    for (const f of fields) {
      if (!fbm[f.module_id]) fbm[f.module_id] = []
      fbm[f.module_id].push(f)
    }
    setFieldsByModule(fbm)

    // Latest snapshot per module + all snapshots per module
    const latest: SnapshotMap = {}
    const all: AllSnapshotsMap = {}
    for (const s of snaps) {
      if (!all[s.module_id]) all[s.module_id] = []
      all[s.module_id].push(s)
      if (!latest[s.module_id]) latest[s.module_id] = s
    }
    setLatestSnapshots(latest)
    setAllSnapshots(all)

    setLoading(false)

    // If no snapshots at all, start onboarding
    if (snaps.length === 0 && mods.length > 0) {
      setView({ kind: 'onboarding', step: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function openEditor(moduleId: string) {
    const snap = latestSnapshots[moduleId]
    setEditorValues(snap ? { ...snap.values } : {})
    setShowHistory(false)
    setView({ kind: 'editor', moduleId })
  }

  async function saveSnapshot(moduleId: string, values: Record<string, string | number | string[]>) {
    setSaving(true)
    const { error } = await supabase.from('context_snapshots').insert({
      module_id: moduleId,
      values,
    })
    if (error) {
      toast('Kunne ikke lagre modulen', 'error')
      setSaving(false)
      return false
    }

    // Clear the API cache
    await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'ping', clearCache: true }),
    }).catch(() => {})

    setSaving(false)
    return true
  }

  async function handleEditorSave(moduleId: string) {
    const ok = await saveSnapshot(moduleId, editorValues)
    if (ok) {
      toast('Modul oppdatert', 'success')
      await fetchData()
      setView({ kind: 'overview' })
    }
  }

  function startCheckin() {
    const needsUpdate = modules.filter(m => isOverdue(m, latestSnapshots[m.id])).map(m => m.id)
    if (needsUpdate.length === 0) return
    setCheckinChanges({})
    setCheckinEditing(false)
    setView({ kind: 'checkin', step: 0, modulesToUpdate: needsUpdate })
  }

  async function checkinConfirm(moduleId: string) {
    const snap = latestSnapshots[moduleId]
    const values = snap ? { ...snap.values } : {}
    const ok = await saveSnapshot(moduleId, values)
    if (ok) {
      setCheckinChanges(prev => ({ ...prev, [moduleId]: 'confirmed' }))
      advanceCheckin()
    }
  }

  function checkinEdit(moduleId: string) {
    const snap = latestSnapshots[moduleId]
    setEditorValues(snap ? { ...snap.values } : {})
  }

  async function checkinSaveAndAdvance(moduleId: string) {
    const ok = await saveSnapshot(moduleId, editorValues)
    if (ok) {
      setCheckinChanges(prev => ({ ...prev, [moduleId]: 'updated' }))
      advanceCheckin()
    }
  }

  function advanceCheckin() {
    if (view.kind !== 'checkin') return
    setCheckinEditing(false)
    const next = view.step + 1
    if (next >= view.modulesToUpdate.length) {
      // Show summary by setting step to length (signals "done")
      setView({ ...view, step: next })
      fetchData()
    } else {
      setView({ ...view, step: next })
    }
  }

  async function onboardingSaveAndAdvance(step: number) {
    const mod = modules[step]
    if (!mod) return
    const ok = await saveSnapshot(mod.id, editorValues)
    if (ok) {
      const next = step + 1
      if (next >= modules.length) {
        setView({ kind: 'onboarding', step: next })
        await fetchData()
      } else {
        setEditorValues({})
        setView({ kind: 'onboarding', step: next })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Field rendering helpers
  // ---------------------------------------------------------------------------

  function renderField(field: ContextModuleField, values: Record<string, string | number | string[]>, onChange: (slug: string, val: string | number | string[]) => void) {
    const value = values[field.slug]

    switch (field.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={e => onChange(field.slug, e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-gray-400"
          />
        )
      case 'textarea':
        return (
          <AutoGrowTextarea
            value={(value as string) ?? ''}
            onChange={val => onChange(field.slug, val)}
          />
        )
      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={e => onChange(field.slug, e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-gray-400"
          />
        )
      case 'select':
        return (
          <select
            value={(value as string) ?? ''}
            onChange={e => onChange(field.slug, e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-gray-400 bg-white"
          >
            <option value="">Velg...</option>
            {(field.options ?? []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      case 'multi_select': {
        const selected = Array.isArray(value) ? value : []
        return (
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map(opt => {
              const isSelected = selected.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = isSelected
                      ? selected.filter(s => s !== opt)
                      : [...selected, opt]
                    onChange(field.slug, next)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    isSelected
                      ? 'border-[#0c3230] bg-[#0c3230] text-[#b8f04a]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        )
      }
      default:
        return null
    }
  }

  function renderFieldsForm(moduleId: string, values: Record<string, string | number | string[]>, onChange: (slug: string, val: string | number | string[]) => void) {
    const fields = fieldsByModule[moduleId] ?? []
    return (
      <div className="space-y-5">
        {fields.map(field => (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{field.label}</label>
            {renderField(field, values, onChange)}
          </div>
        ))}
      </div>
    )
  }

  function renderSnapshotValues(snap: ContextSnapshot, moduleId: string) {
    const fields = fieldsByModule[moduleId] ?? []
    return (
      <div className="space-y-2">
        {fields.map(field => {
          const val = snap.values[field.slug]
          if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) return null
          return (
            <div key={field.slug} className="text-sm">
              <span className="font-medium text-gray-600">{field.label}:</span>{' '}
              <span className="text-gray-800">
                {Array.isArray(val) ? val.join(', ') : String(val)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Onboarding
  // ---------------------------------------------------------------------------

  if (view.kind === 'onboarding') {
    // Completed
    if (view.step >= modules.length) {
      return (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Profilen din er klar!</h2>
          <p className="text-sm text-gray-500 mb-8">Coachen kjenner deg n\u00e5.</p>
          <a
            href="/"
            className="inline-block text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            G\u00e5 til dashboard
          </a>
        </div>
      )
    }

    // Welcome screen (step 0 and no interaction yet)
    const mod = modules[view.step]
    const progress = ((view.step) / modules.length) * 100

    return (
      <div className="max-w-xl mx-auto">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>Modul {view.step + 1} av {modules.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: '#b8f04a' }}
            />
          </div>
        </div>

        {view.step === 0 && !onboardingStarted ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Velkommen til Life OS!</h2>
            <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              For at coachen din skal gi deg gode r\u00e5d, trenger den \u00e5 kjenne deg. Bruk 10 minutter p\u00e5 \u00e5 fylle ut profilen din.
            </p>
            <button
              onClick={() => { setOnboardingStarted(true); setEditorValues({}) }}
              className="text-sm font-semibold px-8 py-3 rounded-xl transition-colors"
              style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
            >
              Kom i gang
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{mod.icon}</span>
              <h2 className="text-lg font-bold text-gray-900">{mod.title}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">{mod.description}</p>

            {renderFieldsForm(mod.id, editorValues, (slug, val) => {
              setEditorValues(prev => ({ ...prev, [slug]: val }))
            })}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => onboardingSaveAndAdvance(view.step)}
                disabled={saving}
                className="text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
              >
                {saving ? 'Lagrer...' : view.step === modules.length - 1 ? 'Fullf\u00f8r' : 'Neste'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Module Editor
  // ---------------------------------------------------------------------------

  if (view.kind === 'editor') {
    const mod = modules.find(m => m.id === view.moduleId)
    if (!mod) return null
    const moduleSnapshots = allSnapshots[mod.id] ?? []

    return (
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <button
          onClick={() => setView({ kind: 'overview' })}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Tilbake
        </button>

        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <span className="text-2xl">{mod.icon}</span>
            <h2 className="text-lg font-bold text-gray-900">{mod.title}</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">{mod.description}</p>

          {renderFieldsForm(mod.id, editorValues, (slug, val) => {
            setEditorValues(prev => ({ ...prev, [slug]: val }))
          })}

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => handleEditorSave(mod.id)}
              disabled={saving}
              className="text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
            >
              {saving ? 'Lagrer...' : 'Lagre'}
            </button>
            <button
              onClick={() => setView({ kind: 'overview' })}
              className="text-sm font-medium px-4 py-2.5 rounded-xl text-gray-500 hover:text-gray-700 transition-colors"
            >
              Avbryt
            </button>
          </div>
        </div>

        {/* History */}
        {moduleSnapshots.length > 0 && (
          <div className="mt-6 bg-white border border-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>Se historikk ({moduleSnapshots.length})</span>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showHistory && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {moduleSnapshots.map(snap => (
                  <div key={snap.id} className="px-5 py-4">
                    <p className="text-xs text-gray-400 mb-2">{formatDate(snap.created_at)}</p>
                    {renderSnapshotValues(snap, mod.id)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Monthly Check-in
  // ---------------------------------------------------------------------------

  if (view.kind === 'checkin') {
    const { step, modulesToUpdate } = view

    // Summary screen
    if (step >= modulesToUpdate.length) {
      return (
        <div className="max-w-xl mx-auto text-center py-12">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Check-in fullf\u00f8rt!</h2>
          <div className="text-left bg-white border border-gray-100 rounded-xl p-5 mb-8">
            {modulesToUpdate.map(mid => {
              const mod = modules.find(m => m.id === mid)
              if (!mod) return null
              const action = checkinChanges[mid]
              return (
                <div key={mid} className="flex items-center gap-3 py-2">
                  <span className="text-lg">{mod.icon}</span>
                  <span className="text-sm font-medium text-gray-800 flex-1">{mod.title}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    action === 'updated'
                      ? 'bg-[#b8f04a]/20 text-[#0c3230]'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {action === 'updated' ? 'Oppdatert' : 'Bekreftet'}
                  </span>
                </div>
              )
            })}
          </div>
          <button
            onClick={() => { fetchData(); setView({ kind: 'overview' }) }}
            className="text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            Tilbake til innstillinger
          </button>
        </div>
      )
    }

    const currentModuleId = modulesToUpdate[step]
    const mod = modules.find(m => m.id === currentModuleId)
    if (!mod) return null

    const snap = latestSnapshots[currentModuleId]
    const progress = ((step) / modulesToUpdate.length) * 100

    return (
      <div className="max-w-xl mx-auto">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>Modul {step + 1} av {modulesToUpdate.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: '#b8f04a' }}
            />
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{mod.icon}</span>
            <h2 className="text-lg font-bold text-gray-900">{mod.title}</h2>
          </div>

          {!checkinEditing ? (
            <>
              {/* Show current values */}
              {snap ? (
                <div className="bg-gray-50 rounded-lg p-4 mb-5">
                  {renderSnapshotValues(snap, mod.id)}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-5">Ingen data enn\u00e5.</p>
              )}

              <p className="text-sm font-medium text-gray-700 mb-4">Stemmer dette fortsatt?</p>

              <div className="flex gap-3">
                <button
                  onClick={() => checkinConfirm(currentModuleId)}
                  disabled={saving}
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
                >
                  {saving ? 'Lagrer...' : 'Ja, bekreft'}
                </button>
                <button
                  onClick={() => {
                    checkinEdit(currentModuleId)
                    setCheckinEditing(true)
                  }}
                  className="text-sm font-medium px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:border-gray-300 transition-colors"
                >
                  Nei, oppdater
                </button>
              </div>
            </>
          ) : (
            <>
              {renderFieldsForm(mod.id, editorValues, (slug, val) => {
                setEditorValues(prev => ({ ...prev, [slug]: val }))
              })}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={async () => {
                    await checkinSaveAndAdvance(currentModuleId)
                    setCheckinEditing(false)
                  }}
                  disabled={saving}
                  className="text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
                >
                  {saving ? 'Lagrer...' : 'Lagre og g\u00e5 videre'}
                </button>
                <button
                  onClick={() => setCheckinEditing(false)}
                  className="text-sm font-medium px-4 py-2.5 rounded-xl text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Avbryt
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Overview (default)
  // ---------------------------------------------------------------------------

  const totalModules = modules.length
  const upToDateModules = modules.filter(m => {
    const snap = latestSnapshots[m.id]
    if (!snap) return false
    const days = daysSince(snap.created_at)
    const freq = FREQ_DAYS[m.update_frequency] ?? 30
    return days <= freq
  }).length
  const healthPercent = totalModules > 0 ? Math.round((upToDateModules / totalModules) * 100) : 0
  const needsCheckin = modules.some(m => isOverdue(m, latestSnapshots[m.id]))

  return (
    <div className="space-y-6">
      {/* Profile health indicator */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">Profil-helse</p>
            <p className="text-xs text-gray-400 mt-0.5">{upToDateModules} av {totalModules} moduler oppdatert</p>
          </div>
          <span className="text-2xl font-bold" style={{ color: '#0c3230' }}>{healthPercent}%</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${healthPercent}%`, backgroundColor: '#b8f04a' }}
          />
        </div>

        {needsCheckin && (
          <button
            onClick={startCheckin}
            className="mt-4 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors w-full sm:w-auto"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            M\u00e5nedlig check-in
          </button>
        )}
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {modules.map(mod => {
          const snap = latestSnapshots[mod.id]
          const color = statusColor(mod, snap)

          return (
            <button
              key={mod.id}
              onClick={() => openEditor(mod.id)}
              className="bg-white border rounded-xl p-4 text-left hover:shadow-sm transition-all group"
              style={{ borderColor: color, borderWidth: '1.5px' }}
            >
              <span className="text-2xl block mb-2">{mod.icon}</span>
              <p className="text-sm font-semibold text-gray-900 mb-1">{mod.title}</p>
              <p className="text-xs text-gray-400 line-clamp-2 mb-3">{mod.description}</p>
              <p className="text-xs" style={{ color: snap ? '#6b7280' : '#9ca3af' }}>
                {snap ? `Sist oppdatert: ${relativeDate(snap.created_at)}` : 'Ikke utfylt'}
              </p>
            </button>
          )
        })}
      </div>

      {/* Info section */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0c3230' }}>
        <p className="text-sm font-semibold text-white mb-2">Hvordan profilmodulene brukes</p>
        <div className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
          <p>Modulene gir coachen din kontekst om hvem du er, hva du jobber med, og hvor du st\u00e5r i livet. Jo mer oppdatert profilen er, jo bedre r\u00e5d f\u00e5r du.</p>
          <p>Bruk m\u00e5nedlig check-in for \u00e5 holde alt oppdatert uten mye arbeid.</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AutoGrowTextarea sub-component
// ---------------------------------------------------------------------------

function AutoGrowTextarea({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${Math.max(80, ref.current.scrollHeight)}px`
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 leading-relaxed focus:outline-none focus:border-gray-400 resize-none"
      style={{ minHeight: '80px' }}
    />
  )
}
