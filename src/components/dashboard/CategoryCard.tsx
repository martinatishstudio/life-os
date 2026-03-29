import { CATEGORY_MAP, type Category } from '@/types'
import { FaceIcon } from '@/components/ui/FaceIcon'

interface CategoryCardProps {
  category: Category
  score: number
  goalCount: number
  completedHabits: number
  totalHabits: number
}

const CATEGORY_ACCENT: Record<Category, string> = {
  business: '#3dbfb5',
  physical: '#b8f04a',
  mental:   '#a78bfa',
  finance:  '#f5c070',
  family:   '#f0a0c0',
  lifestyle:'#f0a07a',
  brand:    '#7aa8f0',
}

export function CategoryCard({ category, score, goalCount, completedHabits, totalHabits }: CategoryCardProps) {
  const meta = CATEGORY_MAP[category]
  const accent = CATEGORY_ACCENT[category]

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ backgroundColor: '#0c3230', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {meta.label}
          </p>
          <p className="text-3xl font-bold text-white mt-0.5">{score}</p>
        </div>
        <FaceIcon score={score} size={44} />
      </div>

      {/* Progress bar */}
      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: accent }}
        />
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{goalCount} mål</p>
        {totalHabits > 0 && (
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{completedHabits}/{totalHabits} vaner</p>
        )}
      </div>
    </div>
  )
}
