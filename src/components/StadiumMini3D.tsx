// src/components/StadiumMini3D.tsx
'use client'

import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { memo, useMemo } from 'react'

type Props = {
  level: number
  night: boolean
  /** 0..1 quanto do anel da cobertura cobre radialmente o bowl (0=sem, 1=total) */
  roofProgress: number
  /** 1..3 quantidade de anéis de arquibancada */
  tierCount: number
  /** 0..6 quantidade de postes de luz */
  lightsCount: number
  /** 0..2 quantidade de telões */
  screens: number
}

export default memo(function StadiumMini3D({
  level,
  night,
  roofProgress,
  tierCount,
  lightsCount,
  screens,
}: Props) {
  // medidas base em “metros” arbitrários
  const RAD_PITCH = 3.6
  const RAD_RUN   = 4.6
  const RAD_T1_IN = 4.9
  const TIER_H    = 0.6
  const TIER_GAP  = 0.14

  // paleta
  const colors = night
    ? {
        bg: '#0b1020',
        plinth: '#0f172a',
        ring: '#111827',
        grass: '#0b8f3f',
        stripe: '#0ea04a',
        line: '#e5e7eb',
        stand1: '#7a8696',
        stand2: '#5f6a78',
        facade: '#4b5563',
        roof: '#cbd5e1',
        roofDeep: '#94a3b8',
        mast: '#9aa6b2',
        glow: '#ffe16b',
      }
    : {
        bg: '#0b1324',
        plinth: '#0e141f',
        ring: '#141b26',
        grass: '#17a34a',
        stripe: '#19b351',
        line: '#ffffff',
        stand1: '#aeb7c4',
        stand2: '#8e98a6',
        facade: '#6b7280',
        roof: '#e5e7eb',
        roofDeep: '#cbd5e1',
        mast: '#9aa6b2',
        glow: '#cbd5e1',
      }

  const cam = { position: new THREE.Vector3(8.5, 5.6, 8.5) }

  return (
    <div
      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3"
      style={{
        boxShadow:
          '0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.02)',
      }}
    >
      <div style={{ height: 380 }}>
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          shadows
          camera={{ fov: 38, position: cam.position, near: 0.1, far: 100 }}
        >
          <color attach="background" args={[colors.bg]} />

          {/* luz ambiente + key light */}
          <ambientLight intensity={night ? 0.25 : 0.55} />
          <directionalLight
            position={[6, 8, 3]}
            intensity={night ? 0.7 : 0.9}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          {/* preenchimento fria */}
          <directionalLight position={[-6, 5, -4]} intensity={night ? 0.25 : 0.35} color={0x99c1ff} />

          {/* base “maquete” */}
          <Plinth radius={7.2} height={0.5} colorTop={colors.ring} colorSide={colors.plinth} />

          {/* pista/anel externo */}
          <Annulus
            outer={RAD_RUN + 1.3}
            inner={RAD_RUN + 0.35}
            height={0.14}
            color={colors.ring}
            y={0.51}
          />

          {/* gramado + marcações */}
          <Pitch
            radius={RAD_PITCH}
            colorGrass={colors.grass}
            colorStripe={colors.stripe}
            colorLine={colors.line}
            y={0.52}
          />

          {/* camadas de arquibancada */}
          <Stands
            tiers={tierCount}
            baseInner={RAD_T1_IN}
            tierHeight={TIER_H}
            tierGap={TIER_GAP}
            colors={[colors.stand1, colors.stand2]}
            y={0.55}
          />

          {/* cobertura – anel com largura proporcional ao progresso */}
          <Roof
            outer={RAD_T1_IN + 1.8}
            width={1.6 * roofProgress}
            height={0.18 + 0.04 * level}
            colorTop={colors.roof}
            colorBottom={colors.roofDeep}
            y={0.55 + tierCount * (TIER_H + TIER_GAP) + 0.18}
          />

          {/* fachadas/towers nos quatro cantos (vai crescendo com o nível) */}
          <Facades
            radius={RAD_T1_IN + 1.1}
            level={level}
            color={colors.facade}
            y={0.55}
          />

          {/* telões */}
          <Screens
            count={screens}
            radius={RAD_T1_IN + 0.4}
            y={0.9}
            color="#0f172a"
            glow="#22d3ee"
          />

          {/* mastros de luz */}
          <LightMasts
            count={lightsCount}
            radius={RAD_T1_IN + 1.9}
            y={0.6}
            pole={colors.mast}
            bulb={colors.glow}
            night={night}
          />

          <OrbitControls
            enablePan={false}
            minDistance={8}
            maxDistance={12}
            minPolarAngle={0.9}
            maxPolarAngle={1.2}
            enableZoom={false}
            target={[0, 0.6, 0]}
          />

          {/* fallback de instrução */}
          <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
            <div className="sr-only">Maquete 3D do estádio</div>
          </Html>
        </Canvas>
      </div>
    </div>
  )
})

/* ---------- Pieces ---------- */

