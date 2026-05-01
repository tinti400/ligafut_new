'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Text } from '@react-three/drei'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'

interface Estadio3DProps {
  capacidade: number
  publico: number
  nomeEstadio?: string
  corPrimaria?: string
  corSecundaria?: string
}

function Campo() {
  return (
    <group>
      {/* Gramado */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.08, 0]}>
        <planeGeometry args={[10, 6.5]} />
        <meshStandardMaterial color="#15803d" roughness={0.8} />
      </mesh>

      {/* Faixas do gramado */}
      {[-3, -1, 1, 3].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -1.06, 0]}>
          <planeGeometry args={[1, 6.5]} />
          <meshStandardMaterial color="#166534" roughness={0.8} />
        </mesh>
      ))}

      {/* Linha central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.035, 0]}>
        <planeGeometry args={[0.035, 6.5]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {/* Círculo central */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.025, 0]}>
        <ringGeometry args={[0.85, 0.89, 96]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>

      {/* Grande áreas */}
      {[-4.1, 4.1].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, -1.025, 0]}>
          <boxGeometry args={[0.035, 2.8, 0.035]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}

      {/* Gols */}
      {[-5.15, 5.15].map((x) => (
        <group key={x} position={[x, -0.75, 0]}>
          <mesh>
            <boxGeometry args={[0.08, 0.7, 1.6]} />
            <meshStandardMaterial color="#e5e7eb" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Bandeiras({
  corPrimaria,
  corSecundaria,
}: {
  corPrimaria: string
  corSecundaria: string
}) {
  const refs = useRef<THREE.Mesh[]>([])

  useFrame((state) => {
    refs.current.forEach((ref, i) => {
      if (ref) {
        ref.rotation.z = Math.sin(state.clock.elapsedTime * 2 + i) * 0.18
      }
    })
  })

  const posicoes = [
    [-7.4, 2.8, -5.2],
    [7.4, 2.8, -5.2],
    [-7.4, 2.8, 5.2],
    [7.4, 2.8, 5.2],
  ]

  return (
    <group>
      {posicoes.map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh position={[0, -0.7, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 1.6, 12]} />
            <meshStandardMaterial color="#d1d5db" />
          </mesh>

          <mesh
            ref={(el) => {
              if (el) refs.current[i] = el
            }}
            position={[0.45, 0.1, 0]}
          >
            <planeGeometry args={[0.9, 0.55, 8, 2]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? corPrimaria : corSecundaria}
              side={THREE.DoubleSide}
              emissive={i % 2 === 0 ? corPrimaria : corSecundaria}
              emissiveIntensity={0.15}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Fogos({ ativo }: { ativo: boolean }) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!groupRef.current || !ativo) return
    groupRef.current.rotation.y += 0.01
    groupRef.current.children.forEach((child, i) => {
      child.position.y = 3.5 + Math.sin(state.clock.elapsedTime * 3 + i) * 0.45
    })
  })

  if (!ativo) return null

  return (
    <group ref={groupRef}>
      {Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2
        const raio = 9.5
        const x = Math.cos(angle) * raio
        const z = Math.sin(angle) * raio

        return (
          <mesh key={i} position={[x, 3.8, z]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? '#facc15' : '#22c55e'}
              emissive={i % 2 === 0 ? '#facc15' : '#22c55e'}
              emissiveIntensity={1.6}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function Torcida({
  raio,
  altura,
  count,
  corPrimaria,
  corSecundaria,
}: {
  raio: number
  altura: number
  count: number
  corPrimaria: string
  corSecundaria: string
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y += 0.0007
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.025
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const x = Math.cos(angle) * raio
        const z = Math.sin(angle) * raio
        const cor = i % 4 === 0 ? corPrimaria : i % 4 === 1 ? corSecundaria : '#ef4444'

        return (
          <mesh key={i} position={[x, altura, z]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial
              color={cor}
              emissive={cor}
              emissiveIntensity={0.28}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function Arquibancada({
  capacidade,
  publico,
  corPrimaria,
  corSecundaria,
}: {
  capacidade: number
  publico: number
  corPrimaria: string
  corSecundaria: string
}) {
  const totalAneis = 6
  const maxPessoasPorAnel = capacidade / totalAneis

  const aneis = useMemo(() => {
    return Array.from({ length: totalAneis }).map((_, index) => {
      const raio = 5.3 + index * 1.15
      const altura = index * 0.55
      const pessoas = Math.max(
        0,
        Math.min(publico - index * maxPessoasPorAnel, maxPessoasPorAnel)
      )

      const count = Math.min(360, Math.floor(pessoas / 55))

      return { index, raio, altura, count }
    })
  }, [capacidade, publico])

  return (
    <group>
      {aneis.map(({ index, raio, altura, count }) => (
        <group key={index}>
          <mesh position={[0, altura - 1, 0]}>
            <cylinderGeometry args={[raio + 0.45, raio - 0.12, 0.42, 128, 1, true]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? '#374151' : '#1f2937'}
              metalness={0.2}
              roughness={0.55}
            />
          </mesh>

          <Torcida
            raio={raio}
            altura={altura - 0.65}
            count={count}
            corPrimaria={corPrimaria}
            corSecundaria={corSecundaria}
          />
        </group>
      ))}
    </group>
  )
}

function Refletores({ intensidade }: { intensidade: number }) {
  return (
    <>
      {[
        [-7, 5.5, -6],
        [7, 5.5, -6],
        [-7, 5.5, 6],
        [7, 5.5, 6],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh position={[0, -1.8, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 3.5, 12]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>

          <mesh>
            <boxGeometry args={[1, 0.4, 0.25]} />
            <meshStandardMaterial
              color="#fef9c3"
              emissive="#fde68a"
              emissiveIntensity={1.2 + intensidade}
            />
          </mesh>

          <pointLight
            color="#fff7cc"
            intensity={2.5 + intensidade * 2}
            distance={16}
          />
        </group>
      ))}
    </>
  )
}

function Placar3D({
  ocupacao,
  nomeEstadio,
}: {
  ocupacao: number
  nomeEstadio: string
}) {
  return (
    <group position={[0, 2.5, -8.2]}>
      <mesh>
        <boxGeometry args={[4.8, 1.15, 0.18]} />
        <meshStandardMaterial color="#020617" metalness={0.3} roughness={0.35} />
      </mesh>

      <Text
        position={[0, 0.25, 0.11]}
        fontSize={0.28}
        color="#22c55e"
        anchorX="center"
        anchorY="middle"
      >
        {nomeEstadio.toUpperCase()}
      </Text>

      <Text
        position={[0, -0.2, 0.11]}
        fontSize={0.23}
        color="#facc15"
        anchorX="center"
        anchorY="middle"
      >
        OCUPAÇÃO {ocupacao}%
      </Text>
    </group>
  )
}

function LuzAmbiente({
  publico,
  capacidade,
}: {
  publico: number
  capacidade: number
}) {
  const intensidade = capacidade > 0 ? publico / capacidade : 0

  return (
    <>
      <ambientLight intensity={0.42 + intensidade * 0.35} />
      <directionalLight position={[10, 14, 10]} intensity={1.2 + intensidade} />
      <spotLight
        position={[0, 8, 0]}
        angle={0.75}
        penumbra={0.55}
        intensity={1.5 + intensidade * 2}
        color="#dcfce7"
      />
    </>
  )
}

export default function Estadio3D({
  capacidade,
  publico,
  nomeEstadio = 'LigaFut Arena',
  corPrimaria = '#22c55e',
  corSecundaria = '#facc15',
}: Estadio3DProps) {
  const capacidadeSegura = Math.max(1, capacidade || 1)
  const publicoSeguro = Math.max(0, Math.min(publico || 0, capacidadeSegura))
  const ocupacao = Math.round((publicoSeguro / capacidadeSegura) * 100)
  const lotado = ocupacao >= 95
  const intensidade = publicoSeguro / capacidadeSegura

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
      {/* HUD */}
      <div className="absolute left-4 top-4 z-10 rounded-2xl border border-white/10 bg-black/75 px-4 py-3 text-sm shadow-xl backdrop-blur">
        <p className="font-black text-green-400">🏟️ {nomeEstadio}</p>
        <p className="text-gray-300">
          Público: {publicoSeguro.toLocaleString('pt-BR')} /{' '}
          {capacidadeSegura.toLocaleString('pt-BR')}
        </p>
        <p className="font-bold text-yellow-400">
          {lotado ? '🔥 CASA LOTADA' : `Ocupação: ${ocupacao}%`}
        </p>
      </div>

      {/* Efeito visual fora do Canvas */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_45%)]" />

      {lotado && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-2xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-2 text-sm font-black text-yellow-300 backdrop-blur">
          ⚡ ATMOSFERA MÁXIMA
        </div>
      )}

      <Canvas camera={{ position: [0, 8.5, 15.5], fov: 43 }}>
        <Suspense fallback={null}>
          <Environment preset="night" />

          <LuzAmbiente capacidade={capacidadeSegura} publico={publicoSeguro} />
          <Refletores intensidade={intensidade} />

          <Campo />

          <Arquibancada
            capacidade={capacidadeSegura}
            publico={publicoSeguro}
            corPrimaria={corPrimaria}
            corSecundaria={corSecundaria}
          />

          <Bandeiras corPrimaria={corPrimaria} corSecundaria={corSecundaria} />
          <Placar3D ocupacao={ocupacao} nomeEstadio={nomeEstadio} />
          <Fogos ativo={lotado} />
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={9}
          maxDistance={24}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  )
}