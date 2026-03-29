'use client'

import { useState, useRef } from 'react'
import type { FinanceEntry, FinanceTarget } from '@/types'
import { createClient } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useClaudeAPI, ClaudeResponseDark } from '@/components/ui/ClaudeResponse'

const CATEGORY_LABELS: Record<string, string> = {
  bolig: 'Bolig', mat: 'Mat', transport: 'Transport', trening: 'Trening',
  spise_ute: 'Spise ute', shopping: 'Shopping', abonnementer: 'Abonnement',
  inntekt: 'Inntekt', lønn: 'Lønn', utbytte: 'Utbytte', diverse: 'Diverse',
}

function label(cat: string) { return CATEGORY_LABELS[cat] ?? cat }

interface FinanceClientProps {
  entries: FinanceEntry[]
  targets: FinanceTarget[]
  month: string // 'YYYY-MM'
  userId: string
}

export function FinanceClient({ entries: initialEntries, targets: initialTargets, userId }: FinanceClientProps) {
  const [entries, setEntries] = useState(initialEntries)
  const [targets, setTargets] = useState(initialTargets)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [showBudgetEditor, setShowBudgetEditor] = useState(false)
  const [addForm, setAddForm] = useState({ date: new Date().toISOString().split('T')[0], amount: '', category: 'mat', description: '' })
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [csvMapping, setCsvMapping] = useState({ date: 0, amount: 1, description: 2 })
  const [csvCategory, setCsvCategory] = useState('mat')
  const [csvStep, setCsvStep] = useState<'upload' | 'map' | 'done'>('upload')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const claude = useClaudeAPI()

  // Edit category state
  const [editingCatEntryId, setEditingCatEntryId] = useState<string | null>(null)

  // Budget editor state
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})
  const [budgetSaving, setBudgetSaving] = useState<string | null>(null)

  // Metrics
  const income = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const expenses = entries.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0
  const unnecessarySpend = entries
    .filter(e => e.amount < 0 && ['spise_ute', 'shopping', 'abonnementer'].includes(e.category))
    .reduce((s, e) => s + Math.abs(e.amount), 0)

  // Savings goal
  const savingsTarget = targets.find(t => t.target_type === 'savings' && t.category === 'sparing_mlj')
  const currentSavings = income - expenses

  // Category spending
  const byCategory = entries
    .filter(e => e.amount < 0)
    .reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Math.abs(e.amount)
      return acc
    }, {})

  const chartData = Object.entries(byCategory)
    .map(([cat, amount]) => {
      const t = targets.find(t => t.category === cat && t.target_type === 'expense_limit')
      return { cat, label: label(cat), amount: Math.round(amount), budget: t?.monthly_budget ?? null }
    })
    .sort((a, b) => b.amount - a.amount)

  async function analyzeFinance() {
    const spendingText = chartData.map(d =>
      `${d.label}: ${formatCurrency(d.amount)}${d.budget ? ` (budsjett: ${formatCurrency(d.budget)})` : ''}`
    ).join('\n')

    const budgetText = targets
      .filter(t => t.target_type === 'expense_limit')
      .map(t => `${label(t.category)}: ${formatCurrency(t.monthly_budget ?? 0)}/mnd`)
      .join('\n')

    const savingsText = `Inntekt: ${formatCurrency(income)}\nUtgifter: ${formatCurrency(expenses)}\nSparerate: ${savingsRate}%\nSpart: ${formatCurrency(currentSavings)}\nMål MLJ Invest: 500 000 kr`

    await claude.call('finance_analysis', {
      spending: spendingText || 'Ingen transaksjoner',
      budgets: budgetText || 'Ingen budsjetter satt',
      savings: savingsText,
    })
  }

  // Add entry
  async function addEntry() {
    const amount = parseFloat(addForm.amount)
    if (!amount || !addForm.date) return
    const row = { user_id: userId, date: addForm.date, amount, category: addForm.category, description: addForm.description || undefined, source: 'manual' }
    const { data, error } = await supabase.from('finance_entries').insert(row).select().single()
    if (error) { console.error('Feil ved opprettelse:', error); return }
    if (data) { setEntries(prev => [data as FinanceEntry, ...prev]); setShowAddForm(false); setAddForm({ date: new Date().toISOString().split('T')[0], amount: '', category: 'mat', description: '' }) }
  }

  // Delete entry
  async function deleteEntry(id: string) {
    if (!window.confirm('Slett denne transaksjonen?')) return
    try {
      const { error } = await supabase.from('finance_entries').delete().eq('id', id)
      if (error) throw error
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch (err) {
      console.error('Feil ved sletting av transaksjon:', err)
    }
  }

  // Update entry category
  async function updateEntryCategory(id: string, newCategory: string) {
    try {
      const { data, error } = await supabase
        .from('finance_entries')
        .update({ category: newCategory })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      setEntries(prev => prev.map(e => e.id === id ? data as FinanceEntry : e))
      setEditingCatEntryId(null)
    } catch (err) {
      console.error('Feil ved oppdatering av kategori:', err)
    }
  }

  // Save budget
  async function saveBudget(category: string) {
    const amount = parseFloat(budgetDrafts[category] ?? '0')
    if (isNaN(amount)) return
    setBudgetSaving(category)
    try {
      const existing = targets.find(t => t.category === category && t.target_type === 'expense_limit')
      if (existing) {
        const { data, error } = await supabase
          .from('finance_targets')
          .update({ monthly_budget: amount })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        setTargets(prev => prev.map(t => t.id === existing.id ? data as FinanceTarget : t))
      } else {
        const { data, error } = await supabase
          .from('finance_targets')
          .insert({ user_id: userId, category, monthly_budget: amount, target_type: 'expense_limit' })
          .select()
          .single()
        if (error) throw error
        setTargets(prev => [...prev, data as FinanceTarget])
      }
    } catch (err) {
      console.error('Feil ved lagring av budsjett:', err)
    } finally {
      setBudgetSaving(null)
    }
  }

  // CSV parse
  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = text.trim().split('\n').map(r => r.split(/[,;|\t]/))
      setCsvRows(rows)
      setCsvStep('map')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function importCsv() {
    const dataRows = csvRows.slice(1) // skip header
    const toInsert = dataRows.map(row => ({
      user_id: userId,
      date: (row[csvMapping.date] ?? '').trim().replace(/\./g, '-').replace(/(\d{2})-(\d{2})-(\d{4})/, '$3-$2-$1'),
      amount: parseFloat((row[csvMapping.amount] ?? '0').replace(',', '.').replace(/\s/g, '')),
      category: csvCategory,
      description: (row[csvMapping.description] ?? '').trim(),
      source: 'csv_import',
    })).filter(r => r.date && !isNaN(r.amount))

    const { data } = await supabase.from('finance_entries').insert(toInsert).select()
    if (data) { setEntries(prev => [...(data as FinanceEntry[]), ...prev]) }
    setCsvStep('done')
    setTimeout(() => { setShowCsvModal(false); setCsvRows([]); setCsvStep('upload') }, 1500)
  }

  const EXPENSE_CATS = ['bolig', 'mat', 'transport', 'trening', 'spise_ute', 'shopping', 'abonnementer', 'diverse']
  const ALL_CATS = ['inntekt', 'lønn', 'utbytte', ...EXPENSE_CATS]

  return (
    <div className="space-y-5">
      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Inntekt', value: formatCurrency(income), color: '#b8f04a', bg: '#0c3230' },
          { label: 'Utgifter', value: formatCurrency(expenses), color: '#f07070', bg: '#0c3230' },
          { label: 'Sparerate', value: `${savingsRate}%`, color: savingsRate >= 20 ? '#b8f04a' : savingsRate >= 0 ? '#f5c070' : '#f07070', bg: '#0c3230' },
          { label: 'Unødvendig', value: formatCurrency(unnecessarySpend), color: '#f5c070', bg: '#0c3230' },
        ].map(m => (
          <div key={m.label} className="rounded-2xl p-4" style={{ backgroundColor: m.bg, border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.label}</p>
            <p className="text-xl font-bold" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Savings goal */}
      {savingsTarget?.yearly_target && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-gray-800">Sparemål MLJ Invest</p>
            <p className="text-xs text-gray-500">
              {formatCurrency(Math.max(0, currentSavings))} / {formatCurrency(savingsTarget.yearly_target)}
            </p>
          </div>
          <div className="w-full rounded-full h-2 bg-gray-100">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((Math.max(0, currentSavings) / savingsTarget.yearly_target) * 100))}%`,
                backgroundColor: '#b8f04a',
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {Math.min(100, Math.round((Math.max(0, currentSavings) / savingsTarget.yearly_target) * 100))}% av årsmål
          </p>
        </div>
      )}

      {/* Spending chart */}
      {chartData.length > 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-800 mb-4">Forbruk per kategori</p>
          <div className="space-y-2.5">
            {chartData.map(({ cat, label: lbl, amount, budget }) => {
              const overBudget = budget && amount > budget
              const pct = budget ? Math.min(130, Math.round((amount / budget) * 100)) : 100
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium">{lbl}</span>
                    <div className="flex gap-2 items-center">
                      {overBudget && <span className="text-red-500 text-[10px] font-semibold">OVER BUDSJETT</span>}
                      <span style={{ color: overBudget ? '#f07070' : '#0c3230' }} className="font-semibold">{formatCurrency(amount)}</span>
                      {budget && <span className="text-gray-400">/ {formatCurrency(budget)}</span>}
                    </div>
                  </div>
                  <div className="w-full rounded-full h-1.5 bg-gray-100">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: overBudget ? '#f07070' : '#3dbfb5' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-400">Ingen transaksjoner denne måneden</p>
        </div>
      )}

      {/* Claude analysis */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#0c3230' }}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-white">Økonomianalyse</p>
          <button
            onClick={analyzeFinance}
            disabled={claude.loading}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#b8f04a', color: '#0c3230' }}
          >
            {claude.loading ? 'Tenker...' : 'Analyser med Claude'}
          </button>
        </div>
        {!claude.response && !claude.loading && !claude.error && (
          <p className="text-sm italic mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Claude analyserer forbruk, budsjett og sparemål.
          </p>
        )}
        <ClaudeResponseDark
          response={claude.response}
          loading={claude.loading}
          error={claude.error}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#0c3230' }}
        >
          + Legg til
        </button>
        <button
          onClick={() => setShowCsvModal(true)}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
          style={{ borderColor: '#0c3230', color: '#0c3230' }}
        >
          Importer CSV
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">Ny postering</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Dato</label>
              <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Beløp (negativt = utgift)</label>
              <input type="number" placeholder="-500" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Kategori</label>
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600">
                {ALL_CATS.map(c => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Beskrivelse</label>
              <input type="text" placeholder="Valgfritt" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addEntry} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0c3230' }}>Lagre</button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200">Avbryt</button>
          </div>
        </div>
      )}

      {/* CSV Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            {csvStep === 'upload' && (
              <>
                <p className="text-sm font-semibold text-gray-800 mb-1">Importer transaksjoner</p>
                <p className="text-xs text-gray-500 mb-4">Last opp en CSV-fil med dato, beløp og beskrivelse. Komma, semikolon og tab støttes.</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-sm text-gray-400 hover:border-teal-400 transition-colors">
                  Klikk for å velge fil
                </button>
                <button onClick={() => setShowCsvModal(false)} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600">Avbryt</button>
              </>
            )}
            {csvStep === 'map' && csvRows.length > 0 && (
              <>
                <p className="text-sm font-semibold text-gray-800 mb-3">Koble kolonner</p>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-600 font-mono overflow-x-auto">
                  {csvRows[0].join(' | ')}
                </div>
                <div className="space-y-3 mb-4">
                  {(['date', 'amount', 'description'] as const).map((field) => (
                    <div key={field} className="flex items-center gap-3">
                      <label className="text-xs text-gray-600 w-24 flex-shrink-0">
                        {field === 'date' ? 'Dato' : field === 'amount' ? 'Beløp' : 'Beskrivelse'}
                      </label>
                      <select
                        value={csvMapping[field]}
                        onChange={e => setCsvMapping(m => ({ ...m, [field]: Number(e.target.value) }))}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                      >
                        {csvRows[0].map((col, i) => <option key={i} value={i}>Kolonne {i + 1}: {col}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-600 w-24 flex-shrink-0">Kategori</label>
                    <select value={csvCategory} onChange={e => setCsvCategory(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                      {ALL_CATS.map(c => <option key={c} value={c}>{label(c)}</option>)}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">{csvRows.length - 1} transaksjoner funnet</p>
                <div className="flex gap-2">
                  <button onClick={importCsv} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#0c3230' }}>
                    Importer {csvRows.length - 1} rader
                  </button>
                  <button onClick={() => { setShowCsvModal(false); setCsvRows([]); setCsvStep('upload') }}
                    className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200">Avbryt</button>
                </div>
              </>
            )}
            {csvStep === 'done' && (
              <div className="text-center py-4">
                <p className="text-2xl mb-2">✓</p>
                <p className="text-sm font-semibold text-gray-800">Import fullført</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Budget editor */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowBudgetEditor(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-sm font-semibold text-gray-800">Rediger budsjetter</p>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-4 w-4 text-gray-400 transition-transform ${showBudgetEditor ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        {showBudgetEditor && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {EXPENSE_CATS.map(cat => {
              const existing = targets.find(t => t.category === cat && t.target_type === 'expense_limit')
              const currentBudget = existing?.monthly_budget ?? 0
              const draftValue = budgetDrafts[cat]
              const hasChanged = draftValue !== undefined && parseFloat(draftValue) !== currentBudget
              return (
                <div key={cat} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <span className="text-sm text-gray-700 flex-shrink-0 w-28">{label(cat)}</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <input
                      type="number"
                      placeholder="0"
                      value={draftValue ?? (currentBudget || '')}
                      onChange={e => setBudgetDrafts(d => ({ ...d, [cat]: e.target.value }))}
                      className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:border-teal-600"
                    />
                    <span className="text-xs text-gray-400">kr/mnd</span>
                    {hasChanged && (
                      <button
                        onClick={() => saveBudget(cat)}
                        disabled={budgetSaving === cat}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50 flex-shrink-0"
                        style={{ backgroundColor: '#0c3230' }}
                      >
                        {budgetSaving === cat ? '...' : 'Lagre'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Transactions list */}
      {entries.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Transaksjoner</p>
          <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50">
            {entries.slice(0, 30).map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{e.description ?? label(e.category)}</p>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    {editingCatEntryId === e.id ? (
                      <select
                        value={e.category}
                        onChange={ev => updateEntryCategory(e.id, ev.target.value)}
                        onBlur={() => setEditingCatEntryId(null)}
                        autoFocus
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-teal-600 bg-white"
                      >
                        {ALL_CATS.map(c => <option key={c} value={c}>{label(c)}</option>)}
                      </select>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-gray-600 transition-colors underline decoration-dotted underline-offset-2"
                        onClick={() => setEditingCatEntryId(e.id)}
                        title="Klikk for å endre kategori"
                      >
                        {label(e.category)}
                      </span>
                    )}
                    <span>·</span>
                    <span>{e.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold" style={{ color: e.amount >= 0 ? '#1a635e' : '#0c3230' }}>
                    {e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}
                  </span>
                  <button
                    onClick={() => deleteEntry(e.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    title="Slett transaksjon"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
