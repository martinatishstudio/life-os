'use client'

import { useState, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts'
import type { ProgressSnapshot, Habit, HabitCompletion, Goal, GoalProgressLog, FinanceEntry } from '@/types'
import type { Category } from '@/types'

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

const HEATMAP_COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const DAY_LABELS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø']

interface TrendsClientProps {
  snapshots: ProgressSnapshot[]
  habits: Habit[]
  completions: HabitCompletion[]
  activeGoals: Goal[]
  completedGoals: Goal[]
  goalProgressLog: GoalProgressLog[]
  financeEntries: FinanceEntry[]
}

function getMonthRange(offset: number): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { start, end }
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('nb-NO', { month: 'short', year: '2-digit' })
}

export function TrendsClient({
  snapshots,
  habits,
  completions,
  activeGoals,
  completedGoals,
  goalProgressLog,
  financeEntries,
}: TrendsClientProps) {
  const [scoreTimeframe, setScoreTimeframe] = useState<'4w' | '3m' | '12m'>('3m')

  // ─── Summary Cards ───────────────────────────────────────────────
  const summaryData = useMemo(() => {
    const thisMonth = getMonthRange(0)
    const lastMonth = getMonthRange(-1)

    // Habit completion rate
    const habitsForRate = (range: { start: Date; end: Date }) => {
      const startStr = toDateStr(range.start)
      const endStr = toDateStr(range.end)
      const daysInRange = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1
      const totalPossible = habits.length * daysInRange
      if (totalPossible === 0) return 0
      const completed = completions.filter(c => c.completed_date >= startStr && c.completed_date <= endStr).length
      return Math.round((completed / totalPossible) * 100)
    }
    const habitRateThis = habitsForRate(thisMonth)
    const habitRateLast = habitsForRate(lastMonth)

    // Average category score
    const avgScore = (range: { start: Date; end: Date }) => {
      const startStr = toDateStr(range.start)
      const endStr = toDateStr(range.end)
      const relevant = snapshots.filter(s => s.week_start >= startStr && s.week_start <= endStr)
      if (relevant.length === 0) return 0
      return Math.round(relevant.reduce((sum, s) => sum + s.score, 0) / relevant.length)
    }
    const scoreThis = avgScore(thisMonth)
    const scoreLast = avgScore(lastMonth)

    // Total spending
    const spending = (range: { start: Date; end: Date }) => {
      const startStr = toDateStr(range.start)
      const endStr = toDateStr(range.end)
      return financeEntries
        .filter(e => e.date >= startStr && e.date <= endStr && e.amount < 0)
        .reduce((sum, e) => sum + Math.abs(e.amount), 0)
    }
    const spendingThis = spending(thisMonth)
    const spendingLast = spending(lastMonth)

    // Goals completed
    const goalsCompleted = (range: { start: Date; end: Date }) => {
      const startStr = toDateStr(range.start)
      const endStr = toDateStr(range.end)
      return completedGoals.filter(g => {
        const updated = g.updated_at.split('T')[0]
        return updated >= startStr && updated <= endStr
      }).length
    }
    const goalsThis = goalsCompleted(thisMonth)
    const goalsLast = goalsCompleted(lastMonth)

    return {
      habitRate: { current: habitRateThis, diff: habitRateThis - habitRateLast },
      score: { current: scoreThis, diff: scoreThis - scoreLast },
      spending: { current: spendingThis, diff: spendingThis - spendingLast },
      goals: { current: goalsThis, diff: goalsThis - goalsLast },
    }
  }, [habits, completions, snapshots, financeEntries, completedGoals])

  // ─── Category Scores Chart Data ──────────────────────────────────
  const scoreChartData = useMemo(() => {
    const now = new Date()
    let cutoff: Date
    if (scoreTimeframe === '4w') {
      cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 28)
    } else if (scoreTimeframe === '3m') {
      cutoff = new Date(now)
      cutoff.setMonth(cutoff.getMonth() - 3)
    } else {
      cutoff = new Date(now)
      cutoff.setFullYear(cutoff.getFullYear() - 1)
    }
    const cutoffStr = toDateStr(cutoff)

    const filtered = snapshots.filter(s => s.week_start >= cutoffStr)

    // Group by week_start
    const weekMap = new Map<string, Record<string, number>>()
    for (const s of filtered) {
      if (!weekMap.has(s.week_start)) weekMap.set(s.week_start, {})
      weekMap.get(s.week_start)![s.category] = s.score
    }

    return Array.from(weekMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, cats]) => ({
        week,
        label: formatShortDate(week),
        ...cats,
      }))
  }, [snapshots, scoreTimeframe])

  const activeCategories = useMemo(() => {
    const cats = new Set<Category>()
    for (const s of snapshots) cats.add(s.category as Category)
    return Array.from(cats)
  }, [snapshots])

  // ─── Habit Heatmap Data ──────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const now = new Date()
    // Go back 13 weeks from current Monday
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = today.getDay()
    const currentMonday = new Date(today)
    currentMonday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))

    const startMonday = new Date(currentMonday)
    startMonday.setDate(startMonday.getDate() - 12 * 7)

    // Build completion map: date -> count
    const completionMap = new Map<string, number>()
    for (const c of completions) {
      completionMap.set(c.completed_date, (completionMap.get(c.completed_date) ?? 0) + 1)
    }

    const totalHabits = habits.length || 1
    const weeks: { date: Date; dateStr: string; rate: number; completed: number; total: number }[][] = []
    const monthLabels: { label: string; colIndex: number }[] = []
    let lastMonth = -1

    for (let w = 0; w < 13; w++) {
      const week: typeof weeks[0] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(startMonday)
        date.setDate(startMonday.getDate() + w * 7 + d)
        const dateStr = toDateStr(date)
        const completed = completionMap.get(dateStr) ?? 0
        const rate = Math.round((completed / totalHabits) * 100)

        if (d === 0 && date.getMonth() !== lastMonth) {
          monthLabels.push({
            label: date.toLocaleDateString('nb-NO', { month: 'short' }),
            colIndex: w,
          })
          lastMonth = date.getMonth()
        }

        week.push({ date, dateStr, rate, completed, total: totalHabits })
      }
      weeks.push(week)
    }

    return { weeks, monthLabels }
  }, [habits, completions])

  // ─── Habit Completion Rates (last 4 weeks) ───────────────────────
  const habitBarData = useMemo(() => {
    const now = new Date()
    const fourWeeksAgo = new Date(now)
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
    const cutoff = toDateStr(fourWeeksAgo)

    const recentCompletions = completions.filter(c => c.completed_date >= cutoff)
    const completionsByHabit = new Map<string, number>()
    for (const c of recentCompletions) {
      completionsByHabit.set(c.habit_id, (completionsByHabit.get(c.habit_id) ?? 0) + 1)
    }

    return habits.map(h => {
      const completed = completionsByHabit.get(h.id) ?? 0
      const possible = 28 // 4 weeks of daily
      const rate = Math.round((completed / possible) * 100)
      return { name: h.title, rate, color: rate < 50 ? '#f07070' : rate < 80 ? '#f0c74a' : '#b8f04a' }
    }).sort((a, b) => a.rate - b.rate)
  }, [habits, completions])

  // ─── Goal Progression Data ───────────────────────────────────────
  const goalChartData = useMemo(() => {
    return activeGoals
      .filter(g => g.target_value != null && g.target_value > 0)
      .map(goal => {
        const logs = goalProgressLog
          .filter(l => l.goal_id === goal.id)
          .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
          .map(l => ({
            date: l.logged_at.split('T')[0],
            label: formatShortDate(l.logged_at.split('T')[0]),
            value: l.value,
          }))

        // Ideal pace line
        let idealLine: { date: string; label: string; ideal: number }[] = []
        if (logs.length > 0 && goal.deadline) {
          const startVal = logs[0].value
          const startDate = new Date(logs[0].date)
          const endDate = new Date(goal.deadline)
          const totalDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / 86400000)
          const valRange = (goal.target_value ?? 0) - startVal

          idealLine = logs.map(l => {
            const daysIn = (new Date(l.date).getTime() - startDate.getTime()) / 86400000
            return {
              date: l.date,
              label: l.label,
              ideal: Math.round(startVal + (valRange * daysIn / totalDays)),
            }
          })
        }

        return { goal, logs, idealLine }
      })
  }, [activeGoals, goalProgressLog])

  // ─── Finance Trends ──────────────────────────────────────────────
  const financeMonthlyData = useMemo(() => {
    const monthMap = new Map<string, number>()
    const categoryMonthMap = new Map<string, Map<string, number>>()

    for (const e of financeEntries) {
      if (e.amount >= 0) continue
      const monthKey = e.date.substring(0, 7) // YYYY-MM
      monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + Math.abs(e.amount))

      if (!categoryMonthMap.has(monthKey)) categoryMonthMap.set(monthKey, new Map())
      const catMap = categoryMonthMap.get(monthKey)!
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + Math.abs(e.amount))
    }

    const months = Array.from(monthMap.keys()).sort()
    const allCategories = new Set<string>()
    for (const catMap of categoryMonthMap.values()) {
      for (const cat of catMap.keys()) allCategories.add(cat)
    }

    const lineData = months.map(m => ({
      month: m,
      label: formatMonthYear(m + '-01'),
      total: Math.round(monthMap.get(m) ?? 0),
    }))

    const stackedData = months.map(m => {
      const catMap = categoryMonthMap.get(m) ?? new Map()
      const entry: Record<string, string | number> = { month: m, label: formatMonthYear(m + '-01') }
      for (const cat of allCategories) {
        entry[cat] = Math.round(catMap.get(cat) ?? 0)
      }
      return entry
    })

    return { lineData, stackedData, categories: Array.from(allCategories).sort() }
  }, [financeEntries])

  // Generate deterministic colors for finance categories
  const finCatColors = useMemo(() => {
    const palette = ['#3B82F6', '#14B8A6', '#A855F7', '#F59E0B', '#EC4899', '#F97316', '#6366F1', '#EF4444', '#10B981', '#8B5CF6']
    const map: Record<string, string> = {}
    financeMonthlyData.categories.forEach((cat, i) => {
      map[cat] = palette[i % palette.length]
    })
    return map
  }, [financeMonthlyData.categories])

  return (
    <div className="space-y-10">
      {/* Section 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Habit fullføring"
          value={`${summaryData.habitRate.current}%`}
          diff={summaryData.habitRate.diff}
          suffix="%"
        />
        <SummaryCard
          label="Snitt kategoriscore"
          value={String(summaryData.score.current)}
          diff={summaryData.score.diff}
          suffix=""
        />
        <SummaryCard
          label="Total forbruk"
          value={formatKr(summaryData.spending.current)}
          diff={-summaryData.spending.diff}
          suffix=""
          invertColor
        />
        <SummaryCard
          label="Mål fullført"
          value={String(summaryData.goals.current)}
          diff={summaryData.goals.diff}
          suffix=""
        />
      </div>

      {/* Section 2: Category Scores Over Time */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Kategoriscorer over tid</h2>
          <div className="flex gap-1">
            {([['4w', '4 uker'], ['3m', '3 måneder'], ['12m', '12 måneder']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setScoreTimeframe(key)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  scoreTimeframe === key
                    ? 'bg-[#0c3230] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {scoreChartData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">Ingen data for valgt periode</p>
        ) : (
          <div className="h-64 md:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  labelFormatter={(label) => String(label)}
                  formatter={(value, name) => [
                    Number(value),
                    CATEGORY_LABELS[String(name) as Category] ?? name,
                  ]}
                />
                <Legend
                  formatter={(value: string) => CATEGORY_LABELS[value as Category] ?? value}
                  wrapperStyle={{ fontSize: 11 }}
                />
                {activeCategories.map(cat => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={CATEGORY_COLORS[cat]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <hr className="border-gray-100" />

      {/* Section 3: Habit Heatmap */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Habit heatmap (siste 13 uker)</h2>
        <div className="overflow-x-auto">
          {/* Month labels */}
          <div className="flex ml-8 mb-1">
            {heatmapData.monthLabels.map((m, i) => (
              <span
                key={i}
                className="text-[10px] text-gray-400 capitalize"
                style={{ marginLeft: i === 0 ? m.colIndex * 16 : undefined, width: 48 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          {/* Grid */}
          <div className="flex gap-[2px]">
            {/* Day labels */}
            <div className="flex flex-col gap-[2px] mr-1">
              {DAY_LABELS.map((d, i) => (
                <span key={i} className="text-[10px] text-gray-400 w-6 h-[14px] flex items-center">
                  {i % 2 === 0 ? d : ''}
                </span>
              ))}
            </div>
            {/* Weeks */}
            {heatmapData.weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[2px]">
                {week.map((day, di) => {
                  const isFuture = day.date > new Date()
                  const colorIndex = isFuture
                    ? 0
                    : day.rate === 0
                      ? 0
                      : day.rate <= 25
                        ? 1
                        : day.rate <= 50
                          ? 2
                          : day.rate <= 75
                            ? 3
                            : 4
                  return (
                    <div
                      key={di}
                      className="w-[14px] h-[14px] rounded-sm group relative"
                      style={{ backgroundColor: HEATMAP_COLORS[colorIndex] }}
                    >
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded whitespace-nowrap z-10">
                        {day.completed} av {day.total} habits fullført
                        <br />
                        {new Date(day.dateStr).toLocaleDateString('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Habit completion bars */}
        {habitBarData.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Fullføringsrate per habit (siste 4 uker)</h3>
            <div className="space-y-2">
              {habitBarData.map((h, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-32 truncate shrink-0">{h.name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 relative">
                    <div
                      className="h-4 rounded-full transition-all"
                      style={{ width: `${Math.min(100, h.rate)}%`, backgroundColor: h.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-10 text-right">{h.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <hr className="border-gray-100" />

      {/* Section 4: Goal Progression */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Målprogresjon</h2>
        {goalChartData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Ingen aktive mål med målverdi</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {goalChartData.map(({ goal, logs, idealLine }) => (
              <div key={goal.id} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-900">{goal.title}</h3>
                  <span className="text-xs text-gray-500">
                    {goal.current_value} / {goal.target_value} {goal.unit ?? ''}
                  </span>
                </div>
                {logs.length === 0 ? (
                  <p className="text-xs text-gray-400 py-6 text-center">Ingen historikk ennå</p>
                ) : (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={logs.map((l, i) => ({
                          ...l,
                          ideal: idealLine[i]?.ideal,
                        }))}
                        margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
                      >
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#9ca3af' }}
                          axisLine={false}
                          tickLine={false}
                          width={35}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
                          formatter={(value, name) => [
                            `${Number(value)} ${goal.unit ?? ''}`,
                            String(name) === 'value' ? 'Faktisk' : 'Ideelt tempo',
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#0c3230"
                          strokeWidth={2}
                          dot={{ r: 3, fill: '#0c3230' }}
                        />
                        {idealLine.length > 0 && (
                          <Line
                            type="monotone"
                            dataKey="ideal"
                            stroke="#9ca3af"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            dot={false}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <hr className="border-gray-100" />

      {/* Section 5: Finance Trends */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Utgifter siste 12 måneder</h2>
        {financeMonthlyData.lineData.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Ingen finansdata tilgjengelig</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Total expenses line chart */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Totale utgifter per måned</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financeMonthlyData.lineData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(value) => [formatKr(Number(value)), 'Utgifter']}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#0c3230"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#0c3230' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Stacked bar chart by category */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Utgifter per kategori</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeMonthlyData.stackedData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      formatter={(value, name) => [formatKr(Number(value)), String(name)]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {financeMonthlyData.categories.map(cat => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        fill={finCatColors[cat]}
                        radius={0}
                        maxBarSize={30}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Helper Components ─────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  diff,
  suffix,
  invertColor,
}: {
  label: string
  value: string
  diff: number
  suffix: string
  invertColor?: boolean
}) {
  const isPositive = invertColor ? diff < 0 : diff > 0
  const isNeutral = diff === 0
  const arrow = diff > 0 ? '\u2191' : diff < 0 ? '\u2193' : ''
  const colorClass = isNeutral
    ? 'text-gray-400'
    : isPositive
      ? 'text-green-600'
      : 'text-red-500'

  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      <p className={`text-xs mt-1 ${colorClass}`}>
        {arrow} {Math.abs(diff)}{suffix} vs forrige mnd
      </p>
    </div>
  )
}

function formatKr(amount: number): string {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    maximumFractionDigits: 0,
  }).format(amount)
}
