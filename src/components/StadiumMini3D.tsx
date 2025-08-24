// src/components/StadiumMini3D.tsx
'use client'

import React, { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'

type Props = {
  level: number        // 1..10
  night?: boolean      // true = iluminação mais forte
  primaryColor?: string
}

export default function StadiumMini3D({ level, night = false, primaryColor = '#22c55e' }: Props) {
  // escala geral do estádio por nível (cresce um pouco a cada nível)
  const scaleK = 1 + (level - 1) * 0.06
  const tiers = level >= 9 ? 3 : level >= 5 ? 2 : 1
  const roofK = level >= 9 ? 1 : level >= 7 ? 0.75 : level >= 5 ? 0.5 : level >= 3 ? 0.25 : 0
  const lightsCount = level >= 9 ? 6 : level >= 6 ? 4 : level >= 3 ? 2 : 0
  const screens = level >= 8 ? 2 : level >= 5 ? 1 : 0

  // dimensões base
  const fieldW = 36 * scaleK
  const fieldH = 22 * scaleK
  const standThickness = 2
  const tierHeight = 3.2
  const gap = 1.2

  const standHeights = useMemo(() => {
    return new Array(tiers).fill(0).map((_, i) => (i + 1) * tierHeight)
  }, [tiers])

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-950/40">
      <Canvas
        camera={{ position: [32, 24, 32], fov: 50 }}
        style={{ width: '100%', height: 360 }}
      >
        {/* Luz ambiente + direcional */}
        <ambientLight intensity={night ? 0.25 : 0.5} />
        <directionalLight position={[30, 40, 10]} intensity={night ? 0.8 : 0.5} />
        {/* Luzes de estádio (postes) */}
        <Lights lightsCount={lightsCount} night={night} radius={Math.max(fieldW, fieldH) * 0.9} />

        <Suspense fallback={<Html center style={{ color: '#e5e7eb', fontSize: 12 }}>Carregando…</Html>}>
          <group>
            {/* Gramado */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[fieldW, fieldH]} />
              <meshStandardMaterial color={primaryColor} />
            </mesh>

            {/* Linha central */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <planeGeometry args={[0.2, fieldH]} />
              <meshBasicMaterial color="#fafafa" />
            </mesh>

            {/* Arquibancadas (4 lados em “caixas” crescentes por nível) */}
            {standHeights.map((h, i) => (
              <group key={i} position={[0, h, 0]}>
                {/* Norte */}
                <Stand w={fieldW + (i + 1) * 6} d={standThickness} h={tierHeight} y={tierHeight / 2} z={-(fieldH / 2) - gap - i * standThickness} />
                {/* Sul */}
                <Stand w={fieldW + (i + 1) * 6} d={standThickness} h={tierHeight} y={tierHeight / 2} z={(fieldH / 2) + gap + i * standThickness} />
                {/* Leste */}
                <Stand w={standThickness} d={fieldH + (i + 1) * 6} h={tierHeight} y={tierHeight / 2} x={(fieldW / 2) + gap + i * standThickness} />
                {/* Oeste */}
                <Stand w={standThickness} d={fieldH + (i + 1) * 6} h={tierHeight} y={tierHeight / 2} x={-(fieldW / 2) - gap - i * standThickness} />
              </group>
            ))}

            {/* Cobertura (progresso) */}
            {roofK > 0 && (
              <mesh position={[0, tiers * tierHeight + 0.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[fieldW + tiers * 8, (fieldH + tiers * 8) * roofK]} />
                <meshStandardMaterial color="#d4d4d8" roughness={0.7} metalness={0.05} />
              </mesh>
            )}

            {/* Telões */}
            {screens >= 1 && (
              <Scoreboard x={0} y={tiers * tierHeight + 2} z={-(fieldH / 2) - 3.5} w={8} h={3} night={night} />
            )}
            {screens >= 2 && (
              <Scoreboard x={0} y={tiers * tierHeight + 2} z={(fieldH / 2) + 3.5} w={8} h={3} night={night} />
            )}
          </group>
        </Suspense>

        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  )
}

function Stand({ w, d, h, x = 0, y = 0, z = 0 }: { w: number; d: number; h: number; x?: number; y?: number; z?: number }) {
  return (
    <mesh position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color="#9ca3af" />
    </mesh>
  )
}

function Scoreboard({ x, y, z, w, h, night }: { x: number; y: number; z: number; w: number; h: number; night: boolean }) {
  return (
    <group position={[x, y, z]}>
      {/* Estrutura */}
      <mesh position={[0, -h / 2 - 1, 0]}>
        <boxGeometry args={[w + 1, 1, 0.6]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      {/* Tela */}
      <mesh>
        <boxGeometry args={[w, h, 0.3]} />
        <meshStandardMaterial color={night ? '#22d3ee' : '#0f172a'} emissive={night ? '#22d3ee' : '#0f172a'} emissiveIntensity={night ? 0.6 : 0.1} />
      </mesh>
    </group>
  )
}

function Lights({ lightsCount, night, radius }: { lightsCount: number; night: boolean; radius: number }) {
  const positions = useMemo(() => {
    const base = [
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.2], [0, 1.2],
    ] as const
    return base.slice(0, lightsCount).map(([sx, sz]) => [sx * radius, 12, sz * radius] as [number, number, number])
  }, [lightsCount, radius])

  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={p as any}>
          <mesh position={[0, -2, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 8, 8]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          <pointLight intensity={night ? 2.2 : 0.8} distance={60} color="#fff7cc" castShadow />
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.4, 12, 12]} />
            <meshBasicMaterial color={night ? '#fff7cc' : '#cbd5e1'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
