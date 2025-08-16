'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

type TimeRow = { id: string; nome: string; saldo?: number; escudo_url?: string | null }
type JogoJSON = {
  mandante: string
  visitante: string
  gols_mandante: number | null
  gols_visitante: number | null
}
type RodadaRow = { id: string; jogos: JogoJSON[] | null; created_at: string }
type BidRow = { descricao: string; data_evento: string }

export default function Home() {
  const router = useRouter()

  // Resumo do meu time
  const [nomeTime, setNomeTime] = useState<string>('')
  const [idTime, setIdTime] = useState<string>('')
  const [saldo, setSaldo] = useState<number | null>(null)
  const [numJogadores, setNumJogadores] = useState<number | null>(null)
  const [posicao, setPosicao] = useState<number | null>(null)
  const [totalSalarios, setTotalSalarios] = useState<number>(0)

  // BID
  const [eventosBID, setEventosBID] = useState<BidRow[]>([])
  const [indexBID, setIndexBID] = useState(0)
  const [fadeBID, setFadeBID] = useState(true)

  // Jogos
  const [jogos, setJogos] = useState<JogoJSON[]>([])
  const [indexJogo, setIndexJogo] = useState(0)
  const [fadeJogo, setFadeJogo] = useState(true)

  // Times (map id → nome)
  const [times, setTimes] = useState<TimeRow[]>([])
  const timesMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of times) m.set(t.id, t.nome)
    return m
  }, [times])

  // rankings
  const [salariosTimes, setSalariosTimes] = useState<{ id_time: string; nome: string; total: number }[]>([])

  // refs para limpar intervalos
  const intervalBidRef = useRef<NodeJS.Timeout | null>(null)
  const intervalJogoRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }

    try {
      const user = JSON.parse(userStr)
      const id = user.id_time as string
      setIdTime(id)
      setNomeTime(user.nome_time || user.nome || '')
      if (id) {
        carregarResumoTime(id)
        carregarTotalSalarios(id)
      }
    } catch {
      router.push('/login')
    }
  }, [])

  useEffect(() => {
    // Carregamentos gerais (independentes do meu time)
    const loadAll = async () => {
      const [bidRes, timesRes, rodadaRes, elencoRes] = await Promise.all([
        supabase.from('bid').select('descricao, data_evento').order('data_evento', { ascending: false }).limit(12),
        supabase.from('times').select('id, nome, saldo, escudo_url'),
        // Pega a última rodada pela created_at (mais seguro no seu schema)
        supabase.from('rodadas').select('id, jogos, created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('elenco').select('id_time, salario'),
      ])

      if (!bidRes.error) setEventosBID((bidRes.data || []) as BidRow[])
      if (!timesRes.error) setTimes((timesRes.data || []) as TimeRow[])

      // jogos finalizados da última rodada
      const ultima: RodadaRow | undefined = (rodadaRes.data || [])[0] as any
      if (ultima?.jogos?.length) {
        const finalizados = (ultima.jogos as JogoJSON[]).filter(
          (j) => j.gols_mandante !== null && j.gols_visitante !== null
        )
        setJogos(finalizados)
      } else {
        setJogos([])
      }

      // salários por time
      if (!elencoRes.error && timesRes.data) {
        const somaPorTime: Record<string, number> = {}
        for (const j of (elencoRes.data as any[]) || []) {
          const t = j.id_time
          somaPorTime[t] = (somaPorTime[t] || 0) + (j.salario || 0)
        }
        const lista = Object.entries(somaPorTime).map(([id_time, total]) => {
          const t = (timesRes.data as TimeRow[]).find((x) => x.id === id_time)
          return { id_time, nome: t?.nome || '(sem nome)', total }
        })
        setSalariosTimes(lista)
      }
    }

    loadAll()
  }, [])

  // carrossel do BID
  useEffect(() => {
    if (intervalBidRef.current) clearInterval(intervalBidRef.current)
    if ((eventosBID?.length || 0) < 2) return
    intervalBidRef.current = setInterval(() => {
      setFadeBID(false)
      setTimeout(() => {
        setIndexBID((prev) => (prev + 1) % eventosBID.length)
        setFadeBID(true)
      }, 250)
    }, 3000)
    return () => {
      if (intervalBidRef.current) clearInterval(intervalBidRef.current)
    }
  }, [eventosBID])

  // carrossel dos jogos
  useEffect(() => {
    if (intervalJogoRef.current) clearInterval(intervalJogoRef.current)
    if ((jogos?.length || 0) < 2) return
    intervalJogoRef.current = setInterval(() => {
      setFadeJogo(false)
      setTimeout(() => {
        setIndexJogo((prev) => (prev + 1) % jogos.length)
        setFadeJogo(true)
      }, 250)
    }, 3000)
    return () => {
      if (intervalJogoRef.current) clearInterval(intervalJogoRef.current)
    }
  }, [jogos])

  async function carregarResumoTime(id: string) {
    const [timeRes, elencoCountRes, classifRes] = await Promise.all([
      supabase.from('times').select('saldo').eq('id', id).single(),
      supabase.from('elenco').select('*', { count: 'exact', head: true }).eq('id_time', id),
      supabase.from('classificacao').select('posicao').eq('id_time', id).single(),
    ])
    if (!timeRes.error && timeRes.data) setSaldo(Number(timeRes.data.saldo ?? 0))
    setNumJogadores(elencoCountRes.count ?? 0)
    if (!classifRes.error && classifRes.data) setPosicao(Number(classifRes.data.posicao ?? 0))
  }

  async function carregarTotalSalarios(id: string) {
    const { data } = await supabase.from('elenco').select('salario').eq('id_time', id)
    if (data) {
      const total = data.reduce((acc: number, j: any) => acc + (j.salario || 0), 0)
      setTotalSalarios(total)
    }
  }

  // helpers
  const nomeDoTime = (id: string | undefined) => {
    if (!id) return ''
    return timesMap.get(id) || ''
  }
  const formatarValor = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

  const topMenoresSaldo = useMemo(() => {
    return [...times].sort((a, b) => (Number(a.saldo || 0) - Number(b.saldo || 0))).slice(0, 3)
  }, [times])

  const topMenoresSalarios = useMemo(() => {
    return [...salariosTimes].sort((a, b) => a.total - b.total).slice(0, 3)
  }, [salariosTimes])

  const sair = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <main
      className="min-h-screen text-white"
      style={{
        backgroundImage: "linear-gradient(180deg, rgba(0,0,0,.85), rgba(0,0,0,.92)), url('/campo-futebol-dark.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-extrabold text-green-400 mb-1">🏟️ Bem-vindo à LigaFut</h1>
        {nomeTime && (
          <p className="text-sm text-gray-300 mb-6">🔰 Gerenciando: <span className="font-semibold">{nomeTime}</span></p>
        )}

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-black/50 border border-white/10 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm">Saldo Atual</div>
            <div className="text-lg font-bold">{saldo !== null ? formatarValor(saldo) : 'Carregando...'}</div>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm">Jogadores</div>
            <div className="text-lg font-bold">{numJogadores ?? 'Carregando...'}</div>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm">Posição</div>
            <div className="text-lg font-bold">{posicao ?? 'Carregando...'}</div>
          </div>
          <div className="bg-black/50 border border-white/10 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm">Total Salários</div>
            <div className="text-lg font-bold">{formatarValor(totalSalarios)}</div>
          </div>
        </div>

        <button
          onClick={sair}
          className="mb-8 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
        >
          🚪 Sair
        </button>

        {/* BID */}
        <section className="bg-black/55 border border-yellow-400/20 rounded-lg p-4 mb-6">
          <h2 className="text-2xl font-bold text-yellow-400 mb-2">📰 Últimos Eventos do BID</h2>
          {eventosBID.length > 0 ? (
            <div
              className={`h-16 flex items-center justify-center transition-opacity duration-300 ${
                fadeBID ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <p className="text-yellow-300 text-lg text-center px-4">
                {eventosBID[indexBID]?.descricao}
              </p>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </section>

        {/* Jogos */}
        <section className="bg-black/55 border border-blue-400/20 rounded-lg p-4 mb-6">
          <h2 className="text-2xl font-bold text-blue-400 mb-2">📅 Últimos Jogos</h2>
          {jogos.length > 0 ? (
            <div
              className={`h-16 flex items-center justify-center transition-opacity duration-300 ${
                fadeJogo ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <p className="text-white text-lg text-center px-4">
                {nomeDoTime(jogos[indexJogo]?.mandante)}{' '}
                {jogos[indexJogo]?.gols_mandante} ⚽ {jogos[indexJogo]?.gols_visitante}{' '}
                {nomeDoTime(jogos[indexJogo]?.visitante)}
              </p>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum jogo finalizado encontrado.</p>
          )}
        </section>

        {/* Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-black/55 border border-red-400/20 rounded-lg p-4">
            <h3 className="text-xl font-bold text-red-400 mb-2">💰 Top 3 Menores Saldo</h3>
            {topMenoresSaldo.map((t, i) => (
              <p key={t.id}>
                {i + 1}. {t.nome} — <span className="text-red-300">{formatarValor(Number(t.saldo || 0))}</span>
              </p>
            ))}
          </div>
          <div className="bg-black/55 border border-blue-400/20 rounded-lg p-4">
            <h3 className="text-xl font-bold text-blue-400 mb-2">📝 Top 3 Menores Salários</h3>
            {topMenoresSalarios.map((t, i) => (
              <p key={t.id_time}>
                {i + 1}. {t.nome} — <span className="text-blue-300">{formatarValor(t.total)}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
