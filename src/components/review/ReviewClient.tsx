'use client'

import { useState, useCallback } from 'react'
import type { ProgressSnapshot, JournalEntry, Habit, HabitCompletion, Goal } from '@/types'
import { CATEGORIES } from '@/types'
import { FaceIcon } from '@/components/ui/FaceIcon'
import { createClient } from '@/lib/supabase'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useClaudeAPI, ClaudeResponseDark } from '@/components/ui/ClaudeResponse'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const TYPE_LABELS: Record<string, string> = {
  daily_brief: 'Daglig brief',
  weekly_review: 'Ukesreview',
  monthly_review: 'Månedlig review',
  note: 'Notat',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  daily_brief: { bg: '#e8f5e0', text: '#0c3230' },
  weekly_review: { bg: '#0c3230', text: '#b8f04a' },
  monthly_review: { bg: '#3dbfb5', text: '#fff' },
  note: { bg: '#f0f0f0', text: '#333' },
}

interface ReviewClientProps {
  snapshots: ProgressSnapshot[]
  journals: JournalEntry[]
  habits: Habit[]
  completions: HabitCompletion[]
  goals: Goal[]
  weekStart: string
  weekEnd: string
  weekExpenses: number
  prevWeekExpenses: number
  userId: string
}

export function ReviewClient({
  snapshots: initialSnapshots,
  journals: initialJournals,
  habits,
  completions,
  goals,
  weekStart,
  weekExpenses,
  prevWeekExpenses,
  userId,
}: ReviewClientProps) {
  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly')
  const [snapshots, setSnapshots] = useState(initialSnapshots)
  const [journals, setJournals] = useState(initialJournals)
  const [expandedJournal, setExpandedJournal] = useState<string | null>(null)
  const [suggestedScores, setSuggestedScores] = useState<Record<string, number> | null>(null)
  const [historyOpen, setHistoryOpen] = useState(true)

  // Notes state
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const claude = useClaudeAPI()
  const { toast } = useToast()
  const supabase = createClient()

  // Habit stats this week
  const habitDays = 7
  const dailyHabits = habits.filter(h => h.frequency === 'daily')
  const possible = dailyHabits.length * habitDays
  const completed = completions.filter(c => dailyHabits.some(h => h.id === c.habit_id)).length
  const habitPct = possible > 0 ? Math.round((completed / possible) * 100) : 0

  // Per-habit completion rates
  const habitStats = habits.map(h => {
    const count = completions.filter(c => c.habit_id === h.id).length
    const max = h.frequency === 'daily' ? 7 : h.frequency === 'weekdays' ? 5 : h.target_count
    return `${h.title}: ${count}/${max}`
  }).join('\n')

  // Goals with progress
  const activeGoals = goals.filter(g => !g.parent_goal_id && g.target_value && g.current_value > 0)

  async function updateScore(category: string, score: number) {
    setSnapshots(prev => {
      const existing = prev.find(s => s.category === category)
      if (existing) return prev.map(s => s.category === category ? { ...s, score } : s)
      return [...prev, { id: crypto.randomUUID(), user_id: userId, category, score, week_start: weekStart, created_at: new Date().toISOString() } as ProgressSnapshot]
    })
    await supabase.from('progress_snapshots').upsert(
      { user_id: userId, category, score, week_start: weekStart },
      { onConflict: 'user_id,category,week_start' }
    )
  }

  async function generateReview() {
    setSuggestedScores(null)

    const scoresText = CATEGORIES.map(cat => {
      const snap = snapshots.find(s => s.category === cat.id)
      return `${cat.label} (${cat.id}): ${snap?.score ?? 0}/100`
    }).join('\n')

    const goalProgress = activeGoals.map(g =>
      `${g.title}: ${Math.round((g.current_value / (g.target_value ?? 1)) * 100)}% (${g.current_value}/${g.target_value} ${g.unit ?? ''})`
    ).join('\n')

    const financeStats = `Utgifter denne uken: ${formatCurrency(weekExpenses)}\nForrige uke: ${formatCurrency(prevWeekExpenses)}\nEndring: ${weekExpenses > prevWeekExpenses ? '+' : ''}${formatCurrency(weekExpenses - prevWeekExpenses)}`

    const response = await claude.call('weekly_review', {
      habitStats,
      goalProgress: goalProgress || 'Ingen mål med endring',
      financeStats,
      scores: scoresText,
    })

    // Try to parse suggested scores from the response
    if (response) {
      const scoresMatch = response.match(/SCORES:\s*(\{[^}]+\})/)
      if (scoresMatch) {
        try {
          const parsed = JSON.parse(scoresMatch[1]) as Record<string, number>
          setSuggestedScores(parsed)
        } catch {
          // Ignore parse errors
        }
      }

      // Auto-save journal entry
      const entryType = mode === 'weekly' ? 'weekly_review' : 'monthly_review'
      const { data, error } = await supabase.from('journal_entries').insert({
        user_id: userId,
        date: weekStart,
        type: entryType,
        content: `Habit stats:\n${habitStats}\n\nGoals:\n${goalProgress}\n\nFinance:\n${financeStats}`,
        ai_response: response,
      }).select().single()

      if (!error && data) {
        setJournals(prev => [data as JournalEntry, ...prev])
        toast('Lagret', 'success')
      } else if (error) {
        toast('Kunne ikke lagre review', 'error')
      }
    }
  }

  async function applySuggestedScores() {
    if (!suggestedScores) return
    for (const [cat, score] of Object.entries(suggestedScores)) {
      if (typeof score === 'number' && score >= 0 && score <= 100) {
        await updateScore(cat, score)
      }
    }
    setSuggestedScores(null)
  }

  // Save personal note
  async function saveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('journal_entries').insert({
      user_id: userId,
      date: today,
      type: 'note',
      content: noteText.trim(),
    }).select().single()

    if (!error && data) {
      setJournals(prev => [data as JournalEntry, ...prev])
      setNoteText('')
      toast('Notat lagret', 'success')
    } else {
      toast('Kunne ikke lagre notat', 'error')
    }
    setSavingNote(false)
  }

  // Delete journal entry
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const { error } = await supabase.from('journal_entries').delete().eq('id', deleteTarget)
    if (!error) {
      setJournals(prev => prev.filter(j => j.id !== deleteTarget))
      if (expandedJournal === deleteTarget) setExpandedJournal(null)
      toast('Slettet', 'success')
    } else {
      toast('Kunne ikke slette', 'error')
    }
    setDeleteTarget(null)
  }, [deleteTarget, supabase, expandedJournal, toast])

  // Save edited journal entry
  async function saveEdit(id: string) {
    if (!editContent.trim()) return
    const { error } = await supabase
      .from('journal_entries')
      .update({ content: editContent.trim() })
      .eq('id', id)

    if (!error) {
      setJournals(prev => prev.map(j => j.id === id ? { ...j, content: editContent.trim() } : j))
      setEditingId(null)
      setEditContent('')
      toast('Oppdatert', 'success')
    } else {
      toast('Kunne ikke oppdatere', 'error')
    }
  }

  function startEdit(journal: JournalEntry) {
    setEditingId(journal.id)
    setEditContent(journal.content)
    setExpandedJournal(journal.id)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  const expenseDiff = weekExpenses - prevWeekExpenses
  const overallScore = snapshots.length > 0
    ? Math.round(snapshots.reduce((s, snap) => s + snap.score, 0) / snapshots.length)
    : 0

  // Strip SCORES: line from display response
  const displayResponse = claude.response?.replace(/\n?SCORES:\s*\{[^}]+\}/, '') ?? null

  return (
    <div className="space-y-5">
      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Slett oppføring"
        message="Er du sikker på at du vil slette denne oppføringen?"
        confirmLabel="Slett"
        cancelLabel="Avbryt"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Mode toggle */}
      <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: '#0c3230' }}>
        {(['weekly', 'monthly'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={mode === m
              ? { backgroundColor: '#b8f04a', color: '#0c3230' }
              : { color: 'rgba(255,255,255,0.5)' }
            }
          >
            {m === 'weekly' ? 'Ukentlig' : 'Månedlig'}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: '#0c3230' }}>{habitPct}%</p>
          <p className="text-xs text-gray-400 mt-0.5">Vaner fullført</p>
          <p className="text-[10px] text-gray-300 mt-0.5">{completed}/{possible}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: expenseDiff > 0 ? '#f07070' : '#b8f04a' }}>
            {expenseDiff > 0 ? '+' : ''}{formatCurrency(expenseDiff)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">vs forrige uke</p>
        </div>
        <div className="flex flex-col items-center justify-center bg-white border border-gray-100 rounded-2xl p-4">
          <FaceIcon score={overallScore} size={36} />
          <p className="text-xs text-gray-400 mt-1">{overallScore}/100</p>
        </div>
      </div>

      {/* Goals this week */}
      {activeGoals.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-800 mb-3">Mål med fremgang</p>
          <div className="space-y-2.5">
            {activeGoals.map(g => {
              const pct = Math.min(100, Math.round((g.current_value / (g.target_value ?? 1)) * 100))
              return (
                <div key={g.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700">{g.title}</span>
                    <span className="font-semibold" style={{ color: '#0c3230' }}>{pct}%</span>
                  </div>
                  <div className="w-full rounded-full h-1.5 bg-gray-100">
                    <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: '#3dbfb5' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Score sliders */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-800">Score per kategori</p>
          {suggestedScores && (
            <button
              onClick={applySuggestedScores}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
            >
              Bruk Claudes forslag
            </button>
          )}
        </div>
        <div className="space-y-4">
          {CATEGORIES.map(cat => {
            const snap = snapshots.find(s => s.category === cat.id)
            const score = snap?.score ?? 0
            const suggested = suggestedScores?.[cat.id]
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-28 flex-shrink-0">
                    <FaceIcon score={score} size={22} />
                    <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={5} value={score}
                    onChange={e => updateScore(cat.id, Number(e.target.value))}
                    className="flex-1"
                    style={{ accentColor: '#0c3230' }}
                  />
                  <span className="text-sm font-bold w-8 text-right" style={{ color: '#0c3230' }}>{score}</span>
                </div>
                {suggested !== undefined && suggested !== score && (
                  <div className="flex items-center gap-2 ml-[7.5rem] mt-1">
                    <span className="text-[10px] text-gray-400">Claude foreslår: {suggested}</span>
                    <button
                      onClick={() => updateScore(cat.id, suggested)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded"
                      style={{ backgroundColor: '#e8f5e0', color: '#0c3230' }}
                    >
                      Bruk
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Claude review */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#0c3230' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">
            {mode === 'weekly' ? 'Ukesreview' : 'Månedlig review'}
          </p>
          <button
            onClick={generateReview}
            disabled={claude.loading}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
          >
            {claude.loading ? 'Tenker...' : 'Start review'}
          </button>
        </div>

        {!displayResponse && !claude.loading && !claude.error && (
          <p className="text-sm italic mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Sett ukesscorer og trykk &quot;Start review&quot; for Claudes analyse av uken din.
          </p>
        )}

        <ClaudeResponseDark
          response={displayResponse}
          loading={claude.loading}
          error={claude.error}
        />
      </div>

      {/* Add personal notes */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <p className="text-sm font-semibold text-gray-800 mb-3">Legg til notater</p>
        <textarea
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
          placeholder="Skriv dine egne tanker og refleksjoner..."
          className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:border-[#3dbfb5] resize-none"
          rows={3}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={saveNote}
            disabled={savingNote || !noteText.trim()}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
          >
            {savingNote ? 'Lagrer...' : 'Lagre notat'}
          </button>
        </div>
      </div>

      {/* Journal history */}
      <div>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center justify-between w-full mb-3"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Tidligere reviews
          </p>
          <span className="text-gray-300 text-sm">{historyOpen ? '▲' : '▼'}</span>
        </button>

        {historyOpen && (
          <div className="space-y-3">
            {journals.length === 0 && (
              <p className="text-sm text-gray-300 italic">Ingen oppføringer ennå.</p>
            )}
            {journals.map(j => {
              const isExpanded = expandedJournal === j.id
              const isEditing = editingId === j.id
              const typeStyle = TYPE_COLORS[j.type] ?? TYPE_COLORS.note
              const preview = j.content.length > 100 ? j.content.slice(0, 100) + '...' : j.content

              return (
                <div key={j.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => {
                        if (isEditing) return
                        setExpandedJournal(isExpanded ? null : j.id)
                      }}
                      className="flex-1 flex items-start gap-3 text-left min-w-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-gray-800">{formatDate(j.date)}</p>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: typeStyle.bg, color: typeStyle.text }}
                          >
                            {TYPE_LABELS[j.type] ?? j.type}
                          </span>
                        </div>
                        {!isExpanded && (
                          <p className="text-xs text-gray-400 truncate">{preview}</p>
                        )}
                      </div>
                      <span className="text-gray-300 flex-shrink-0 mt-0.5">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(j)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
                        title="Rediger"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(j.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-[#f07070] hover:bg-red-50 transition-colors"
                        title="Slett"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50">
                      {isEditing ? (
                        <div className="mt-3">
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            className="w-full rounded-xl border border-gray-200 p-3 text-sm text-gray-700 focus:outline-none focus:border-[#3dbfb5] resize-none"
                            rows={5}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={cancelEdit}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                            >
                              Avbryt
                            </button>
                            <button
                              onClick={() => saveEdit(j.id)}
                              disabled={!editContent.trim()}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                              style={{ backgroundColor: '#0c3230', color: '#b8f04a' }}
                            >
                              Lagre
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600 leading-relaxed mt-3 whitespace-pre-wrap">{j.content}</p>
                          {j.ai_response && (
                            <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#f7faf5' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Claudes svar</p>
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {j.ai_response.replace(/\n?SCORES:\s*\{[^}]+\}/, '')}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
