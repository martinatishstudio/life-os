import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { FinanceEntry, FinanceTarget } from '@/types'
import { FinanceClient } from '@/components/finance/FinanceClient'
import { MonthNav } from '@/components/finance/MonthNav'

export const revalidate = 0

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const params = await searchParams

  const now = new Date()
  const month = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${new Date(year, mon, 0).getDate()}`

  const [entriesRes, targetsRes] = await Promise.all([
    supabase.from('finance_entries').select('*').gte('date', monthStart).lte('date', monthEnd).order('date', { ascending: false }),
    supabase.from('finance_targets').select('*'),
  ])

  const entries = (entriesRes.data ?? []) as FinanceEntry[]
  const targets = (targetsRes.data ?? []) as FinanceTarget[]

  const monthLabel = new Date(year, mon - 1, 1).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })

  return (
    <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Økonomi</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 capitalize">{monthLabel}</h1>
        </div>
        <MonthNav currentMonth={month} />
      </div>
      <FinanceClient entries={entries} targets={targets} month={month} userId={user?.id ?? ''} />
    </div>
  )
}
