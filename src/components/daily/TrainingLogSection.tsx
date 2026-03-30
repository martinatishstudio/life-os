'use client'

import Link from 'next/link'
import type { TrainingLog } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  'Styrke': 'bg-blue-50 text-blue-700',
  'Cardio': 'bg-red-50 text-red-700',
  'Zone 2': 'bg-teal-50 text-teal-700',
  'HYROX': 'bg-amber-50 text-amber-700',
  'Padel': 'bg-purple-50 text-purple-700',
  'Annet': 'bg-gray-100 text-gray-600',
}

function getRelativeDate(dateStr: string): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(dateStr + 'T12:00:00')
  date.setHours(0, 0, 0, 0)

  const diffMs = today.getTime() - date.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'I dag'
  if (diffDays === 1) return 'I g\u00E5r'
  if (diffDays < 7) return `${diffDays} dager siden`
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
}

interface TrainingLogSectionProps {
  logs: TrainingLog[]
}

export function TrainingLogSection({ logs }: TrainingLogSectionProps) {
  if (logs.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Treningslogg</p>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-400">
            Ingen treninger logget enn\u00E5. Bruk + knappen for \u00E5 logge.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Treningslogg</p>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {logs.map((log) => {
          const colorClass = TYPE_COLORS[log.type] ?? TYPE_COLORS['Annet']
          return (
            <div key={log.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-gray-400 w-16 flex-shrink-0">
                {getRelativeDate(log.date)}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${colorClass}`}>
                {log.type}
              </span>
              {log.duration_minutes && (
                <span className="text-sm text-gray-600 flex-shrink-0">
                  {log.duration_minutes} min
                </span>
              )}
              {log.notes && (
                <span className="text-xs text-gray-400 truncate min-w-0">
                  {log.notes}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <Link
        href="/trends"
        className="block text-center text-xs font-medium mt-2 py-2 transition-colors"
        style={{ color: '#3dbfb5' }}
      >
        Se alle trender {'\u2192'}
      </Link>
    </div>
  )
}
