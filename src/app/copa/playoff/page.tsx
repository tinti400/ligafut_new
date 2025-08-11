'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos (iguais ao estilo do seu ClassificacaoPage) ===== */
interface Time {
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

export default function PlayoffPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  const [jogos, setJogos] = useState<Jogo[]>([])
  const [loading, setLoading] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})

  useEffect(() => {
    carregarJogosELogos()
  }, [])

  /** Busca jogos e carrega logos dos times envolvidos (mesma lógica do seu exemplo) */
  async function carregarJogosELogos() {
    try {
      setLoading(true)

      // 1) Buscar jogos
      const { data: jogosData, error } = await supabase
        .from('copa_playoff')
        .select('*')
        .order('rodada', { ascending: true })
        .order('ordem', { ascending: true })

      if (error) throw error
      const js = (jogosData || []) as Jogo[]
      setJogos(js)

      // 2) Buscar logos dos times que aparecem nos confrontos
      const ids = Array.from(
        new Set(js.flatMap((j) => [j.id_time1, j.id_time2]).filter(Boolean))
      )

      if (ids.length) {
        const { data: timesData, error: tErr } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', ids)

        if (tErr) throw tErr

        const mapa: Record<string, Time> = {}
        for (const t of (timesData || []) as Time[]) {
          mapa[t.id] = t
        }
        setTimesMap(mapa)
      } else {
        setTimesMap({})
      }
    } catch (e: any) {
      console.error(e)
      toast.error('Erro ao carregar jogos ou logos')
    } finally {
      setLoading(false)
    }
  }

  /** Salvar placar (somente admin) */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    const { error } = await supabase
      .from('copa_playoff')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2
      })
      .eq('id', jogo.id)

    if (error) toast.error('Erro ao salvar')
    else toast.success('Placar salvo!')
  }

  /** Embaralhar (Fisher-Yates) */
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  /** Nome do time via relação (fallback) */
  function nomeDoTime(reg: any): string {
    const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
    return t?.nome ?? 'Time'
  }

  /** Sortear confrontos do 9º ao 24º; apaga e reinsere (somente admin) */
  async function sortearPlayoff() {
    if (!isAdmin) return

    const { data: classificacao, error } = await supabase
      .from('classificacao')
      .select('id_time, times ( nome )')
      .eq('temporada', 1)
      .order('pontos', { ascending: false })

    if (error || !classificacao) {
      toast.error('Erro ao buscar classificação')
      return
    }

    // 9º ao 24º -> índices 8..23
    const classificados = classificacao.slice(8, 24)
    if (classificados.length !== 16) {
      toast.error('São necessários exatamente 16 times (do 9º ao 24º).')
      return
    }

    const embaralhados = shuffle(classificados)
    const novosJogos: Jogo[] = []
    let ordem = 1

    for (let i = 0; i < embaralhados.length; i += 2) {
      const a = embaralhados[i]
      const b = embaralhados[i + 1]

      const idA = a.id_time
      const idB = b.id_time
      const nomeA = nomeDoTime(a)
      const nomeB = nomeDoTime(b)

      if (!idA || !idB) {
        toast.error('Registro de time inválido.')
        return
      }

      // ida
      novosJogos.push({
        rodada: 1,
        ordem: ordem++,
        id_time1: idA,
        id_time2: idB,
        time1: nomeA,
        time2: nomeB,
        gols_time1: null,
        gols_time2: null
      })
      // volta
      novosJogos.push({
        rodada: 2,
        ordem: ordem++,
        id_time1: idB,
        id_time2: idA,
        time1: nomeB,
        time2: nomeA,
        gols_time1: null,
        gols_time2: null
      })
    }

    // Apaga tudo e insere o novo sorteio
    const { error: delError } = await supabase.from('copa_playoff').delete().neq('id', 0)
    if (delError) {
      toast.error('Erro ao limpar jogos antigos')
      return
    }

    const { error: insError } = await supabase.from('copa_playoff').insert(novosJogos)
    if (insError) {
      toast.error('Erro ao sortear jogos')
    } else {
      toast.success('Jogos sorteados com sucesso!')
      await carregarJogosELogos()
    }
  }

  /** Agrupar por rodada para layout */
  const jogosPorRodada = useMemo(() => {
    const g = { 1: [] as Jogo[], 2: [] as Jogo[] }
    for (const j of jogos) {
      if (j.rodada === 1) g[1].push(j)
      else g[2].push(j)
    }
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
            {(t?.nome || nome || 'TIM').slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">🎯 Playoff</h1>

          {/* Botão só para admin (como no seu exemplo) */}
          {!loadingAdmin && isAdmin && (
            <button
              onClick={sortearPlayoff}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 transition"
            >
              Sortear confrontos (9º ao 24º)
            </button>
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
                            type="number"
                            min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time1 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos((prev) =>
                                prev.map((jj) => (jj.id === jogo.id ? { ...jj, gols_time1: Number.isNaN(gols as any) ? null : gols } : jj))
                              )
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number"
                            min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time2 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos((prev) =>
                                prev.map((jj) => (jj.id === jogo.id ? { ...jj, gols_time2: Number.isNaN(gols as any) ? null : gols } : jj))
                              )
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
                            type="number"
                            min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time1 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos((prev) =>
                                prev.map((jj) => (jj.id === jogo.id ? { ...jj, gols_time1: Number.isNaN(gols as any) ? null : gols } : jj))
                              )
                            }}
                          />
                          <span className="text-gray-400 font-semibold">x</span>
                          <input
                            type="number"
                            min={0}
                            className="w-16 text-center text-lg md:text-xl font-bold rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-600"
                            value={jogo.gols_time2 ?? ''}
                            disabled={!isAdmin}
                            onChange={(e) => {
                              const v = e.target.value
                              const gols = v === '' ? null : Math.max(0, parseInt(v))
                              setJogos((prev) =>
                                prev.map((jj) => (jj.id === jogo.id ? { ...jj, gols_time2: Number.isNaN(gols as any) ? null : gols } : jj))
                              )
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
    </div>
  )
}
