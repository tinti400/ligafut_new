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
  FaTrophy,
  FaFutbol,
  FaShieldAlt,
  FaClipboardList,
  FaUniversity,
  FaBolt,
  FaCoins,
} from 'react-icons/fa'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TimeRow = {
  id: string
  nome: string
  saldo?: number | null
  total_salarios?: number | null
  escudo_url?: string | null
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

type LocalUser = {
  nome_time?: string
  nome?: string
  usuario?: string
  email?: string
}

const formatarValor = (valor?: number | null) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(valor ?? 0))

const formatarDataCurta = (data?: string | null) => {
  if (!data) return '—'
  try {
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

async function checarAdminPorEmail(email: string) {
  const e = (email || '').trim()
  if (!e) return false

  const { data, error } = await supabase.rpc('is_admin', { p_email: e })
  if (!error) return Boolean(data)

  const fb = await supabase.from('admins').select('email').eq('email', e).maybeSingle()
  if (fb.error) return false
  return !!fb.data
}

function ShellCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[28px] border border-white/10 bg-white/[0.06] shadow-xl backdrop-blur-md ${className}`}
    >
      {children}
    </div>
  )
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-white">
          {icon}
          <h2 className="text-base md:text-lg font-extrabold">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 text-xs text-white/60">{subtitle}</p> : null}
      </div>
    </div>
  )
}

function ActionShortcut({
  label,
  icon,
  onClick,
  accent = 'green',
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  accent?: 'green' | 'yellow' | 'blue' | 'purple'
}) {
  const accentMap = {
    green: 'from-emerald-500/20 to-green-500/5 border-emerald-400/20 hover:border-emerald-300/40',
    yellow: 'from-yellow-500/20 to-amber-500/5 border-yellow-400/20 hover:border-yellow-300/40',
    blue: 'from-sky-500/20 to-blue-500/5 border-sky-400/20 hover:border-sky-300/40',
    purple: 'from-fuchsia-500/20 to-purple-500/5 border-fuchsia-400/20 hover:border-fuchsia-300/40',
  }[accent]

  return (
    <button
      onClick={onClick}
      className={`group rounded-2xl border bg-gradient-to-br px-4 py-4 text-left transition hover:scale-[1.01] ${accentMap}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/30 text-white ring-1 ring-white/10">
          {icon}
        </div>
        <div>
          <div className="text-sm font-black text-white">{label}</div>
          <div className="text-xs text-white/60">Abrir agora</div>
        </div>
      </div>
    </button>
  )
}

