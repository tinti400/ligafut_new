'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

/** === Supabase (client) === */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** === Tipos === */
type UUID = string

type TimeRow = {
  id: UUID
  nome: string
  logo_url?: string | null
  divisao?: number | null
}

type Jogo = {
  mandante_id: UUID
  visitante_id: UUID
  mandante: string
  visitante: string
  gols_mandante: number | null
  gols_visitante: number | null
}

type RodadaRow = {
  id: UUID
  numero: number
  jogos: Jogo[] | null
  created_at?: string
}

/** === Utils === */
const clampInt = (v: any) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** === Round-robin (turno único) === */
function gerarRodadasTurnoUnico(times: TimeRow[]): { numero: number; jogos: Jogo[] }[] {
  if (times.length < 2) return []

  const ghost: TimeRow = { id: 'ghost' as UUID, nome: 'BYE', logo_url: null }
  const lista = times.length % 2 === 1 ? [...times, ghost] : [...times]

  const arr = shuffle(lista)
  const n = arr.length
  const rounds = n - 1
  const half = n / 2

  const fixo = arr[0]
  let rotativos = arr.slice(1)

  const result: { numero: number; jogos: Jogo[] }[] = []

  for (let r = 0; r < rounds; r++) {
    const esquerda = [fixo, ...rotativos.slice(0, half - 1)]
    const direita = rotativos.slice(half - 1).reverse()

    const jogos: Jogo[] = []
    for (let i = 0; i < half; i++) {
      const A = esquerda[i]
      const B = direita[i]
      if (!A || !B) continue
      if (A.id === 'ghost' || B.id === 'ghost') continue

      const invert = (r + i) % 2 === 1
      const mand = invert ? B : A
      const vis = invert ? A : B

      jogos.push({
        mandante_id: mand.id,
        visitante_id: vis.id,
        mandante: mand.nome,
        visitante: vis.nome,
        gols_mandante: null,
        gols_visitante: null,
      })
    }

    result.push({ numero: r + 1, jogos })
    rotativos = [rotativos[rotativos.length - 1], ...rotativos.slice(0, rotativos.length - 1)]
  }

  return result
}

/** === Classificação === */
type RowClass = {
  id_time: UUID
  nome: string
  jogos: number
  v: number
  e: number
  d: number
  gp: number
  gc: number
  sg: number
  pontos: number
  logo_url?: string | null
  divisao?: number | null
}

function computeClassificacao(rodadas: RodadaRow[], times: TimeRow[]): RowClass[] {
  const map = new Map<UUID, RowClass>()
  for (const t of times) {
    map.set(t.id, {
      id_time: t.id,
      nome: t.nome,
      logo_url: t.logo_url,
      divisao: t.divisao,
      jogos: 0,
      v: 0,
      e: 0,
      d: 0,
      gp: 0,
      gc: 0,
      sg: 0,
      pontos: 0,
    })
  }
  for (const r of rodadas) {
    for (const j of r.jogos ?? []) {
      if (j.gols_mandante == null || j.gols_visitante == null) continue
      const m = map.get(j.mandante_id)
      const v = map.get(j.visitante_id)
      if (!m || !v) continue

      m.jogos += 1
      v.jogos += 1
      m.gp += j.gols_mandante
      m.gc += j.gols_visitante
      v.gp += j.gols_visitante
      v.gc += j.gols_mandante

      if (j.gols_mandante > j.gols_visitante) {
        m.v += 1
        m.pontos += 3
        v.d += 1
      } else if (j.gols_mandante < j.gols_visitante) {
        v.v += 1
        v.pontos += 3
        m.d += 1
      } else {
        m.e += 1
        v.e += 1
        m.pontos += 1
        v.pontos += 1
      }
    }
  }
  for (const r of map.values()) r.sg = r.gp - r.gc

  return Array.from(map.values()).sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.v !== a.v) return b.v - a.v
    if (b.sg !== a.sg) return b.sg - a.sg
    if (b.gp !== a.gp) return b.gp - a.gp
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
}

