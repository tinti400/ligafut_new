'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (!user) {
      router.push('/login')
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4 text-green-400">🏟️ Bem-vindo à LigaFut</h1>
        <p className="mb-8 text-gray-300">Gerencie seu time, participe dos leilões, acompanhe as rodadas e negocie jogadores!</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">⚔️ Leilões Ativos</h2>
            <p className="text-gray-400">Acompanhe e participe dos leilões em tempo real.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">📋 Classificação</h2>
            <p className="text-gray-400">Veja a tabela atualizada do campeonato da sua divisão.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">💰 Mercado de Transferências</h2>
            <p className="text-gray-400">Negocie jogadores diretamente com outros times.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">📝 Painel Administrativo</h2>
            <p className="text-gray-400">Gerencie as regras, eventos e participantes da LigaFut.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
