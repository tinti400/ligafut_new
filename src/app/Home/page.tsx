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
  FaRegPauseCircle,
  FaPlayCircle,
  FaRegNewspaper,
  FaUserShield,
  FaUser
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
  tipo_evento?: string | null
  id_time1?: string | null
  id_time2?: string | null
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

  // ✅ Lê login do localStorage
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

  // ✅ Carrega BID + times
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
          supabase.from('times').select('id, nome, saldo, total_salarios, escudo_url')
        ])

        if (!bidRes.error) setEventosBID(bidRes.data || [])
        if (!timesRes.error) setTimes(timesRes.data || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // ✅ BID em tempo real (INSERT)
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

  // ✅ Carrossel seguro
  useEffect(() => setIndexAtual(0), [eventosBID.length])
  useEffect(() => {
    if (paused || !eventosBID.length) return
    const id = setInterval(() => setIndexAtual((p) => (p + 1) % eventosBID.length), 3500)
    return () => clearInterval(id)
  }, [paused, eventosBID])

  const formatarValor = (valor?: number | null) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0))

  const safeTimes = useMemo<RankedTime[]>(
    () =>
      (times || []).map((t) => ({
        id: t.id,
        nome: t.nome,
        saldo: Number(t.saldo ?? 0),
        total_salarios: Number(t.total_salarios ?? 0),
        escudo_url: t.escudo_url ?? null
      })),
    [times]
  )

  const top = useMemo(
    () => ({
      saldoDesc: [...safeTimes].sort((a, b) => b.saldo - a.saldo).slice(0, 3),
      saldoAsc: [...safeTimes].sort((a, b) => a.saldo - b.saldo).slice(0, 3),
      salDesc: [...safeTimes].sort((a, b) => b.total_salarios - a.total_salarios).slice(0, 3),
      salAsc: [...safeTimes].sort((a, b) => a.total_salarios - b.total_salarios).slice(0, 3)
    }),
    [safeTimes]
  )

  const timeById = useMemo<Record<string, TimeRow>>(
    () => Object.fromEntries((times || []).map((t) => [t.id, t])),
    [times]
  )

  const CardRanking = ({
    titulo,
    lista,
    cor,
    Icone
  }: {
    titulo: string
    lista: RankedTime[]
    cor: string
    Icone: any
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center justify-between">
        <h3 className={`text-base md:text-lg font-extrabold ${cor} flex items-center gap-2`}>
          <Icone className="opacity-90" /> {titulo}
        </h3>
      </div>

      <div className="mt-3 space-y-2">
        {lista.map((time, index) => {
          const valor = titulo.toLowerCase().includes('salári') ? time.total_salarios : time.saldo
          const isMeu = time.nome === nomeTime
          return (
            <div
              key={time.id}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                isMeu ? 'bg-yellow-500/10 border border-yellow-400/20' : 'bg-black/20'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-white/70 w-5">{index + 1}.</span>
                {time.escudo_url ? (
                  <img
                    src={time.escudo_url}
                    alt={`Escudo do ${time.nome}`}
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <div className="w-6 h-6 rounded bg-white/10" />
                )}
                <span className={`text-sm font-semibold truncate ${isMeu ? 'text-yellow-300' : ''}`}>
                  {time.nome}
                </span>
              </div>
              <span className="text-sm font-bold text-white/90 whitespace-nowrap">
                {formatarValor(valor)}
              </span>
            </div>
          )
        })}
      </div>
    </motion.div>
  )

  // ====== ARTES DE TRANSFERÊNCIA ======
  const TransferCard = ({ ev }: { ev: BidEvent }) => {
    const vendedor = ev.id_time1 ? timeById[ev.id_time1] : null
    const comprador = ev.id_time2 ? timeById[ev.id_time2] : null
    const tipo = (ev.tipo_evento || '').toLowerCase()
    const hasValor = Number(ev.valor ?? 0) > 0

    const bg = tipo.includes('troca')
      ? 'from-indigo-700/45 via-purple-700/25 to-pink-600/25'
      : tipo.includes('percent') || tipo.includes('comprar_percentual')
      ? 'from-cyan-700/45 via-teal-700/25 to-emerald-600/25'
      : 'from-emerald-700/45 via-green-700/25 to-lime-600/25'

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
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_top,rgba(255,255,255,0.20),transparent_55%)]" />
        <div className="relative flex items-center justify-between gap-4">
          {/* Vendedor */}
          <div className="flex items-center gap-2 w-1/4 min-w-[95px]">
            {vendedor?.escudo_url ? (
              <img
                src={vendedor.escudo_url}
                alt={`Escudo do ${vendedor.nome}`}
                className="w-10 h-10 object-contain drop-shadow"
              />
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
              <img
                src={comprador.escudo_url}
                alt={`Escudo do ${comprador.nome}`}
                className="w-10 h-10 object-contain drop-shadow"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10" />
            )}
          </div>
        </div>
      </motion.div>
    )
  }

  const eventoAtual = eventosBID[indexAtual]
  const ultimosLista = useMemo(() => (eventosBID || []).slice(0, 5), [eventosBID])

  return (
    <main
      className="relative min-h-screen text-white bg-cover bg-center"
      style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}
    >
      {/* overlay */}
      <div className="absolute inset-0 bg-black/80" />

      {/* header fixo estilo app */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-black/40 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-green-500/15 border border-green-400/20 flex items-center justify-center">
              <span className="text-green-300 text-lg">🏟️</span>
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold text-green-300">LigaFut</div>
              <div className="text-[12px] text-white/60 -mt-0.5">Central da liga</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {logado ? (
              <div className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5">
                <FaUser className="text-white/70" />
                <span className="text-sm text-white/80 max-w-[160px] truncate">{nomeTime}</span>
              </div>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="rounded-full bg-green-600 hover:bg-green-700 px-4 py-2 text-sm font-bold shadow"
              >
                🔑 Login
              </button>
            )}
          </div>
        </div>
      </div>

      {/* conteúdo */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-6">
        {/* hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 md:p-6 shadow-xl backdrop-blur-md"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">
                Simule campeonatos. Gerencie seu time. <span className="text-green-300">Conquiste títulos.</span>
              </h1>
              <p className="mt-1 text-sm text-white/65">
                Tudo em tempo real: BID, transferências, rankings e controle financeiro.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaused((p) => !p)}
                className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm font-bold flex items-center gap-2"
                title={paused ? 'Retomar carrossel' : 'Pausar carrossel'}
              >
                {paused ? <FaPlayCircle /> : <FaRegPauseCircle />}
                {paused ? 'Retomar' : 'Pausar'}
              </button>

              {logado ? (
                <div className="rounded-2xl bg-green-500/10 border border-green-400/15 px-4 py-2 text-sm font-bold flex items-center gap-2">
                  <FaUserShield className="text-green-300" />
                  Logado
                </div>
              ) : (
                <div className="rounded-2xl bg-red-500/10 border border-red-400/15 px-4 py-2 text-sm font-bold">
                  Não logado
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* BID */}
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

                {/* descrição */}
                <div className="mt-3 text-sm text-yellow-200/90 italic line-clamp-2">
                  {eventoAtual?.descricao}
                </div>

                {/* indicadores */}
                <div className="flex gap-1.5 justify-center mt-3">
                  {eventosBID.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${i === indexAtual ? 'bg-green-400' : 'bg-white/20'}`}
                    />
                  ))}
                </div>

                {/* lista útil */}
                <div className="mt-4 grid gap-2">
                  {ultimosLista.map((ev, i) => (
                    <button
                      key={ev.id}
                      onClick={() => setIndexAtual(i)}
                      className={`text-left rounded-2xl px-3 py-2 border ${
                        i === indexAtual ? 'border-green-400/30 bg-green-500/10' : 'border-white/10 bg-black/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-white/90 line-clamp-1">
                          {ev.jogador_nome || 'Jogador'}
                        </div>
                        <div className="text-xs text-white/60 whitespace-nowrap">
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

        {/* Rankings */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardRanking titulo="Top 3 Mais Saldo" lista={top.saldoDesc} cor="text-green-300" Icone={FaMoneyBillWave} />
          <CardRanking titulo="Top 3 Menos Saldo" lista={top.saldoAsc} cor="text-red-300" Icone={FaArrowDown} />
          <CardRanking titulo="Top 3 Maiores Salários" lista={top.salDesc} cor="text-yellow-200" Icone={FaChartLine} />
          <CardRanking titulo="Top 3 Menores Salários" lista={top.salAsc} cor="text-blue-300" Icone={FaArrowUp} />
        </div>

        {/* FAB Admin */}
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
