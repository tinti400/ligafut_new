'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import {
  FaMoneyBillWave, FaChartLine, FaArrowDown, FaArrowUp, FaPlus, FaExchangeAlt, FaPercent
} from 'react-icons/fa'
import { motion } from 'framer-motion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type BidEvent = {
  id: string
  descricao: string
  data_evento: string
  tipo_evento?: string | null // 'transferencia' | 'troca' | ...
  id_time1?: string | null // vendedor
  id_time2?: string | null // comprador
  valor?: number | null
  // novos campos para “arte”
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

export default function HomePage() {
  const router = useRouter()
  const [nomeTime, setNomeTime] = useState('')
  const [logado, setLogado] = useState(false)
  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [indexAtual, setIndexAtual] = useState(0)
  const [times, setTimes] = useState<TimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [paused, setPaused] = useState(false)

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

  // Carrega BID + times
  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const [bidRes, timesRes] = await Promise.all([
          supabase.from('bid').select('id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_id, jogador_nome, jogador_imagem_url').order('data_evento', { ascending: false }).limit(10),
          supabase.from('times').select('id, nome, saldo, total_salarios, escudo_url')
        ])
        if (!bidRes.error) setEventosBID(bidRes.data || [])
        if (!timesRes.error) setTimes(timesRes.data || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // BID em tempo real (inserts)
  useEffect(() => {
    const ch = supabase
      .channel('bid-inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bid' }, (payload) => {
        setEventosBID((prev) => [payload.new as BidEvent, ...prev].slice(0, 10))
        setIndexAtual(0)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Carrossel seguro
  useEffect(() => { setIndexAtual(0) }, [eventosBID.length])
  useEffect(() => {
    if (paused || !eventosBID.length) return
    const id = setInterval(() => setIndexAtual((p) => (p + 1) % eventosBID.length), 3000)
    return () => clearInterval(id)
  }, [paused, eventosBID])

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const safeTimes = useMemo<Required<Pick<TimeRow, 'id' | 'nome'>> & { saldo: number, total_salarios: number, escudo_url?: string | null }[]>(
    () => times.map((t) => ({
      id: t.id,
      nome: t.nome,
      saldo: Number(t.saldo ?? 0),
      total_salarios: Number(t.total_salarios ?? 0),
      escudo_url: t.escudo_url ?? null
    })), [times]
  )

  const top = useMemo(() => ({
    saldoDesc: [...safeTimes].sort((a,b)=>b.saldo - a.saldo).slice(0,3),
    saldoAsc:  [...safeTimes].sort((a,b)=>a.saldo - b.saldo).slice(0,3),
    salDesc:   [...safeTimes].sort((a,b)=>b.total_salarios - a.total_salarios).slice(0,3),
    salAsc:    [...safeTimes].sort((a,b)=>a.total_salarios - b.total_salarios).slice(0,3),
  }), [safeTimes])

  const CardRanking = ({ titulo, lista, cor, Icone }:{
    titulo: string, lista: typeof top.saldoDesc, cor: string, Icone: any
  }) => (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
      className="bg-black/60 p-4 rounded shadow-md">
      <h3 className={`text-xl font-bold ${cor} mb-2 flex items-center gap-2`}><Icone /> {titulo}</h3>
      {lista.map((time, index) => (
        <div key={time.id} className={`flex items-center gap-2 ${time.nome === nomeTime ? 'text-yellow-400 font-semibold' : ''}`}>
          {time.escudo_url && <img src={time.escudo_url} alt={`Escudo do ${time.nome}`} className="w-5 h-5 rounded-sm object-contain" />}
          <p>{index + 1}. {time.nome} — {formatarValor((titulo.includes('Salário') ? time.total_salarios : time.saldo))}</p>
        </div>
      ))}
    </motion.div>
  )

  // ====== ARTES DE TRANSFERÊNCIA ======
  const timeById = useMemo(() => Object.fromEntries(times.map(t => [t.id, t])), [times])

  const TransferCard = ({ ev }: { ev: BidEvent }) => {
    const vendedor = ev.id_time1 ? timeById[ev.id_time1] : null
    const comprador = ev.id_time2 ? timeById[ev.id_time2] : null
    const tipo = (ev.tipo_evento || '').toLowerCase()
    const hasValor = (ev.valor ?? 0) > 0

    // Gradiente por tipo de evento
    const bg = tipo.includes('troca')
      ? 'from-indigo-700/40 via-purple-700/30 to-pink-600/30'
      : tipo.includes('percent') || tipo.includes('comprar_percentual')
      ? 'from-cyan-700/40 via-teal-700/30 to-emerald-600/30'
      : 'from-emerald-700/40 via-green-700/30 to-lime-600/30' // transferencia com dinheiro

    // Ícone por tipo
    const TipoIcon = tipo.includes('troca')
      ? FaExchangeAlt
      : tipo.includes('percent') || tipo.includes('comprar_percentual')
      ? FaPercent
      : FaMoneyBillWave

    return (
      <motion.div
        key={ev.id}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className={`relative flex items-center justify-between gap-3 rounded-2xl p-4 border border-white/10 shadow-lg bg-gradient-to-r ${bg}`}
      >
        {/* Vendedor */}
        <div className="flex items-center gap-2 w-1/4 min-w-[90px]">
          {vendedor?.escudo_url && (
            <img src={vendedor.escudo_url} alt={`Escudo do ${vendedor.nome}`} className="w-10 h-10 object-contain drop-shadow" />
          )}
          <div className="text-xs text-gray-200 leading-4">
            <div className="opacity-70">de</div>
            <div className="font-semibold">{vendedor?.nome || '—'}</div>
          </div>
        </div>

        {/* Jogador central */}
        <div className="flex flex-col items-center w-2/4">
          <div className="relative">
            <div className="absolute -inset-1 bg-white/10 blur-xl rounded-full" />
            <img
              src={ev.jogador_imagem_url || '/jogador_padrao.png'}
              onError={(e)=>{ (e.currentTarget as HTMLImageElement).src='/jogador_padrao.png' }}
              alt={ev.jogador_nome || 'Jogador'}
              className="relative w-16 h-16 rounded-full object-cover ring-2 ring-white/20"
            />
          </div>
          <div className="mt-1 text-sm font-semibold text-white text-center line-clamp-1">
            {ev.jogador_nome || 'Jogador'}
          </div>
          <div className="mt-1 px-2 py-0.5 text-[11px] rounded-full bg-black/30 text-white/90 flex items-center gap-1">
            <TipoIcon className="opacity-80" />
            <span className="capitalize">{tipo ? tipo.replace('_', ' ') : 'transferência'}</span>
            {hasValor && <span className="font-bold">• {formatarValor(ev.valor!)}</span>}
          </div>
        </div>

        {/* Comprador */}
        <div className="flex items-center gap-2 w-1/4 min-w-[90px] justify-end">
          <div className="text-xs text-gray-200 text-right leading-4">
            <div className="opacity-70">para</div>
            <div className="font-semibold">{comprador?.nome || '—'}</div>
          </div>
          {comprador?.escudo_url && (
            <img src={comprador.escudo_url} alt={`Escudo do ${comprador.nome}`} className="w-10 h-10 object-contain drop-shadow" />
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <main className="relative min-h-screen text-white bg-cover bg-center" style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}>
      <div className="absolute inset-0 bg-black bg-opacity-80 z-0" />
      <div className="relative z-10 flex flex-col items-center justify-start p-6">

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-4 text-center">
          <h1 className="text-4xl font-bold text-green-500 flex items-center justify-center gap-2">🏟️ LigaFut</h1>
          <p className="text-sm text-gray-300 italic">Simule campeonatos, gerencie seu time e conquiste títulos!</p>
        </motion.div>

        {logado ? (
          <p className="text-lg mb-6">✅ Logado como <span className="text-green-400">{nomeTime}</span></p>
        ) : (
          <div className="mb-6 text-center">
            <p className="text-lg">❌ Você não está logado</p>
            <button onClick={() => router.push('/login')} className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded mt-2">
              🔑 Ir para Login
            </button>
          </div>
        )}

        {/* ======= BID com artes ======= */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-black/60 rounded p-4 w-full max-w-2xl text-center mb-6">
          <h2 className="text-2xl font-semibold mb-3">📰 Últimos Eventos do BID</h2>

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
              <div className="h-20 bg-white/5 rounded-2xl animate-pulse" />
            </div>
          ) : eventosBID.length > 0 ? (
            <div aria-live="polite" className="flex flex-col items-stretch gap-3"
              onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
              {/* Card “arte” do evento atual */}
              <TransferCard ev={eventosBID[indexAtual]} />

              {/* carrossel controls */}
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={() => setIndexAtual((p) => (p - 1 + eventosBID.length) % eventosBID.length)}
                  className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                  title="Anterior"
                >‹</button>
                <div className="text-yellow-300 text-sm font-medium italic line-clamp-2 px-2">
                  {eventosBID[indexAtual]?.descricao}
                </div>
                <button
                  onClick={() => setIndexAtual((p) => (p + 1) % eventosBID.length)}
                  className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
                  title="Próximo"
                >›</button>
              </div>

              {/* indicadores */}
              <div className="flex gap-1 justify-center mt-2">
                {eventosBID.map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i === indexAtual ? 'bg-green-400' : 'bg-white/20'}`} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </motion.div>

        {/* ======= Rankings ======= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
          <CardRanking titulo="Top 3 Mais Saldo"       lista={top.saldoDesc} cor="text-green-400"  Icone={FaMoneyBillWave} />
          <CardRanking titulo="Top 3 Menos Saldo"      lista={top.saldoAsc}  cor="text-red-400"    Icone={FaArrowDown} />
          <CardRanking titulo="Top 3 Maiores Salários" lista={top.salDesc}   cor="text-yellow-300" Icone={FaChartLine} />
          <CardRanking titulo="Top 3 Menores Salários" lista={top.salAsc}    cor="text-blue-400"   Icone={FaArrowUp} />
        </div>

        {logado && (
          <button
            onClick={() => router.push('/admin')}
            className="fixed bottom-6 right-6 p-4 bg-green-600 rounded-full text-white shadow-lg hover:bg-green-700"
            title="Administração"
          >
            <FaPlus size={20} />
          </button>
        )}
      </div>
    </main>
  )
}
