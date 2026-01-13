'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  FaMoneyBillWave,
  FaUsers,
  FaMapMarkerAlt,
  FaChartLine,
  FaArrowDown,
  FaArrowUp,
  FaExchangeAlt,
  FaPercent,
  FaRegNewspaper,
  FaPlayCircle,
  FaRegPauseCircle,
  FaPlus,
} from 'react-icons/fa'

/** ================== Supabase ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ================== Types ================== */
type TimeRow = {
  id: string
  nome: string
  saldo?: number | null
  total_salarios?: number | null
  escudo_url?: string | null

  // campos opcionais (se existirem, melhor)
  divisao?: string | number | null
  divisao_nome?: string | null
  divisao_id?: string | number | null
  divisao_numero?: string | number | null
}

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

type JogoRow = {
  id: string
  created_at?: string | null
  mandante_nome?: string | null
  visitante_nome?: string | null
  mandante_escudo_url?: string | null
  visitante_escudo_url?: string | null
  gols_mandante?: number | null
  gols_visitante?: number | null
}

type RankedTime = {
  id: string
  nome: string
  saldo: number
  total_salarios: number
  escudo_url: string | null
}

/** ================== Utils ================== */
const formatarValor = (valor?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0))

/** ================== Hero UT ================== */
function HeroUT({
  nomeTime,
  logado,
  onGoMercado,
  onGoElenco,
  onGoBID,
  paused,
  onTogglePaused,
}: {
  nomeTime: string
  logado: boolean
  onGoMercado: () => void
  onGoElenco: () => void
  onGoBID: () => void
  paused: boolean
  onTogglePaused: () => void
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-md"
    >
      {/* neon + grid */}
      <div className="absolute inset-0 opacity-55 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.22),transparent_55%)]" />
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
              Domine o{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-300 via-emerald-200 to-lime-200 drop-shadow">
                Mercado
              </span>{' '}
              e faça história na Liga.
            </h1>

            <p className="mt-2 text-sm md:text-base text-white/70 max-w-2xl">
              BID em tempo real, transferências, rankings e finanças — com vibe Ultimate Team.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                ⚡ Tempo real
              </span>
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                💸 Finanças
              </span>
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                🧩 Elencos
              </span>
              <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/80">
                🏆 Competições
              </span>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button
                onClick={onGoMercado}
                className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-3 text-sm font-black shadow-lg shadow-green-500/20 hover:brightness-110 border border-white/10"
              >
                🚀 Mercado
              </button>

              <button
                onClick={onGoElenco}
                className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-black border border-white/10"
              >
                🧩 Elenco
              </button>

              <button
                onClick={onGoBID}
                className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-black border border-white/10"
              >
                📰 BID
              </button>
            </div>
          </div>

          {/* card do gerente */}
          <div className="w-full md:w-[360px] shrink-0">
            <div className="relative rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl overflow-hidden">
              <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.20),transparent_60%)]" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-black text-white/70">GERENCIANDO</div>
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
                      <div className="text-[11px] text-white/60">Carrossel BID</div>
                      <div className="text-sm font-extrabold text-white">{paused ? 'Pausado' : 'Rodando'}</div>
                    </div>
                    <div className="rounded-xl bg-black/30 border border-white/10 p-2">
                      <div className="text-[11px] text-white/60">Dica</div>
                      <div className="text-sm font-extrabold text-white">Passe o mouse</div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={onTogglePaused}
                  className="mt-3 w-full rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-black border border-white/10 flex items-center justify-center gap-2"
                  title={paused ? 'Retomar carrossel do BID' : 'Pausar carrossel do BID'}
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
  )
}

