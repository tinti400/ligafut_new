'use client'

import { Canvas, ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Environment, Html } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

export type Stadium3DProps = {
  level: number            // 1..10
  night?: boolean
  primaryColor?: string    // cor do clube para detalhes
}

export default function StadiumMini3D({ level, night = false, primaryColor = '#22c55e' }: Stadium3DProps) {
  // features por nível
  const tiers = level >= 9 ? 3 : level >= 5 ? 2 : 1
  const roofK = level >= 9 ? 1 : level >= 7 ? 0.75 : level >= 5 ? 0.5 : level >= 3 ? 0.25 : 0.05
  const lights = level >= 9 ? 6 : level >= 6 ? 4 : level >= 3 ? 2 : 0
  const screens = level >= 8 ? 2 : level >= 5 ? 1 : 0

  const seatColor = new THREE.Color(primaryColor).lerp(new THREE.Color('#8b949e'), 0.4).getStyle()
  const roofColor = '#dadde3'
  const roofBeam = '#a0a6b1'
  const concrete = '#9aa3ad'
  const track = '#4b5563'
  const grass = '#1f8b3f'
  const line = '#e5e7eb'

  // dimensões base
  const fieldW = 60
  const fieldH = 38
  const pad = 10

  const standData = useMemo(() => {
    const arr: { w: number; h: number; d: number; x: number; z: number; rotY: number }[] = []
    // quatro lados, cada um com "tiers" anéis (empilhados atrás)
    const depthPerTier = 6
    const heightPerTier = 4.5
    const gap = 1.5
    const baseW = fieldW + pad * 2
    const baseH = fieldH + pad * 2

    for (let t = 0; t < tiers; t++) {
      const back = t * (depthPerTier + gap)
      const h = heightPerTier
      const d = depthPerTier

      // norte (atrás do gol)
      arr.push({ w: baseW, h, d, x: 0, z: -(baseH / 2 + d / 2 + back), rotY: 0 })
      // sul
      arr.push({ w: baseW, h, d, x: 0, z: (baseH / 2 + d / 2 + back), rotY: Math.PI })
      // leste
      arr.push({ w: baseH, h, d, x: (baseW / 2 + d / 2 + back), z: 0, rotY: -Math.PI / 2 })
      // oeste
      arr.push({ w: baseH, h, d, x: -(baseW / 2 + d / 2 + back), z: 0, rotY: Math.PI / 2 })
    }
    return arr
  }, [tiers])

  const roofPieces = useMemo(() => {
    const pieces: { w: number; t: number; l: number; x: number; z: number; rotY: number }[] = []
    const wN = (fieldW + pad * 2) * roofK
    const lE = (fieldH + pad * 2) * roofK
    const t = 0.6
    const hUp = 8 + tiers * 3.5

    // norte
    pieces.push({ w: wN, t, l: 6, x: 0, z: -(fieldH / 2 + pad + 7), rotY: 0 })
    // sul
    pieces.push({ w: wN, t, l: 6, x: 0, z: (fieldH / 2 + pad + 7), rotY: Math.PI })
    // leste
    pieces.push({ w: lE, t, l: 6, x: (fieldW / 2 + pad + 7), z: 0, rotY: -Math.PI / 2 })
    // oeste
    pieces.push({ w: lE, t, l: 6, x: -(fieldW / 2 + pad + 7), z: 0, rotY: Math.PI / 2 })

    return { pieces, hUp }
  }, [roofK, tiers, fieldW, fieldH, pad])

  const lightPoints = useMemo(() => {
    const pts = [
      { x: fieldW / 2 + pad + 12, z: fieldH / 2 + pad + 12 },
      { x: -(fieldW / 2 + pad + 12), z: fieldH / 2 + pad + 12 },
      { x: fieldW / 2 + pad + 12, z: -(fieldH / 2 + pad + 12) },
      { x: -(fieldW / 2 + pad + 12), z: -(fieldH / 2 + pad + 12) },
      { x: 0, z: fieldH / 2 + pad + 16 },
      { x: 0, z: -(fieldH / 2 + pad + 16) },
    ].slice(0, lights)
    return pts
  }, [lights, fieldW, fieldH, pad])

  const screenRects = useMemo(() => {
    const arr = [
      { x: 0, y: 8 + tiers * 2.5, z: -(fieldH / 2 + pad + 8), w: 18, h: 10, rotY: 0 },
      { x: 0, y: 8 + tiers * 2.5, z: (fieldH / 2 + pad + 8), w: 18, h: 10, rotY: Math.PI },
    ].slice(0, screens)
    return arr
  }, [screens, tiers, fieldH, pad])

  return (
    <div className="w-full h-72 md:h-96 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
      <Canvas camera={{ position: [90, 80, 90], fov: 40 }}>
        {/* ambiente / luz */}
        <ambientLight intensity={night ? 0.25 : 0.6} />
        <directionalLight position={[50, 100, 20]} intensity={night ? 0.25 : 0.8} castShadow />
        <Environment preset="city" />

        {/* gramado */}
        <group position={[0, 0, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[fieldW + pad * 4, fieldH + pad * 4]} />
            <meshStandardMaterial color={grass} />
          </mesh>

          {/* linhas simples */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <planeGeometry args={[fieldW, fieldH]} />
            <meshBasicMaterial color={grass} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
            <planeGeometry args={[0.3, fieldH]} />
            <meshBasicMaterial color={line} />
          </mesh>

          {/* pista/entorno */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <ringGeometry args={[Math.max(fieldW, fieldH) * 0.6, Math.max(fieldW, fieldH) * 0.78, 64]} />
            <meshStandardMaterial color={track} side={THREE.DoubleSide} />
          </mesh>
        </group>

        {/* arquibancadas */}
        <group position={[0, 0, 0]}>
          {standData.map((s, i) => (
            <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.rotY, 0]}>
              {/* base inclinada */}
              <mesh position={[0, s.h / 2, 0]} rotation={[-0.45, 0, 0]} castShadow>
                <boxGeometry args={[s.w, s.h, s.d]} />
                <meshStandardMaterial color={concrete} />
              </mesh>
              {/* assentos (faixa colorida) */}
              <mesh position={[0, s.h + 0.2, -s.d * 0.2]} rotation={[-0.45, 0, 0]}>
                <boxGeometry args={[s.w * 0.9, 0.5, s.d * 0.6]} />
                <meshStandardMaterial color={seatColor} />
              </mesh>
            </group>
          ))}
        </group>

        {/* cobertura */}
        <group position={[0, roofPieces.hUp, 0]}>
          {roofPieces.pieces.map((r, i) => (
            <group key={i} position={[r.x, 0, r.z]} rotation={[0, r.rotY, 0]}>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[r.w, r.t, r.l]} />
                <meshStandardMaterial color={roofColor} />
              </mesh>
              {/* vigas */}
              <mesh position={[0, -1.2, 0]}>
                <boxGeometry args={[r.w * 0.95, 0.25, r.l * 0.9]} />
                <meshStandardMaterial color={roofBeam} />
              </mesh>
            </group>
          ))}
        </group>

        {/* refletores */}
        <group>
          {lightPoints.map((p, i) => (
            <group key={i} position={[p.x, 0, p.z]}>
              <mesh position={[0, 10 + tiers * 2, 0]}>
                <cylinderGeometry args={[0.25, 0.25, 20, 8]} />
                <meshStandardMaterial color="#b8c2cc" />
              </mesh>
              <pointLight
                position={[0, 21 + tiers * 2, 0]}
                intensity={night ? 2.5 : 0.6}
                distance={80}
                color={night ? '#fff5b1' : '#ffffff'}
                castShadow
              />
              <mesh position={[0, 21 + tiers * 2, 0]}>
                <sphereGeometry args={[0.8, 16, 16]} />
                <meshBasicMaterial color={night ? '#ffe16b' : '#e2e8f0'} />
              </mesh>
            </group>
          ))}
        </group>

        {/* telões */}
        <group>
          {screenRects.map((s, i) => (
            <group key={i} position={[s.x, s.y, s.z]} rotation={[0, s.rotY, 0]}>
              <mesh>
                <boxGeometry args={[s.w, s.h, 0.6]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>
              {/* brilho */}
              <mesh position={[0, 0, 0.31]}>
                <planeGeometry args={[s.w * 0.9, s.h * 0.7]} />
                <meshBasicMaterial color={night ? '#22d3ee' : '#7dd3fc'} transparent opacity={night ? 0.6 : 0.35} />
              </mesh>
            </group>
          ))}
        </group>

        {/* chão base */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color={night ? '#0b1020' : '#0b1324'} />
        </mesh>

        <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2.2} minDistance={80} maxDistance={140} />
      </Canvas>
    </div>
  )
}
