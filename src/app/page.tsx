'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'
import {
  FiLogOut,
  FiChevronLeft,
  FiChevronRight,
  FiUsers,
  FiDollarSign,
  FiAward,
} from 'react-icons/fi'

/** ========= Supabase ========= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ========= Tipos ========= */
type TimeRow = {
  id: string
  nome: string
  saldo?: number | null
  escudo_url?: string | null
}
type JogoJSON = {
  mandante: string
  visitante: string
  gols_mandante: number | null
  gols_visitante: number | null
}
type RodadaRow = { id: string; jogos: JogoJSON[] | null; created_at: string }
type BidRow = { descricao: string; data_evento: string }
type SalarioRow = { id_time: string; salario: number | null }

/** ========= Utils ========= */
const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

/** ========= Página ========= */
export default function Home() {
  const router = useRouter()

  // Meu time
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
  const bidPaused = useRef(false)

  // Jogos
  const [jogos, setJogos] = useState<JogoJSON[]>([])
  const [indexJogo, setIndexJogo] = useState(0)
  const [fadeJogo, setFadeJogo] = useState(true)
  const jogoPaused = useRef(false)

  // Times (map id → nome/escudo/saldo)
  const [times, setTimes] = useState<TimeRow[]>([])
  const timesMap = useMemo(() => {
    const m = new Map<string, TimeRow>()
    for (const t of times) m.set(t.id, t)
    return m
  }, [times])

  // Rankings
  const [salariosTimes, setSalariosTimes] = useState<{ id_time: string; nome: string; total: number; escudo_url?: string | null }[]>([])

  // refs para limpar intervalos (tip seguro p/ browser/SSR)
  const intervalBidRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intervalJogoRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** ===== Boot ===== */
  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null
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
  }, [router])

  /** ===== Cargas gerais ===== */
  useEffect(() => {
    const loadAll = async () => {
      const [bidRes, timesRes, rodadaRes, elencoRes] = await Promise.all([
        supabase.from('bid').select('descricao, data_evento').order('data_evento', { ascending: false }).limit(12),
        supabase.from('times').select('id, nome, saldo, escudo_url'),
        supabase.from('rodadas').select('id, jogos, created_at').order('created_at', { ascending: false }).limit(1),
        supabase.from('elenco').select('id_time, salario'),
      ])

      if (bidRes.error) {
        toast.error('Falha ao carregar BID')
      } else {
        setEventosBID((bidRes.data || []) as BidRow[])
      }

      if (timesRes.error) {
        toast.error('Falha ao carregar times')
      } else {
        setTimes((timesRes.data || []) as TimeRow[])
      }

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
        for (const j of (elencoRes.data as SalarioRow[]) || []) {
          const t = j.id_time
          somaPorTime[t] = (somaPorTime[t] || 0) + (j.salario || 0)
        }
        const lista = Object.entries(somaPorTime).map(([id_time, total]) => {
          const t = (timesRes.data as TimeRow[]).find((x) => x.id === id_time)
          return { id_time, nome: t?.nome || '(sem nome)', total, escudo_url: t?.escudo_url }
        })
        setSalariosTimes(lista)
      }
    }
    loadAll()
  }, [])

  /** ===== Realtime (BID, Rodadas, Times) ===== */
  useEffect(() => {
    const channel = supabase
      .channel('home-realtime')
      // novos eventos BID
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bid' },
        (payload: any) => {
          const novo = { descricao: payload.new?.descricao, data_evento: payload.new?.data_evento } as BidRow
          setEventosBID((prev) => [novo, ...prev].slice(0, 12))
        }
      )
      // mudanças em rodadas (pega a mais recente novamente)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rodadas' },
        async () => {
          const { data } = await supabase
            .from('rodadas')
            .select('id, jogos, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
          const ultima: RodadaRow | undefined = (data || [])[0] as any
          if (ultima?.jogos?.length) {
            const finalizados = (ultima.jogos as JogoJSON[]).filter(
              (j) => j.gols_mandante !== null && j.gols_visitante !== null
            )
            setJogos(finalizados)
          } else {
            setJogos([])
          }
        }
      )
      // atualizações de times (para saldo/escudos/nome)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'times' },
        async () => {
          const { data } = await supabase.from('times').select('id, nome, saldo, escudo_url')
          if (data) setTimes(data as TimeRow[])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  /** ===== Carrossel do BID ===== */
  useEffect(() => {
    if (intervalBidRef.current) clearInterval(intervalBidRef.current)
    if ((eventosBID?.length || 0) < 2) return
    intervalBidRef.current = setInterval(() => {
      if (bidPaused.current) return
      setFadeBID(false)
      setTimeout(() => {
        setIndexBID((prev) => (prev + 1) % eventosBID.length)
        setFadeBID(true)
      }, 250)
    }, 3500)
    return () => {
      if (intervalBidRef.current) clearInterval(intervalBidRef.current)
    }
  }, [eventosBID])

  /** ===== Carrossel dos Jogos ===== */
  useEffect(() => {
    if (intervalJogoRef.current) clearInterval(intervalJogoRef.current)
    if ((jogos?.length || 0) < 2) return
    intervalJogoRef.current = setInterval(() => {
      if (jogoPaused.current) return
      setFadeJogo(false)
      setTimeout(() => {
        setIndexJogo((prev) => (prev + 1) % jogos.length)
        setFadeJogo(true)
      }, 250)
    }, 3500)
    return () => {
      if (intervalJogoRef.current) clearInterval(intervalJogoRef.current)
    }
  }, [jogos])

  /** ===== Resumo do meu time ===== */
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
    const { data, error } = await supabase.from('elenco').select('salario').eq('id_time', id)
    if (error) return
    const total = (data || []).reduce((acc: number, j: any) => acc + (j.salario || 0), 0)
    setTotalSalarios(total)
  }

  /** ===== Helpers ===== */
  const nomeDoTime = (id?: string) => (id ? (timesMap.get(id)?.nome ?? '') : '')
  const escudoDoTime = (id?: string) => (id ? timesMap.get(id)?.escudo_url ?? '' : '')

  const topMenoresSaldo = useMemo(() => {
    return [...times]
      .sort((a, b) => Number(a.saldo || 0) - Number(b.saldo || 0))
      .slice(0, 3)
  }, [times])

  const topMenoresSalarios = useMemo(() => {
    return [...salariosTimes].sort((a, b) => a.total - b.total).slice(0, 3)
  }, [salariosTimes])

  const sair = () => {
    localStorage.clear()
    router.push('/login')
  }

  /** ===== UI ===== */
  return (
    <main
      className="min-h-screen text-white"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(0,0,0,.88), rgba(0,0,0,.95)), url('/campo-futebol-dark.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <Toaster position="top-right" />

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-extrabold text-green-400 leading-tight">
              🏟️ LigaFut <span className="text-green-300/70 text-xl align-top">/ Home</span>
            </h1>
            {nomeTime && (
              <p className="text-sm text-gray-300">
                🔰 Gerenciando: <span className="font-semibold">{nomeTime}</span>
              </p>
            )}
          </div>

          <button
            onClick={sair}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold flex items-center gap-2"
            title="Sair"
          >
            <FiLogOut className="text-white" />
            Sair
          </button>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <CardInfo
            label="Saldo Atual"
            value={saldo !== null ? fmtBRL(saldo) : '—'}
            icon={<FiDollarSign className="text-green-300" />}
            accent="from-emerald-500/20 to-emerald-400/10"
          />
          <CardInfo
            label="Jogadores"
            value={numJogadores ?? '—'}
            icon={<FiUsers className="text-blue-300" />}
            accent="from-sky-500/20 to-sky-400/10"
          />
          <CardInfo
            label="Posição"
            value={posicao ?? '—'}
            icon={<FiAward className="text-yellow-300" />}
            accent="from-yellow-500/20 to-yellow-400/10"
          />
          <CardInfo
            label="Total Salários"
            value={fmtBRL(totalSalarios)}
            icon={<FiDollarSign className="text-fuchsia-300" />}
            accent="from-fuchsia-500/20 to-fuchsia-400/10"
          />
        </div>

        {/* BID */}
        <section className="bg-black/55 border border-yellow-400/20 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-yellow-400">📰 Últimos Eventos do BID</h2>
            {eventosBID.length > 1 && (
              <div className="flex items-center gap-2">
                <IconButton
                  onClick={() => {
                    setFadeBID(false)
                    setTimeout(() => {
                      setIndexBID((prev) => (prev - 1 + eventosBID.length) % eventosBID.length)
                      setFadeBID(true)
                    }, 200)
                  }}
                  ariaLabel="Anterior"
                >
                  <FiChevronLeft />
                </IconButton>
                <IconButton
                  onClick={() => {
                    setFadeBID(false)
                    setTimeout(() => {
                      setIndexBID((prev) => (prev + 1) % eventosBID.length)
                      setFadeBID(true)
                    }, 200)
                  }}
                  ariaLabel="Próximo"
                >
                  <FiChevronRight />
                </IconButton>
              </div>
            )}
          </div>

          {eventosBID.length > 0 ? (
            <div
              onMouseEnter={() => (bidPaused.current = true)}
              onMouseLeave={() => (bidPaused.current = false)}
              className={`relative min-h-16 flex items-center justify-center transition-opacity duration-300 ${
                fadeBID ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <p className="text-yellow-300 text-lg text-center px-4">
                {eventosBID[indexBID]?.descricao}
              </p>

              {/* Dots */}
              <div className="absolute -bottom-1 left-0 right-0 flex justify-center gap-1">
                {eventosBID.slice(0, 6).map((_, i) => (
                  <span
                    key={`dot-bid-${i}`}
                    className={`h-1.5 w-1.5 rounded-full ${
                      i === indexBID % 6 ? 'bg-yellow-400' : 'bg-yellow-400/30'
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </section>

        {/* Jogos */}
        <section className="bg-black/55 border border-blue-400/20 rounded-lg p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-blue-400">📅 Últimos Jogos</h2>
            {jogos.length > 1 && (
              <div className="flex items-center gap-2">
                <IconButton
                  onClick={() => {
                    setFadeJogo(false)
                    setTimeout(() => {
                      setIndexJogo((prev) => (prev - 1 + jogos.length) % jogos.length)
                      setFadeJogo(true)
                    }, 200)
                  }}
                  ariaLabel="Anterior"
                >
                  <FiChevronLeft />
                </IconButton>
                <IconButton
                  onClick={() => {
                    setFadeJogo(false)
                    setTimeout(() => {
                      setIndexJogo((prev) => (prev + 1) % jogos.length)
                      setFadeJogo(true)
                    }, 200)
                  }}
                  ariaLabel="Próximo"
                >
                  <FiChevronRight />
                </IconButton>
              </div>
            )}
          </div>

          {jogos.length > 0 ? (
            <div
              onMouseEnter={() => (jogoPaused.current = true)}
              onMouseLeave={() => (jogoPaused.current = false)}
              className={`transition-opacity duration-300 ${fadeJogo ? 'opacity-100' : 'opacity-0'}`}
            >
              <Placar
                mandante={{
                  nome: nomeDoTime(jogos[indexJogo]?.mandante),
                  escudo: escudoDoTime(jogos[indexJogo]?.mandante),
                }}
                visitante={{
                  nome: nomeDoTime(jogos[indexJogo]?.visitante),
                  escudo: escudoDoTime(jogos[indexJogo]?.visitante),
                }}
                gm={jogos[indexJogo]?.gols_mandante ?? 0}
                gv={jogos[indexJogo]?.gols_visitante ?? 0}
              />
            </div>
          ) : (
            <p className="text-gray-400">Nenhum jogo finalizado encontrado.</p>
          )}
        </section>

        {/* Rankings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RankingCard
            titulo="💰 Top 3 Menores Saldo"
            items={topMenoresSaldo.map((t) => ({
              id: t.id,
              nome: t.nome,
              sub: fmtBRL(Number(t.saldo || 0)),
              escudo: t.escudo_url || '',
            }))}
            borderColor="border-rose-400/20"
            badgeClass="bg-rose-500/20 text-rose-200"
          />
          <RankingCard
            titulo="📝 Top 3 Menores Salários"
            items={topMenoresSalarios.map((t) => ({
              id: t.id_time,
              nome: t.nome,
              sub: fmtBRL(t.total),
              escudo: t.escudo_url || '',
            }))}
            borderColor="border-blue-400/20"
            badgeClass="bg-blue-500/20 text-blue-200"
          />
        </div>
      </div>
    </main>
  )
}

/** ========= Componentes auxiliares ========= */

function CardInfo({
  label,
  value,
  icon,
  accent = 'from-emerald-500/20 to-emerald-400/10',
}: {
  label: string
  value: string | number
  icon?: React.ReactNode
  accent?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/50 p-4">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent}`} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="text-gray-400 text-sm">{label}</div>
          {icon}
        </div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="h-8 w-8 grid place-items-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition"
    >
      {children}
    </button>
  )
}

function Placar({
  mandante,
  visitante,
  gm,
  gv,
}: {
  mandante: { nome: string; escudo?: string }
  visitante: { nome: string; escudo?: string }
  gm: number
  gv: number
}) {
  const vencedor =
    gm > gv ? 'mandante' : gv > gm ? 'visitante' : 'empate'

  return (
    <div className="rounded-lg border border-blue-400/20 bg-gradient-to-br from-blue-500/10 to-indigo-500/5 p-4">
      <div className="grid grid-cols-3 items-center gap-2">
        {/* Mandante */}
        <TeamSide
          nome={mandante.nome}
          escudo={mandante.escudo}
          align="right"
          highlight={vencedor === 'mandante'}
        />

        {/* Placar */}
        <div className="text-center">
          <div className="text-4xl font-extrabold">
            {gm} <span className="text-blue-300">x</span> {gv}
          </div>
        </div>

        {/* Visitante */}
        <TeamSide
          nome={visitante.nome}
          escudo={visitante.escudo}
          align="left"
          highlight={vencedor === 'visitante'}
        />
      </div>
    </div>
  )
}

function TeamSide({
  nome,
  escudo,
  align = 'left',
  highlight = false,
}: {
  nome: string
  escudo?: string
  align?: 'left' | 'right'
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {align === 'left' && (
        <Escudo src={escudo} alt={nome} />
      )}

      <div className={`text-lg font-semibold ${highlight ? 'text-white' : 'text-gray-200'}`}>
        {nome || '—'}
      </div>

      {align === 'right' && (
        <Escudo src={escudo} alt={nome} />
      )}
    </div>
  )
}

function Escudo({ src, alt }: { src?: string; alt: string }) {
  const fallback = '/escudo-fallback.png' // garanta um fallback na pasta public
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || fallback}
      alt={alt}
      className="h-10 w-10 rounded-full object-cover border border-white/10 bg-white/5"
      onError={(e) => {
        const el = e.currentTarget as HTMLImageElement
        if (el.src !== window.location.origin + fallback) el.src = fallback
      }}
    />
  )
}

function RankingCard({
  titulo,
  items,
  borderColor,
  badgeClass,
}: {
  titulo: string
  items: { id: string; nome: string; sub: string; escudo?: string }[]
  borderColor: string
  badgeClass: string
}) {
  return (
    <div className={`bg-black/55 border ${borderColor} rounded-lg p-4`}>
      <h3 className="text-xl font-bold mb-3">{titulo}</h3>
      {items.length === 0 ? (
        <p className="text-gray-400">Sem dados suficientes.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/5 p-2"
            >
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.escudo || '/escudo-fallback.png'}
                  alt={it.nome}
                  className="h-8 w-8 rounded-full object-cover border border-white/10"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.src = '/escudo-fallback.png'
                  }}
                />
                <div className="font-medium">{i + 1}. {it.nome}</div>
              </div>
              <span className={`text-sm px-2 py-1 rounded ${badgeClass}`}>{it.sub}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
