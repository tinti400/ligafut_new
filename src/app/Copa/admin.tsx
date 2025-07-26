'use client'

import { useAdmin } from '@/hooks/useAdmin'
import Link from 'next/link'

export default function AdminCopaPage() {
  const { isAdmin } = useAdmin()

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        <div className="text-center space-y-2">
          <p className="text-3xl">⛔</p>
          <p className="text-lg font-semibold">Acesso restrito!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 text-white min-h-screen bg-gradient-to-b from-[#0d0d0d] to-[#1a1a1a]">
      <h1 className="text-3xl font-bold text-center mb-6">⚽ Administração da Copa</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/copa/fase_liga"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🏆 Fase Liga – Editar Resultados
        </Link>

        <Link
          href="/copa/playoff"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🎯 Playoff – Gerenciar Jogos
        </Link>

        <Link
          href="/copa/oitavas"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🥇 Oitavas de Final – Gerenciar
        </Link>

        <Link
          href="/copa/quartas"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🥈 Quartas de Final – Gerenciar
        </Link>

        <Link
          href="/copa/semi"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🥉 Semifinal – Gerenciar
        </Link>

        <Link
          href="/copa/final"
          className="bg-blue-600 hover:bg-blue-700 transition text-white p-4 rounded-2xl text-center shadow-md"
        >
          🏅 Final – Gerenciar
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/copa/gerar_confrontos"
          className="bg-green-600 hover:bg-green-700 transition text-white p-4 rounded-2xl text-center block shadow-md"
        >
          🛠️ Gerar Confrontos / Avançar Classificados
        </Link>
      </div>
    </div>
  )
}
