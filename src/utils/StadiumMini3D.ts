'use client'

import React from 'react'

type Props = {
  level: number
  night?: boolean
  roofProgress?: number   // 0..1
  tierCount?: number      // 1..3
  lightsCount?: number    // 0..6
  screens?: number        // 0..2
}

export default function StadiumMini3D({
  level,
  night = false,
  roofProgress = 0.2,
  tierCount = 1,
  lightsCount = 0,
  screens = 0,
}: Props) {
  // canvas
  const W = 520
  const H = 300

  // paleta (dia/noite)
  const col = {
    sky: night ? '#0b1020' : '#0e1428',
    skyGlow: night ? '#101735' : '#122043',
    grass: night ? '#14693a' : '#1f8b3f',
    track: '#4b5563',
    wall: '#374151',
    stand1: '#9aa3af',
    stand2: '#7a8390',
    roof: '#d4d4d8',
    roofDark: '#a1a1aa',
    pole: '#94a3b8',
    lightOn: night ? '#ffe16b' : '#cbd5e1',
    screen: '#0b1220',
    screenGlow: '#22d3ee',
    line: '#e5e7eb',
  }

  // helpers
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

  // geometria básica
  const margin = 18
  const fieldW = W - margin * 2
  const fieldH = 140
  const fieldY = H - fieldH - 40

  // perspectiva simples para arquibancadas (quanto maior nível, mais “altas”)
  const tierGap = 8
  const standHeight = 22 + level * 2
  const standSkew = 0.15 // inclinação
  const tiers = Array.from({ length: tierCount }).map((_, i) => {
    const top = fieldY - (standHeight + tierGap) * (i + 1)
    const sx = 1 - i * 0.08 // “estreita” em cima
    const left = (W - fieldW * sx) / 2
    const right = W - left
    const h = standHeight
    // polígono trapezoidal
    const x1 = left
    const y1 = top + h
    const x2 = left + 10
    const y2 = top
    const x3 = right - 10
    const y3 = top
    const x4 = right
    const y4 = top + h
    return { d: `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`, i }
  })

  // cobertura (vai preenchendo de acordo com roofProgress)
  const roofY = fieldY - (standHeight + tierGap) * tierCount - 10
  const roofX1 = margin + 35
  const roofX2 = W - roofX1
  const roofW = roofX2 - roofX1
  const roofCover = clamp(roofProgress, 0, 1) * roofW

  // postes de luz (até 6)
  const lightPositions = [
    { x: margin + 28, y: roofY - 22 },
    { x: W - margin - 28, y: roofY - 22 },
    { x: margin + 110, y: roofY - 28 },
    { x: W - margin - 110, y: roofY - 28 },
    { x: W / 2 - 70, y: roofY - 32 },
    { x: W / 2 + 70, y: roofY - 32 },
  ].slice(0, clamp(lightsCount, 0, 6))

  // telões (até 2)
  const screenPositions = [
    { x: W / 2 - 70, y: roofY - 16, w: 140, h: 16 },
    { x: W / 2 - 50, y: fieldY + fieldH + 8, w: 100, h: 12 },
  ].slice(0, clamp(screens, 0, 2))

  // “3Dzinho” via transform
  const tilt = 6 // graus de inclinação
  const shadow = night ? '0 12px 30px rgba(0,0,0,0.45)' : '0 12px 28px rgba(0,0,0,0.25)'

  return (
    <div
      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3"
      style={{
        boxShadow: shadow,
        perspective: 900,
      }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          transform: `rotateX(${tilt}deg)`,
          transformOrigin: 'center 80%',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
          {/* Céu / fundo com gradiente */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col.sky} />
              <stop offset="100%" stopColor={col.skyGlow} />
            </linearGradient>
            <linearGradient id="grassGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col.grass} />
              <stop offset="100%" stopColor={night ? '#0d3f25' : '#136c34'} />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#sky)" />

          {/* Gramado */}
          <rect x={margin} y={fieldY} width={fieldW} height={fieldH} fill="url(#grassGrad)" stroke="#0f172a" strokeWidth="1" />
          {/* marcações */}
          <rect x={W/2 - 1} y={fieldY} width="2" height={fieldH} fill={col.line} opacity="0.6" />
          <rect x={margin + 12} y={fieldY + 12} width={fieldW - 24} height={fieldH - 24} fill="none" stroke={col.line} strokeWidth="1" opacity="0.25" rx="14" />

          {/* Pista/entorno */}
          <rect x={margin - 8} y={fieldY + fieldH} width={fieldW + 16} height="16" fill={col.track} opacity="0.85" />
          <rect x={margin - 10} y={fieldY + fieldH + 16} width={fieldW + 20} height="10" fill={col.wall} />

          {/* Arquibancadas */}
          {tiers.map(({ d, i }) => (
            <path
              key={i}
              d={d}
              fill={i % 2 === 0 ? col.stand1 : col.stand2}
              stroke="#0f172a"
              strokeWidth="1"
              opacity={0.94 - i * 0.06}
            />
          ))}

          {/* Cobertura total (base) */}
          {tierCount > 0 && (
            <>
              <rect x={roofX1} y={roofY} width={roofW} height="12" fill={col.roofDark} opacity="0.45" />
              {/* Progresso de cobertura */}
              <rect x={roofX1} y={roofY} width={roofCover} height="12" fill={col.roof} />
            </>
          )}

          {/* Postes e luzes */}
          {lightPositions.map((p, i) => (
            <g key={i}>
              <rect x={p.x - 1.8} y={p.y} width="3.6" height={H - p.y - 48} fill={col.pole} />
              <circle cx={p.x} cy={p.y} r="6" fill={col.lightOn} opacity={night ? 1 : 0.7} />
              {night && <circle cx={p.x} cy={p.y} r="14" fill={col.lightOn} opacity="0.22" />}
            </g>
          ))}

          {/* Telões */}
          {screenPositions.map((s, i) => (
            <g key={i}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={col.screen} stroke="#233047" strokeWidth="1" rx="3" />
              <rect x={s.x + 4} y={s.y + 3} width={s.w - 8} height={s.h - 6} fill={col.screenGlow} opacity={night ? 0.55 : 0.28} rx="2" />
            </g>
          ))}

          {/* Sombra frontal para profundidade */}
          <rect x="0" y={H - 24} width={W} height="24" fill="#000" opacity="0.18" />
        </svg>
      </div>
    </div>
  )
}
