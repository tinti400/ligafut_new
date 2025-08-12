'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Tipos ========= */
interface TimeRow {
  id: string
  nome: string
  logo_url: string | null
}
interface Jogo {
  id?: number
  rodada: 1 | 2
  ordem: number
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
}

/** ========= Utils ========= */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function nomeRel(reg: any): string {
  const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
  return t?.nome ?? 'Time'
}
function logoRel(reg: any): string | null {
  const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
  return t?.logo_url ?? null
}

/** ========= Componente ========= */
export default function PlayoffPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  // jogos exibidos
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [loading, setLoading] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})

  // sorteio ao vivo (sincronizado)
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [sorteioAtivo, setSorteioAtivo] = useState(false)
  const [contador, setContador] = useState(3)
  const [fila, setFila] = useState<TimeRow[]>([])
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [flipA, setFlipA] = useState(false)
  const [flipB, setFlipB] = useState(false)
  const [confirmavel, setConfirmavel] = useState(false)
  const [confirming, setConfirming] = useState(false) // trava anti duplo clique

  // realtime infra
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const tickerRef = useRef<NodeJS.Timeout | null>(null)

  // snapshot atual do estado (para evitar closures velhas no broadcast)
  const stateRef = useRef({
    sorteioAberto, sorteioAtivo, contador, fila, pares, parAtual, flipA, flipB, confirmavel
  })
  useEffect(() => {
    stateRef.current = { sorteioAberto, sorteioAtivo, contador, fila, pares, parAtual, flipA, flipB, confirmavel }
  }, [sorteioAberto, sorteioAtivo, contador, fila, pares, parAtual, flipA, flipB, confirmavel])

  useEffect(() => {
    carregarJogosELogos()

    // canal realtime
    const ch = supabase.channel('playoff-sorteio', { config: { broadcast: { self: true } } })

    // LISTENER COM MERGE DEFENSIVO
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}

      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('sorteioAtivo' in p) setSorteioAtivo(!!p.sorteioAtivo)
      if ('contador' in p) setContador(typeof p.contador === 'number' ? p.contador : 3)
      if ('fila' in p) setFila(p.fila || [])
      if ('pares' in p) setPares(p.pares || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A:null, B:null })
      if ('flipA' in p) setFlipA(!!p.flipA)
      if ('flipB' in p) setFlipB(!!p.flipB)
      if ('confirmavel' in p) setConfirmavel(!!p.confirmavel)
    })

    ch.subscribe()
    channelRef.current = ch

    return () => {
      ch.unsubscribe()
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [])

  // BROADCAST COM SNAPSHOT (força sorteioAberto: true durante o sorteio)
  function broadcast(partial: any) {
    const base = stateRef.current
    channelRef.current?.send({
      type: 'broadcast',
      event: 'state',
      payload: { ...base, ...partial, sorteioAberto: true }
    })
  }

  /** ====== Dados dos jogos ====== */
  async function carregarJogosELogos() {
    try {
      setLoading(true)
      const { data: jogosData, error } = await supabase
        .from('copa_playoff')
        .select('*')
        .order('rodada', { ascending: true })
        .order('ordem', { ascending: true })
      if (error) throw error

      const js = (jogosData || []) as Jogo[]
      setJogos(js)

      const ids = Array.from(new Set(js.flatMap(j => [j.id_time1, j.id_time2]).filter(Boolean)))
      if (ids.length) {
        const { data: timesData, error: tErr } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', ids)
        if (tErr) throw tErr
        const mapa: Record<string, TimeRow> = {}
        for (const t of (timesData || []) as TimeRow[]) mapa[t.id] = t
        setTimesMap(mapa)
      } else {
        setTimesMap({})
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar jogos ou logos')
    } finally {
      setLoading(false)
    }
  }

  /** ====== Apagar confrontos ====== */
  async function apagarConfrontos() {
    if (!isAdmin) return
    const temPlacar = jogos.some(j => j.gols_time1 != null || j.gols_time2 != null)
    const msg = (temPlacar ? '⚠️ Existem jogos com placar lançado.\n\n' : '') + 'Tem certeza que deseja APAGAR todos os confrontos?'
    if (!confirm(msg)) return

    const { error } = await supabase.from('copa_playoff').delete().neq('id', 0)
    if (error) {
      toast.error('Erro ao apagar confrontos')
      return
    }
    toast.success('Confrontos apagados!')
    await carregarJogosELogos()
  }

  /** ====== Iniciar sorteio ao vivo ====== */
  async function iniciarSorteio() {
    if (!isAdmin) return

    // trava: só sorteia se não houver jogos
    const { count, error: cErr } = await supabase
      .from('copa_playoff')
      .select('*', { count: 'exact', head: true })
    if (cErr) { toast.error('Erro ao checar confrontos'); return }
    if ((count ?? 0) > 0) {
      toast.error('Apague os confrontos antes de sortear.')
      return
    }

    const { data: classificacao, error } = await supabase
      .from('classificacao')
      .select('id_time, times ( nome, logo_url )')
      .eq('temporada', 1)
      .order('pontos', { ascending: false })
    if (error || !classificacao) {
      toast.error('Erro ao buscar classificação')
      return
    }

    const faixa = classificacao.slice(8, 24) // 9º..24º
    if (faixa.length !== 16) {
      toast.error('Precisamos de 16 times (9º ao 24º).')
      return
    }

    const lista: TimeRow[] = shuffle(
      faixa.map((r: any) => ({ id: r.id_time, nome: nomeRel(r), logo_url: logoRel(r) }))
    )

    // reset estado
    setSorteioAberto(true)
    setSorteioAtivo(true)
    setContador(3)
    setFila(lista)
    setPares([])
    setParAtual({ A:null, B:null })
    setFlipA(false); setFlipB(false)
    setConfirmavel(false)
    // broadcast snapshot inicial
    broadcast({
      sorteioAtivo: true, contador: 3, fila: lista, pares: [],
      parAtual: {A:null, B:null}, flipA: false, flipB: false, confirmavel: false
    })

    // inicia loop com HOLD de 3s para cada par
    startTicker(lista)
  }

  /** ====== Loop do sorteio com HOLD de 3s ====== */
  const HOLD_MS = 3000 // 3 segundos exibindo o par antes de seguir

  function startTicker(initialQueue: TimeRow[]) {
    if (tickerRef.current) clearInterval(tickerRef.current)

    let queue = [...initialQueue]
    let localPar: {A: TimeRow | null; B: TimeRow | null} = {A:null, B:null}
    let localPares: Array<[TimeRow, TimeRow]> = []

    const nextCountdown = () => {
      setContador(3); broadcast({ contador: 3 })
      let c = 3
      if (tickerRef.current) clearInterval(tickerRef.current)
      tickerRef.current = setInterval(() => {
        c -= 1
        setContador(c); broadcast({ contador: c })
        if (c <= 0) {
          clearInterval(tickerRef.current!)
          revealA()
        }
      }, 1000)
    }

    const revealA = () => {
      localPar = { A: queue.shift() || null, B: null }
      setParAtual(localPar); setFlipA(false); setFlipB(false)
      broadcast({ parAtual: localPar, flipA: false, flipB: false })
      // pequena latência para a animação
      setTimeout(() => { setFlipA(true); broadcast({ flipA: true }); revealB() }, 300)
    }

    const revealB = () => {
      localPar = { ...localPar, B: queue.shift() || null }
      setParAtual(localPar); broadcast({ parAtual: localPar })
      setTimeout(() => { setFlipB(true); broadcast({ flipB: true }); holdPair() }, 300)
    }

    const holdPair = () => {
      // mantém o par exibido por 3s
      setTimeout(() => { commitPair() }, HOLD_MS)
    }

    const commitPair = () => {
      if (localPar.A && localPar.B) {
        localPares = [...localPares, [localPar.A, localPar.B]]
        setPares(localPares); broadcast({ pares: localPares })
      }
      if (queue.length === 0) {
        setSorteioAtivo(false); setConfirmavel(true)
        broadcast({ sorteioAtivo: false, confirmavel: true })
        return
      }
      nextCountdown()
    }

    // estado inicial
    setSorteioAtivo(true); setConfirmavel(false)
    broadcast({ sorteioAtivo: true, confirmavel: false })

    nextCountdown()
  }

  /** ====== Confirmar confrontos ====== */
  async function confirmarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) { toast.error('Sorteio incompleto.'); return }

    try {
      setConfirming(true)
      const novos: Jogo[] = []
      let ordem = 1
      for (const [A, B] of pares) {
        novos.push({
          rodada: 1, ordem: ordem++,
          id_time1: A.id, id_time2: B.id, time1: A.nome, time2: B.nome,
          gols_time1: null, gols_time2: null
        })
        novos.push({
          rodada: 2, ordem: ordem++,
          id_time1: B.id, id_time2: A.id, time1: B.nome, time2: A.nome,
          gols_time1: null, gols_time2: null
        })
      }
      const { error: delErr } = await supabase.from('copa_playoff').delete().neq('id', 0)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('copa_playoff').insert(novos)
      if (insErr) throw insErr

      toast.success('Confrontos confirmados!')
      setSorteioAberto(false)
      // fecha para todo mundo
      channelRef.current?.send({
        type: 'broadcast',
        event: 'state',
        payload: { ...stateRef.current, sorteioAberto: false }
      })
      await carregarJogosELogos()
    } catch (e) {
      console.error(e)
      toast.error('Erro ao confirmar confrontos')
    } finally {
      setConfirming(false)
    }
  }

  /** ====== Salvar placar + pagar 14mi ====== */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    try {
      const { data: antes, error: bErr } = await supabase
        .from('copa_playoff')
        .select('gols_time1, gols_time2')
        .eq('id', jogo.id).single()
      if (bErr) throw bErr

      const antesDef = antes?.gols_time1 != null && antes?.gols_time2 != null

      const { error: uErr } = await supabase
        .from('copa_playoff')
        .update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 })
        .eq('id', jogo.id)
      if (uErr) throw uErr

      const agoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
      if (!antesDef && agoraDef && jogo.gols_time1 !== jogo.gols_time2) {
        const vencedorId = jogo.gols_time1! > jogo.gols_time2! ? jogo.id_time1 : jogo.id_time2
        const { error: rpcErr } = await supabase.rpc('incrementar_saldo', {
          p_id_time: vencedorId, p_valor: 14_000_000
        })
        if (rpcErr) toast.error('Erro ao pagar vitória (14M)')
        else toast.success('Vitória paga: R$ 14.000.000')
      }

      toast.success('Placar salvo!')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao salvar placar')
    }
  }

  /** Agrupar por rodada */
  const jogosPorRodada = useMemo(() => {
    const g = { 1: [] as Jogo[], 2: [] as Jogo[] }
    for (const j of jogos) (j.rodada === 1 ? g[1] : g[2]).push(j)
    return g
  }, [jogos])

  /** UI: escudo redondo */
  function Escudo({ url, alt, size=32 }: { url?: string|null; alt: string; size?: number }) {
    return (
      <div
        className="rounded-full overflow-hidden bg-gray-800 border border-gray-700 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-gray-300 px-1">{alt.slice(0,3).toUpperCase()}</span>
        )}
      </div>
    )
  }

  /** ====== Render ====== */
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">🎯 Playoff</h1>

          {!loadingAdmin && isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={apagarConfrontos}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition"
              >
                🗑️ Apagar confrontos
              </button>

              <button
                onClick={iniciarSorteio}
                disabled={jogos.length > 0}
                title={jogos.length > 0 ? 'Apague os confrontos antes de sortear' : ''}
                className={`px-4 py-2 rounded-lg transition ${
                  jogos.length > 0 ? 'bg-green-600/50 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                🎲 Sorteio ao vivo (9º–24º)
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <div className="text-gray-400 animate-pulse">Carregando…</div>
        ) : (
          <>
            {/* RODADA 1 */}
            {jogosPorRodada[1].length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold mb-3">Rodada 1 (ida)</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {jogosPorRodada[1].map((j) => (
                    <article key={j.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>Ordem #{j.ordem}</span><span>ID {j.id}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <Escudo url={timesMap[j.id_time1]?.logo_url} alt={timesMap[j.id_time1]?.nome || j.time1} />
                        <div className="flex-1">
                          <div className="font-medium">{timesMap[j.id_time1]?.nome || j.time1}</div>
                          <div className="text-xs text-gray-400">Mandante</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={j.gols_time1 ?? ''} disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(x => x.id === j.id ? { ...x, gols_time1: Number.isNaN(gols as any) ? null : gols } : x))
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={j.gols_time2 ?? ''} disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(x => x.id === j.id ? { ...x, gols_time2: Number.isNaN(gols as any) ? null : gols } : x))
                            }}
                          />
                        </div>

                        <div className="flex-1 text-right">
                          <div className="font-medium">{timesMap[j.id_time2]?.nome || j.time2}</div>
                          <div className="text-xs text-gray-400">Visitante</div>
                        </div>
                        <Escudo url={timesMap[j.id_time2]?.logo_url} alt={timesMap[j.id_time2]?.nome || j.time2} />
                      </div>

                      {isAdmin && (
                        <div className="mt-4 flex justify-end">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 transition text-sm"
                            onClick={() => salvarPlacar(j)}
                          >
                            Salvar placar
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* RODADA 2 */}
            {jogosPorRodada[2].length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold mb-3">Rodada 2 (volta)</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {jogosPorRodada[2].map((j) => (
                    <article key={j.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>Ordem #{j.ordem}</span><span>ID {j.id}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <Escudo url={timesMap[j.id_time1]?.logo_url} alt={timesMap[j.id_time1]?.nome || j.time1} />
                        <div className="flex-1">
                          <div className="font-medium">{timesMap[j.id_time1]?.nome || j.time1}</div>
                          <div className="text-xs text-gray-400">Mandante</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={j.gols_time1 ?? ''} disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(x => x.id === j.id ? { ...x, gols_time1: Number.isNaN(gols as any) ? null : gols } : x))
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={j.gols_time2 ?? ''} disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(x => x.id === j.id ? { ...x, gols_time2: Number.isNaN(gols as any) ? null : gols } : x))
                            }}
                          />
                        </div>

                        <div className="flex-1 text-right">
                          <div className="font-medium">{timesMap[j.id_time2]?.nome || j.time2}</div>
                          <div className="text-xs text-gray-400">Visitante</div>
                        </div>
                        <Escudo url={timesMap[j.id_time2]?.logo_url} alt={timesMap[j.id_time2]?.nome || j.time2} />
                      </div>

                      {isAdmin && (
                        <div className="mt-4 flex justify-end">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 transition text-sm"
                            onClick={() => salvarPlacar(j)}
                          >
                            Salvar placar
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ===== Overlay do Sorteio ao Vivo ===== */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gray-900 rounded-2xl border border-gray-700 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio ao vivo</h3>
              {isAdmin && (
                <button
                  className="text-sm px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700"
                  onClick={() => {
                    setSorteioAberto(false)
                    channelRef.current?.send({
                      type:'broadcast', event:'state',
                      payload:{ ...stateRef.current, sorteioAberto:false }
                    })
                  }}
                >
                  Fechar
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-5">
              <div className={`text-3xl font-bold tabular-nums ${sorteioAtivo ? 'text-green-400' : 'text-gray-400'}`}>
                {sorteioAtivo ? `Revelando em: ${contador}` : (confirmavel ? 'Sorteio finalizado' : 'Aguardando')}
              </div>

              {!loadingAdmin && isAdmin && !sorteioAtivo && !confirmavel && (
                <button
                  className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500"
                  onClick={iniciarSorteio}
                >
                  Reiniciar sorteio
                </button>
              )}

              <div className="text-sm text-gray-400">Restantes: {fila.length}</div>
            </div>

            {/* Cartas virando */}
            <div className="grid grid-cols-3 items-center gap-2 mb-6">
              <FlipCard flipped={flipA} time={parAtual.A} />
              <div className="text-center text-gray-400">x</div>
              <FlipCard flipped={flipB} time={parAtual.B} />
            </div>

            {/* Pares já formados */}
            <div className="space-y-2">
              {pares.map(([a,b], i) => (
                <div key={a.id + b.id + i} className="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Escudo url={a.logo_url} alt={a.nome} />
                      <span className="font-medium">{a.nome}</span>
                    </div>
                    <span className="text-gray-400">x</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.nome}</span>
                      <Escudo url={b.logo_url} alt={b.nome} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              {isAdmin && (
                <button
                  className={`px-4 py-2 rounded-lg ${
                    pares.length === 8 && !confirming
                      ? 'bg-green-600 hover:bg-green-500'
                      : 'bg-green-600/50 cursor-not-allowed'
                  }`}
                  disabled={pares.length !== 8 || confirming}
                  onClick={confirmarConfrontos}
                  title={pares.length !== 8 ? 'Aguarde formar os 8 confrontos' : ''}
                >
                  {confirming ? 'Gravando…' : '✅ Confirmar confrontos'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** ====== Carta com flip ====== */
function FlipCard({ flipped, time }: { flipped: boolean; time: TimeRow | null }) {
  return (
    <div className="relative w-full h-28 perspective">
      <style jsx>{`
        .perspective { perspective: 1000px; }
        .flip-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s;
          transform-style: preserve-3d;
        }
        .flipped { transform: rotateY(180deg); }
        .flip-face {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          border-radius: 0.75rem;
          border: 1px solid rgba(63,63,70,1);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(39,39,42,0.7);
        }
        .flip-back { transform: rotateY(180deg); }
      `}</style>

      <div className={`flip-inner ${flipped ? 'flipped' : ''}`}>
        <div className="flip-face">
          <span className="text-gray-400">?</span>
        </div>
        <div className="flip-face flip-back px-3">
          {time ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center">
                {time.logo_url
                  ? <img src={time.logo_url} alt={time.nome} className="w-full h-full object-cover" />
                  : <span className="text-xs text-gray-300">{time.nome.slice(0,3).toUpperCase()}</span>}
              </div>
              <div className="font-medium">{time.nome}</div>
            </div>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
