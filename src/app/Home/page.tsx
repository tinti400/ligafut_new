'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  FaMoneyBillWave,
  FaChartLine,
  FaArrowDown,
  FaArrowUp,
  FaPlus,
  FaExchangeAlt,
  FaPercent,
  FaRegNewspaper,
  FaRegPauseCircle,
  FaPlayCircle,
  FaUser,
} from 'react-icons/fa'
import { motion } from 'framer-motion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type BidEvent = {
  id: string
  descricao: string
  data_evento: string
  tipo_evento?: string | null // 'transferencia' | 'troca' | ...
  id_time1?: string | null // vendedor
  id_time2?: string | null // comprador
  valor?: number | null
  jogador_id?: string | null
  jogador_nome?: string | null
  jogador_imagem_url?: string | null
}

type TimeRow = {
  id: string
  nome: string
  saldo?: number | null
  total_salarios?: number | null
  escudo_url?: string | null
}

type RankedTime = {
  id: string
  nome: string
  saldo: number
  total_salarios: number
  escudo_url: string | null
}

export default function HomePage() {
  const router = useRouter()

  const [nomeTime, setNomeTime] = useState('')
  const [logado, setLogado] = useState(false)

  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [indexAtual, setIndexAtual] = useState(0)

  const [times, setTimes] = useState<TimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)

  // ===== Login (localStorage)
  useEffect(() => {
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    if (userStr) {
      try {
        const userData = JSON.parse(userStr)
        setNomeTime(userData.nome_time || userData.nome || '')
        setLogado(true)
      } catch {
        setNomeTime('')
        setLogado(false)
      }
    }
  }, [])

  // ===== Carrega BID + times
  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const [bidRes, timesRes] = await Promise.all([
          supabase
            .from('bid')
            .select(
              'id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_id, jogador_nome, jogador_imagem_url'
            )
            .order('data_evento', { ascending: false })
            .limit(10),
          supabase.from('times').select('id, nome, saldo, total_salarios, escudo_url'),
        ])

        if (!bidRes.error) setEventosBID(bidRes.data || [])
        if (!timesRes.error) setTimes(timesRes.data || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // ===== Realtime BID (INSERT)
  useEffect(() => {
    const ch = supabase
      .channel('bid-inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bid' }, (payload) => {
        setEventosBID((prev) => [payload.new as BidEvent, ...prev].slice(0, 10))
        setIndexAtual(0)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  // ===== Carrossel seguro
  useEffect(() => setIndexAtual(0), [eventosBID.length])
  useEffect(() => {
    if (paused || !eventosBID.length) return
    const id = setInterval(() => setIndexAtual((p) => (p + 1) % eventosBID.length), 3500)
    return () => clearInterval(id)
  }, [paused, eventosBID.length])

  const formatarValor = (valor?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0))

  const safeTimes = useMemo<RankedTime[]>(
    () =>
      (times || []).map((t) => ({
        id: t.id,
        nome: t.nome,
        saldo: Number(t.saldo ?? 0),
        total_salarios: Number(t.total_salarios ?? 0),
        escudo_url: t.escudo_url ?? null,
      })),
    [times]
  )

  const top = useMemo(
    () => ({
      saldoDesc: [...safeTimes].sort((a, b) => b.saldo - a.saldo).slice(0, 3),
      saldoAsc: [...safeTimes].sort((a, b) => a.saldo - b.saldo).slice(0, 3),
      salDesc: [...safeTimes].sort((a, b) => b.total_salarios - a.total_salarios).slice(0, 3),
      salAsc: [...safeTimes].sort((a, b) => a.total_salarios - b.total_salarios).slice(0, 3),
    }),
    [safeTimes]
  )

  const timeById = useMemo<Record<string, TimeRow>>(
    () => Object.fromEntries((times || []).map((t) => [t.id, t])),
    [times]
  )

  const eventoAtual = eventosBID[indexAtual]
  const ultimosLista = useMemo(() => (eventosBID || []).slice(0, 5), [eventosBID])

  // ===== Cards
  const CardRanking = ({
    titulo,
    lista,
    cor,
    Icone,
    usaSalario,
  }: {
    titulo: string
    lista: RankedTime[]
    cor: string
    Icone: any
    usaSalario?: boolean
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md"
    >
      <div className={`text-base font-extrabold ${cor} flex items-center gap-2`}>
        <Icone className="opacity-90" /> {titulo}
      </div>

      <div className="mt-3 space-y-2">
        {lista.map((time, index) => {
          const valor = usaSalario ? time.total_salarios : time.saldo
          const isMeu = time.nome === nomeTime
          return (
            <div
              key={time.id}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                isMeu ? 'bg-yellow-500/10 border border-yellow-400/20' : 'bg-black/20 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-white/70 w-5">{index + 1}.</span>
                {time.escudo_url ? (
                  <img src={time.escudo_url} alt="" className="w-6 h-6 object-contain" />
                ) : (
                  <div className="w-6 h-6 rounded bg-white/10" />
                )}
                <span className={`text-sm font-semibold truncate ${isMeu ? 'text-yellow-300' : ''}`}>
                  {time.nome}
                </span>
              </div>

              <span className="text-sm font-black text-white/90 whitespace-nowrap">
                {formatarValor(valor)}
              </span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )

  // ===== Arte BID
  const TransferCard = ({ ev }: { ev: BidEvent }) => {
    const vendedor = ev.id_time1 ? timeById[ev.id_time1] : null
    const comprador = ev.id_time2 ? timeById[ev.id_time2] : null
    const tipo = (ev.tipo_evento || '').toLowerCase()
    const hasValor = Number(ev.valor ?? 0) > 0

    const bg = tipo.includes('troca')
      ? 'from-indigo-700/55 via-purple-700/30 to-pink-600/25'
      : tipo.includes('percent') || tipo.includes('comprar_percentual')
      ? 'from-cyan-700/55 via-teal-700/30 to-emerald-600/25'
      : 'from-emerald-700/55 via-green-700/30 to-lime-600/25'

    const TipoIcon = tipo.includes('troca')
      ? FaExchangeAlt
      : tipo.includes('percent') || tipo.includes('comprar_percentual')
      ? FaPercent
      : FaMoneyBillWave

    return (
      <motion.div
        key={ev.id}
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
        className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r ${bg} p-4 shadow-2xl`}
      >
        <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />

        <div className="relative flex items-center justify-between gap-4">
          {/* Vendedor */}
          <div className="flex items-center gap-2 w-1/4 min-w-[95px]">
            {vendedor?.escudo_url ? (
              <img src={vendedor.escudo_url} alt="" className="w-10 h-10 object-contain drop-shadow" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10" />
            )}
            <div className="text-xs text-gray-100/90 leading-4 min-w-0">
              <div className="opacity-70">de</div>
              <div className="font-semibold truncate">{vendedor?.nome || '—'}</div>
            </div>
          </div>

          {/* Jogador */}
          <div className="flex flex-col items-center w-2/4">
            <div className="relative">
              <div className="absolute -inset-2 bg-white/10 blur-2xl rounded-full" />
              <img
                src={ev.jogador_imagem_url || '/jogador_padrao.png'}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = '/jogador_padrao.png'
                }}
                alt={ev.jogador_nome || 'Jogador'}
                className="relative w-16 h-16 rounded-full object-cover ring-2 ring-white/25"
              />
            </div>

            <div className="mt-2 text-sm md:text-base font-extrabold text-white text-center line-clamp-1">
              {ev.jogador_nome || 'Jogador'}
            </div>

            <div className="mt-1 px-2.5 py-1 text-[11px] rounded-full bg-black/30 text-white/90 flex items-center gap-1">
              <TipoIcon className="opacity-80" />
              <span className="capitalize">{tipo ? tipo.replaceAll('_', ' ') : 'transferência'}</span>
              {hasValor && <span className="font-black">• {formatarValor(ev.valor)}</span>}
            </div>
          </div>

          {/* Comprador */}
          <div className="flex items-center gap-2 w-1/4 min-w-[95px] justify-end">
            <div className="text-xs text-gray-100/90 text-right leading-4 min-w-0">
              <div className="opacity-70">para</div>
              <div className="font-semibold truncate">{comprador?.nome || '—'}</div>
            </div>
            {comprador?.escudo_url ? (
              <img src={comprador.escudo_url} alt="" className="w-10 h-10 object-contain drop-shadow" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10" />
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <main
      className="relative min-h-screen text-white bg-cover bg-center"
      style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/80" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-5">
        {/* Header compacto */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-green-500/15 border border-green-400/20 flex items-center justify-center">
              <span className="text-green-300 text-lg">🏟️</span>
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-green-300">LigaFut</div>
              <div className="text-[12px] text-white/60 -mt-0.5">Home • Central da Liga</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {logado ? (
              <div className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5">
                <FaUser className="text-white/70" />
                <span className="text-sm text-white/80 max-w-[220px] truncate">{nomeTime}</span>
              </div>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="rounded-full bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-black shadow"
              >
                🔑 Login
              </button>
            )}
          </div>
        </div>

        {/* ✅ HERO UT (NOVO) */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-md"
        >
          <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.22),transparent_55%)]" />
          <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.18),transparent_60%)]" />
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:36px_36px]" />
          <div className="pointer-events-none absolute -top-28 -right-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-green-500/10 blur-3xl" />

          <div className="relative p-5 md:p-7">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white/80">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-400 shadow-[0_0_18px_rgba(34,197,94,0.8)]" />
                  TEMPORADA 2026 • CENTRAL DO CLUBE
                </div>

                <h1 className="mt-3 text-[22px] md:text-[32px] font-extrabold tracking-tight">
                  Monte seu elenco, domine o{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-emerald-200 to-lime-200 drop-shadow">
                    Mercado
                  </span>{' '}
                  e faça história.
                </h1>

                <p className="mt-2 text-sm md:text-base text-white/70 max-w-2xl">
                  BID em tempo real, transferências, rankings financeiros e tudo com vibe Ultimate Team.
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                    ⚡ BID ao vivo
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                    💸 Mercado
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                    🧠 Finanças
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                    🏆 Competições
                  </span>
                </div>

                <div className="mt-5 flex flex-col sm:flex-row gap-2">
                  {logado ? (
                    <>
                      <button
                        onClick={() => router.push('/mercado')}
                        className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-3 text-sm font-black shadow-lg shadow-green-500/20 hover:brightness-110 border border-white/10"
                      >
                        🚀 Ir pro Mercado
                      </button>
                      <button
                        onClick={() => router.push('/elenco')}
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-black border border-white/10"
                      >
                        🧩 Ver Elenco
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push('/login')}
                        className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-3 text-sm font-black shadow-lg shadow-green-500/20 hover:brightness-110 border border-white/10"
                      >
                        🔑 Entrar
                      </button>
                      <button
                        onClick={() => router.push('/regras')}
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-black border border-white/10"
                      >
                        📜 Ver Regras
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* card status */}
              <div className="w-full md:w-[360px] shrink-0">
                <div className="relative rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl overflow-hidden">
                  <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.20),transparent_60%)]" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-black text-white/70">STATUS</div>
                      <div
                        className={`text-xs font-black px-2 py-1 rounded-full border ${
                          logado
                            ? 'bg-green-500/10 border-green-400/20 text-green-200'
                            : 'bg-red-500/10 border-red-400/20 text-red-200'
                        }`}
                      >
                        {logado ? 'ONLINE' : 'OFFLINE'}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-xs text-white/60">Seu time</div>
                      <div className="text-base font-extrabold text-white mt-0.5 truncate">
                        {logado ? nomeTime : 'Faça login para continuar'}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-black/30 border border-white/10 p-2">
                          <div className="text-[11px] text-white/60">BID</div>
                          <div className="text-sm font-extrabold text-white">Tempo real</div>
                        </div>
                        <div className="rounded-xl bg-black/30 border border-white/10 p-2">
                          <div className="text-[11px] text-white/60">Mercado</div>
                          <div className="text-sm font-extrabold text-white">Online</div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setPaused((p) => !p)}
                      className="mt-3 w-full rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-black border border-white/10 flex items-center justify-center gap-2"
                      title={paused ? 'Retomar carrossel' : 'Pausar carrossel'}
                    >
                      {paused ? <FaPlayCircle /> : <FaRegPauseCircle />}
                      {paused ? 'Retomar carrossel do BID' : 'Pausar carrossel do BID'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ======= BID ======= */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mt-5 rounded-3xl border border-white/10 bg-white/[0.05] p-5 shadow-xl backdrop-blur-md"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg md:text-xl font-extrabold flex items-center gap-2">
              <FaRegNewspaper className="text-green-300" /> Últimos eventos do BID
            </h2>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIndexAtual((p) => (p - 1 + eventosBID.length) % eventosBID.length)}
                disabled={!eventosBID.length}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
                title="Anterior"
              >
                ‹
              </button>
              <button
                onClick={() => setIndexAtual((p) => (p + 1) % eventosBID.length)}
                disabled={!eventosBID.length}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
                title="Próximo"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="space-y-3">
                <div className="h-24 bg-white/5 rounded-3xl animate-pulse" />
                <div className="h-14 bg-white/5 rounded-2xl animate-pulse" />
              </div>
            ) : eventosBID.length ? (
              <>
                <TransferCard ev={eventoAtual} />

                <div className="mt-3 text-sm text-yellow-200/90 italic line-clamp-2">
                  {eventoAtual?.descricao}
                </div>

                <div className="flex gap-1.5 justify-center mt-3">
                  {eventosBID.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${i === indexAtual ? 'bg-green-400' : 'bg-white/20'}`}
                    />
                  ))}
                </div>

                {/* Lista clicável */}
                <div className="mt-4 grid gap-2">
                  {ultimosLista.map((ev, i) => (
                    <button
                      key={ev.id}
                      onClick={() => setIndexAtual(i)}
                      className={`text-left rounded-2xl px-3 py-2 border ${
                        i === indexAtual
                          ? 'border-green-400/30 bg-green-500/10'
                          : 'border-white/10 bg-black/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-white/90 line-clamp-1">
                          {ev.jogador_nome || 'Jogador'}
                        </div>
                        <div className="text-xs text-white/70 whitespace-nowrap">
                          {formatarValor(ev.valor)}
                        </div>
                      </div>
                      <div className="text-xs text-white/60 line-clamp-1 mt-0.5">{ev.descricao}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 text-white/60">Nenhum evento encontrado.</div>
            )}
          </div>
        </motion.section>

        {/* ======= Rankings ======= */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardRanking titulo="Top 3 Mais Saldo" lista={top.saldoDesc} cor="text-green-300" Icone={FaMoneyBillWave} />
          <CardRanking titulo="Top 3 Menos Saldo" lista={top.saldoAsc} cor="text-red-300" Icone={FaArrowDown} />
          <CardRanking titulo="Top 3 Maiores Salários" lista={top.salDesc} cor="text-yellow-200" Icone={FaChartLine} usaSalario />
          <CardRanking titulo="Top 3 Menores Salários" lista={top.salAsc} cor="text-blue-300" Icone={FaArrowUp} usaSalario />
        </div>

        {/* FAB Admin (mantive: se logado aparece) */}
        {logado && (
          <button
            onClick={() => router.push('/admin')}
            className="fixed bottom-6 right-6 z-30 p-4 bg-green-600 rounded-full text-white shadow-2xl hover:bg-green-700 border border-white/10"
            title="Administração"
          >
            <FaPlus size={20} />
          </button>
        )}
      </div>
    </main>
  )
}
