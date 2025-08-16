'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

type TimeRow = { id: string; nome: string; saldo?: number | null; escudo_url?: string | null }
type BidEvent = {
  id: string
  descricao: string
  data_evento: string
  tipo_evento?: string | null
  id_time1?: string | null // vendedor
  id_time2?: string | null // comprador
  valor?: number | null
  jogador_nome?: string | null
  jogador_imagem_url?: string | null
}

export default function Home() {
  const router = useRouter()

  // Resumo do meu time
  const [nomeTime, setNomeTime] = useState('')
  const [saldo, setSaldo] = useState<number | null>(null)
  const [numJogadores, setNumJogadores] = useState<number | null>(null)
  const [posicao, setPosicao] = useState<number | null>(null)
  const [totalSalarios, setTotalSalarios] = useState<number>(0)

  // Listas
  const [times, setTimes] = useState<TimeRow[]>([])
  const [salariosTimes, setSalariosTimes] = useState<{ id_time: string; nome: string; total: number }[]>([])
  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [jogosFiltrados, setJogosFiltrados] = useState<any[]>([])

  // Carrosséis
  const [indexBID, setIndexBID] = useState(0)
  const [pausedBID, setPausedBID] = useState(false)
  const [indexJogo, setIndexJogo] = useState(0)
  const [pausedJogo, setPausedJogo] = useState(false)

  // Helpers
  const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  const norm = (s: string) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  const toBRL = (v: number | null | undefined) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

  const timesById = useMemo(() => Object.fromEntries(times.map(t => [t.id, t])), [times])
  const timesByName = useMemo(() => Object.fromEntries(times.map(t => [norm(t.nome), t])), [times])

  const nomeDoTime = (ref: string | null | undefined) => {
    if (!ref) return '—'
    if (isUUID(ref)) return timesById[ref]?.nome || '—'
    return timesByName[norm(ref)]?.nome || ref // mostra o que vier, se já for nome
  }
  const escudoDoTime = (ref: string | null | undefined) => {
    if (!ref) return '/escudo_padrao.png'
    const t = isUUID(ref) ? timesById[ref] : timesByName[norm(ref)]
    return t?.escudo_url || '/escudo_padrao.png'
  }

  const getTop = (arr: any[], campo: string, ordem: 'asc' | 'desc') =>
    [...arr].sort((a, b) => (ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo])).slice(0, 3)

  // Boot
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }
    const user = JSON.parse(userStr)
    setNomeTime(user.nome_time || '')
    if (user.id_time) {
      carregarResumo(user.id_time)
      carregarTotalSalarios(user.id_time)
    }
  }, [])

  async function carregarResumo(idTime: string) {
    const t = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (!t.error && t.data) setSaldo(t.data.saldo)

    const e = await supabase.from('elenco').select('*', { count: 'exact', head: true }).eq('id_time', idTime)
    setNumJogadores(e.count ?? 0)

    const c = await supabase.from('classificacao').select('posicao').eq('id_time', idTime).single()
    if (!c.error && c.data) setPosicao(c.data.posicao)
  }

  async function carregarTotalSalarios(idTime: string) {
    const { data } = await supabase.from('elenco').select('salario').eq('id_time', idTime)
    if (data) setTotalSalarios(data.reduce((acc, j) => acc + (j.salario || 0), 0))
  }

  // Dados gerais
  useEffect(() => {
    const run = async () => {
      // Times (para nomes/escudos)
      const timesRes = await supabase.from('times').select('id, nome, saldo, escudo_url')
      if (!timesRes.error) setTimes(timesRes.data || [])

      // BID (pega tudo que for útil, mas funciona só com descricao também)
      const bidRes = await supabase
        .from('bid')
        .select('id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_nome, jogador_imagem_url')
        .order('data_evento', { ascending: false })
        .limit(10)
      if (!bidRes.error) setEventosBID(bidRes.data || [])

      // Última rodada
      const rodada = await supabase
        .from('rodadas')
        .select('jogos')
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle()
      const jogos = (rodada.data?.jogos || []).filter((j: any) => j.gols_mandante != null && j.gols_visitante != null)
      setJogosFiltrados(jogos)

      // Salários agregados
      const elencoRes = await supabase.from('elenco').select('id_time, salario')
      if (!elencoRes.error && !timesRes.error) {
        const map: Record<string, number> = {}
        for (const j of (elencoRes.data || [])) {
          map[j.id_time] = (map[j.id_time] || 0) + (j.salario || 0)
        }
        const lista = Object.entries(map).map(([id_time, total]) => {
          const tm = (timesRes.data || []).find((t) => t.id === id_time)
          return { id_time, nome: tm?.nome || id_time, total }
        })
        setSalariosTimes(lista)
      }
    }
    run()
  }, [])

  // Auto-play
  useEffect(() => {
    if (!eventosBID.length || pausedBID) return
    const id = setInterval(() => setIndexBID((i) => (i + 1) % eventosBID.length), 3000)
    return () => clearInterval(id)
  }, [eventosBID, pausedBID])

  useEffect(() => {
    if (!jogosFiltrados.length || pausedJogo) return
    const id = setInterval(() => setIndexJogo((i) => (i + 1) % jogosFiltrados.length), 3000)
    return () => clearInterval(id)
  }, [jogosFiltrados, pausedJogo])

  const logout = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-[url('/campo-futebol-dark.jpg')] bg-cover bg-center">
      <div className="min-h-screen bg-black/80 text-white px-6 py-8">
        <div className="max-w-6xl mx-auto">

          {/* Cabeçalho */}
          <div className="text-center mb-6">
            <h1 className="text-4xl font-extrabold text-green-400">🏟️ Bem-vindo à LigaFut</h1>
            {nomeTime && (
              <p className="mt-1 text-gray-300">
                🔰 Gerenciando: <span className="font-semibold text-white">{nomeTime}</span>
              </p>
            )}
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Saldo Atual', value: saldo === null ? 'Carregando...' : toBRL(saldo) },
              { label: 'Jogadores', value: numJogadores ?? 'Carregando...' },
              { label: 'Posição', value: posicao ?? 'Carregando...' },
              { label: 'Total Salários', value: toBRL(totalSalarios) },
            ].map((c, idx) => (
              <div key={idx} className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 text-center shadow-lg">
                <div className="text-sm text-gray-400">{c.label}</div>
                <div className="mt-1 text-xl font-bold">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mb-6">
            <button onClick={logout} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold">
              🚪 Sair
            </button>
          </div>

          {/* BID */}
          <div
            className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 mb-6 shadow-xl"
            onMouseEnter={() => setPausedBID(true)}
            onMouseLeave={() => setPausedBID(false)}
          >
            <h2 className="text-2xl font-bold text-yellow-400 mb-3">📰 Últimos Eventos do BID</h2>

            {eventosBID.length > 0 ? (
              <div className="relative h-40">
                {eventosBID.map((ev, i) => {
                  const ativo = i === indexBID
                  const sellerRef = ev.id_time1 || null
                  const buyerRef  = ev.id_time2 || null

                  return (
                    <div
                      key={ev.id}
                      className={`absolute inset-0 transition-all duration-500 ${ativo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                    >
                      <div className="h-full w-full rounded-xl overflow-hidden bg-gradient-to-r from-emerald-900/50 via-zinc-900/60 to-indigo-900/40 border border-white/10">
                        <div className="grid grid-cols-12 h-full">

                          {/* Vendedor */}
                          <div className="col-span-3 flex items-center justify-center gap-3 p-3">
                            <img
                              src={escudoDoTime(sellerRef)}
                              className="w-12 h-12 object-contain drop-shadow"
                              alt={nomeDoTime(sellerRef)}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                            />
                            <div className="text-left">
                              <div className="text-[11px] text-gray-300">Vendedor</div>
                              <div className="text-sm font-semibold">{nomeDoTime(sellerRef)}</div>
                            </div>
                          </div>

                          {/* Arte central */}
                          <div className="col-span-6 flex flex-col items-center justify-center px-3">
                            <div className="text-[11px] uppercase tracking-wider text-gray-300">
                              {ev.tipo_evento || 'transferência'}
                            </div>

                            <div className="mt-1 flex items-center gap-4">
                              <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/20">
                                <img
                                  src={ev.jogador_imagem_url || '/jogador_padrao.png'}
                                  alt={ev.jogador_nome || 'Jogador'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/jogador_padrao.png' }}
                                />
                              </div>
                              <div className="text-center">
                                <div className="text-sm font-bold">{ev.jogador_nome || 'Jogador'}</div>
                                <div className="text-xs text-emerald-300 font-semibold">
                                  {ev.valor && ev.valor > 0 ? `Valor: ${toBRL(ev.valor)}` : 'Troca sem valor'}
                                </div>
                              </div>
                            </div>

                            {/* Descrição sempre visível */}
                            <p className="mt-2 text-center text-[13px] text-yellow-200/90 px-2 italic">
                              {ev.descricao}
                            </p>
                          </div>

                          {/* Comprador */}
                          <div className="col-span-3 flex items-center justify-center gap-3 p-3">
                            <div className="text-right">
                              <div className="text-[11px] text-gray-300">Comprador</div>
                              <div className="text-sm font-semibold">{nomeDoTime(buyerRef)}</div>
                            </div>
                            <img
                              src={escudoDoTime(buyerRef)}
                              className="w-12 h-12 object-contain drop-shadow"
                              alt={nomeDoTime(buyerRef)}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                            />
                          </div>

                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-400">Nenhum evento encontrado.</p>
            )}

            {/* Dots */}
            <div className="mt-3 flex items-center justify-center gap-2">
              {eventosBID.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIndexBID(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === indexBID ? 'bg-yellow-400' : 'bg-white/20'}`}
                  aria-label={`Ir para evento ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Jogos */}
          <div
            className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 mb-6"
            onMouseEnter={() => setPausedJogo(true)}
            onMouseLeave={() => setPausedJogo(false)}
          >
            <h2 className="text-2xl font-bold text-blue-400 mb-2">📅 Últimos Jogos</h2>
            {jogosFiltrados.length > 0 ? (
              <div className="relative h-16">
                {jogosFiltrados.map((j, i) => {
                  const ativo = i === indexJogo
                  const mand = j.mandante // pode ser id OU nome
                  const vist = j.visitante
                  return (
                    <div
                      key={`${mand}-${vist}-${i}`}
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${ativo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                    >
                      <p className="text-white text-lg">
                        {nomeDoTime(mand)} {j.gols_mandante} ⚽ {j.gols_visitante} {nomeDoTime(vist)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-400">Nenhum jogo encontrado.</p>
            )}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xl font-bold text-red-400 mb-3">💰 Top 3 Menores Saldo</h3>
              {getTop(times, 'saldo', 'asc').map((t: any, idx: number) => (
                <div key={t.id} className="flex items-center gap-3 mb-1">
                  <img
                    src={t.escudo_url || '/escudo_padrao.png'}
                    className="w-6 h-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                  />
                  <p>
                    {idx + 1}. {t.nome} — <span className="text-red-300">{toBRL(t.saldo)}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xl font-bold text-blue-400 mb-3">📝 Top 3 Menores Salários</h3>
              {getTop(salariosTimes, 'total', 'asc').map((t, idx) => (
                <div key={t.id_time} className="flex items-center gap-3 mb-1">
                  <img
                    src={escudoDoTime(t.id_time)}
                    className="w-6 h-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                  />
                  <p>
                    {idx + 1}. {t.nome} — <span className="text-blue-300">{toBRL(t.total)}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}
