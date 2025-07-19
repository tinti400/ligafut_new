'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense } from 'react'

interface Estadio3DProps {
  capacidade: number
  publico: number
}

export default function Estadio3D({ capacidade, publico }: Estadio3DProps) {
  const totalAneis = 5
  const maxPessoasPorAnel = capacidade / totalAneis

  const renderAnel = (index: number) => {
    const raio = 5 + index * 1.5
    const altura = index * 0.5
    const pessoasNesteAnel = Math.min(publico - index * maxPessoasPorAnel, maxPessoasPorAnel)

    const bolinhas = []
    if (pessoasNesteAnel > 0) {
      const count = Math.floor(pessoasNesteAnel / 100)
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        bolinhas.push(
          <mesh key={i} position={[Math.cos(angle) * raio, altura + 0.2, Math.sin(angle) * raio]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={'#ff4040'} />
          </mesh>
        )
      }
    }

    return (
      <mesh key={index} position={[0, altura - 1, 0]}>
        <cylinderGeometry args={[raio + 0.1, raio - 0.1, 0.3, 64]} />
        <meshStandardMaterial color={'#888888'} />
        {bolinhas}
      </mesh>
    )
  }

  return (
    <div className="w-full h-96 bg-black rounded">
      <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          {[...Array(totalAneis)].map((_, idx) => renderAnel(idx))}
        </Suspense>
        <OrbitControls />
      </Canvas>
    </div>
  )
}
