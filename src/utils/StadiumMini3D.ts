'use client'

export default function StadiumMini3D({
  level,
  night,
  roofProgress, // 0..1
  tierCount,    // 1..3
  lightsCount,  // 0..6
  screens,      // 0..2
}: {
  level: number
  night: boolean
  roofProgress: number
  tierCount: number
  lightsCount: number
  screens: number
}) {
  const W = 220
  const H = 130
  const standH = 18 + level * 5
  const pad = 10

  const grass = '#1f8b3f'
  const dirt = '#4b5563'
  const stand = '#9ca3af'
  const standDark = '#6b7280'
  const roof = '#d4d4d8'
  const roofDark = '#a1a1aa'
  const pole = '#94a3b8'
  const lightOn = night ? '#ffe16b' : '#cbd5e1'
  const screen = '#111827'
  const screenGlow = '#22d3ee'

  function tier(y: number, scaleX = 1) {
    const baseW = (W - pad * 2) * scaleX
    const x1 = (W - baseW) / 2
    const y1 = y
    const x2 = W - x1
    const y2 = y + standH
    return `M ${x1} ${y2} L ${x1 + 8} ${y1} L ${x2 - 8} ${y1} L ${x2} ${y2} Z`
  }

  const tiers: string[] = []
  const tiersGap = 6
  for (let i = 0; i < tierCount; i++) {
    tiers.push(tier(20 + i * (standH + tiersGap), 1 - i * 0.1))
  }

  const roofY = 18
  const roofX1 = 22
  const roofX2 = W - roofX1
  const roofW = roofX2 - roofX1
  const roofCoverW = roofW * roofProgress

  const lightPositions = [
    { x: 22, y: 12 },
    { x: W - 22, y: 12 },
    { x: 60, y: 8 },
    { x: W - 60, y: 8 },
    { x: 100, y: 6 },
    { x: W - 100, y: 6 },
  ].slice(0, lightsCount)

  const screenPositions = [
    { x: W / 2 - 28, y: 6, w: 56, h: 10 },
    { x: W / 2 - 20, y: H - 20, w: 40, h: 8 },
  ].slice(0, screens)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <rect x="0" y="0" width={W} height={H} fill={night ? '#0b1020' : '#0b1324'} opacity={night ? 0.9 : 0.6} />

      <rect x={pad} y={H - 38} width={W - pad * 2} height={24} fill={grass} stroke="#0f172a" strokeWidth="1" />
      <rect x={W / 2 - 1} y={H - 38} width="2" height="24" fill="#e5e7eb" opacity="0.6" />
      <rect x={pad - 4} y={H - 14} width={W - (pad - 4) * 2} height={8} fill={dirt} opacity="0.8" />

      {tiers.map((d, i) => (
        <path key={i} d={d} fill={i % 2 === 0 ? stand : standDark} stroke="#0f172a" strokeWidth="1" opacity={0.95 - i * 0.05} />
      ))}

      <g>
        <rect x={roofX1} y={roofY} width={roofW} height="8" fill={roofDark} opacity="0.6" />
        <rect x={roofX1} y={roofY} width={roofCoverW} height="8" fill={roof} />
      </g>

      {lightPositions.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 1.2} y={p.y} width="2.4" height={H - p.y - 20} fill={pole} />
          <circle cx={p.x} cy={p.y} r="4" fill={lightOn} opacity={night ? 1 : 0.7} />
          {night && <circle cx={p.x} cy={p.y} r="8" fill={lightOn} opacity="0.25" />}
        </g>
      ))}

      {screenPositions.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={screen} stroke="#374151" strokeWidth="1" />
          <rect x={s.x + 3} y={s.y + 3} width={s.w - 6} height={s.h - 6} fill={screenGlow} opacity={night ? 0.5 : 0.25} />
        </g>
      ))}

      <rect x={pad - 6} y={H - 10} width={W - (pad - 6) * 2} height="6" fill="#374151" />
    </svg>
  )
}
