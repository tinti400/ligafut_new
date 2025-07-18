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
  const [totalSalarios, setTotalSalarios] = useState<number>(0)
  const [eventosBID, setEventosBID] = useState<any[]>([])
  const [indexBID, setIndexBID] = useState(0)
  const [times, setTimes] = useState<any[]>([])
  const [jogos, setJogos] = useState<any[]>([])
  const [fade, setFade] = useState(true)

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
      buscarTotalSalarios(idTime)
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

  async function buscarTotalSalarios(idTime: string) {
    const { data: jogadores } = await supabase
      .from('elenco')
      .select('salario')
      .eq('id_time', idTime)

    if (jogadores) {
      const total = jogadores.reduce((acc, jogador) => acc + (jogador.salario || 0), 0)
      setTotalSalarios(total)
    }
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

    const buscarJogos = async () => {
      const { data } = await supabase
        .from('rodadas')
        .select('jogos')
        .order('numero', { ascending: false })
        .limit(1)
        .single()
      if (data?.jogos) setJogos(data.jogos)
    }

    buscarBID()
    buscarTimes()
    buscarJogos()
  }, [])

  useEffect(() => {
    const intervalo = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIndexBID((prev) => (prev + 1) % (eventosBID.length || 1))
        setFade(true)
      }, 300)
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

        {/* Resumo rápido */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4 text-left">
          <div className="bg-gray-800 p-4 rounded shadow text-center">
            <h3 className="font-semibold mb-1">Saldo Atual</h3>
            <p>{saldo !== null ? `R$ ${saldo.toLocaleString('pt-BR')}` : 'Carregando...'}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded shadow text-center">
            <h3 className="font-semibold mb-1">Jogadores</h3>
            <p>{numJogadores !== null ? numJogadores : 'Carregando...'}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded shadow text-center">
            <h3 className="font-semibold mb-1">Posição</h3>
            <p>{posicao !== null ? posicao : 'Carregando...'}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded shadow text-center">
            <h3 className="font-semibold mb-1">Total Salários</h3>
            <p>{`R$ ${totalSalarios.toLocaleString('pt-BR')}`}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mb-8 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
        >
          🚪 Sair
        </button>

        {/* Carrossel BID */}
        <div className="bg-gray-800 p-4 rounded mb-6">
          <h2 className="text-2xl font-bold text-yellow-400 mb-2">📰 Últimos Eventos do BID</h2>
          {eventosBID.length > 0 ? (
            <div className={`h-20 flex items-center justify-center transition-opacity duration-500 ${fade ? 'opacity-100' : 'opacity-0'}`}>
              <p className="text-yellow-300 text-lg">{eventosBID[indexBID]?.descricao}</p>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </div>

        {/* Últimos Jogos */}
        <div className="bg-gray-800 p-4 rounded mb-6">
          <h2 className="text-2xl font-bold text-blue-400 mb-2">📅 Últimos Jogos</h2>
          {jogos.length > 0 ? (
            <div className="space-y-2">
              {jogos.map((jogo: any, index: number) => (
                <div key={index} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                  <span className="text-green-300">{jogo.mandante}</span>
                  <span className="text-yellow-300 font-bold">
                    {jogo.gols_mandante} ⚽ {jogo.gols_visitante}
                  </span>
                  <span className="text-red-300">{jogo.visitante}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">Nenhum jogo encontrado.</p>
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
