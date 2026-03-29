'use client'

import { useRouter } from 'next/navigation'

interface MonthNavProps {
  currentMonth: string // 'YYYY-MM'
}

export function MonthNav({ currentMonth }: MonthNavProps) {
  const router = useRouter()
  const [year, mon] = currentMonth.split('-').map(Number)

  function navigate(offset: number) {
    const d = new Date(year, mon - 1 + offset, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    router.push(`/finance?month=${m}`)
  }

  const isCurrentMonth = currentMonth === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => navigate(-1)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
        ‹
      </button>
      {!isCurrentMonth && (
        <button onClick={() => navigate(0)}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
          I dag
        </button>
      )}
      <button onClick={() => navigate(1)} disabled={isCurrentMonth}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-30">
        ›
      </button>
    </div>
  )
}
