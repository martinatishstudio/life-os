'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { FinanceTarget } from '@/types'

interface SpendingChartProps {
  data: Record<string, number>
  targets: FinanceTarget[]
}

export function SpendingChart({ data, targets }: SpendingChartProps) {
  const chartData = Object.entries(data).map(([category, amount]) => {
    const target = targets.find((t) => t.category === category && t.target_type === 'expense_limit')
    return {
      category,
      amount: Math.round(amount),
      budget: target?.monthly_budget ?? null,
    }
  }).sort((a, b) => b.amount - a.amount)

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="category"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value) => [
              new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(Number(value)),
              'Brukt',
            ]}
          />
          <Bar dataKey="amount" fill="#111827" radius={[3, 3, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
