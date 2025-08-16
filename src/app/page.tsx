'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

type BidEvent = {
  id: string
  descricao: string
  data_evento: string
  tipo_evento?: string | null
  id_time1?: string | null // vendedor
  id_time2?: string | null // comprador
  valor?: number | null
  jogador_id?: string | null
  jogador_nome?: string | null
  jogador_imagem_url?: string | null
}

export default function Home() {
  const router = useRouter()

  const [nomeTime, setNomeTime] = useState('')
  const [saldo, setSaldo] = useState<number | null>(null)
  const [numJogadores, setNumJogadores] = useState<number | null>(null)
  const [posicao, setPosicao] = useState<number | null>(null)
  const [totalSalarios, setTotalSalarios] = useState<number>(0)

  const [eventosBID, setEventosBID] = useState<BidEvent[]>([])
  const [indexBID, setIndexBID] = useState(0)
  const [pausedBID, setPausedBID] = useState(false)

  const [jogosFiltrados, setJogosFiltrados] = useState<any[]>([])
  const [indexJogo, setIndexJogo] = useState(0)
  const [pausedJogo, setPausedJogo] = useState(false)

  const [times, setTimes] = useState<any[]>([])
  const [salariosTimes, setSalariosTimes] = useState<any[]>([])

  // Helpers
  const formatarValor = (valor: number | null | undefined) =>
    `R$ ${Number(valor || 0).toLocaleString('pt-BR')}`
  const buscarNomeTime = (id: string) => times.find((t: any) => t.id === id)?.nome || 'Desconhecido'
  const timeById = useMemo(() => Object.fromEntries(times.map((t: any) => [t.id, t])), [times])

  // Boot
  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/login')
      return
    }
    const userData = JSON.parse(userStr)
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
      const total = jogadores.reduce((acc, j) => acc + (j.salario || 0), 0)
      setTotalSalarios(total)
    }
  }

  // Dados gerais (BID, times, rodada, salários agregados)
  useEffect(() => {
    const buscarTudo = async () => {
      const { data: bidData } = await supabase
        .from('bid')
        .select('id, descricao, data_evento, tipo_evento, id_time1, id_time2, valor, jogador_id, jogador_nome, jogador_imagem_url')
        .order('data_evento', { ascending: false })
        .limit(10)
      if (bidData) setEventosBID(bidData as BidEvent[])

      const { data: timesData } = await supabase.from('times').select('id, nome, saldo, escudo_url')
      if (timesData) setTimes(timesData)

      const { data: rodadaData } = await supabase
        .from('rodadas')
        .select('jogos')
        .order('numero', { ascending: false })
        .limit(1)
        .single()

      if (rodadaData?.jogos) {
        const filtrados = rodadaData.jogos.filter(
          (j: any) => j.gols_mandante !== null && j.gols_visitante !== null
        )
        setJogosFiltrados(filtrados)
      }

      const { data: elencoData } = await supabase
        .from('elenco')
        .select('id_time, salario')

      if (elencoData && timesData) {
        const map: Record<string, number> = {}
        for (const j of elencoData) {
          map[j.id_time] = (map[j.id_time] || 0) + (j.salario || 0)
        }
        const lista = Object.entries(map).map(([id_time, total]) => {
          const tm = timesData.find((t) => t.id === id_time)
          return { id_time, nome: tm?.nome || 'Desconhecido', total }
        })
        setSalariosTimes(lista)
      }
    }
    buscarTudo()
  }, [])

  // Carrosséis auto-play com pausa no hover
  useEffect(() => {
    if (!eventosBID.length || pausedBID) return
    const id = setInterval(() => setIndexBID((p) => (p + 1) % eventosBID.length), 3000)
    return () => clearInterval(id)
  }, [eventosBID, pausedBID])

  useEffect(() => {
    if (!jogosFiltrados.length || pausedJogo) return
    const id = setInterval(() => setIndexJogo((p) => (p + 1) % jogosFiltrados.length), 3000)
    return () => clearInterval(id)
  }, [jogosFiltrados, pausedJogo])

  const handleLogout = () => {
    localStorage.clear()
    router.push('/login')
  }

  const getTop = (array: any[], campo: string, ordem: 'asc' | 'desc') =>
    [...array].sort((a, b) => (ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo])).slice(0, 3)

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

          {/* Resumo com cards animados */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 text-center shadow-lg">
              <div className="text-sm text-gray-400">Saldo Atual</div>
              <div className="mt-1 text-xl font-bold">{saldo !== null ? formatarValor(saldo) : 'Carregando...'}</div>
            </div>
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 text-center shadow-lg">
              <div className="text-sm text-gray-400">Jogadores</div>
              <div className="mt-1 text-xl font-bold">{numJogadores ?? 'Carregando...'}</div>
            </div>
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 text-center shadow-lg">
              <div className="text-sm text-gray-400">Posição</div>
              <div className="mt-1 text-xl font-bold">{posicao ?? 'Carregando...'}</div>
            </div>
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 text-center shadow-lg">
              <div className="text-sm text-gray-400">Total Salários</div>
              <div className="mt-1 text-xl font-bold">{formatarValor(totalSalarios)}</div>
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
            >
              🚪 Sair
            </button>
          </div>

          {/* BID com “arte” de transferência */}
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
                  const buyer = ev.id_time2 ? timeById[ev.id_time2] : null
                  const seller = ev.id_time1 ? timeById[ev.id_time1] : null

                  return (
                    <div
                      key={ev.id}
                      className={`absolute inset-0 transition-all duration-500 ${ativo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} `}
                    >
                      <div className="h-full w-full rounded-xl overflow-hidden bg-gradient-to-r from-emerald-900/50 via-zinc-900/60 to-indigo-900/40 border border-white/10">
                        <div className="grid grid-cols-12 h-full">
                          {/* Seller */}
                          <div className="col-span-3 flex items-center justify-center gap-3 p-3">
                            <img
                              src={seller?.escudo_url || '/escudo_padrao.png'}
                              className="w-12 h-12 object-contain drop-shadow"
                              alt={seller?.nome || 'Vendedor'}
                              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                            />
                            <div className="text-left">
                              <div className="text-[11px] text-gray-300">Vendedor</div>
                              <div className="text-sm font-semibold">{seller?.nome || '—'}</div>
                            </div>
                          </div>

                          {/* Arte central */}
                          <div className="col-span-6 relative flex flex-col items-center justify-center">
                            <div className="text-[11px] uppercase tracking-wider text-gray-300">
                              {ev.tipo_evento || 'transferencia'}
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
                                  {ev.valor && ev.valor > 0 ? `Valor: ${formatarValor(ev.valor)}` : 'Troca sem valor'}
                                </div>
                              </div>
                            </div>

                            <p className="mt-2 text-center text-[13px] text-yellow-200/90 px-4 italic">
                              {ev.descricao}
                            </p>
                          </div>

                          {/* Buyer */}
                          <div className="col-span-3 flex items-center justify-center gap-3 p-3">
                            <div className="text-right">
                              <div className="text-[11px] text-gray-300">Comprador</div>
                              <div className="text-sm font-semibold">{buyer?.nome || '—'}</div>
                            </div>
                            <img
                              src={buyer?.escudo_url || '/escudo_padrao.png'}
                              className="w-12 h-12 object-contain drop-shadow"
                              alt={buyer?.nome || 'Comprador'}
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
                {jogosFiltrados.map((j, i) => (
                  <div
                    key={`${j.mandante}-${j.visitante}-${i}`}
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${i === indexJogo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  >
                    <p className="text-white text-lg">
                      {buscarNomeTime(j.mandante)} {j.gols_mandante} ⚽ {j.gols_visitante} {buscarNomeTime(j.visitante)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">Nenhum jogo encontrado.</p>
            )}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xl font-bold text-red-400 mb-3">💰 Top 3 Menores Saldo</h3>
              {getTop(times, 'saldo', 'asc').map((t, idx) => (
                <div key={t.id} className="flex items-center gap-3 mb-1">
                  <img
                    src={t.escudo_url || '/escudo_padrao.png'}
                    className="w-6 h-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                  />
                  <p>
                    {idx + 1}. {t.nome} — <span className="text-red-300">{formatarValor(t.saldo)}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
              <h3 className="text-xl font-bold text-blue-400 mb-3">📝 Top 3 Menores Salários</h3>
              {getTop(salariosTimes, 'total', 'asc').map((t, idx) => (
                <div key={t.id_time} className="flex items-center gap-3 mb-1">
                  <img
                    src={(timeById[t.id_time]?.escudo_url) || '/escudo_padrao.png'}
                    className="w-6 h-6 object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/escudo_padrao.png' }}
                  />
                  <p>
                    {idx + 1}. {t.nome} — <span className="text-blue-300">{formatarValor(t.total)}</span>
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
