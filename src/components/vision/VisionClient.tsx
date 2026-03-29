'use client'

import { useState } from 'react'
import type { Vision, VisionCategory, Milestone } from '@/types'
import { CATEGORIES, CATEGORY_MAP } from '@/types'
import { useClaudeAPI, ClaudeResponseDark } from '@/components/ui/ClaudeResponse'
import { createClient } from '@/lib/supabase'

interface YearMilestone {
  year: number
  category: string
  milestone: string
}

interface VisionClientProps {
  vision: Vision | null
  categories: VisionCategory[]
  timeline: Milestone[]
  userId?: string
}

export function VisionClient({ vision: initialVision, categories: initialCategories, timeline: initialTimeline }: VisionClientProps) {
  const claude = useClaudeAPI()
  const supabase = createClient()
  const [breakdownData, setBreakdownData] = useState<YearMilestone[] | null>(null)

  // Vision edit state
  const [vision, setVision] = useState(initialVision)
  const [editingVision, setEditingVision] = useState(false)
  const [visionDraft, setVisionDraft] = useState(initialVision?.description ?? '')
  const [visionSaving, setVisionSaving] = useState(false)

  // Category edit state
  const [categories, setCategories] = useState(initialCategories)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [catDraft, setCatDraft] = useState({ description: '', target_state: '' })
  const [catSaving, setCatSaving] = useState(false)

  // Timeline state
  const [timeline, setTimeline] = useState(initialTimeline)
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [milestoneDraft, setMilestoneDraft] = useState({ title: '', description: '', target_date: '' })
  const [milestoneSaving, setMilestoneSaving] = useState(false)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [milestoneEditDraft, setMilestoneEditDraft] = useState({ title: '', description: '' })

  // Save vision description
  async function saveVision() {
    if (!vision) return
    setVisionSaving(true)
    try {
      const { data, error } = await supabase
        .from('vision')
        .update({ description: visionDraft, updated_at: new Date().toISOString() })
        .eq('id', vision.id)
        .select()
        .single()
      if (error) throw error
      setVision(data as Vision)
      setEditingVision(false)
    } catch (err) {
      console.error('Feil ved lagring av visjon:', err)
    } finally {
      setVisionSaving(false)
    }
  }

  // Save category edit
  async function saveCategory(catId: string) {
    setCatSaving(true)
    try {
      const { data, error } = await supabase
        .from('vision_categories')
        .update({ description: catDraft.description, target_state: catDraft.target_state })
        .eq('id', catId)
        .select()
        .single()
      if (error) throw error
      setCategories(prev => prev.map(c => c.id === catId ? data as VisionCategory : c))
      setEditingCatId(null)
    } catch (err) {
      console.error('Feil ved lagring av kategori:', err)
    } finally {
      setCatSaving(false)
    }
  }

  // Add milestone
  async function addMilestone() {
    if (!milestoneDraft.title || !milestoneDraft.target_date) return
    setMilestoneSaving(true)
    try {
      const { data, error } = await supabase
        .from('milestones')
        .insert({
          goal_id: '90000000-0000-0000-0000-000000000001',
          title: milestoneDraft.title,
          description: milestoneDraft.description || undefined,
          target_date: milestoneDraft.target_date,
          completed: false,
          sort_order: timeline.length,
        })
        .select()
        .single()
      if (error) throw error
      setTimeline(prev => [...prev, data as Milestone].sort((a, b) => (a.target_date ?? '').localeCompare(b.target_date ?? '')))
      setMilestoneDraft({ title: '', description: '', target_date: '' })
      setShowAddMilestone(false)
    } catch (err) {
      console.error('Feil ved opprettelse av milepæl:', err)
    } finally {
      setMilestoneSaving(false)
    }
  }

  // Edit milestone
  async function saveMilestoneEdit(id: string) {
    setMilestoneSaving(true)
    try {
      const { data, error } = await supabase
        .from('milestones')
        .update({ title: milestoneEditDraft.title, description: milestoneEditDraft.description || null })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setTimeline(prev => prev.map(m => m.id === id ? data as Milestone : m))
      setEditingMilestoneId(null)
    } catch (err) {
      console.error('Feil ved redigering av milepæl:', err)
    } finally {
      setMilestoneSaving(false)
    }
  }

  // Delete milestone
  async function deleteMilestone(id: string) {
    if (!window.confirm('Er du sikker på at du vil slette denne milepælen?')) return
    try {
      const { error } = await supabase.from('milestones').delete().eq('id', id)
      if (error) throw error
      setTimeline(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      console.error('Feil ved sletting av milepæl:', err)
    }
  }

  // Toggle milestone completed
  async function toggleMilestone(id: string, completed: boolean) {
    try {
      const updates: Record<string, unknown> = { completed: !completed }
      if (!completed) updates.completed_at = new Date().toISOString()
      else updates.completed_at = null

      const { data, error } = await supabase
        .from('milestones')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setTimeline(prev => prev.map(m => m.id === id ? data as Milestone : m))
    } catch (err) {
      console.error('Feil ved oppdatering av milepæl:', err)
    }
  }

  async function onBreakdown() {
    if (!vision) return
    setBreakdownData(null)
    const catText = categories.map(c => {
      const cat = CATEGORIES.find(ca => ca.id === c.category)
      return `${cat?.label ?? c.category}: ${c.target_state}`
    }).join('\n')

    const response = await claude.call('vision_breakdown', {
      vision: `${vision.description}\n\nMål: ${vision.target_year}`,
      categories: catText,
    })

    if (response) {
      try {
        const json = response.match(/\[[\s\S]*\]/)
        if (json) {
          const parsed = JSON.parse(json[0]) as YearMilestone[]
          setBreakdownData(parsed)
        }
      } catch {
        // Will show raw text via ClaudeResponseDark
      }
    }
  }

  // Group breakdown by year
  const byYear = breakdownData?.reduce<Record<number, YearMilestone[]>>((acc, item) => {
    if (!acc[item.year]) acc[item.year] = []
    acc[item.year].push(item)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Vision statement */}
      {vision && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#0c3230' }}>
          {editingVision ? (
            <div className="space-y-3">
              <textarea
                value={visionDraft}
                onChange={e => setVisionDraft(e.target.value)}
                rows={5}
                className="w-full bg-white/10 text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#3dbfb5] resize-none"
                style={{ color: 'rgba(255,255,255,0.9)' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={saveVision}
                  disabled={visionSaving}
                  className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
                >
                  {visionSaving ? 'Lagrer...' : 'Lagre'}
                </button>
                <button
                  onClick={() => { setEditingVision(false); setVisionDraft(vision.description) }}
                  className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : (
            <p
              className="text-sm leading-relaxed cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: 'rgba(255,255,255,0.85)' }}
              onClick={() => { setEditingVision(true); setVisionDraft(vision.description) }}
              title="Klikk for å redigere"
            >
              {vision.description}
            </p>
          )}
          <p className="text-xs mt-3 font-semibold" style={{ color: '#b8f04a' }}>Mål: {vision.target_year}</p>

          <div className="mt-4 flex">
            <button
              onClick={onBreakdown}
              disabled={claude.loading}
              className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
            >
              {claude.loading ? 'Tenker...' : breakdownData ? 'Generer på nytt' : 'Bryt ned med Claude'}
            </button>
          </div>

          {/* Show parsed breakdown if available */}
          {breakdownData && byYear ? (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="space-y-4">
                {Object.entries(byYear).sort(([a], [b]) => Number(a) - Number(b)).map(([year, items]) => (
                  <div key={year}>
                    <p className="text-xs font-bold mb-2" style={{ color: '#b8f04a' }}>{year}</p>
                    <div className="space-y-1.5">
                      {items.map((item, i) => {
                        const catMeta = CATEGORY_MAP[item.category as keyof typeof CATEGORY_MAP]
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-semibold uppercase mt-0.5 w-16 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
                              {catMeta?.label ?? item.category}
                            </span>
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.75)' }}>{item.milestone}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Show raw text response if JSON parsing failed
            <ClaudeResponseDark
              response={!breakdownData ? claude.response : null}
              loading={claude.loading}
              error={claude.error}
            />
          )}
        </div>
      )}

      {/* Vision by category */}
      {categories.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Per livsområde</p>
          <div className="space-y-3">
            {CATEGORIES.map((cat) => {
              const vc = categories.find((c) => c.category === cat.id)
              if (!vc) return null
              const isEditing = editingCatId === vc.id
              return (
                <div key={cat.id} className={`rounded-2xl border p-4 ${cat.bg} ${cat.border}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${cat.color} mb-1`}>{cat.label}</p>
                  {isEditing ? (
                    <div className="space-y-2 mt-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Beskrivelse</label>
                        <input
                          type="text"
                          value={catDraft.description}
                          onChange={e => setCatDraft(d => ({ ...d, description: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Målbilde</label>
                        <textarea
                          value={catDraft.target_state}
                          onChange={e => setCatDraft(d => ({ ...d, target_state: e.target.value }))}
                          rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 bg-white resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveCategory(vc.id)}
                          disabled={catSaving}
                          className="text-xs font-semibold px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: '#0c3230' }}
                        >
                          {catSaving ? 'Lagrer...' : 'Lagre'}
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="text-xs font-semibold px-4 py-2 rounded-lg text-gray-500 border border-gray-200 transition-colors"
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setEditingCatId(vc.id)
                        setCatDraft({ description: vc.description, target_state: vc.target_state })
                      }}
                      title="Klikk for å redigere"
                    >
                      <p className="text-sm font-semibold text-gray-800 mb-1">{vc.description}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{vc.target_state}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Tidslinje mot {vision?.target_year ?? 2036}</p>
        {timeline.length > 0 && (
          <div className="space-y-0">
            {timeline.map((m, i) => {
              const isEditing = editingMilestoneId === m.id
              return (
                <div key={m.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => toggleMilestone(m.id, m.completed)}
                      className="w-3 h-3 rounded-full mt-1 flex-shrink-0 transition-colors hover:ring-2 hover:ring-offset-1"
                      style={{
                        backgroundColor: m.completed ? '#0c3230' : '#d1d5db',
                        ...(m.completed ? {} : {}),
                      }}
                      title={m.completed ? 'Merk som ikke fullført' : 'Merk som fullført'}
                    />
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                  </div>
                  <div className="pb-5 flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={milestoneEditDraft.title}
                          onChange={e => setMilestoneEditDraft(d => ({ ...d, title: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-600"
                        />
                        <input
                          type="text"
                          value={milestoneEditDraft.description}
                          onChange={e => setMilestoneEditDraft(d => ({ ...d, description: e.target.value }))}
                          placeholder="Beskrivelse (valgfritt)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-teal-600"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveMilestoneEdit(m.id)}
                            disabled={milestoneSaving}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                            style={{ backgroundColor: '#0c3230' }}
                          >
                            {milestoneSaving ? 'Lagrer...' : 'Lagre'}
                          </button>
                          <button
                            onClick={() => setEditingMilestoneId(null)}
                            className="text-xs text-gray-500 px-3 py-1.5"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            setEditingMilestoneId(m.id)
                            setMilestoneEditDraft({ title: m.title, description: m.description ?? '' })
                          }}
                          title="Klikk for å redigere"
                        >
                          <p className="text-xs font-semibold" style={{ color: '#3dbfb5' }}>
                            {m.target_date?.slice(0, 4)}
                          </p>
                          <p className={`text-sm font-semibold mt-0.5 ${m.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {m.title}
                          </p>
                          {m.description && <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>}
                        </div>
                        <button
                          onClick={() => deleteMilestone(m.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-1"
                          title="Slett milepæl"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add milestone form */}
        {showAddMilestone ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3 mt-3">
            <p className="text-sm font-semibold text-gray-800">Ny milepæl</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tittel</label>
              <input
                type="text"
                value={milestoneDraft.title}
                onChange={e => setMilestoneDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Hva skal oppnås?"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Beskrivelse (valgfritt)</label>
              <input
                type="text"
                value={milestoneDraft.description}
                onChange={e => setMilestoneDraft(d => ({ ...d, description: e.target.value }))}
                placeholder="Utdyp gjerne"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Måldato</label>
              <input
                type="date"
                value={milestoneDraft.target_date}
                onChange={e => setMilestoneDraft(d => ({ ...d, target_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addMilestone}
                disabled={milestoneSaving || !milestoneDraft.title || !milestoneDraft.target_date}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#0c3230' }}
              >
                {milestoneSaving ? 'Lagrer...' : 'Legg til'}
              </button>
              <button
                onClick={() => { setShowAddMilestone(false); setMilestoneDraft({ title: '', description: '', target_date: '' }) }}
                className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200"
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMilestone(true)}
            className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
            style={{ borderColor: '#0c3230', color: '#0c3230' }}
          >
            + Legg til milepæl
          </button>
        )}
      </div>
    </div>
  )
}