/** ================== Page ================== */
export default function HomePage() {
  const router = useRouter()

  const [nomeTime, setNomeTime] = useState('')
  const [logado, setLogado] = useState(false)

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // topo
  const [saldoAtual, setSaldoAtual] = useState<number>(0)
  const [totalSalariosMeuTime, setTotalSalariosMeuTime] = useState<number>(0)
  const [jogadoresCount, setJogadoresCount] = useState<number>(0)
  const [posicao, setPosicao] = useState<string>('—')

  // BID + times + jogos
  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [indexAtual, setIndexAtual] = useState(0)
  const [paused, setPaused] = useState(false)

  const [times, setTimes] = useState<TimeRow[]>([])
  const [ultimosJogos, setUltimosJogos] = useState<JogoRow[]>([])
  const [indexJogo, setIndexJogo] = useState(0)

  // ===== login localStorage
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

  // ===== load data
  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setErro(null)

        // 1) Times (inclui campos de divisão se existirem)
        const timesRes = await supabase
          .from('times')
          .select('id, nome, saldo, total_salarios, escudo_url, divisao, divisao_nome, divisao_id, divisao_numero')

        if (timesRes.error) throw new Error('Falha ao carregar times')

        const timesData = (timesRes.data || []) as TimeRow[]
        setTimes(timesData)

        // meu time pelo nome (igual você já usa)
        const meu = timesData.find(
          (t) => (t.nome || '').toLowerCase() === (nomeTime || '').toLowerCase()
        )
        setSaldoAtual(Number(meu?.saldo ?? 0))
        setTotalSalariosMeuTime(Number(meu?.total_salarios ?? 0))

        // 2) BID
        const bidRes = await supabase
          .from('bid')
          .select(
            'id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_id, jogador_nome, jogador_imagem_url'
          )
          .order('data_evento', { ascending: false })
          .limit(10)

        if (bidRes.error) throw new Error('Falha ao carregar BID')
        setEventosBID((bidRes.data || []) as BidEvent[])

        // 3) Últimos jogos (se não existir, não quebra)
        const jogosRes = await supabase
          .from('jogos')
          .select(
            'id, created_at, mandante_nome, visitante_nome, mandante_escudo_url, visitante_escudo_url, gols_mandante, gols_visitante'
          )
          .order('created_at', { ascending: false })
          .limit(10)

        if (!jogosRes.error) setUltimosJogos((jogosRes.data || []) as JogoRow[])

        // 4) Contagem de jogadores (se não existir, não quebra)
        const jogadoresRes = await supabase.from('jogadores').select('id', { count: 'exact', head: true })
        if (!jogadoresRes.error) setJogadoresCount(Number(jogadoresRes.count ?? 0))

        // 5) posição (se não existir, não quebra)
        const posRes = await supabase
          .from('classificacao')
          .select('posicao')
          .eq('time_nome', nomeTime)
          .maybeSingle()

        if (!posRes.error && posRes.data?.posicao) setPosicao(String(posRes.data.posicao))
      } catch (e: any) {
        setErro(e?.message || 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    })()
  }, [nomeTime])

  // ===== realtime BID (INSERT)
  useEffect(() => {
    const ch = supabase
      .channel('bid-inserts-home')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bid' }, (payload) => {
        setEventosBID((prev) => [payload.new as BidEvent, ...prev].slice(0, 10))
        setIndexAtual(0)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  // ===== carrossel BID
  useEffect(() => setIndexAtual(0), [eventosBID.length])
  useEffect(() => {
    if (paused || !eventosBID.length) return
    const id = setInterval(() => setIndexAtual((p) => (p + 1) % eventosBID.length), 3500)
    return () => clearInterval(id)
  }, [paused, eventosBID.length])

  // ===== carrossel jogos
  useEffect(() => setIndexJogo(0), [ultimosJogos.length])
  useEffect(() => {
    if (!ultimosJogos.length) return
    const id = setInterval(() => setIndexJogo((p) => (p + 1) % ultimosJogos.length), 5000)
    return () => clearInterval(id)
  }, [ultimosJogos.length])

  const timeById = useMemo<Record<string, TimeRow>>(
    () => Object.fromEntries((times || []).map((t) => [t.id, t])),
    [times]
  )

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

  const eventoAtual = eventosBID[indexAtual]
  const jogoAtual = ultimosJogos[indexJogo]

  const StatCard = ({
    title,
    value,
    Icon,
    tone,
  }: {
    title: string
    value: string
    Icon: any
    tone: 'green' | 'blue' | 'yellow' | 'purple'
  }) => {
    const toneMap = {
      green: 'from-emerald-500/25 via-green-500/10 to-lime-400/10',
      blue: 'from-sky-500/25 via-blue-500/10 to-cyan-400/10',
      yellow: 'from-amber-500/25 via-yellow-500/10 to-orange-400/10',
      purple: 'from-fuchsia-500/25 via-purple-500/10 to-indigo-400/10',
    }[tone]

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${toneMap} p-4 shadow-xl`}
      >
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_top,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/70 font-semibold">{title}</div>
            <div className="mt-1 text-lg md:text-xl font-extrabold text-white truncate">{value}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
            <Icon className="text-white/80" />
          </div>
        </div>
      </motion.div>
    )
  }

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
      <div className={`text-base font-extrabold ${cor} flex items-center gap-2`}>
        <Icone className="opacity-90" /> {titulo}
      </div>

      <div className="mt-3 space-y-2">
        {lista.length ? (
          lista.map((time, index) => {
            const valor = usaSalario ? time.total_salarios : time.saldo
            const isMeu = (time.nome || '').toLowerCase() === (nomeTime || '').toLowerCase()
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
          })
        ) : (
          <div className="text-sm text-white/60 mt-2">Sem dados suficientes.</div>
        )}
      </div>
    </div>
  )

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
        initial={{ opacity: 0, y: 8, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r ${bg} p-4 shadow-2xl`}
      >
        <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_55%)]" />

        <div className="relative flex items-center justify-between gap-4">
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

  // ===== Times por divisão (somente logos)
  const timesPorDivisao = useMemo(() => {
    const getDiv = (t: any) =>
      t.divisao_nome ??
      t.divisao ??
      t.divisao_id ??
      t.divisao_numero ??
      'Divisão 1'

    const grupos = (times || []).reduce<Record<string, TimeRow[]>>((acc, t: any) => {
      const key = String(getDiv(t))
      if (!acc[key]) acc[key] = []
      acc[key].push(t as TimeRow)
      return acc
    }, {})

    const ordem = Object.keys(grupos).sort((a, b) => {
      const na = Number(a.replace(/\D/g, '')) || 999
      const nb = Number(b.replace(/\D/g, '')) || 999
      if (na !== nb) return na - nb
      return a.localeCompare(b)
    })

    return { grupos, ordem }
  }, [times])

  return (
    <main className="relative min-h-screen text-white bg-cover bg-center" style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}>
      <div className="absolute inset-0 bg-black/80" />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-4">
        {/* erro */}
        {erro && (
          <div className="mb-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            ❌ {erro}
          </div>
        )}

        {/* HERO */}
        <HeroUT
          nomeTime={nomeTime}
          logado={logado}
          paused={paused}
          onTogglePaused={() => setPaused((p) => !p)}
          onGoMercado={() => router.push('/mercado')}
          onGoElenco={() => router.push('/elenco')}
          onGoBID={() => router.push('/BID')} // ✅ BID em MAIÚSCULO
        />

        {/* Top stats */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard title="Saldo Atual" value={formatarValor(saldoAtual)} Icon={FaMoneyBillWave} tone="green" />
          <StatCard title="Jogadores" value={String(jogadoresCount)} Icon={FaUsers} tone="blue" />
          <StatCard title="Posição" value={posicao || '—'} Icon={FaMapMarkerAlt} tone="yellow" />
          <StatCard title="Total Salários" value={formatarValor(totalSalariosMeuTime)} Icon={FaChartLine} tone="purple" />
        </div>

        {/* ================= TIMES POR DIVISÕES (LOGOS) ================= */}
        <section className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base md:text-lg font-extrabold">🏟️ Times</h2>

            {/* botão opcional */}
            <button
              onClick={() => router.push('/BID')}
              className="text-xs font-black px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10"
              title="Abrir BID"
            >
              Abrir BID
            </button>
          </div>

          <p className="mt-1 text-xs text-white/60">
            Logos organizados por divisão.
          </p>

          <div className="mt-4 space-y-6">
            {timesPorDivisao.ordem.map((div) => {
              const lista = (timesPorDivisao.grupos[div] || []).slice().sort((a, b) => a.nome.localeCompare(b.nome))
              const titulo = String(div).toLowerCase().includes('div') ? div : `Divisão ${div}`

              return (
                <div key={div}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-extrabold text-white/90">{titulo}</div>
                    <div className="text-xs text-white/60">{lista.length} times</div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
                    {lista.map((t) => (
                      <div
                        key={t.id}
                        className="group relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/25 p-2 hover:bg-white/5 transition"
                        title={t.nome}
                      >
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition [background:radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_60%)] rounded-2xl" />

                        {t.escudo_url ? (
                          <img
                            src={t.escudo_url}
                            alt={t.nome}
                            className="relative w-10 h-10 md:w-12 md:h-12 object-contain drop-shadow"
                          />
                        ) : (
                          <div className="relative w-10 h-10 rounded-xl bg-white/10" />
                        )}

                        <div className="mt-1 text-[10px] text-white/70 truncate w-full text-center opacity-0 group-hover:opacity-100 transition">
                          {t.nome}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* BID + Jogos */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* BID */}
          <section
            className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base md:text-lg font-extrabold flex items-center gap-2">
                <FaRegNewspaper className="text-green-300" /> Últimos Eventos do BID
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

            <div className="mt-3">
              {loading ? (
                <div className="space-y-2">
                  <div className="h-24 bg-white/5 rounded-3xl animate-pulse" />
                  <div className="h-10 bg-white/5 rounded-2xl animate-pulse" />
                </div>
              ) : eventosBID.length ? (
                <>
                  <TransferCard ev={eventoAtual} />
                  <div className="mt-2 text-sm text-yellow-200/90 italic line-clamp-2">{eventoAtual?.descricao}</div>

                  <div className="flex gap-1.5 justify-center mt-3">
                    {eventosBID.map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full ${i === indexAtual ? 'bg-green-400' : 'bg-white/20'}`}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-white/60 mt-2">Nenhum evento encontrado.</div>
              )}
            </div>
          </section>

          {/* Últimos jogos */}
          <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base md:text-lg font-extrabold">📅 Últimos Jogos</h2>
              <div className="text-xs text-white/60">rotativo</div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-4">
              {ultimosJogos.length ? (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    {jogoAtual?.mandante_escudo_url ? (
                      <img src={jogoAtual.mandante_escudo_url} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/10" />
                    )}
                    <div className="font-bold truncate">{jogoAtual?.mandante_nome || '—'}</div>
                  </div>

                  <div className="text-2xl font-black text-white whitespace-nowrap">
                    {(jogoAtual?.gols_mandante ?? 0).toString()} x {(jogoAtual?.gols_visitante ?? 0).toString()}
                  </div>

                  <div className="flex items-center gap-2 min-w-0 justify-end">
                    <div className="font-bold truncate text-right">{jogoAtual?.visitante_nome || '—'}</div>
                    {jogoAtual?.visitante_escudo_url ? (
                      <img src={jogoAtual.visitante_escudo_url} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/10" />
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/60">Sem jogos suficientes.</div>
              )}
            </div>

            <div className="mt-3 flex gap-1.5 justify-center">
              {ultimosJogos.slice(0, 10).map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full ${i === indexJogo ? 'bg-blue-400' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Rankings */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardRanking titulo="Top 3 Mais Saldo" lista={top.saldoDesc} cor="text-green-300" Icone={FaMoneyBillWave} />
          <CardRanking titulo="Top 3 Menos Saldo" lista={top.saldoAsc} cor="text-red-300" Icone={FaArrowDown} />
          <CardRanking
            titulo="Top 3 Maiores Salários"
            lista={top.salDesc}
            cor="text-yellow-200"
            Icone={FaChartLine}
            usaSalario
          />
          <CardRanking
            titulo="Top 3 Menores Salários"
            lista={top.salAsc}
            cor="text-blue-300"
            Icone={FaArrowUp}
            usaSalario
          />
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
