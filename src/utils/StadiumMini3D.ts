'use client'

import React, { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type StadiumMini3DProps = {
  level: number
  night: boolean
  roofProgress: number   // 0..1
  tierCount: number      // 1..3
  lightsCount: number    // 0..6
  screens: number        // 0..2
  width?: number
  height?: number
  autoRotate?: boolean
}

function Rotator({ children, speed = 0.003, enable = true }: { children: React.ReactNode; speed?: number; enable?: boolean }) {
  const ref = useRef<THREE.Group>(null!)
  useFrame(() => {
    if (!enable) return
    ref.current.rotation.y += speed
  })
  return <group ref={ref}>{children}</group>
}

function Ground({ night }: { night: boolean }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color={night ? '#0b3b19' : '#1f8b3f'} />
    </mesh>
  )
}

function Pitch() {
  return (
    <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[8, 4.8]} />
      <meshStandardMaterial color="#1ca64a" />
    </mesh>
  )
}

function Bowl({ tierCount, level }: { tierCount: number; level: number }) {
  // Raio e altura variam levemente com o nível
  const baseR = useMemo(() => 3.5 + Math.min(3, level * 0.25), [level])
  const h = 0.3

  const tiers = Array.from({ length: tierCount }).map((_, i) => {
    const rTop = baseR - i * 0.35
    const rBot = rTop * 0.82
    const y = 0.15 + i * (h + 0.08)
    const color = i % 2 === 0 ? '#9ca3af' : '#6b7280'
    return (
      <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[rTop, rBot, h, 48]} />
        <meshStandardMaterial color={color} metalness={0.2} roughness={0.7} />
      </mesh>
    )
  })

  return <group>{tiers}</group>
}

function Roof({ progress = 0, level }: { progress: number; level: number }) {
  if (progress <= 0.01) return null
  const inner = 2.6 + Math.min(2, level * 0.12)
  const outer = inner + 0.6
  const theta = Math.min(Math.PI * 2, Math.max(0.05, Math.PI * 2 * progress))

  return (
    <group position={[0, 0.65 + level * 0.02, 0]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow castShadow>
        {/* RingGeometry(innerRadius, outerRadius, thetaSegments, phiSegments, thetaStart, thetaLength) */}
        <ringGeometry args={[inner, outer, 96, 1, 0, theta]} />
        <meshStandardMaterial color="#d4d4d8" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function LightPoles({ count, night }: { count: number; night: boolean }) {
  if (count <= 0) return null
  const radius = 4.2
  const poles = Array.from({ length: count }).map((_, i) => {
    const ang = (i / count) * Math.PI * 2
    const x = Math.cos(ang) * radius
    const z = Math.sin(ang) * radius
    const color = night ? '#ffe16b' : '#cbd5e1'
    return (
      <group key={i} position={[x, 0, z]} rotation-y={-ang}>
        <mesh position={[0, 0.8, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 1.6, 12]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
        <mesh position={[0, 1.7, 0]} castShadow>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
        {night && (
          <pointLight
            position={[0, 1.7, 0]}
            intensity={2.2}
            distance={6}
            color={color}
          />
        )}
      </group>
    )
  })
  return <group>{poles}</group>
}

function Screens({ count }: { count: number }) {
  if (count <= 0) return null
  const items = []
  const radius = 3.3
  const heights = [0.9, 0.4]
  const sizes = [
    { w: 1.2, h: 0.6 },
    { w: 0.9, h: 0.45 },
  ]

  for (let i = 0; i < count; i++) {
    const ang = (i === 0 ? 0 : Math.PI) // frente e trás
    const x = Math.cos(ang) * radius
    const z = Math.sin(ang) * radius
    const y = heights[i] || 0.9
    const { w, h } = sizes[i] || sizes[0]
    items.push(
      <group key={i} position={[x, y, z]} rotation-y={-ang}>
        <mesh castShadow>
          <boxGeometry args={[w, h, 0.04]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[w * 0.92, h * 0.8]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.5} />
        </mesh>
      </group>
    )
  }
  return <group>{items}</group>
}

export default function StadiumMini3D({
  level,
  night,
  roofProgress,
  tierCount,
  lightsCount,
  screens,
  width = 220,
  height = 160,
  autoRotate = true,
}: StadiumMini3DProps) {
  const bg = night ? '#0b1020' : '#0b1324'
  const ambientI = night ? 0.2 : 0.6
  const dirI = night ? 0.4 : 0.9

  return (
    <div style={{ width: '100%', height }}>
      <Canvas
        shadows
        camera={{ position: [4.5, 3.2, 5.2], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* Fundo */}
        <color attach="background" args={[bg]} />
        <fog attach="fog" args={[bg, 12, 22]} />

        {/* Luzes */}
        <ambientLight intensity={ambientI} />
        <directionalLight
          position={[6, 8, 4]}
          intensity={dirI}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />

        <Suspense fallback={null}>
          <Rotator enable={autoRotate}>
            <group position={[0, 0, 0]}>
              <Ground night={night} />
              <Pitch />
              <Bowl tierCount={tierCount} level={level} />
              <Roof progress={roofProgress} level={level} />
              <LightPoles count={lightsCount} night={night} />
              <Screens count={screens} />
            </group>
          </Rotator>
        </Suspense>
      </Canvas>
    </div>
  )
}
