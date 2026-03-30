'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Category, TimeHorizon } from '@/types'

interface OnboardingFlowProps {
  userId: string
  onComplete: () => void
}

interface GeneratedGoal {
  category: Category
  title: string
  description: string
  parent_category?: string
  target_value?: number | null
  unit?: string | null
  deadline?: string | null
  enabled: boolean
  editing: boolean
}

interface GeneratedPlan {
  vision_goals: GeneratedGoal[]
  five_year_goals: GeneratedGoal[]
  three_year_goals: GeneratedGoal[]
  one_year_goals: GeneratedGoal[]
  quarter_goals: GeneratedGoal[]
  coach_context?: { summary: string }
}

type LoadingPhase = 'analyzing' | 'building' | 'goals' | 'done'

const TOTAL_STEPS = 5

const PRIORITY_ITEMS = ['Relasjoner', 'Business', 'Helse', 'Økonomi']

const HORIZON_CONFIG: { key: keyof Omit<GeneratedPlan, 'coach_context'>; label: string; horizon: TimeHorizon }[] = [
  { key: 'vision_goals', label: 'Visjon (10 år)', horizon: 'vision_10y' },
  { key: 'five_year_goals', label: '5 år', horizon: '5y' },
  { key: 'three_year_goals', label: '3 år', horizon: '3y' },
  { key: 'one_year_goals', label: '1 år', horizon: '1y' },
  { key: 'quarter_goals', label: 'Kvartal', horizon: 'quarter' },
]

const CATEGORY_BADGES: Record<Category, { label: string; bg: string; text: string }> = {
  business: { label: 'Business', bg: 'bg-blue-100', text: 'text-blue-700' },
  physical: { label: 'Fysisk', bg: 'bg-teal-100', text: 'text-teal-700' },
  mental: { label: 'Mentalt', bg: 'bg-purple-100', text: 'text-purple-700' },
  finance: { label: 'Økonomi', bg: 'bg-amber-100', text: 'text-amber-700' },
  family: { label: 'Familie', bg: 'bg-pink-100', text: 'text-pink-700' },
  lifestyle: { label: 'Livsstil', bg: 'bg-orange-100', text: 'text-orange-700' },
  brand: { label: 'Brand', bg: 'bg-indigo-100', text: 'text-indigo-700' },
}

