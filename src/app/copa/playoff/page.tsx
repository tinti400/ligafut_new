'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
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
interface ClassifRow {
  id_time: string
  times: { nome: string; logo_url: string | null } | { nome: string; logo_url: string | null }[] | null
}

/** ===== Util ===== */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function nomeDoTime(reg: any): string {
  const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
  return t?.nome ?? 'Time'
}
function logoDoTime(reg: any): string | null {
  const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
  return t?.logo_url ?? null
}

export default function PlayoffPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  // jogos normais
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [loading, setLoading] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})

  // sorteio ao vivo (UI + realtime)
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [sorteioAtivo, setSorteioAtivo] = useState(false)
  const [revelados, setRevelados] = useState<TimeRow[]>([])            // times revelados (em ordem)
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])    // pares formados
  const [contador, setContador] = useState<number>(0)                  // contador de 3..2..1 para próxima carta
  const [filaSorteio, setFilaSorteio] = useState<TimeRow[]>([])        // ordem embaralhada de 16 times
  const [confirmavel, setConfirmavel] = useState(false)                // quando todos os pares estão prontos
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    carregarJogosELogos()
    // ingressar no canal realtime para assistir o sorteio
    const ch = supabase.channel('playoff-sorteio', {
      config: { broadcast: { self: true } }
    })

    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      // sincroniza UI com transmissões do admin
      const {
        sorteioAberto: sao, sorteioAtivo: sat, revelados: rev,
        pares: prs, contador: cnt, confirmavel: confv
      } = payload || {}
      setSorteioAberto(!!sao)
      setSorteioAtivo(!!sat)
      setRevelados(rev || [])
      setPares(prs || [])
      setContador(typeof cnt === 'number' ? cnt : 0)
      setConfirmavel(!!confv)
    })

    ch.subscribe((status) => {
      // console.log('realtime status:', status)
    })

    channelRef.current = ch
    return () => {
      ch.unsubscribe()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  /** Broadcast helper */
  function broadcastState(partial: any) {
    const payload = {
      sorteioAberto,
      sorteioAtivo,
      revelados,
      pares,
      contador,
      confirmavel,
      ...partial
    }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'state',
      payload
    })
  }

  /** ===== Dados principais (jogos + logos) ===== */
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

  /** ===== Salvar placar e pagar 14M ao vencedor (idempotente) ===== */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    try {
      const { data: antes, error: beforeErr } = await supabase
        .from('copa_playoff')
        .select('gols_time1, gols_time2, id_time1, id_time2')
        .eq('id', jogo.id)
        .single()
      if (beforeErr) throw beforeErr

      const antesDef = antes?.gols_time1 != null && antes?.gols_time2 != null

      const { error: updErr } = await supabase
        .from('copa_playoff')
        .update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 })
        .eq('id', jogo.id)
      if (updErr) throw updErr

      const agoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
      if (!antesDef && agoraDef && jogo.gols_time1 !== jogo.gols_time2) {
        const vencedorId = jogo.gols_time1! > jogo.gols_time2! ? jogo.id_time1 : jogo.id_time2
        const { error: saldoErr } = await supabase.rpc('incrementar_saldo', {
          p_id_time: vencedorId,
          p_valor: 14_000_000
        })
        if (saldoErr) toast.error('Erro ao pagar vitória (14M)')
        else toast.success('Vitória paga: R$ 14.000.000')
      }

      toast.success('Placar salvo!')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao salvar placar')
    }
  }

  /** ===== Sorteio ao vivo ===== */

  // Admin: prepara lista (9º–24º), embaralha e abre overlay
  async function iniciarSorteioAoVivo() {
    if (!isAdmin) return
    try {
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
        toast.error('Precisamos de exatamente 16 times (9º ao 24º).')
        return
      }

      const lista: TimeRow[] = shuffle(
        faixa.map((r: ClassifRow) => ({
          id: r.id_time,
          nome: nomeDoTime(r),
          logo_url: logoDoTime(r)
        }))
      )

      // reset de estado do sorteio
      setSorteioAberto(true)
      setSorteioAtivo(true)
      setRevelados([])
      setPares([])
      setFilaSorteio(lista)
      setConfirmavel(false)
      setContador(3)
      broadcastState({
        sorteioAberto: true,
        sorteioAtivo: true,
        revelados: [],
        pares: [],
        filaSorteio: lista,
        confirmavel: false,
        contador: 3
      })

      // inicia temporizador para revelar automaticamente
      iniciarTemporizador(lista)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao iniciar sorteio')
    }
  }

  // Admin: cronômetro revela um time a cada ciclo e fecha pares
  function iniciarTemporizador(lista: TimeRow[]) {
    if (timerRef.current) clearInterval(timerRef.current)
    let fila = [...lista]
    let localRevelados: TimeRow[] = []
    let localPares: Array<[TimeRow, TimeRow]> = []
    let c = 3

    timerRef.current = setInterval(() => {
      if (c > 0) {
        c = c - 1
        setContador(c)
        broadcastState({ contador: c })
        return
      }
      // tempo zerou -> revela próximo time
      const prox = fila.shift()
      if (prox) {
        localRevelados = [...localRevelados, prox]
        setRevelados(localRevelados)
        broadcastState({ revelados: localRevelados })
        c = 3
        setContador(c)
        broadcastState({ contador: c })

        // se tiver dois últimos revelados sem par, fecha um par
        if (localRevelados.length % 2 === 0) {
          const a = localRevelados[localRevelados.length - 2]
          const b = localRevelados[localRevelados.length - 1]
          localPares = [...localPares, [a, b]]
          setPares(localPares)
          broadcastState({ pares: localPares })
        }
      }

      // terminou?
      if (fila.length === 0 && localRevelados.length === 16) {
        if (timerRef.current) clearInterval(timerRef.current)
        setConfirmavel(true)
        setSorteioAtivo(false)
        broadcastState({ confirmavel: true, sorteioAtivo: false })
      }
    }, 1000) // 1s por tick; a cada 3 ticks revela. (total ~4s por carta)
  }

  // Admin: confirma e grava confrontos (apaga e insere ida/volta)
  async function confirmarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) {
      toast.error('Sorteio incompleto.')
      return
    }
    try {
      const novos: Jogo[] = []
      let ordem = 1
      for (const [A, B] of pares) {
        // ida
        novos.push({
          rodada: 1, ordem: ordem++,
          id_time1: A.id, id_time2: B.id,
          time1: A.nome, time2: B.nome,
          gols_time1: null, gols_time2: null
        })
        // volta
        novos.push({
          rodada: 2, ordem: ordem++,
          id_time1: B.id, id_time2: A.id,
          time1: B.nome, time2: A.nome,
          gols_time1: null, gols_time2: null
        })
      }

      const { error: delErr } = await supabase.from('copa_playoff').delete().neq('id', 0)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('copa_playoff').insert(novos)
      if (insErr) throw insErr

      toast.success('Confrontos confirmados!')
      setSorteioAberto(false)
      broadcastState({ sorteioAberto: false })
      await carregarJogosELogos()
    } catch (e) {
      console.error(e)
      toast.error('Erro ao confirmar confrontos')
    }
  }

  /** ===== Layout de jogos atuais ===== */
  const jogosPorRodada = useMemo(() => {
    const g = { 1: [] as Jogo[], 2: [] as Jogo[] }
    for (const j of jogos) (j.rodada === 1 ? g[1] : g[2]).push(j)
    return g
  }, [jogos])

  function Escudo({ id, nome }: { id: string; nome: string }) {
    const t = timesMap[id]
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-800 border border-gray-700">
        {t?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo_url} alt={t.nome || nome} className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] text-gray-300 px-1 text-center">
            {(t?.nome || nome || 'TIM').slice(0,3).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  /** ===== UI ===== */
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">🎯 Playoff</h1>

          {!loadingAdmin && isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSorteioAberto(true)
                  broadcastState({ sorteioAberto: true })
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
              >
                Abrir painel
              </button>
              <button
                onClick={iniciarSorteioAoVivo}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 transition"
              >
                Sorteio ao vivo (9º–24º)
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <div className="text-gray-400 animate-pulse">Carregando…</div>
        ) : (
          <>
            {/* RODADA 1 (IDA) */}
            {jogosPorRodada[1].length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold mb-3">Rodada 1 (ida)</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {jogosPorRodada[1].map((jogo) => (
                    <article key={jogo.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>Ordem #{jogo.ordem}</span>
                        <span>ID {jogo.id}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <Escudo id={jogo.id_time1} nome={jogo.time1} />
                        <div className="flex-1">
                          <div className="font-medium">{timesMap[jogo.id_time1]?.nome || jogo.time1}</div>
                          <div className="text-xs text-gray-400">Mandante</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time1 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: Number.isNaN(gols as any) ? null : gols } : j))
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time2 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: Number.isNaN(gols as any) ? null : gols } : j))
                            }}
                          />
                        </div>

                        <div className="flex-1 text-right">
                          <div className="font-medium">{timesMap[jogo.id_time2]?.nome || jogo.time2}</div>
                          <div className="text-xs text-gray-400">Visitante</div>
                        </div>
                        <Escudo id={jogo.id_time2} nome={jogo.time2} />
                      </div>

                      {isAdmin && (
                        <div className="mt-4 flex justify-end">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 transition text-sm"
                            onClick={() => salvarPlacar(jogo)}
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

            {/* RODADA 2 (VOLTA) */}
            {jogosPorRodada[2].length > 0 && (
              <section className="mb-10">
                <h2 className="text-xl font-semibold mb-3">Rodada 2 (volta)</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {jogosPorRodada[2].map((jogo) => (
                    <article key={jogo.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                        <span>Ordem #{jogo.ordem}</span>
                        <span>ID {jogo.id}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <Escudo id={jogo.id_time1} nome={jogo.time1} />
                        <div className="flex-1">
                          <div className="font-medium">{timesMap[jogo.id_time1]?.nome || jogo.time1}</div>
                          <div className="text-xs text-gray-400">Mandante</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time1 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: Number.isNaN(gols as any) ? null : gols } : j))
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number" min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time2 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: Number.isNaN(gols as any) ? null : gols } : j))
                            }}
                          />
                        </div>

                        <div className="flex-1 text-right">
                          <div className="font-medium">{timesMap[jogo.id_time2]?.nome || jogo.time2}</div>
                          <div className="text-xs text-gray-400">Visitante</div>
                        </div>
                        <Escudo id={jogo.id_time2} nome={jogo.time2} />
                      </div>

                      {isAdmin && (
                        <div className="mt-4 flex justify-end">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 transition text-sm"
                            onClick={() => salvarPlacar(jogo)}
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

      {/* ===== Overlay do Sorteio Ao Vivo (todos assistem) ===== */}
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
                    broadcastState({ sorteioAberto: false })
                  }}
                >
                  Fechar
                </button>
              )}
            </div>

            {/* contador e status */}
            <div className="flex items-center justify-between mb-4">
              <div className={classNames(
                'text-4xl font-bold tabular-nums',
                sorteioAtivo ? 'text-green-400' : 'text-gray-400'
              )}>
                {sorteioAtivo ? `Revelando em: ${contador}` : (confirmavel ? 'Sorteio finalizado' : 'Aguardando início')}
              </div>

              {isAdmin && !sorteioAtivo && !confirmavel && (
                <button
                  className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-500"
                  onClick={iniciarSorteioAoVivo}
                >
                  Reiniciar sorteio
                </button>
              )}
            </div>

            {/* revelados como "cartas" */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {revelados.map((t, idx) => (
                <div key={t.id + idx} className="h-20 rounded-xl border border-gray-700 bg-gray-800/60 flex items-center gap-3 px-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center">
                    {t.logo_url
                      ? <img src={t.logo_url} alt={t.nome} className="w-full h-full object-cover" />
                      : <span className="text-[10px] text-gray-300">{t.nome.slice(0,3).toUpperCase()}</span>
                    }
                  </div>
                  <div className="text-sm font-medium">{t.nome}</div>
                </div>
              ))}
            </div>

            {/* pares formados */}
            <div className="space-y-2">
              {pares.map(([a, b], i) => (
                <div key={a.id + b.id + i} className="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center">
                        {a.logo_url
                          ? <img src={a.logo_url} alt={a.nome} className="w-full h-full object-cover" />
                          : <span className="text-[10px] text-gray-300">{a.nome.slice(0,3).toUpperCase()}</span>}
                      </div>
                      <span className="font-medium">{a.nome}</span>
                    </div>
                    <span className="text-gray-400">x</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.nome}</span>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center">
                        {b.logo_url
                          ? <img src={b.logo_url} alt={b.nome} className="w-full h-full object-cover" />
                          : <span className="text-[10px] text-gray-300">{b.nome.slice(0,3).toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ações finais */}
            <div className="mt-6 flex justify-end gap-2">
              {isAdmin && confirmavel && (
                <button
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500"
                  onClick={confirmarConfrontos}
                >
                  ✅ Confirmar confrontos
                </button>
              )}
              {(!loadingAdmin && isAdmin) && (
                <button
                  className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
                  onClick={() => {
                    setSorteioAberto(false)
                    broadcastState({ sorteioAberto: false })
                  }}
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

