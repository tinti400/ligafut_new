'use client'

import { useAdmin } from '@/hooks/useAdmin'
import Link from 'next/link'

export default function AdminCopaPage() {
  const { isAdmin } = useAdmin()

  if (!isAdmin) return <div className="p-4">⛔ Acesso restrito!</div>

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">⚽ Administração da Copa</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/copa/fase_liga" className="bg-blue-500 text-white p-3 rounded text-center">
          🏆 Fase Liga – Editar Resultados
        </Link>

        <Link href="/copa/playoff" className="bg-blue-500 text-white p-3 rounded text-center">
          🎯 Playoff – Gerenciar Jogos
        </Link>

        <Link href="/copa/oitavas" className="bg-blue-500 text-white p-3 rounded text-center">
          🥇 Oitavas de Final – Gerenciar
        </Link>

        <Link href="/copa/quartas" className="bg-blue-500 text-white p-3 rounded text-center">
          🥈 Quartas de Final – Gerenciar
        </Link>

        <Link href="/copa/semi" className="bg-blue-500 text-white p-3 rounded text-center">
          🥉 Semifinal – Gerenciar
        </Link>

        <Link href="/copa/final" className="bg-blue-500 text-white p-3 rounded text-center">
          🏅 Final – Gerenciar
        </Link>
      </div>

      <div className="mt-6">
        <Link href="/copa/gerar_confrontos" className="bg-green-500 text-white p-3 rounded text-center block">
          🛠️ Gerar Confrontos / Avançar Classificados
        </Link>
      </div>
    </div>
  )
}