function Plinth({ radius, height, colorTop, colorSide }: { radius: number; height: number; colorTop: string; colorSide: string }) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 64]} />
        <meshStandardMaterial color={colorSide} roughness={0.8} metalness={0.05} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + 0.001, 0]} receiveShadow>
        <circleGeometry args={[radius * 0.985, 64]} />
        <meshStandardMaterial color={colorTop} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Pitch({
  radius,
  colorGrass,
  colorStripe,
  colorLine,
  y,
}: {
  radius: number
  colorGrass: string
  colorStripe: string
  colorLine: string
  y: number
}) {
  // faixas do gramado
  const stripes = useMemo(() => {
    const arr: number[] = []
    const bands = 8
    for (let i = 0; i < bands; i++) arr.push((i / bands) * Math.PI * 2)
    return arr
  }, [])

  return (
    <group position={[0, y, 0]}>
      {/* disco base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color={colorGrass} roughness={0.9} />
      </mesh>

      {/* listras radiais bem suaves */}
      {stripes.map((ang, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, ang, 0]}>
          <planeGeometry args={[radius * 2, radius * 0.34]} />
          <meshStandardMaterial
            color={colorStripe}
            transparent
            opacity={0.18}
          />
        </mesh>
      ))}

      {/* marcações simples */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[radius * 0.995, radius, 64, 1]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[radius * 0.24, radius * 0.25, 48, 1]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>
      {/* linha central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <planeGeometry args={[radius * 2, 0.03]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>
    </group>
  )
}

function Stands({
  tiers,
  baseInner,
  tierHeight,
  tierGap,
  colors,
  y,
}: {
  tiers: number
  baseInner: number
  tierHeight: number
  tierGap: number
  colors: [string, string]
  y: number
}) {
  const elems = []
  for (let i = 0; i < tiers; i++) {
    const inner = baseInner + i * 0.75
    const outer = inner + 0.7
    const h = tierHeight - i * 0.05
    elems.push(
      <Annulus
        key={i}
        inner={inner}
        outer={outer}
        height={h}
        y={y + i * (tierHeight + tierGap)}
        color={i % 2 === 0 ? colors[0] : colors[1]}
        bevel
      />
    )
  }
  return <group>{elems}</group>
}

function Roof({
  outer,
  width,
  height,
  colorTop,
  colorBottom,
  y,
}: {
  outer: number
  width: number
  height: number
  colorTop: string
  colorBottom: string
  y: number
}) {
  const inner = Math.max(outer - Math.max(0.001, width), 0.001)
  return (
    <group position={[0, y, 0]}>
      {/* parte de baixo mais escura */}
      <Annulus inner={inner} outer={outer} height={height * 0.45} y={0} color={colorBottom} />
      {/* cobertura vista de cima */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height * 0.45 + 0.002, 0]} castShadow receiveShadow>
        <ringGeometry args={[inner, outer, 96]} />
        <meshStandardMaterial color={colorTop} roughness={0.35} metalness={0.05} />
      </mesh>
    </group>
  )
}

function Facades({ radius, level, color, y }: { radius: number; level: number; color: string; y: number }) {
  const h = 0.8 + level * 0.12
  const w = 1.1
  const d = 0.55
  const r = radius + 0.35
  const pos = [
    [ r / Math.SQRT2,  y + h / 2,  r / Math.SQRT2],
    [-r / Math.SQRT2,  y + h / 2,  r / Math.SQRT2],
    [-r / Math.SQRT2,  y + h / 2, -r / Math.SQRT2],
    [ r / Math.SQRT2,  y + h / 2, -r / Math.SQRT2],
  ] as const
  return (
    <group>
      {pos.map((p, i) => (
        <mesh key={i} position={p as any} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Screens({ count, radius, y, color, glow }: { count: number; radius: number; y: number; color: string; glow: string }) {
  const locs = useMemo(() => {
    const a: Array<[number, number, number, number]> = []
    const angs = [-Math.PI / 2, Math.PI / 2]
    for (let i = 0; i < Math.min(count, 2); i++) {
      const ang = angs[i]
      a.push([Math.cos(ang) * radius, y, Math.sin(ang) * radius, ang + Math.PI])
    }
    return a
  }, [count, radius, y])

  return (
    <group>
      {locs.map(([x, yy, z, rot], i) => (
        <group key={i} position={[x, yy, z]} rotation={[0, rot, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.5, 0.08]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.045]}>
            <planeGeometry args={[0.78, 0.38]} />
            <meshBasicMaterial color={glow} transparent opacity={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LightMasts({
  count,
  radius,
  y,
  pole,
  bulb,
  night,
}: {
  count: number
  radius: number
  y: number
  pole: string
  bulb: string
  night: boolean
}) {
  const angsBase = [-0.9, 0.9, Math.PI - 0.9, Math.PI + 0.9, 0, Math.PI]
  const angs = angsBase.slice(0, Math.min(angsBase.length, count))
  return (
    <group>
      {angs.map((a, i) => {
        const x = Math.cos(a) * radius
        const z = Math.sin(a) * radius
        return (
          <group key={i} position={[x, y, z]} rotation={[0, -a, 0]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.05, 0.05, 1.8, 12]} />
              <meshStandardMaterial color={pole} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.95, 0.1]}>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshStandardMaterial
                color={bulb}
                emissive={night ? new THREE.Color(bulb) : new THREE.Color('#000')}
                emissiveIntensity={night ? 1.8 : 0}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/* --- util: anel extrudado com altura --- */
function Annulus({
  outer,
  inner,
  height,
  color,
  y = 0,
  bevel = false,
}: {
  outer: number
  inner: number
  height: number
  color: string
  y?: number
  bevel?: boolean
}) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape()
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: bevel,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 96,
    })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [outer, inner, height, bevel])

  return (
    <mesh geometry={geom} position={[0, y + height / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.04} />
    </mesh>
  )
}
