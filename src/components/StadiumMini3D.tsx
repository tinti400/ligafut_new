'use client'

import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html, Environment, Text } from '@react-three/drei'
import { memo, useMemo, useRef } from 'react'

type Props = {
  level: number
  night: boolean
  roofProgress: number
  tierCount: number
  lightsCount: number
  screens: number
  variant?: 'mini' | 'full'
}

export default memo(function StadiumMini3D({
  level,
  night,
  roofProgress,
  tierCount,
  lightsCount,
  screens,
  variant = 'full',
}: Props) {
  const colors = night
    ? {
        bg: '#020617',
        plinth: '#030712',
        ring: '#0f172a',
        grass: '#047857',
        stripe: '#10b981',
        line: '#e5e7eb',
        stand1: '#64748b',
        stand2: '#475569',
        facade: '#334155',
        roof: '#e5e7eb',
        roofDeep: '#94a3b8',
        mast: '#cbd5e1',
        glow: '#facc15',
        primary: '#22c55e',
        secondary: '#facc15',
      }
    : {
        bg: '#07111f',
        plinth: '#0f172a',
        ring: '#111827',
        grass: '#16a34a',
        stripe: '#22c55e',
        line: '#ffffff',
        stand1: '#cbd5e1',
        stand2: '#94a3b8',
        facade: '#64748b',
        roof: '#f8fafc',
        roofDeep: '#cbd5e1',
        mast: '#94a3b8',
        glow: '#fde68a',
        primary: '#22c55e',
        secondary: '#facc15',
      }

  const containerHeight = variant === 'mini' ? 240 : 430
  const camPos =
    variant === 'mini'
      ? new THREE.Vector3(8.8, 6.2, 8.8)
      : new THREE.Vector3(9.5, 6.5, 9.5)

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/50 p-3 shadow-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_45%)]" />

      <div className="relative" style={{ height: containerHeight }}>
        <Canvas
          dpr={[1, 1.7]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          shadows
          camera={{ fov: 36, position: camPos, near: 0.1, far: 100 }}
          frameloop={variant === 'mini' ? 'demand' : 'always'}
        >
          <color attach="background" args={[colors.bg]} />
          <Environment preset={night ? 'night' : 'city'} />

          <ambientLight intensity={night ? 0.32 : 0.65} />
          <directionalLight position={[6, 9, 4]} intensity={night ? 0.85 : 1.1} castShadow />
          <directionalLight position={[-6, 5, -4]} intensity={0.35} color="#93c5fd" />

          <Plinth radius={7.4} height={0.55} colorTop={colors.ring} colorSide={colors.plinth} />
          <Annulus outer={5.95} inner={4.85} height={0.16} color={colors.ring} y={0.56} />

          <Pitch
            radius={3.65}
            colorGrass={colors.grass}
            colorStripe={colors.stripe}
            colorLine={colors.line}
            y={0.6}
          />

          <Stands
            tiers={tierCount}
            baseInner={4.95}
            tierHeight={0.62}
            tierGap={0.14}
            colors={[colors.stand1, colors.stand2]}
            y={0.62}
          />

          <Crowd
            rings={tierCount}
            baseRadius={5.12}
            y={0.92}
            primary={colors.primary}
            secondary={colors.secondary}
            level={level}
          />

          <Roof
            outer={6.8}
            width={1.65 * roofProgress}
            height={0.2 + 0.035 * level}
            colorTop={colors.roof}
            colorBottom={colors.roofDeep}
            y={0.78 + tierCount * 0.72}
          />

          <Facades radius={6.45} level={level} color={colors.facade} y={0.55} />

          <Screens
            count={Math.min(screens, variant === 'mini' ? 1 : 2)}
            radius={5.45}
            y={1.18}
            color="#020617"
            glow="#22d3ee"
          />

          <PremiumLights
            count={Math.min(lightsCount, variant === 'mini' ? 4 : lightsCount)}
            radius={6.95}
            y={0.7}
            pole={colors.mast}
            bulb={colors.glow}
            night={night}
          />

          <LevelBadge level={level} />

          <OrbitControls
            enabled={variant !== 'mini'}
            enablePan={false}
            enableZoom={variant !== 'mini'}
            minDistance={8}
            maxDistance={13}
            minPolarAngle={0.78}
            maxPolarAngle={1.25}
            target={[0, 0.9, 0]}
          />

          <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
            <div className="sr-only">Maquete 3D premium do estádio LigaFut</div>
          </Html>
        </Canvas>
      </div>
    </div>
  )
})

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
  const stripes = useMemo(() => Array.from({ length: 9 }, (_, i) => i - 4), [])

  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 96]} />
        <meshStandardMaterial color={colorGrass} roughness={0.9} />
      </mesh>

      {stripes.map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[i * 0.55, 0.004, 0]}>
          <planeGeometry args={[0.32, radius * 2]} />
          <meshStandardMaterial color={colorStripe} transparent opacity={0.16} />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[radius * 0.99, radius, 96]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[radius * 0.23, radius * 0.245, 64]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.013, 0]}>
        <planeGeometry args={[radius * 2, 0.035]} />
        <meshBasicMaterial color={colorLine} />
      </mesh>

      {[-2.45, 2.45].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.014, 0]}>
          <ringGeometry args={[0.45, 0.465, 48, 1, 0, Math.PI]} />
          <meshBasicMaterial color={colorLine} />
        </mesh>
      ))}
    </group>
  )
}

