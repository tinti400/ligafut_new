'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UUID = string

type FinalRow = {
  id: UUID
  temporada: number
  divisao: number
  id_time1: UUID
  id_time2: UUID
  gols_time1: number | null
  gols_time2: number | null
  created_at: string | null
}

type Time = {
  id: UUID
  nome: string
  logo_url?: string | null
}

type CampeaoItem = {
  temporada: number
  divisao: number
  vencedor: Time | null
  vice: Time | null
  golsVencedor: number | null
  golsVice: number | null
  data: string | null
}

function TeamChip({ nome, logo, align = 'start' }: { nome: string; logo?: string | null; align?: 'start' | 'end' }) {
  const abbr = useMemo(() => (nome?.trim()?.[0] || 'T').toUpperCase(), [nome])
  return (
    <div className={`flex items-center gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {align === 'end' ? null : (
        logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={nome} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
        ) : (
          <div className="h-8 w-8 rounded-full grid place-items-center bg-gray-800 ring-1 ring-white/10">
            <span className="text-gray-300 text-sm font-semibold">{abbr}</span>
          </div>
        )
      )}
      <span className="font-semibold truncate max-w-[160px]">{nome}</span>
      {align === 'end' ? (
        logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={nome} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
        ) : (
          <div className="h-8 w-8 rounded-full grid place-items-center bg-gray-800 ring-1 ring-white/10">
            <span className="text-gray-300 text-sm font-semibold">{abbr}</span>
          </div>
        )
      ) : null}
    </div>
  )
}

export default function HistoricoCampeoesPage() {
  const [itens, setItens] = useState<CampeaoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [divisaoFiltro, setDivisaoFiltro] = useState<number | 'todas'>('todas')
  const [divisoesDisponiveis, setDivisoesDisponiveis] = useState<number[]>([])

  useEffect(() => {
    (async () => {
      setCarregando(true)

      // 1) Busca todas as finais registradas
      const { data: finais, error } = await supabase
        .from('copa_final')
        .select('id, temporada, divisao, id_time1, id_time2, gols_time1, gols_time2, created_at')
        .order('temporada', { ascending: false })

      if (error) {
        toast.error('Erro ao buscar finais')
        setCarregando(false)
        return
      }
      const finaisList = (finais || []) as FinalRow[]

      // 2) Carrega todos os times envolvidos para resolver nomes/logos em 1 query
      const idsTimes = Array.from(
        new Set(
          finaisList.flatMap(f => [f.id_time1, f.id_time2]).filter(Boolean)
        )
      ) as UUID[]

      let mapaTimes = new Map<UUID, Time>()
      if (idsTimes.length) {
        const { data: times, error: errTimes } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', idsTimes)

        if (errTimes) {
          toast.error('Erro ao buscar times')
        } else if (times) {
          mapaTimes = new Map(times.map(t => [t.id as UUID, { id: t.id as UUID, nome: t.nome, logo_url: t.logo_url }]))
        }
      }

      // 3) Calcula campeão/vice por final
      const calculados: CampeaoItem[] = finaisList.map(f => {
        const time1 = mapaTimes.get(f.id_time1) || null
        const time2 = mapaTimes.get(f.id_time2) || null

        // regra: se empate, campeão é time1 (melhor campanha)
        const vencedor =
          f.gols_time1 == null || f.gols_time2 == null
            ? null
            : f.gols_time1 > f.gols_time2
              ? time1
              : f.gols_time2 > f.gols_time1
                ? time2
                : time1

        const vice =
          f.gols_time1 == null || f.gols_time2 == null
            ? null
            : vencedor?.id === time1?.id
              ? time2
              : time1

        const golsVencedor =
          vencedor?.id === time1?.id ? f.gols_time1
            : vencedor?.id === time2?.id ? f.gols_time2
            : null

        const golsVice =
          vencedor?.id === time1?.id ? f.gols_time2
            : vencedor?.id === time2?.id ? f.gols_time1
            : null

        return {
          temporada: f.temporada,
          divisao: f.divisao,
          vencedor,
          vice,
          golsVencedor,
          golsVice,
          data: f.created_at
        }
      })

      setItens(calculados)
      setDivisoesDisponiveis(
        Array.from(new Set(calculados.map(c => c.divisao))).sort((a, b) => a - b)
      )
      setCarregando(false)
    })()
  }, [])

  const exibidos = useMemo(() => {
    const base = [...itens].sort((a, b) => {
      // ordena: temporada desc, divisao asc
      if (a.temporada !== b.temporada) return b.temporada - a.temporada
      return a.divisao - b.divisao
    })
    return divisaoFiltro === 'todas' ? base : base.filter(i => i.divisao === divisaoFiltro)
  }, [itens, divisaoFiltro])

  return (
    <div className="p-4 text-white">
      <header className="mx-auto max-w-5xl mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">
            <span className="bg-gradient-to-r from-yellow-300 via-white to-yellow-300 bg-clip-text text-transparent">
              🏆 Histórico de Campeões — Copa
            </span>
          </h1>
          <p className="text-white/60 mt-1">
            Visualize os campeões por temporada antes de reiniciar a próxima.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-white/70">Divisão</label>
          <select
            value={divisaoFiltro}
            onChange={e => setDivisaoFiltro(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
            className="rounded-lg bg-gray-900 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400/40"
          >
            <option value="todas">Todas</option>
            {divisoesDisponiveis.map(d => (
              <option key={d} value={d}>Divisão {d}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="mx-auto max-w-5xl">
        {carregando ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse" />
            ))}
          </div>
        ) : exibidos.length === 0 ? (
          <p className="text-center text-white/60">Nenhuma final registrada.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {exibidos.map((c, idx) => {
              const pendente = !c.vencedor || c.golsVencedor == null || c.golsVice == null
              return (
                <div
                  key={`${c.temporada}-${c.divisao}-${idx}`}
                  className="relative overflow-hidden rounded-2xl bg-[#0B1220] ring-1 ring-white/10 shadow-xl"
                >
                  {/* brilho */}
                  <div className="pointer-events-none absolute -inset-1 opacity-20 [mask-image:radial-gradient(60%_60%_at_50%_20%,black,transparent)]">
                    <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-yellow-500 blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-600 blur-3xl" />
                  </div>

                  <div className="relative p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs uppercase tracking-widest text-white/60">
                        Temporada {c.temporada} • Divisão {c.divisao}
                      </div>
                      <div className="rounded-full bg-yellow-500/15 text-yellow-300 text-xs px-2 py-1 ring-1 ring-yellow-300/20">
                        Final
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      {/* Vencedor / a esquerda */}
                      <div className="min-w-0">
                        <TeamChip nome={c.vencedor?.nome ?? (pendente ? 'Em aberto' : '-')} logo={c.vencedor?.logo_url} />
                      </div>

                      {/* Placar */}
                      <div className="grid place-items-center">
                        <div className={`text-3xl font-black ${pendente ? 'text-white/50' : ''}`}>
                          {pendente ? '—' : `${c.golsVencedor} x ${c.golsVice}`}
                        </div>
                        <div className="text-[10px] tracking-widest text-white/50 uppercase mt-1">Placar</div>
                      </div>

                      {/* Vice / à direita */}
                      <div className="min-w-0">
                        <TeamChip
                          nome={c.vice?.nome ?? (pendente ? 'A definir' : '-')}
                          logo={c.vice?.logo_url}
                          align="end"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-white/60">
                      <span>{c.data ? new Date(c.data).toLocaleString() : 'Sem data'}</span>
                      {!pendente ? (
                        <span className="inline-flex items-center gap-1 text-yellow-300">
                          <span className="text-lg">🏆</span> Campeão
                        </span>
                      ) : (
                        <span className="text-white/50">Final pendente</span>
                      )}
                    </div>
                  </div>

                  {/* medalha decorativa */}
                  {!pendente && (
                    <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 opacity-20 blur-2xl" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      <style jsx>{`
        /* sem CSS extra obrigatório aqui; estilos inline no card */
      `}</style>
    </div>
  )
}
