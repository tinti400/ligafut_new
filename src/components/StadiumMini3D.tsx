'use client'

import React, { useMemo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

type Props = {
  level: number
  night?: boolean
  primaryColor?: string
  // Controles opcionais (se não passar, calculamos pelo nível)
  roofProgress?: number   // 0..1 (quanto da cobertura já existe)
  tierCount?: number      // 1..3 (andares de arquibancada)
  lightsCount?: number    // 0..6 (postes de luz)
  screens?: number        // 0..2 (telões)
}

export default function StadiumMini3D(props: Props) {
  const {
    level,
    night = false,
    primaryColor = '#22c55e',
    roofProgress,
    tierCount,
    lightsCount,
    screens,
  } = props

  // Fallbacks visuais baseado no nível (caso não venham via props)
  const tiers = tierCount ?? (level >= 9 ? 3 : level >= 5 ? 2 : 1)
  const roofK = roofProgress ?? (level >= 9 ? 1 : level >= 7 ? 0.75 : level >= 5 ? 0.5 : level >= 3 ? 0.25 : 0.05)
  const lights = lightsCount ?? (level >= 9 ? 6 : level >= 6 ? 4 : level >= 3 ? 2 : 0)
  const screensN = screens ?? (level >= 8 ? 2 : level >= 5 ? 1 : 0)

  // Dimensões baseadas no "nível"
  const bowlOuter = 12 + level * 0.8
  const fieldSize = 10
  const tierHeight = 0.5
  const tierGap = 0.18
  const roofOuter = bowlOuter + 0.8
  const roofInner = bowlOuter - 0.8

  // Distribuições
  const lightPositions = useMemo(() => {
    const arr: { x: number; z: number }[] = []
    const count = Math.max(0, Math.min(6, lights))
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2
      arr.push({ x: Math.cos(ang) * (bowlOuter + 1.6), z: Math.sin(ang) * (bowlOuter + 1.6) })
    }
    return arr
  }, [lights, bowlOuter])

  const screenPositions = useMemo(() => {
    const base: { x: number; z: number; rotY: number }[] = [
      { x: 0, z: -(bowlOuter + 0.6), rotY: 0 },                 // atrás do gol
      { x: bowlOuter + 0.6, z: 0, rotY: -Math.PI / 2 },         // lateral
    ]
    return base.slice(0, Math.max(0, Math.min(2, screensN)))
  }, [screensN, bowlOuter])

  return (
    <div className="w-full h-[420px] rounded-xl border border-zinc-800 bg-zinc-950/40">
      <Canvas camera={{ position: [0, 12, 20], fov: 50 }}>
        <Suspense fallback={null}>
          {/* Luz ambiente/direcional simples – mais escuro à noite */}
          <ambientLight intensity={night ? 0.2 : 0.7} />
          <directionalLight position={[6, 12, 6]} intensity={night ? 0.5 : 0.7} />
          {night && (
            <>
              <pointLight position={[0, 10, 0]} intensity={0.4} />
              {lightPositions.map((p, i) => (
                <pointLight key={i} position={[p.x, 6.5, p.z]} intensity={0.9} distance={18} />
              ))}
            </>
          )}

          <Scene
            fieldSize={fieldSize}
            bowlOuter={bowlOuter}
            tiers={tiers}
            tierHeight={tierHeight}
            tierGap={tierGap}
            roofInner={roofInner}
            roofOuter={roofOuter}
            roofK={roofK}
            lightPositions={lightPositions}
            screenPositions={screenPositions}
            night={night}
            primaryColor={primaryColor}
          />

          <OrbitControls enablePan enableZoom enableRotate />
        </Suspense>
      </Canvas>
    </div>
  )
}

/* ===== Cena em meshes simples (leve e estável no build) ===== */
function Scene({
  fieldSize,
  bowlOuter,
  tiers,
  tierHeight,
  tierGap,
  roofInner,
  roofOuter,
  roofK,
  lightPositions,
  screenPositions,
  night,
  primaryColor,
}: {
  fieldSize: number
  bowlOuter: number
  tiers: number
  tierHeight: number
  tierGap: number
  roofInner: number
  roofOuter: number
  roofK: number
  lightPositions: { x: number; z: number }[]
  screenPositions: { x: number; z: number; rotY: number }[]
  night: boolean
  primaryColor: string
}) {
  // Campo
  return (
    <group>
      {/* Gramado */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[fieldSize, fieldSize]} />
        <meshStandardMaterial color={primaryColor} />
      </mesh>

      {/* Linhas do campo */}
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.001, 0]}>
          <ringGeometry args={[fieldSize * 0.48, fieldSize * 0.5, 64]} />
          <meshBasicMaterial color={night ? '#cbd5e1' : '#e5e7eb'} />
        </mesh>
        <mesh position={[0, 0.001, 0]}>
          <planeGeometry args={[0.05, fieldSize]} />
          <meshBasicMaterial color={night ? '#cbd5e1' : '#e5e7eb'} />
        </mesh>
      </group>

      {/* Arquibancadas (anéis) */}
      {Array.from({ length: tiers }).map((_, i) => {
        const inner = fieldSize * 0.55 + i * (1.4)
        const outer = inner + 1.2 + i * 0.15
        const y = 0.22 + i * (tierHeight + tierGap)
        const color = i % 2 === 0 ? '#9ca3af' : '#6b7280'
        return (
          <mesh key={i} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            {/* anel horizontal */}
            {/* @ts-ignore – argumentos de RingGeometry aceitos pelo runtime */}
            <ringGeometry args={[inner, Math.min(outer, bowlOuter), 64]} />
            <meshStandardMaterial color={color} />
          </mesh>
        )
      })}

      {/* Cobertura (proporção do círculo) */}
      {roofK > 0 && (
        <mesh position={[0, 0.22 + tiers * (tierHeight + tierGap), 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {/* @ts-ignore */}
          <ringGeometry args={[roofInner, roofOuter, 64, 1, 0, Math.PI * 2 * Math.min(1, Math.max(0, roofK))]} />
          <meshStandardMaterial color={night ? '#a1a1aa' : '#d4d4d8'} opacity={night ? 0.85 : 1} transparent />
        </mesh>
      )}

      {/* Postes de luz */}
      {lightPositions.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 3.2, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 6.4, 12]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          <mesh position={[0, 6.6, 0]}>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial
              color={night ? '#ffe16b' : '#cbd5e1'}
              emissive={night ? '#ffe16b' : '#000000'}
              emissiveIntensity={night ? 1.5 : 0}
            />
          </mesh>
        </group>
      ))}

      {/* Telões */}
      {screenPositions.map((p, i) => (
        <group key={i} position={[p.x, 2.2, p.z]} rotation={[0, p.rotY, 0]}>
          <mesh>
            <boxGeometry args={[1.8, 1.0, 0.08]} />
            <meshStandardMaterial color="#111827" />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <planeGeometry args={[1.6, 0.8]} />
            <meshBasicMaterial color={night ? '#22d3ee' : '#60a5fa'} transparent opacity={night ? 0.6 : 0.35} />
          </mesh>
        </group>
      ))}

      {/* Piso/entorno */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <ringGeometry args={[fieldSize * 0.5, bowlOuter + 2.5, 64]} />
        <meshStandardMaterial color={night ? '#374151' : '#4b5563'} />
      </mesh>
    </group>
  )
}
