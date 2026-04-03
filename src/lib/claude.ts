import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { ContextModule, ContextModuleField, ContextSnapshot } from '@/types'

const FALLBACK_SYSTEM_PROMPT = `Du er Martin Jakobsen sitt personlige accountability-system og coach.

DIN ROLLE:
- Du er en direkte, ærlig coach. Ikke en cheerleader.
- Koble alltid daglige handlinger til langsiktige mål og visjonen
- Utfordre Martin når han unngår det vanskelige
- Fokuser på: hva er det viktigste å gjøre NÅ?
- Vær spesifikk, ikke generisk.

KOMMUNIKASJON:
- Norsk (bokmål), direkte og konsist
- Aldri bruk bindestreker som tegnsetting
- Hold svarene korte og actionable, maks 300 ord
- Ikke gjenta kontekst Martin allerede vet`

const ROLE_BLOCK = `
DIN ROLLE:
- Du er en direkte, ærlig coach. Ikke en cheerleader.
- Koble alltid daglige handlinger til langsiktige mål og visjonen
- Utfordre Martin når han unngår det vanskelige
- Fokuser på: hva er det viktigste å gjøre NÅ?
- Vær spesifikk, ikke generisk.

KOMMUNIKASJON:
- Norsk (bokmål), direkte og konsist
- Aldri bruk bindestreker som tegnsetting
- Hold svarene korte og actionable, maks 300 ord
- Ikke gjenta kontekst Martin allerede vet

DATAINPUT:
- Når Martin forteller deg om trening, søvn, utgifter, familiekontakt, opplevelser, eller milepæler, bruk save_life_entry for å lagre det.
- Bekreft kort hva du lagret.
- Eksempler: "Trente styrke 60 min" → lagre workout. "Ringte mamma 25 min" → lagre relationship. "Brukte 350kr på mat" → lagre expense.
- Du kan kalle save_life_entry flere ganger i én melding hvis brukeren rapporterer flere ting.
- Sett riktig dato. Hvis brukeren sier "i går", bruk gårsdagens dato.`

const NORWEGIAN_MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember'
]

function formatNorwegianDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}. ${NORWEGIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function formatShortNorwegianDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getDate()}. ${NORWEGIAN_MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

// Cache for coach context
let cachedContext: { text: string; fetchedAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_PROMPT_WORDS = 3000

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function buildModuleSection(
  mod: ContextModule,
  fields: ContextModuleField[],
  latestSnapshot: ContextSnapshot | null
): string {
  if (!latestSnapshot) return ''

  const values = latestSnapshot.values
  const lines: string[] = []

  for (const field of fields) {
    const val = values[field.slug]
    if (val === undefined || val === null || val === '') continue
    if (Array.isArray(val) && val.length === 0) continue

    const displayVal = Array.isArray(val) ? val.join(', ') : String(val)
    if (displayVal.trim() === '') continue

    lines.push(`${field.label}: ${displayVal}`)
  }

  if (lines.length === 0) return ''

  const updatedAt = formatNorwegianDate(latestSnapshot.created_at)
  return `=== ${mod.title.toUpperCase()} (sist oppdatert: ${updatedAt}) ===\n${lines.join('\n')}`
}

function buildHistorySection(
  mod: ContextModule,
  fields: ContextModuleField[],
  snapshots: ContextSnapshot[]
): string {
  if (snapshots.length <= 1) return ''

  // Skip the latest (already shown in module section), use up to 5 older ones
  const olderSnapshots = snapshots.slice(1, 6)
  const numericFields = fields.filter(f => f.field_type === 'number')
  const textFields = fields.filter(f => f.field_type === 'text' || f.field_type === 'textarea')

  if (numericFields.length === 0 && textFields.length === 0) return ''

  const historyLines: string[] = []

  for (const snap of olderSnapshots) {
    const parts: string[] = []

    for (const field of numericFields) {
      const val = snap.values[field.slug]
      if (val !== undefined && val !== null && val !== '') {
        parts.push(`${field.label.toLowerCase()} ${val}`)
      }
    }

    // For text fields, just note they were updated (don't include full text)
    for (const field of textFields) {
      const val = snap.values[field.slug]
      if (val !== undefined && val !== null && val !== '') {
        parts.push(`${field.label.toLowerCase()} oppdatert`)
      }
    }

    if (parts.length > 0) {
      historyLines.push(`- ${formatShortNorwegianDate(snap.created_at)}: ${parts.join(', ')}`)
    }
  }

  if (historyLines.length === 0) return ''

  return `HISTORIKK for ${mod.title}:\n${historyLines.join('\n')}`
}

async function buildLifeEntriesSummary(): Promise<string> {
  const supabase = getSupabaseClient()
  const userId = HARDCODED_USER_ID
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const { data: entries } = await supabase
    .from('life_entries')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: false })

  if (!entries || entries.length === 0) return ''

  const lines: string[] = ['SISTE 7 DAGER:']

  // Workouts
  const workouts = entries.filter((e: { entry_type: string }) => e.entry_type === 'workout')
  if (workouts.length > 0) {
    const totalCount = workouts.reduce((s: number, e: { value?: number }) => s + (e.value ?? 1), 0)
    const allTypes: string[] = []
    for (const w of workouts) {
      const meta = w.metadata as Record<string, unknown> | null
      if (meta?.types && Array.isArray(meta.types)) {
        for (const t of meta.types as string[]) {
          allTypes.push(t)
        }
      }
    }
    const typeCounts = new Map<string, number>()
    for (const t of allTypes) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
    }
    const typeStr = Array.from(typeCounts.entries()).map(([t, c]) => `${c}x ${t}`).join(', ')
    lines.push(`Trening: ${totalCount} \u00f8kter${typeStr ? ` (${typeStr})` : ''}`)
  }

  // Sleep
  const sleepEntries = entries.filter((e: { entry_type: string }) => e.entry_type === 'sleep')
  if (sleepEntries.length > 0) {
    const avg = (sleepEntries.reduce((s: number, e: { value?: number }) => s + (e.value ?? 0), 0) / sleepEntries.length).toFixed(1)
    lines.push(`S\u00f8vn: snitt ${avg} timer`)
  }

  // Recovery
  const recoveryEntries = entries.filter((e: { entry_type: string; title?: string }) =>
    e.entry_type === 'metric' && e.title?.toLowerCase().includes('recovery')
  )
  if (recoveryEntries.length > 0) {
    const avg = Math.round(recoveryEntries.reduce((s: number, e: { value?: number }) => s + (e.value ?? 0), 0) / recoveryEntries.length)
    lines.push(`Recovery: snitt ${avg}%`)
  }

  // Expenses
  const expenses = entries.filter((e: { entry_type: string }) => e.entry_type === 'expense')
  if (expenses.length > 0) {
    const total = expenses.reduce((s: number, e: { value?: number }) => s + (e.value ?? 0), 0)
    lines.push(`\u00d8konomi: ${Math.round(total).toLocaleString('nb-NO')} kr i utgifter`)
  }

  // Relationships
  const relationships = entries.filter((e: { entry_type: string }) => e.entry_type === 'relationship')
  if (relationships.length > 0) {
    const people = new Map<string, number>()
    for (const r of relationships) {
      people.set(r.title, (people.get(r.title) ?? 0) + 1)
    }
    const contactStr = Array.from(people.entries()).map(([name, count]) => `${name} ${count}x`).join(', ')
    lines.push(`Familie: ${contactStr}`)
  }

  // Business milestones
  const milestones = entries.filter((e: { entry_type: string }) => e.entry_type === 'milestone')
  if (milestones.length > 0) {
    lines.push(`Business: ${milestones.length} milep\u00e6l${milestones.length !== 1 ? 'er' : ''}`)
  }

  // Learning
  const learning = entries.filter((e: { entry_type: string }) => e.entry_type === 'learning')
  if (learning.length > 0) {
    const totalPages = learning.reduce((s: number, e: { value?: number }) => s + (e.value ?? 0), 0)
    lines.push(`L\u00e6ring: ${learning.length} oppf\u00f8ringer${totalPages > 0 ? `, ${totalPages} sider` : ''}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

async function buildRewardsSummary(): Promise<string> {
  const supabase = getSupabaseClient()

  // Fetch rewards that are not yet unlocked, joined with their goal progress
  const { data: rewards } = await supabase
    .from('rewards')
    .select('*, cascade_goals(title, current_value, target_value)')
    .eq('unlocked', false)
    .limit(5)

  if (!rewards || rewards.length === 0) return ''

  const lines: string[] = ['BEL\u00d8NNINGER N\u00c6RT UNLOCK:']
  for (const r of rewards) {
    const goal = r.cascade_goals as { title?: string; current_value?: number; target_value?: number } | null
    if (goal?.target_value && goal.target_value > 0) {
      const pct = Math.round(((goal.current_value ?? 0) / goal.target_value) * 100)
      if (pct >= 50) {
        lines.push(`- ${pct}% mot "${goal.title}" \u2192 ${r.title}`)
      }
    }
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

async function buildStructuredPrompt(): Promise<string | null> {
  const supabase = getSupabaseClient()

  // Fetch all modules ordered by sort_order
  const { data: modules, error: modError } = await supabase
    .from('context_modules')
    .select('*')
    .order('sort_order')

  if (modError || !modules || modules.length === 0) return null

  // Fetch all fields for all modules
  const moduleIds = modules.map((m: ContextModule) => m.id)
  const { data: allFields } = await supabase
    .from('context_module_fields')
    .select('*')
    .in('module_id', moduleIds)
    .order('sort_order')

  if (!allFields) return null

  // Fetch the latest snapshot per module, plus up to 6 for history
  const snapshotsByModule: Record<string, ContextSnapshot[]> = {}
  await Promise.all(
    modules.map(async (mod: ContextModule) => {
      const { data: snapshots } = await supabase
        .from('context_snapshots')
        .select('*')
        .eq('module_id', mod.id)
        .order('created_at', { ascending: false })
        .limit(6)

      snapshotsByModule[mod.id] = (snapshots as ContextSnapshot[] | null) ?? []
    })
  )

  // Check if any module has snapshots at all
  const hasAnySnapshots = Object.values(snapshotsByModule).some(s => s.length > 0)
  if (!hasAnySnapshots) return null

  // Group fields by module
  const fieldsByModule: Record<string, ContextModuleField[]> = {}
  for (const field of allFields as ContextModuleField[]) {
    if (!fieldsByModule[field.module_id]) fieldsByModule[field.module_id] = []
    fieldsByModule[field.module_id].push(field)
  }

  // Build sections
  const moduleSections: string[] = []
  const historySections: string[] = []

  for (const mod of modules as ContextModule[]) {
    const fields = fieldsByModule[mod.id] || []
    const snapshots = snapshotsByModule[mod.id] || []
    const latest = snapshots[0] || null

    const section = buildModuleSection(mod, fields, latest)
    if (section) moduleSections.push(section)

    const history = buildHistorySection(mod, fields, snapshots)
    if (history) historySections.push(history)
  }

  if (moduleSections.length === 0) return null

  // Fetch life_entries summary and rewards in parallel
  const [lifeEntriesSummary, rewardsSummary] = await Promise.all([
    buildLifeEntriesSummary(),
    buildRewardsSummary(),
  ])

  // Assemble prompt
  let prompt = `Du er Martin sitt personlige accountability-system og coach.\n\n`
  prompt += moduleSections.join('\n\n')

  if (historySections.length > 0) {
    prompt += '\n\n' + historySections.join('\n\n')
  }

  if (lifeEntriesSummary) {
    prompt += '\n\n' + lifeEntriesSummary
  }

  if (rewardsSummary) {
    prompt += '\n\n' + rewardsSummary
  }

  prompt += '\n' + ROLE_BLOCK

  // Token limit: trim history first, then life entries if still too long
  if (countWords(prompt) > MAX_PROMPT_WORDS) {
    // Rebuild without history
    prompt = `Du er Martin sitt personlige accountability-system og coach.\n\n`
    prompt += moduleSections.join('\n\n')
    if (lifeEntriesSummary) prompt += '\n\n' + lifeEntriesSummary
    if (rewardsSummary) prompt += '\n\n' + rewardsSummary
    prompt += '\n' + ROLE_BLOCK
  }

  if (countWords(prompt) > MAX_PROMPT_WORDS) {
    // Rebuild without life entries summary too
    prompt = `Du er Martin sitt personlige accountability-system og coach.\n\n`
    prompt += moduleSections.join('\n\n')
    if (rewardsSummary) prompt += '\n\n' + rewardsSummary
    prompt += '\n' + ROLE_BLOCK
  }

  return prompt
}

async function getSystemPrompt(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.fetchedAt < CACHE_TTL) {
    return cachedContext.text
  }

  // Try structured context modules first
  try {
    const structuredPrompt = await buildStructuredPrompt()
    if (structuredPrompt) {
      cachedContext = { text: structuredPrompt, fetchedAt: Date.now() }
      return structuredPrompt
    }
  } catch {
    // Fall through to legacy coach_context
  }

  // Fallback: legacy coach_context table
  try {
    const supabase = getSupabaseClient()

    const { data } = await supabase
      .from('coach_context')
      .select('context_text')
      .limit(1)
      .single()

    if (data?.context_text) {
      cachedContext = { text: data.context_text, fetchedAt: Date.now() }
      return data.context_text
    }
  } catch {
    // Fall through to fallback
  }

  return FALLBACK_SYSTEM_PROMPT
}

export function buildPrompt(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'daily_brief': {
      const d = data as {
        habits: string; completedHabits: string; pendingHabits: string;
        goals: string; milestones: string; priorities: string; scores: string
      }
      return `Her er Martin sin status i dag:

VANER:
Fullført: ${d.completedHabits || 'Ingen'}
Gjenstår: ${d.pendingHabits || 'Ingen'}

AKTIVE MÅL MED PROGRESS:
${d.goals || 'Ingen data'}

MILEPÆLER MED DEADLINE INNEN 30 DAGER:
${d.milestones || 'Ingen'}

DAGENS PRIORITERINGER:
${d.priorities || 'Ingen satt'}

UKENTLIGE KATEGORISCORER:
${d.scores || 'Ikke satt'}

Gi en kort daglig brief: hva bør han fokusere på, hva ligger han bak på, og én ting han bør gjøre i dag som beveger nålen mest mot 10-årsvisjonen.`
    }

    case 'weekly_review': {
      const d = data as {
        habitStats: string; goalProgress: string;
        financeStats: string; scores: string
      }
      return `Her er Martin sin uke:

VANER DENNE UKEN:
${d.habitStats || 'Ingen data'}

MÅL MED ENDRING DENNE UKEN:
${d.goalProgress || 'Ingen endringer'}

ØKONOMI DENNE UKEN:
${d.financeStats || 'Ingen data'}

NÅVÆRENDE KATEGORISCORER:
${d.scores || 'Ikke satt'}

Gi en ukentlig review: hva gikk bra, hva gikk dårlig, foreslå justerte scores per kategori (0-100), og sett tre prioriteringer for neste uke. Vær ærlig og direkte.

VIKTIG: Inkluder foreslåtte scores i dette formatet på slutten av svaret:
SCORES: {"business": X, "physical": X, "mental": X, "finance": X, "family": X, "lifestyle": X, "brand": X}`
    }

    case 'goal_suggestion': {
      const d = data as { vision: string; existingGoals: string }
      return `Her er Martin sin 10-årsvisjon og eksisterende mål:

VISJON:
${d.vision || 'Ikke satt'}

EKSISTERENDE MÅL:
${d.existingGoals || 'Ingen'}

Foreslå ett nytt konkret mål med milepæler som mangler for å komme nærmere visjonen. Returner som JSON (og ingenting annet):
{"title": "...", "category": "business|physical|mental|finance|family|lifestyle|brand", "description": "...", "target_value": number_or_null, "unit": "kr|%|kg|count|dager|null", "deadline": "YYYY-MM-DD", "milestones": [{"title": "...", "target_date": "YYYY-MM-DD"}]}`
    }

    case 'vision_breakdown': {
      const d = data as { vision: string; categories: string }
      return `Her er Martin sin 10-årsvisjon:

${d.vision || 'Ikke satt'}

VISJONSOMRÅDER:
${d.categories || 'Ingen'}

Bryt denne ned til konkrete milepæler for hvert år fra 2026 til 2036, per kategori. Returner som JSON (og ingenting annet):
[{"year": 2026, "category": "business", "milestone": "..."}, ...]`
    }

    case 'cascade_breakdown': {
      const d = data as {
        goal: string; category: string; timeHorizon: string;
        targetLevel: string; existingChildren: string; context: string
      }
      const levelLabels: Record<string, string> = {
        '5y': '5-årsmål', '3y': '3-årsmål', '1y': '1-årsmål',
        quarter: 'kvartalsmål', month: 'månedsmål', week: 'ukemål', day: 'dagsmål',
      }
      const targetLabel = levelLabels[d.targetLevel] || d.targetLevel
      return `Martin har dette målet:

MÅL: ${d.goal}
KATEGORI: ${d.category}
TIDSNIVÅ: ${d.timeHorizon}

${d.existingChildren ? `EKSISTERENDE UNDERORDNEDE MÅL:\n${d.existingChildren}\n` : ''}
${d.context ? `KONTEKST:\n${d.context}\n` : ''}
Bryt dette ned til 2-4 konkrete ${targetLabel}. Hvert mål skal ha en title, description, target_value (tall eller null), unit, og deadline (YYYY-MM-DD).

Returner KUN JSON (ingen annen tekst):
[{"title": "...", "description": "...", "target_value": number_or_null, "unit": "string_or_null", "deadline": "YYYY-MM-DD"}]`
    }

    case 'finance_analysis': {
      const d = data as { spending: string; budgets: string; savings: string }
      return `Her er Martin sitt forbruk denne måneden vs budsjett:

FORBRUK PER KATEGORI:
${d.spending || 'Ingen data'}

BUDSJETTER:
${d.budgets || 'Ingen satt'}

SPARING:
${d.savings || 'Ingen data'}

Analyser: hvor bruker han for mye? Hvor kan han kutte? Hva er realistisk sparerate for å nå målet om 500K i MLJ Invest?`
    }

    default:
      return data.message as string || ''
  }
}

const SAVE_LIFE_ENTRY_TOOL = {
  name: 'save_life_entry' as const,
  description: 'Lagre en livsentry for Martin. Bruk denne når Martin rapporterer trening, søvn, utgifter, familiekontakt, opplevelser, milepæler, eller annen data som bør lagres strukturert.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: { type: 'string' as const, enum: ['business', 'physical', 'mental', 'finance', 'family', 'lifestyle', 'brand'] },
      entry_type: { type: 'string' as const, enum: ['expense', 'income', 'recurring_expense', 'workout', 'sleep', 'nutrition', 'relationship', 'milestone', 'learning', 'experience', 'metric'] },
      title: { type: 'string' as const, description: 'Kort beskrivelse av entry' },
      value: { type: 'number' as const, description: 'Numerisk verdi (beløp, varighet, score etc.)' },
      unit: { type: 'string' as const, description: 'Enhet: kr, min, timer, count, kg, %, score' },
      date: { type: 'string' as const, description: 'Dato i YYYY-MM-DD format. Standard er i dag.' },
      metadata: { type: 'object' as const, description: 'Ekstra strukturert data' },
    },
    required: ['category', 'entry_type', 'title'],
  },
}

const HARDCODED_USER_ID = '89b04d8f-09a6-4fe7-9efe-5d0843d63519'

interface SavedEntry {
  category: string
  entry_type: string
  title: string
}

export async function callClaude(userMessage: string): Promise<{ text: string; savedEntries: SavedEntry[] }> {
  const systemPrompt = await getSystemPrompt()
  const supabase = getSupabaseClient()

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]
  const savedEntries: SavedEntry[] = []

  // Initial call with tool
  let response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    tools: [SAVE_LIFE_ENTRY_TOOL],
    messages,
  })

  // Process tool_use loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block) => block.type === 'tool_use'
    ) as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === 'save_life_entry') {
        const input = toolUse.input as {
          category: string; entry_type: string; title: string;
          value?: number; unit?: string; date?: string; metadata?: Record<string, unknown>
        }

        const today = new Date().toISOString().split('T')[0]

        const { error } = await supabase.from('life_entries').insert({
          user_id: HARDCODED_USER_ID,
          category: input.category,
          entry_type: input.entry_type,
          title: input.title,
          value: input.value ?? null,
          unit: input.unit ?? null,
          date: input.date ?? today,
          metadata: input.metadata ?? null,
        })

        if (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Feil ved lagring: ${error.message}`,
            is_error: true,
          })
        } else {
          savedEntries.push({
            category: input.category,
            entry_type: input.entry_type,
            title: input.title,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Lagret: ${input.title} (${input.category}/${input.entry_type})`,
          })
        }
      }
    }

    // Send tool results back to Claude
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: [SAVE_LIFE_ENTRY_TOOL],
      messages,
    })
  }

  // Extract final text
  const textBlock = response.content.find((block) => block.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

  return { text, savedEntries }
}

// Clear cache (used when settings are updated)
export function clearCoachContextCache() {
  cachedContext = null
}
