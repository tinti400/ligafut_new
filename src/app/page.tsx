'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

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
  const [eventosBID, setEventosBID] = useState<any[]>([])
  const [indexBID, setIndexBID] = useState(0)
  const [times, setTimes] = useState<any[]>([])

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
    const { data: timeData } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()
    if (timeData) setSaldo(timeData.saldo)

    const { count: countElenco } = await supabase
      .from('elenco')
      .select('*', { count: 'exact', head: true })
      .eq('id_time', idTime)
    setNumJogadores(countElenco || 0)

    const { data: classificacaoData } = await supabase
      .from('classificacao')
      .select('posicao')
      .eq('id_time', idTime)
      .single()
    if (classificacaoData) setPosicao(classificacaoData.posicao)
  }

  useEffect(() => {
    const buscarBID = async () => {
      const { data } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .limit(10)
      if (data) setEventosBID(data)
    }

    const buscarTimes = async () => {
      const { data } = await supabase
        .from('times')
        .select('*')
      if (data) setTimes(data)
    }

    buscarBID()
    buscarTimes()
  }, [])

  useEffect(() => {
    const intervalo = setInterval(() => {
      setIndexBID((prev) => (prev + 1) % (eventosBID.length || 1))
    }, 3000)
    return () => clearInterval(intervalo)
  }, [eventosBID])

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const getTopTimes = (campo: string, ordem: 'asc' | 'desc') => {
    return [...times]
      .sort((a, b) => (ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo]))
      .slice(0, 3)
  }

  const handleLogout = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-5xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-2 text-green-400">🏟️ Bem-vindo à LigaFut</h1>
        {nomeTime && <p className="mb-4 text-gray-300">🔰 Gerenciando: <strong>{nomeTime}</strong></p>}

        {/* Resumo rápido do time */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
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

        {/* Grid de Opções */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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

        {/* Carrossel BID */}
        <div className="bg-gray-800 p-4 rounded mb-6">
          <h2 className="text-2xl font-bold text-yellow-400 mb-2">📰 Últimos Eventos do BID</h2>
          {eventosBID.length > 0 ? (
            <div className="h-20 flex items-center justify-center transition-all duration-500">
              <p className="text-yellow-300 text-lg">{eventosBID[indexBID]?.descricao}</p>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </div>

        {/* Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 p-4 rounded">
            <h3 className="text-xl font-bold text-green-400 mb-2">💰 Top 3 Mais Saldo</h3>
            {getTopTimes('saldo', 'desc').map((time, index) => (
              <p key={time.id}>
                {index + 1}. {time.nome} — <span className="text-green-300">{formatarValor(time.saldo)}</span>
              </p>
            ))}
          </div>

          <div className="bg-gray-800 p-4 rounded">
            <h3 className="text-xl font-bold text-red-400 mb-2">💸 Top 3 Menos Saldo</h3>
            {getTopTimes('saldo', 'asc').map((time, index) => (
              <p key={time.id}>
                {index + 1}. {time.nome} — <span className="text-red-300">{formatarValor(time.saldo)}</span>
              </p>
            ))}
          </div>

          <div className="bg-gray-800 p-4 rounded">
            <h3 className="text-xl font-bold text-yellow-400 mb-2">🧩 Top 3 Maiores Salários</h3>
            {getTopTimes('total_salarios', 'desc').map((time, index) => (
              <p key={time.id}>
                {index + 1}. {time.nome} — <span className="text-yellow-300">{formatarValor(time.total_salarios)}</span>
              </p>
            ))}
          </div>

          <div className="bg-gray-800 p-4 rounded">
            <h3 className="text-xl font-bold text-blue-400 mb-2">📝 Top 3 Menores Salários</h3>
            {getTopTimes('total_salarios', 'asc').map((time, index) => (
              <p key={time.id}>
                {index + 1}. {time.nome} — <span className="text-blue-300">{formatarValor(time.total_salarios)}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
