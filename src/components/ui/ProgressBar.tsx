interface ProgressBarProps {
  value: number
  max: number
  colorClass?: string
}

export function ProgressBar({ value, max, colorClass = 'bg-gray-900' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