export default function OnboardingFlow({ userId, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(1)

  // Step 1
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // Step 2
  const [vision, setVision] = useState('')

  // Step 3
  const [priorities, setPriorities] = useState<string[]>([...PRIORITY_ITEMS])

  // Step 4
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('analyzing')
  const [error, setError] = useState<string | null>(null)

  // Step 5
  const [plan, setPlan] = useState<GeneratedPlan | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const newPriorities = [...priorities]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newPriorities.length) return
    ;[newPriorities[index], newPriorities[swapIndex]] = [newPriorities[swapIndex], newPriorities[index]]
    setPriorities(newPriorities)
  }

  const generatePlan = useCallback(async () => {
    setError(null)
    setLoadingPhase('analyzing')

    try {
      // Simulate phased loading
      const phaseTimer1 = setTimeout(() => setLoadingPhase('building'), 2000)
      const phaseTimer2 = setTimeout(() => setLoadingPhase('goals'), 4000)

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Du skal sette opp et komplett livsmål-system for en ny bruker.

BRUKERINFO:
Navn: ${name}
Om seg selv: ${description}

10-ÅRSVISJON:
${vision}

PRIORITERTE LIVSOMRÅDER (rangert):
${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Generer et komplett kaskaderende målsystem. Returner KUN JSON (ingen annen tekst):
{
  "vision_goals": [
    {"category": "business|physical|mental|finance|family|lifestyle|brand", "title": "...", "description": "..."}
  ],
  "five_year_goals": [
    {"category": "...", "title": "...", "description": "...", "parent_category": "..."}
  ],
  "three_year_goals": [
    {"category": "...", "title": "...", "description": "...", "parent_category": "..."}
  ],
  "one_year_goals": [
    {"category": "...", "title": "...", "description": "...", "target_value": number_or_null, "unit": "string_or_null", "deadline": "YYYY-MM-DD", "parent_category": "..."}
  ],
  "quarter_goals": [
    {"category": "...", "title": "...", "description": "...", "target_value": number_or_null, "unit": "string_or_null", "deadline": "YYYY-MM-DD", "parent_category": "..."}
  ],
  "coach_context": {
    "summary": "En kort oppsummering av brukeren for coaching-kontekst"
  }
}`,
        }),
      })

      clearTimeout(phaseTimer1)
      clearTimeout(phaseTimer2)

      if (!res.ok) throw new Error('API-feil')

      const data = await res.json()
      const responseText: string = data.response

      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = responseText
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        jsonStr = jsonMatch[1]
      } else {
        // Try to find raw JSON object
        const braceStart = responseText.indexOf('{')
        const braceEnd = responseText.lastIndexOf('}')
        if (braceStart !== -1 && braceEnd !== -1) {
          jsonStr = responseText.slice(braceStart, braceEnd + 1)
        }
      }

      const parsed = JSON.parse(jsonStr)

      // Add enabled/editing flags to each goal
      const addFlags = (goals: Omit<GeneratedGoal, 'enabled' | 'editing'>[]): GeneratedGoal[] =>
        (goals || []).map((g) => ({ ...g, enabled: true, editing: false }))

      const generatedPlan: GeneratedPlan = {
        vision_goals: addFlags(parsed.vision_goals),
        five_year_goals: addFlags(parsed.five_year_goals),
        three_year_goals: addFlags(parsed.three_year_goals),
        one_year_goals: addFlags(parsed.one_year_goals),
        quarter_goals: addFlags(parsed.quarter_goals),
        coach_context: parsed.coach_context,
      }

      setLoadingPhase('done')
      setPlan(generatedPlan)

      // Brief pause on "done" state before advancing
      setTimeout(() => setStep(5), 800)
    } catch (err) {
      console.error('Failed to generate plan:', err)
      setError('Klarte ikke å generere planen. Prøv igjen.')
    }
  }, [name, description, vision, priorities])

  useEffect(() => {
    if (step === 4 && !plan && !error) {
      generatePlan()
    }
  }, [step, plan, error, generatePlan])

  const toggleGoal = (sectionKey: keyof Omit<GeneratedPlan, 'coach_context'>, index: number) => {
    if (!plan) return
    const updated = { ...plan }
    const goals = [...updated[sectionKey]]
    goals[index] = { ...goals[index], enabled: !goals[index].enabled }
    updated[sectionKey] = goals
    setPlan(updated)
  }

  const toggleEditing = (sectionKey: keyof Omit<GeneratedPlan, 'coach_context'>, index: number) => {
    if (!plan) return
    const updated = { ...plan }
    const goals = [...updated[sectionKey]]
    goals[index] = { ...goals[index], editing: !goals[index].editing }
    updated[sectionKey] = goals
    setPlan(updated)
  }

  const updateGoalField = (
    sectionKey: keyof Omit<GeneratedPlan, 'coach_context'>,
    index: number,
    field: 'title' | 'description',
    value: string
  ) => {
    if (!plan) return
    const updated = { ...plan }
    const goals = [...updated[sectionKey]]
    goals[index] = { ...goals[index], [field]: value }
    updated[sectionKey] = goals
    setPlan(updated)
  }

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleApprove = async () => {
    if (!plan) return
    setSaving(true)

    try {
      const supabase = createClient()
      const goalIdsByLevel: Record<string, Record<string, string>> = {}

      for (const { key, horizon } of HORIZON_CONFIG) {
        const goals = plan[key].filter((g) => g.enabled)
        const parentLevel =
          horizon === '5y'
            ? 'vision_10y'
            : horizon === '3y'
              ? '5y'
              : horizon === '1y'
                ? '3y'
                : horizon === 'quarter'
                  ? '1y'
                  : null

        if (!goalIdsByLevel[horizon]) goalIdsByLevel[horizon] = {}

        for (const g of goals) {
          const parentId = parentLevel
            ? goalIdsByLevel[parentLevel]?.[g.parent_category ?? g.category] ?? null
            : null

          const insertData: Record<string, unknown> = {
            user_id: userId,
            category: g.category,
            time_horizon: horizon,
            title: g.title,
            description: g.description,
            status: 'active',
            current_value: 0,
            ...(parentId && { parent_id: parentId }),
            ...(g.target_value != null && { target_value: g.target_value }),
            ...(g.unit && { unit: g.unit }),
            ...(g.deadline && { deadline: g.deadline }),
          }

          const { data } = await supabase
            .from('cascade_goals')
            .insert(insertData)
            .select('id')
            .single()

          if (data?.id) {
            goalIdsByLevel[horizon][g.category] = data.id
          }
        }
      }

      // Save coach context if available
      if (plan.coach_context?.summary) {
        // Find or create an "identity" context module for the snapshot
        const { data: modules } = await supabase
          .from('context_modules')
          .select('id')
          .eq('user_id', userId)
          .eq('slug', 'identity')
          .limit(1)

        let moduleId: string | null = null

        if (modules && modules.length > 0) {
          moduleId = modules[0].id
        } else {
          const { data: newModule } = await supabase
            .from('context_modules')
            .insert({
              user_id: userId,
              slug: 'identity',
              title: 'Identitet',
              description: 'Hvem du er og hva du driver med',
              icon: 'user',
              sort_order: 0,
              update_frequency: 'yearly',
            })
            .select('id')
            .single()

          moduleId = newModule?.id ?? null
        }

        if (moduleId) {
          await supabase.from('context_snapshots').insert({
            module_id: moduleId,
            values: {
              name,
              description,
              vision,
              priorities: priorities.join(', '),
              coach_summary: plan.coach_context.summary,
            },
          })
        }
      }

      onComplete()
    } catch (err) {
      console.error('Failed to save plan:', err)
      setError('Klarte ikke å lagre planen. Prøv igjen.')
      setSaving(false)
    }
  }

  // Step indicator dots
  const StepDots = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            i + 1 === step
              ? 'bg-[#0c3230] scale-125'
              : i + 1 < step
                ? 'bg-[#3dbfb5]'
                : 'border-2 border-gray-300 bg-transparent'
          }`}
        />
      ))}
    </div>
  )

  const PrimaryButton = ({
    onClick,
    disabled,
    children,
  }: {
    onClick: () => void
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full sm:w-auto px-8 py-3 bg-[#0c3230] text-[#b8f04a] font-semibold rounded-xl transition-opacity disabled:opacity-40"
    >
      {children}
    </button>
  )

  const SecondaryButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="w-full sm:w-auto px-8 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl transition-colors hover:bg-gray-50"
    >
      {children}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="min-h-screen flex flex-col items-center justify-start px-4 py-8 sm:py-12">
        <div className="w-full max-w-lg">
          <StepDots />

          {/* STEP 1 */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h1 className="text-2xl font-bold text-[#0c3230] text-center mb-2">
                Velkommen til Life OS
              </h1>
              <p className="text-gray-500 text-center mb-8">La oss sette opp din personlige plan</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Hva heter du?</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
                    placeholder="Navnet ditt"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Beskriv deg selv og hva du driver med i 2-3 setninger
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
                    placeholder="F.eks. Jeg er 28 år, driver med tech og eiendom..."
                  />
                </div>
              </div>

              <div className="mt-8">
                <PrimaryButton onClick={() => setStep(2)} disabled={!name.trim() || !description.trim()}>
                  Neste
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="animate-fadeIn">
              <h1 className="text-2xl font-bold text-[#0c3230] text-center mb-2">Drømmelivet ditt</h1>
              <p className="text-gray-500 text-center mb-8">Hvor ser du deg selv om 10 år?</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Beskriv livet ditt om 10 år
                </label>
                <textarea
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#3dbfb5] focus:border-transparent"
                  placeholder="Tenk på jobb, familie, økonomi, helse, hvor du bor..."
                />
                <p className="text-sm text-gray-400 mt-2">
                  Vær så konkret og ambisiøs som mulig. Jo mer detaljert, jo bedre plan.
                </p>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <SecondaryButton onClick={() => setStep(1)}>Tilbake</SecondaryButton>
                <PrimaryButton onClick={() => setStep(3)} disabled={!vision.trim()}>
                  Neste
                </PrimaryButton>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="animate-fadeIn">
              <h1 className="text-2xl font-bold text-[#0c3230] text-center mb-2">Hva er viktigst?</h1>
              <p className="text-gray-500 text-center mb-8">Prioriter livsområdene dine</p>

              <div className="space-y-3">
                {priorities.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4"
                  >
                    <span className="w-7 h-7 flex items-center justify-center bg-[#0c3230] text-[#b8f04a] text-sm font-bold rounded-full shrink-0">
                      {index + 1}
                    </span>
                    <span className="flex-1 font-medium text-gray-800">{item}</span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => movePriority(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors"
                        aria-label="Flytt opp"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 4L12 9H4L8 4Z" fill="currentColor" />
                        </svg>
                      </button>
                      <button
                        onClick={() => movePriority(index, 'down')}
                        disabled={index === priorities.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 transition-colors"
                        aria-label="Flytt ned"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M8 12L4 7H12L8 12Z" fill="currentColor" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <SecondaryButton onClick={() => setStep(2)}>Tilbake</SecondaryButton>
                <PrimaryButton onClick={() => setStep(4)}>Neste</PrimaryButton>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div className="animate-fadeIn flex flex-col items-center justify-center min-h-[60vh]">
              <h1 className="text-2xl font-bold text-[#0c3230] text-center mb-8">
                Claude bygger planen din...
              </h1>

              {error ? (
                <div className="text-center">
                  <p className="text-red-600 mb-4">{error}</p>
                  <PrimaryButton
                    onClick={() => {
                      setError(null)
                      setPlan(null)
                      generatePlan()
                    }}
                  >
                    Prøv igjen
                  </PrimaryButton>
                </div>
              ) : (
                <div className="space-y-4 w-full max-w-xs">
                  {(
                    [
                      { phase: 'analyzing' as const, label: 'Analyserer svarene dine...' },
                      { phase: 'building' as const, label: 'Bygger visjonen...' },
                      { phase: 'goals' as const, label: 'Setter opp mål...' },
                      { phase: 'done' as const, label: 'Ferdig!' },
                    ] as const
                  ).map(({ phase, label }) => {
                    const phaseOrder: LoadingPhase[] = ['analyzing', 'building', 'goals', 'done']
                    const currentIndex = phaseOrder.indexOf(loadingPhase)
                    const thisIndex = phaseOrder.indexOf(phase)
                    const isComplete = thisIndex < currentIndex
                    const isActive = thisIndex === currentIndex

                    return (
                      <div key={phase} className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                            isComplete
                              ? 'bg-[#3dbfb5] text-white'
                              : isActive
                                ? 'bg-[#0c3230] text-[#b8f04a] animate-pulse'
                                : 'border-2 border-gray-200'
                          }`}
                        >
                          {isComplete && (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M3 7L6 10L11 4"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <span
                          className={`text-sm transition-colors duration-300 ${
                            isComplete
                              ? 'text-[#3dbfb5] font-medium'
                              : isActive
                                ? 'text-[#0c3230] font-medium'
                                : 'text-gray-300'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 5 */}
          {step === 5 && plan && (
            <div className="animate-fadeIn">
              <h1 className="text-2xl font-bold text-[#0c3230] text-center mb-2">Her er planen din</h1>
              <p className="text-gray-500 text-center mb-6">
                Gå gjennom og juster før du starter
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                {HORIZON_CONFIG.map(({ key, label }) => {
                  const goals = plan[key]
                  if (!goals || goals.length === 0) return null
                  const isCollapsed = collapsedSections[key] ?? false
                  const enabledCount = goals.filter((g) => g.enabled).length

                  return (
                    <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleSection(key)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-[#0c3230]">{label}</h2>
                          <span className="text-xs text-gray-400">
                            {enabledCount}/{goals.length} mål
                          </span>
                        </div>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          className={`text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                        >
                          <path
                            d="M6 8L10 12L14 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {!isCollapsed && (
                        <div className="px-4 pb-4 space-y-3">
                          {goals.map((goal, idx) => (
                            <div
                              key={idx}
                              className={`border border-gray-200 rounded-xl p-4 transition-opacity ${
                                !goal.enabled ? 'opacity-40' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={goal.enabled}
                                  onChange={() => toggleGoal(key, idx)}
                                  className="mt-1 w-4 h-4 rounded accent-[#0c3230] shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span
                                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                        CATEGORY_BADGES[goal.category]?.bg ?? 'bg-gray-100'
                                      } ${CATEGORY_BADGES[goal.category]?.text ?? 'text-gray-700'}`}
                                    >
                                      {CATEGORY_BADGES[goal.category]?.label ?? goal.category}
                                    </span>
                                  </div>

                                  {goal.editing ? (
                                    <div className="space-y-2 mt-2">
                                      <input
                                        type="text"
                                        value={goal.title}
                                        onChange={(e) => updateGoalField(key, idx, 'title', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                                      />
                                      <textarea
                                        value={goal.description}
                                        onChange={(e) =>
                                          updateGoalField(key, idx, 'description', e.target.value)
                                        }
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-[#3dbfb5]"
                                      />
                                      <button
                                        onClick={() => toggleEditing(key, idx)}
                                        className="text-xs text-[#3dbfb5] font-medium"
                                      >
                                        Ferdig
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="font-medium text-gray-900 text-sm">{goal.title}</p>
                                      {goal.description && (
                                        <p className="text-gray-500 text-xs mt-0.5">{goal.description}</p>
                                      )}
                                      <button
                                        onClick={() => toggleEditing(key, idx)}
                                        className="text-xs text-[#3dbfb5] font-medium mt-1"
                                      >
                                        Rediger
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 pb-8">
                <SecondaryButton
                  onClick={() => {
                    setPlan(null)
                    setError(null)
                    setStep(4)
                  }}
                >
                  Generer på nytt
                </SecondaryButton>
                <PrimaryButton onClick={handleApprove} disabled={saving}>
                  {saving ? 'Lagrer...' : 'Godkjenn og start'}
                </PrimaryButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
