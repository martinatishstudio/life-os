interface FaceIconProps {
  score: number
  size?: number
  className?: string
}

// Score thresholds
// 0–40: sad (red)
// 41–65: neutral (amber)
// 66–100: happy (green)

export function FaceIcon({ score, size = 40, className = '' }: FaceIconProps) {
  const mood = score >= 66 ? 'happy' : score >= 41 ? 'neutral' : 'sad'

  const colors = {
    happy:   { bg: '#b8f04a', stroke: '#0c3230', glow: '#b8f04a33' },
    neutral: { bg: '#f5c070', stroke: '#0c3230', glow: '#f5c07033' },
    sad:     { bg: '#f07070', stroke: '#0c3230', glow: '#f0707033' },
  }

  const c = colors[mood]
  const s = size

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* SIM card shape */}
      <path
        d="M6 10C6 7.79 7.79 6 10 6H26L34 14V30C34 32.21 32.21 34 30 34H10C7.79 34 6 32.21 6 30V10Z"
        fill={c.bg}
        stroke={c.stroke}
        strokeWidth="2.2"
      />
      {/* Cut corner detail */}
      <path
        d="M26 6L34 14H28C26.9 14 26 13.1 26 12V6Z"
        fill={c.stroke}
        opacity="0.15"
      />

      {/* Eyes */}
      {mood === 'happy' && (
        <>
          {/* Happy squint eyes */}
          <path d="M14 18.5C14 18.5 14.8 17.5 16 17.5C17.2 17.5 18 18.5 18 18.5" stroke={c.stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M22 18.5C22 18.5 22.8 17.5 24 17.5C25.2 17.5 26 18.5 26 18.5" stroke={c.stroke} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {mood === 'neutral' && (
        <>
          {/* Neutral dot eyes */}
          <circle cx="16" cy="18" r="1.4" fill={c.stroke} />
          <circle cx="24" cy="18" r="1.4" fill={c.stroke} />
        </>
      )}
      {mood === 'sad' && (
        <>
          {/* Sad dot eyes with slight worry */}
          <circle cx="16" cy="18" r="1.4" fill={c.stroke} />
          <circle cx="24" cy="18" r="1.4" fill={c.stroke} />
          {/* Eyebrow worry lines */}
          <path d="M14 15.5C14.5 14.8 16 14.5 17 15" stroke={c.stroke} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M23 15C24 14.5 25.5 14.8 26 15.5" stroke={c.stroke} strokeWidth="1.4" strokeLinecap="round" />
        </>
      )}

      {/* Mouth */}
      {mood === 'happy' && (
        <path d="M15 24C15 24 17 27 20 27C23 27 25 24 25 24" stroke={c.stroke} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {mood === 'neutral' && (
        <path d="M15.5 25H24.5" stroke={c.stroke} strokeWidth="1.8" strokeLinecap="round" />
      )}
      {mood === 'sad' && (
        <path d="M15 27C15 27 17 24 20 24C23 24 25 27 25 27" stroke={c.stroke} strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function FaceLabel({ score }: { score: number }) {
  if (score >= 66) return <span className="text-xs font-medium text-lime-600">På sporet</span>
  if (score >= 41) return <span className="text-xs font-medium text-amber-600">Kan gjøres bedre</span>
  return <span className="text-xs font-medium text-red-600">Bakpå</span>
}
