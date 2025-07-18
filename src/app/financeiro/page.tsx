'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Inicializa Supabase com variáveis ambiente
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Home() {
  const router = useRouter()
  const [nomeTime, setNomeTime] = useState('')
  const [saldo, setSaldo] = useState<number | null>(null)
  const [numJogadores, setNumJogadores] = useState<number | null>(null)
  const [posicao, setPosicao] = useState<number | null>(null)

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (!user) {
      router.push('/login')
      return
    }

    const userData = JSON.parse(user)
    setNomeTime(userData.nome_time || '')

    const idTime = userData.id_time
    if (idTime) {
      buscarResumoTime(idTime)
    }
  }, [])

  async function buscarResumoTime(idTime: string) {
    // Buscar saldo do time
    const { data: timeData, error: errTime } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()
    if (!errTime && timeData) {
      setSaldo(timeData.saldo)
    }

    // Buscar número de jogadores no elenco
    const { count: countElenco, error: errElenco } = await supabase
      .from('elenco')
      .select('*', { count: 'exact', head: true })
      .eq('id_time', idTime)
    if (!errElenco) {
      setNumJogadores(countElenco || 0)
    }

    // Buscar posição atual na classificação
    const { data: classificacaoData, error: errClassificacao } = await supabase
      .from('classificacao')
      .select('posicao')
      .eq('id_time', idTime)
      .single()
    if (!errClassificacao && classificacaoData) {
      setPosicao(classificacaoData.posicao)
    }
  }

  const handleLogout = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-2 text-green-400">🏟️ Bem-vindo à LigaFut</h1>
        {nomeTime && <p className="mb-4 text-gray-300">🔰 Gerenciando: <strong>{nomeTime}</strong></p>}

        {/* Resumo rápido do time */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          <div className="bg-gray-800 p-4 rounded shadow">
            <h3 className="font-semibold mb-1">Saldo Atual</h3>
            <p>{saldo !== null ? `R$ ${saldo.toLocaleString('pt-BR')}` : 'Carregando...'}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded shadow">
            <h3 className="font-semibold mb-1">Jogadores no Elenco</h3>
            <p>{numJogadores !== null ? numJogadores : 'Carregando...'}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded shadow">
            <h3 className="font-semibold mb-1">Posição na Liga</h3>
            <p>{posicao !== null ? posicao : 'Carregando...'}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mb-8 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
        >
          🚪 Sair
        </button>

        {/* Seu grid de opções abaixo */}
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