function HeroManager({
  nomeTime,
  logado,
  saldoAtual,
  posicao,
  onGoJogos,
  onGoClassificacao,
  onGoMercado,
  onGoElenco,
  onGoBID,
  paused,
  onTogglePaused,
}: {
  nomeTime: string
  logado: boolean
  saldoAtual: number
  posicao: string
  onGoJogos: () => void
  onGoClassificacao: () => void
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
      transition={{ duration: 0.45 }}
      className="relative overflow-hidden rounded-[34px] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-md"
    >
      <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.23),transparent_55%)]" />
      <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.14),transparent_55%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="absolute -top-24 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute -bottom-24 left-0 h-72 w-72 rounded-full bg-lime-500/10 blur-3xl" />

      <div className="relative p-5 md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-white/75">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(34,197,94,0.85)]" />
              ARENA FC MANAGER • CENTRAL DO CLUBE
            </div>

            <h1 className="mt-4 text-[26px] md:text-[38px] font-black leading-tight tracking-tight">
              Seu clube no{' '}
              <span className="bg-gradient-to-r from-green-300 via-emerald-200 to-lime-200 bg-clip-text text-transparent">
                controle
              </span>
              .
            </h1>

            <p className="mt-3 max-w-2xl text-sm md:text-base text-white/70">
              Jogos, classificação, mercado, finanças e BID em tempo real. Uma central pensada
              para gerir a sua temporada como um verdadeiro manager.
            </p>

            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionShortcut label="Jogos" icon={<FaFutbol />} onClick={onGoJogos} accent="green" />
              <ActionShortcut label="Classificação" icon={<FaTrophy />} onClick={onGoClassificacao} accent="yellow" />
              <ActionShortcut label="Mercado" icon={<FaMoneyBillWave />} onClick={onGoMercado} accent="blue" />
              <ActionShortcut label="Elenco" icon={<FaUsers />} onClick={onGoElenco} accent="purple" />
            </div>
          </div>

          <div className="w-full lg:w-[360px] shrink-0">
            <div className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black text-white/65">STATUS DO CLUBE</div>
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

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/60">Clube em gestão</div>
                <div className="mt-1 text-xl font-black text-white truncate">
                  {logado ? nomeTime : 'Faça login para continuar'}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[11px] text-white/60">Posição</div>
                    <div className="mt-1 text-base font-black text-white">{posicao || '—'}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[11px] text-white/60">Saldo</div>
                    <div className="mt-1 text-base font-black text-white truncate">
                      {formatarValor(saldoAtual)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={onGoBID}
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
                >
                  📰 Abrir BID
                </button>

                <button
                  onClick={onTogglePaused}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/15 flex items-center justify-center gap-2"
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

export default function HomePage() {
  const router = useRouter()

  const [nomeTime, setNomeTime] = useState('')
  const [logado, setLogado] = useState(false)

  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [saldoAtual, setSaldoAtual] = useState<number>(0)
  const [totalSalariosMeuTime, setTotalSalariosMeuTime] = useState<number>(0)
  const [jogadoresCount, setJogadoresCount] = useState<number>(0)
  const [posicao, setPosicao] = useState<string>('—')

  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [indexAtual, setIndexAtual] = useState(0)
  const [paused, setPaused] = useState(false)

  const [times, setTimes] = useState<TimeRow[]>([])
  const [ultimosJogos, setUltimosJogos] = useState<JogoRow[]>([])
  const [indexJogo, setIndexJogo] = useState(0)

  useEffect(() => {
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')

    if (!userStr) {
      setNomeTime('')
      setLogado(false)
      setIsAdmin(false)
      setCheckingAdmin(false)
      return
    }

    try {
      const userData = JSON.parse(userStr) as LocalUser
      setNomeTime(userData.nome_time || userData.nome || '')
      setLogado(true)

      const email = (userData.email || userData.usuario || '').trim()

      ;(async () => {
        setCheckingAdmin(true)
        const ok = await checarAdminPorEmail(email)
        setIsAdmin(ok)
        setCheckingAdmin(false)
      })()
    } catch {
      setNomeTime('')
      setLogado(false)
      setIsAdmin(false)
      setCheckingAdmin(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setErro(null)

        const timesRes = await supabase
          .from('times')
          .select('id, nome, saldo, total_salarios, escudo_url, divisao, divisao_nome, divisao_id, divisao_numero')

        if (timesRes.error) throw new Error('Falha ao carregar times')

        const timesData = (timesRes.data || []) as TimeRow[]
        setTimes(timesData)

        const meu = timesData.find((t) => (t.nome || '').toLowerCase() === (nomeTime || '').toLowerCase())
        setSaldoAtual(Number(meu?.saldo ?? 0))
        setTotalSalariosMeuTime(Number(meu?.total_salarios ?? 0))

        const bidRes = await supabase
          .from('bid')
          .select(
            'id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_id, jogador_nome, jogador_imagem_url'
          )
          .order('data_evento', { ascending: false })
          .limit(10)

        if (bidRes.error) throw new Error('Falha ao carregar BID')
        setEventosBID((bidRes.data || []) as BidEvent[])

        const jogosRes = await supabase
          .from('jogos')
          .select(
            'id, created_at, mandante_nome, visitante_nome, mandante_escudo_url, visitante_escudo_url, gols_mandante, gols_visitante'
          )
          .order('created_at', { ascending: false })
          .limit(10)

        if (!jogosRes.error) setUltimosJogos((jogosRes.data || []) as JogoRow[])

        const jogadoresRes = await supabase.from('jogadores').select('id', { count: 'exact', head: true })
        if (!jogadoresRes.error) setJogadoresCount(Number(jogadoresRes.count ?? 0))

        const posRes = await supabase.from('classificacao').select('posicao').eq('time_nome', nomeTime).maybeSingle()
        if (!posRes.error && posRes.data?.posicao) setPosicao(String(posRes.data.posicao))
      } catch (e: any) {
        setErro(e?.message || 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    })()
  }, [nomeTime])

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

  useEffect(() => setIndexAtual(0), [eventosBID.length])
  useEffect(() => {
    if (paused || !eventosBID.length) return
    const id = setInterval(() => setIndexAtual((p) => (p + 1) % eventosBID.length), 3500)
    return () => clearInterval(id)
  }, [paused, eventosBID.length])

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

  const timesPorDivisao = useMemo(() => {
    const getDiv = (t: any) => t.divisao_nome ?? t.divisao ?? t.divisao_id ?? t.divisao_numero ?? 'Divisão 1'

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

  const destaqueTemporada = useMemo(() => {
    const liderSaldo = top.saldoDesc[0]
    const menorFolha = top.salAsc[0]
    return {
      liderSaldo,
      menorFolha,
      totalClubes: safeTimes.length,
    }
  }, [top, safeTimes])

  function StatCard({
    title,
    value,
    Icon,
    tone,
    helper,
  }: {
    title: string
    value: string
    Icon: any
    tone: 'green' | 'blue' | 'yellow' | 'purple'
    helper?: string
  }) {
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
            {helper ? <div className="mt-1 text-[11px] text-white/60">{helper}</div> : null}
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
            <Icon className="text-white/85" />
          </div>
        </div>
      </motion.div>
    )
  }

  function RankingCard({
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
  }) {
    return (
      <ShellCard className="p-4">
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
                  className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ${
                    isMeu
                      ? 'bg-yellow-500/10 border border-yellow-400/20'
                      : 'bg-black/20 border border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-white/70 w-5">{index + 1}.</span>
                    {time.escudo_url ? (
                      <img src={time.escudo_url} alt="" className="w-7 h-7 object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-white/10" />
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
      </ShellCard>
    )
  }

  function TransferCard({ ev }: { ev: BidEvent }) {
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

        <div className="mt-3 text-xs text-white/60 text-center">
          {formatarDataCurta(ev.data_evento)}
        </div>
      </motion.div>
    )
  }

  return (
    <main
      className="relative min-h-screen text-white bg-cover bg-center"
      style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}
    >
      <div className="absolute inset-0 bg-black/82" />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-4 sm:py-6">
        {erro && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            ❌ {erro}
          </div>
        )}

        <HeroManager
          nomeTime={nomeTime}
          logado={logado}
          saldoAtual={saldoAtual}
          posicao={posicao}
          paused={paused}
          onTogglePaused={() => setPaused((p) => !p)}
          onGoJogos={() => router.push('/jogos')}
          onGoClassificacao={() => router.push('/classificacao')}
          onGoMercado={() => router.push('/mercado')}
          onGoElenco={() => router.push('/elenco')}
          onGoBID={() => router.push('/BID')}
        />

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            title="Saldo Atual"
            value={formatarValor(saldoAtual)}
            Icon={FaMoneyBillWave}
            tone="green"
            helper="Caixa disponível do clube"
          />
          <StatCard
            title="Jogadores"
            value={String(jogadoresCount)}
            Icon={FaUsers}
            tone="blue"
            helper="Elenco total registrado"
          />
          <StatCard
            title="Posição"
            value={posicao || '—'}
            Icon={FaMapMarkerAlt}
            tone="yellow"
            helper="Situação na temporada"
          />
          <StatCard
            title="Folha salarial"
            value={formatarValor(totalSalariosMeuTime)}
            Icon={FaChartLine}
            tone="purple"
            helper="Custo atual do elenco"
          />
        </div>

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr] gap-4">
          <ShellCard className="p-4 md:p-5">
            <SectionTitle
              icon={<FaBolt className="text-yellow-300" />}
              title="Centro da temporada"
              subtitle="Resumo rápido do que mais importa na sua gestão"
            />

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs text-white/60 uppercase tracking-[0.18em]">Maior caixa</div>
                <div className="mt-3 flex items-center gap-3">
                  {destaqueTemporada.liderSaldo?.escudo_url ? (
                    <img src={destaqueTemporada.liderSaldo.escudo_url} alt="" className="w-11 h-11 object-contain" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-white/10" />
                  )}
                  <div>
                    <div className="font-extrabold text-white">{destaqueTemporada.liderSaldo?.nome || '—'}</div>
                    <div className="text-sm text-emerald-300 font-black">
                      {formatarValor(destaqueTemporada.liderSaldo?.saldo)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs text-white/60 uppercase tracking-[0.18em]">Menor folha</div>
                <div className="mt-3 flex items-center gap-3">
                  {destaqueTemporada.menorFolha?.escudo_url ? (
                    <img src={destaqueTemporada.menorFolha.escudo_url} alt="" className="w-11 h-11 object-contain" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-white/10" />
                  )}
                  <div>
                    <div className="font-extrabold text-white">{destaqueTemporada.menorFolha?.nome || '—'}</div>
                    <div className="text-sm text-sky-300 font-black">
                      {formatarValor(destaqueTemporada.menorFolha?.total_salarios)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <div className="text-xs text-white/60 uppercase tracking-[0.18em]">Clubes ativos</div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400/20">
                    <FaShieldAlt className="text-emerald-300" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-white">{destaqueTemporada.totalClubes}</div>
                    <div className="text-sm text-white/60">Na plataforma</div>
                  </div>
                </div>
              </div>
            </div>
          </ShellCard>

          <ShellCard className="p-4 md:p-5">
            <SectionTitle
              icon={<FaClipboardList className="text-emerald-300" />}
              title="Atalhos rápidos"
              subtitle="Acesse as áreas principais em um toque"
            />

            <div className="mt-4 grid grid-cols-2 gap-3">
              <ActionShortcut label="Jogos" icon={<FaFutbol />} onClick={() => router.push('/jogos')} accent="green" />
              <ActionShortcut label="Classificação" icon={<FaTrophy />} onClick={() => router.push('/classificacao')} accent="yellow" />
              <ActionShortcut label="Mercado" icon={<FaCoins />} onClick={() => router.push('/mercado')} accent="blue" />
              <ActionShortcut label="Elenco" icon={<FaUsers />} onClick={() => router.push('/elenco')} accent="purple" />
            </div>
          </ShellCard>
        </div>

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1.25fr_0.95fr] gap-4">
          <ShellCard
            className="p-4"
          >
            <div
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
            >
              <div className="flex items-center justify-between gap-3">
                <SectionTitle
                  icon={<FaRegNewspaper className="text-green-300" />}
                  title="Central BID"
                  subtitle="Transferências, trocas e movimentações em tempo real"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIndexAtual((p) => (p - 1 + eventosBID.length) % eventosBID.length)}
                    disabled={!eventosBID.length}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setIndexAtual((p) => (p + 1) % eventosBID.length)}
                    disabled={!eventosBID.length}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-24 bg-white/5 rounded-3xl animate-pulse" />
                    <div className="h-10 bg-white/5 rounded-2xl animate-pulse" />
                  </div>
                ) : eventosBID.length ? (
                  <>
                    <TransferCard ev={eventoAtual} />
                    <div className="mt-3 text-sm text-yellow-200/90 italic line-clamp-2 text-center">
                      {eventoAtual?.descricao}
                    </div>

                    <div className="mt-3 flex gap-1.5 justify-center">
                      {eventosBID.map((_, i) => (
                        <span
                          key={i}
                          className={`h-2 w-2 rounded-full ${i === indexAtual ? 'bg-green-400' : 'bg-white/20'}`}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-white/60 mt-2">Nenhum evento encontrado.</div>
                )}
              </div>
            </div>
          </ShellCard>

          <ShellCard className="p-4">
            <SectionTitle
              icon={<FaFutbol className="text-sky-300" />}
              title="Último jogo em destaque"
              subtitle="Feed rotativo das partidas mais recentes"
            />

            <div className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-5">
              {ultimosJogos.length ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      {jogoAtual?.mandante_escudo_url ? (
                        <img src={jogoAtual.mandante_escudo_url} alt="" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-white/10" />
                      )}
                      <div className="font-black truncate text-white">{jogoAtual?.mandante_nome || '—'}</div>
                    </div>

                    <div className="text-3xl font-black text-white whitespace-nowrap">
                      {(jogoAtual?.gols_mandante ?? 0).toString()} x {(jogoAtual?.gols_visitante ?? 0).toString()}
                    </div>

                    <div className="flex items-center gap-2 min-w-0 justify-end">
                      <div className="font-black truncate text-right text-white">{jogoAtual?.visitante_nome || '—'}</div>
                      {jogoAtual?.visitante_escudo_url ? (
                        <img src={jogoAtual.visitante_escudo_url} alt="" className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-white/10" />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-1.5 justify-center">
                    {ultimosJogos.slice(0, 10).map((_, i) => (
                      <span key={i} className={`h-2 w-2 rounded-full ${i === indexJogo ? 'bg-blue-400' : 'bg-white/20'}`} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-white/60">Sem jogos suficientes.</div>
              )}
            </div>
          </ShellCard>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <RankingCard titulo="Top 3 Mais Saldo" lista={top.saldoDesc} cor="text-green-300" Icone={FaMoneyBillWave} />
          <RankingCard titulo="Top 3 Menos Saldo" lista={top.saldoAsc} cor="text-red-300" Icone={FaArrowDown} />
          <RankingCard titulo="Top 3 Maiores Salários" lista={top.salDesc} cor="text-yellow-200" Icone={FaChartLine} usaSalario />
          <RankingCard titulo="Top 3 Menores Salários" lista={top.salAsc} cor="text-blue-300" Icone={FaArrowUp} usaSalario />
        </div>

        <ShellCard className="mt-5 p-4 md:p-5">
          <SectionTitle
            icon={<FaUniversity className="text-emerald-300" />}
            title="Clubes por divisão"
            subtitle="Visual institucional da liga com logos organizados"
          />

          <div className="mt-5 space-y-6">
            {timesPorDivisao.ordem.map((div) => {
              const lista = (timesPorDivisao.grupos[div] || []).slice().sort((a, b) => a.nome.localeCompare(b.nome))
              const titulo = String(div).toLowerCase().includes('div') ? div : `Divisão ${div}`

              return (
                <div key={div}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-extrabold text-white/90">{titulo}</div>
                    <div className="text-xs text-white/60">{lista.length} times</div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                    {lista.map((t) => (
                      <div
                        key={t.id}
                        className="group relative flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:bg-white/5"
                        title={t.nome}
                      >
                        <div className="absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-100 [background:radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_60%)]" />

                        {t.escudo_url ? (
                          <img
                            src={t.escudo_url}
                            alt={t.nome}
                            className="relative h-12 w-12 md:h-14 md:w-14 object-contain drop-shadow"
                          />
                        ) : (
                          <div className="relative h-12 w-12 rounded-xl bg-white/10" />
                        )}

                        <div className="mt-2 text-[11px] font-semibold text-white/80 text-center line-clamp-2">
                          {t.nome}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </ShellCard>

        {logado && !checkingAdmin && isAdmin && (
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