/** === Page === */
export default function LigaCopaPage() {
  const [times, setTimes] = useState<TimeRow[]>([])
  const [rodadas, setRodadas] = useState<RodadaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingRodada, setSavingRodada] = useState<number | null>(null)

  // carregar SOMENTE divisões 1 a 3
  const loadTimes = async () => {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url, divisao')
      .in('divisao', [1, 2, 3])
      .order('divisao', { ascending: true })
      .order('nome', { ascending: true })

    if (error) {
      toast.error('Erro ao carregar times das divisões 1 a 3')
      console.error(error)
      setTimes([])
      return
    }
    setTimes((data as TimeRow[]) || [])
  }

  const loadRodadas = async () => {
    const { data, error } = await supabase
      .from('liga_copa_rodadas')
      .select('id, numero, jogos, created_at')
      .order('numero', { ascending: true })
    if (error) {
      console.warn('liga_copa_rodadas não encontrada ou erro ao buscar', error)
      setRodadas([])
      return
    }
    setRodadas((data as RodadaRow[]) || [])
  }

  useEffect(() => {
    loadTimes()
    loadRodadas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const classificacao = useMemo(() => computeClassificacao(rodadas, times), [rodadas, times])

  const gerarLigaCopa = async () => {
    if (times.length < 2) {
      toast.error('Cadastre ao menos 2 times (divisões 1 a 3).')
      return
    }
    setLoading(true)
    try {
      const { error: delErr } = await supabase
        .from('liga_copa_rodadas')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (delErr && delErr.code !== '42P01') {
        console.warn('Erro ao limpar liga_copa_rodadas', delErr)
      }

      const listas = gerarRodadasTurnoUnico(times)
      if (listas.length === 0) {
        toast.error('Não foi possível gerar as rodadas.')
        setLoading(false)
        return
      }

      const payload = listas.map((r) => ({ numero: r.numero, jogos: r.jogos }))
      const { error: insErr } = await supabase.from('liga_copa_rodadas').insert(payload)
      if (insErr) {
        toast.error('Erro ao salvar as rodadas.')
        console.error(insErr)
      } else {
        toast.success('Liga-Copa gerada com sucesso!')
        await loadRodadas()
      }
    } finally {
      setLoading(false)
    }
  }

  const salvarRodada = async (numero: number, jogosAtualizados: Jogo[]) => {
    setSavingRodada(numero)
    try {
      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: jogosAtualizados })
        .eq('numero', numero)

      if (updErr) {
        toast.error(`Erro ao salvar a rodada ${numero}`)
        console.error(updErr)
        return
      }

      await loadRodadas()
      toast.success(`Rodada ${numero} salva!`)
    } finally {
      setSavingRodada(null)
    }
  }

  const setGol = (
    rnum: number,
    idx: number,
    field: 'gols_mandante' | 'gols_visitante',
    val: number | null
  ) => {
    setRodadas((prev) =>
      prev.map((r) => {
        if (r.numero !== rnum) return r
        const jogos = [...(r.jogos || [])]
        const j = { ...(jogos[idx] || {}) } as Jogo
        ;(j as any)[field] = val
        jogos[idx] = j
        return { ...r, jogos }
      })
    )
  }

  /** === UI helpers === */
  const aproveitamento = (row: RowClass) =>
    row.jogos > 0 ? Math.round((row.pontos / (row.jogos * 3)) * 100) : 0

  // mapeia a faixa por posição (1-10 → D1, 11-20 → D2, 21-último → D3)
  const faixaPorPosicao = (pos: number) => {
    if (pos >= 1 && pos <= 10) return { rotulo: '1ª Divisão', cor: 'bg-emerald-500 text-black', chip: 'bg-emerald-600/20 ring-emerald-500/40' }
    if (pos >= 11 && pos <= 20) return { rotulo: '2ª Divisão', cor: 'bg-sky-400 text-black', chip: 'bg-sky-600/20 ring-sky-400/40' }
    return { rotulo: '3ª Divisão', cor: 'bg-amber-400 text-black', chip: 'bg-amber-600/20 ring-amber-400/40' }
  }

  /** === Render === */
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      {/* Título */}
      <div className="max-w-6xl mx-auto px-4 pt-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center mb-6">
          <span className="bg-gradient-to-r from-yellow-400 via-emerald-400 to-lime-300 bg-clip-text text-transparent">
            🏟️ Liga-Copa (D1–D3) • Turno Único
          </span>
        </h1>
      </div>

      {/* Ações */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={gerarLigaCopa}
            disabled={loading || times.length < 2}
            className={`px-4 py-2 rounded-full text-sm border transition ${
              loading
                ? 'bg-gray-700 text-gray-300 cursor-not-allowed border-white/10'
                : 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-500/50'
            }`}
          >
            {loading ? 'Gerando…' : '🚀 Gerar/Resetar Rodadas'}
          </button>
        </div>

        <div className="mb-1 text-center text-xs text-emerald-300">
          Participantes (D1–D3): <b>{times.length}</b>
        </div>
      </div>

      {/* Legenda (faixas por posição) */}
      <div className="max-w-6xl mx-auto px-4 mt-2 mb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 bg-emerald-600/20 ring-1 ring-emerald-500/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 1º – 10º • 1ª Divisão
          </span>
          <span className="inline-flex items-center gap-2 bg-sky-600/20 ring-1 ring-sky-400/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> 11º – 20º • 2ª Divisão
          </span>
          <span className="inline-flex items-center gap-2 bg-amber-600/20 ring-1 ring-amber-400/40 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> 21º – Último • 3ª Divisão
          </span>
        </div>
      </div>

      {/* Tabela principal */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        {/* Compartilhar */}
        <div className="mb-3 flex justify-end">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `📊 Liga-Copa (Turno Único • D1–D3):\n\n` +
                classificacao
                  .map(
                    (item, i) =>
                      `${i + 1}º ${item.nome} - ${item.pontos} pts (${item.v}V ${item.e}E ${item.d}D)`
                  )
                  .join('\n')
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm px-3 py-1.5 rounded-lg font-semibold"
          >
            📤 Compartilhar
          </a>
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-900/60 shadow-2xl shadow-black/30">
          <table className="min-w-full text-sm">
            <thead className="bg-black/70 text-yellow-300 border-b border-white/10">
              <tr>
                <th className="py-3 px-4 text-left">Pos</th>
                <th className="py-3 px-4 text-left">Time</th>
                <th className="py-3 px-2 text-center">Faixa</th>
                <th className="py-3 px-2 text-center">Pts</th>
                <th className="py-3 px-2 text-center">Aprove.</th>
                <th className="py-3 px-2 text-center">J</th>
                <th className="py-3 px-2 text-center">V</th>
                <th className="py-3 px-2 text-center">E</th>
                <th className="py-3 px-2 text-center">D</th>
                <th className="py-3 px-2 text-center">GP</th>
                <th className="py-3 px-2 text-center">GC</th>
                <th className="py-3 px-2 text-center">SG</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {classificacao.map((item, index) => {
                const pos = index + 1
                const ap = aproveitamento(item)
                const faixa = faixaPorPosicao(pos)

                // realce suave por faixa (linha)
                const linhaCor =
                  pos <= 10
                    ? 'bg-emerald-950/30 hover:bg-emerald-900/30'
                    : pos <= 20
                    ? 'bg-sky-950/30 hover:bg-sky-900/30'
                    : 'bg-amber-950/30 hover:bg-amber-900/30'

                return (
                  <tr key={item.id_time} className={`${linhaCor} transition-colors`}>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ring-1 ring-white/10 bg-gray-700 text-gray-200">
                        {pos}
                      </span>
                    </td>

                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3">
                        {item.logo_url ? (
                          <img
                            src={item.logo_url}
                            alt={item.nome}
                            className="w-7 h-7 rounded-full ring-1 ring-white/10 object-cover"
                          />
                        ) : (
                          <span className="w-7 h-7 grid place-items-center rounded-full bg-gray-700 text-[10px] text-gray-200 ring-1 ring-white/10">
                            {item.nome.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium">{item.nome}</span>
                        {typeof item.divisao === 'number' && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-800 ring-1 ring-white/10 text-gray-300">
                            D{item.divisao}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Faixa da próxima divisão */}
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${faixa.chip}`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${faixa.cor.replace(' text-black', '')}`}></span>
                        {faixa.rotulo}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-center font-bold text-yellow-300">{item.pontos}</td>

                    <td className="py-2.5 px-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-24 md:w-32 h-2 rounded-full bg-gray-700 overflow-hidden">
                          <div className="h-2 bg-emerald-500" style={{ width: `${ap}%` }} />
                        </div>
                        <span className="text-xs text-gray-300">{ap}%</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-center">{item.jogos}</td>
                    <td className="py-2.5 px-2 text-center">{item.v}</td>
                    <td className="py-2.5 px-2 text-center">{item.e}</td>
                    <td className="py-2.5 px-2 text-center">{item.d}</td>
                    <td className="py-2.5 px-2 text-center">{item.gp}</td>
                    <td className="py-2.5 px-2 text-center">{item.gc}</td>
                    <td className="py-2.5 px-2 text-center">{item.sg}</td>
                  </tr>
                )
              })}
              {classificacao.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-gray-400">
                    Sem jogos finalizados ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rodadas — cartões escuros no mesmo estilo */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <h2 className="text-base font-semibold text-gray-200 mb-3">Rodadas</h2>

        {rodadas.map((r) => (
          <div key={r.id ?? r.numero} className="rounded-xl border border-white/10 bg-gray-900/50 mb-4">
            <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/10">
              <h3 className="font-semibold">Rodada {r.numero}</h3>
              <button
                onClick={() => salvarRodada(r.numero, r.jogos || [])}
                disabled={savingRodada === r.numero}
                className="rounded-lg px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black text-sm disabled:opacity-50"
              >
                {savingRodada === r.numero ? 'Salvando…' : 'Salvar resultados'}
              </button>
            </div>

            <div className="divide-y divide-white/10">
              {(r.jogos || []).map((jogo, idx) => (
                <div key={idx} className="px-4 md:px-6 py-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5 md:col-span-5 text-right truncate">{jogo.mandante}</div>
                  <div className="col-span-1 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-center text-white"
                      value={jogo.gols_mandante ?? ''}
                      onChange={(e) => setGol(r.numero, idx, 'gols_mandante', clampInt(e.target.value))}
                    />
                  </div>
                  <div className="col-span-0 text-center font-semibold">x</div>
                  <div className="col-span-1 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-center text-white"
                      value={jogo.gols_visitante ?? ''}
                      onChange={(e) => setGol(r.numero, idx, 'gols_visitante', clampInt(e.target.value))}
                    />
                  </div>
                  <div className="col-span-5 md:col-span-5 text-left truncate">{jogo.visitante}</div>
                </div>
              ))}
              {(r.jogos || []).length === 0 && (
                <div className="px-4 md:px-6 py-8 text-center text-sm text-gray-400">
                  Nenhum jogo nesta rodada.
                </div>
              )}
            </div>
          </div>
        ))}

        {rodadas.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 px-4 md:px-6 py-10 text-center text-gray-400">
            Nenhuma rodada gerada. Use <strong>Gerar/Resetar Rodadas</strong> acima.
          </div>
        )}
      </div>
    </div>
  )
}