function Crowd({
  rings,
  baseRadius,
  y,
  primary,
  secondary,
  level,
}: {
  rings: number
  baseRadius: number
  y: number
  primary: string
  secondary: string
  level: number
}) {
  const ref = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!ref.current) return
    ref.current.rotation.y += 0.0008
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.018
  })

  const people = useMemo(() => {
    const arr: { x: number; z: number; yy: number; color: string }[] = []
    const totalRings = Math.max(1, rings)

    for (let r = 0; r < totalRings; r++) {
      const radius = baseRadius + r * 0.72
      const count = Math.min(80 + level * 10, 160)
      for (let i = 0; i < count; i++) {
        if (i % Math.max(1, 5 - Math.min(4, level)) === 0) {
          const a = (i / count) * Math.PI * 2
          arr.push({
            x: Math.cos(a) * radius,
            z: Math.sin(a) * radius,
            yy: y + r * 0.52,
            color: i % 4 === 0 ? primary : i % 4 === 1 ? secondary : '#ef4444',
          })
        }
      }
    }

    return arr
  }, [rings, baseRadius, y, primary, secondary, level])

  return (
    <group ref={ref}>
      {people.map((p, i) => (
        <mesh key={i} position={[p.x, p.yy, p.z]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.18} />
        </mesh>
      ))}
    </group>
  )
}

function Plinth({
  radius,
  height,
  colorTop,
  colorSide,
}: {
  radius: number
  height: number
  colorTop: string
  colorSide: string
}) {
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 96]} />
        <meshStandardMaterial color={colorSide} roughness={0.8} metalness={0.08} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height + 0.001, 0]} receiveShadow>
        <circleGeometry args={[radius * 0.985, 96]} />
        <meshStandardMaterial color={colorTop} roughness={0.9} />
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
    const outer = inner + 0.72
    const h = tierHeight - i * 0.04

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
  const safeWidth = Math.max(0.05, width)
  const inner = Math.max(outer - safeWidth, 0.001)

  return (
    <group position={[0, y, 0]}>
      <Annulus inner={inner} outer={outer} height={height * 0.45} y={0} color={colorBottom} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height * 0.45 + 0.003, 0]} castShadow receiveShadow>
        <ringGeometry args={[inner, outer, 128]} />
        <meshStandardMaterial color={colorTop} roughness={0.28} metalness={0.12} />
      </mesh>
    </group>
  )
}

function Facades({
  radius,
  level,
  color,
  y,
}: {
  radius: number
  level: number
  color: string
  y: number
}) {
  const h = 0.72 + level * 0.12
  const w = 1.15
  const d = 0.55
  const r = radius + 0.32

  const pos = [
    [r / Math.SQRT2, y + h / 2, r / Math.SQRT2],
    [-r / Math.SQRT2, y + h / 2, r / Math.SQRT2],
    [-r / Math.SQRT2, y + h / 2, -r / Math.SQRT2],
    [r / Math.SQRT2, y + h / 2, -r / Math.SQRT2],
  ] as const

  return (
    <group>
      {pos.map((p, i) => (
        <mesh key={i} position={p as any} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={color} roughness={0.78} metalness={0.08} />
        </mesh>
      ))}
    </group>
  )
}

function Screens({
  count,
  radius,
  y,
  color,
  glow,
}: {
  count: number
  radius: number
  y: number
  color: string
  glow: string
}) {
  const locs = useMemo(() => {
    const arr: Array<[number, number, number, number]> = []
    const angs = [-Math.PI / 2, Math.PI / 2]

    for (let i = 0; i < Math.min(count, 2); i++) {
      const ang = angs[i]
      arr.push([Math.cos(ang) * radius, y, Math.sin(ang) * radius, ang + Math.PI])
    }

    return arr
  }, [count, radius, y])

  return (
    <group>
      {locs.map(([x, yy, z, rot], i) => (
        <group key={i} position={[x, yy, z]} rotation={[0, rot, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.05, 0.55, 0.08]} />
            <meshStandardMaterial color={color} roughness={0.55} metalness={0.18} />
          </mesh>

          <mesh position={[0, 0, 0.046]}>
            <planeGeometry args={[0.9, 0.42]} />
            <meshBasicMaterial color={glow} transparent opacity={0.42} />
          </mesh>

          <Text position={[0, 0, 0.052]} fontSize={0.12} color="#ffffff" anchorX="center" anchorY="middle">
            LF
          </Text>
        </group>
      ))}
    </group>
  )
}

function PremiumLights({
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
              <cylinderGeometry args={[0.055, 0.055, 2.1, 12]} />
              <meshStandardMaterial color={pole} roughness={0.75} metalness={0.1} />
            </mesh>

            <mesh position={[0, 1.1, 0.12]}>
              <boxGeometry args={[0.38, 0.18, 0.12]} />
              <meshStandardMaterial
                color={bulb}
                emissive={night ? new THREE.Color(bulb) : new THREE.Color('#000000')}
                emissiveIntensity={night ? 2.2 : 0.15}
              />
            </mesh>

            {night && (
              <pointLight position={[0, 1.05, 0.1]} color={bulb} intensity={0.9} distance={6} />
            )}
          </group>
        )
      })}
    </group>
  )
}

function LevelBadge({ level }: { level: number }) {
  return (
    <group position={[0, 2.25, -5.2]}>
      <mesh>
        <boxGeometry args={[2.2, 0.55, 0.08]} />
        <meshStandardMaterial color="#020617" metalness={0.2} roughness={0.35} />
      </mesh>

      <Text position={[0, 0, 0.055]} fontSize={0.18} color="#facc15" anchorX="center" anchorY="middle">
        NÍVEL {level}
      </Text>
    </group>
  )
}

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
      bevelThickness: 0.045,
      bevelSize: 0.045,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 128,
    })

    geo.rotateX(-Math.PI / 2)
    return geo
  }, [outer, inner, height, bevel])

  return (
    <mesh geometry={geom} position={[0, y + height / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.82} metalness={0.06} />
    </mesh>
  )
}