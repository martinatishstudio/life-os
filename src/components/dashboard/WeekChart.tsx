'use client'

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { CATEGORIES } from '@/types'
import type { ProgressSnapshot } from '@/types'

interface WeekChartProps {
  snapshots: ProgressSnapshot[]
}

export function WeekChart({ snapshots }: WeekChartProps) {
  const data = CATEGORIES.map((cat) => {
    const snap = snapshots.find((s) => s.category === cat.id)
    return {
      category: cat.label,
      score: snap?.score ?? 0,
    }
  })

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="category"
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#111827"
            fill="#111827"
            fillOpacity={0.08}
            strokeWidth={1.5}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
            formatter={(value) => [`${value}/100`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
