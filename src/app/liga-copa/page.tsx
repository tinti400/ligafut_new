'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ===== Tipos ===== */
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

/** ===== Utils ===== */
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

/** ===== Round-robin (turno único) ===== */
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

/** ===== Classificação ===== */
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
}

function computeClassificacao(rodadas: RodadaRow[], times: TimeRow[]): RowClass[] {
  const map = new Map<UUID, RowClass>()
  for (const t of times) {
    map.set(t.id, {
      id_time: t.id, nome: t.nome,
      jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pontos: 0
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
        m.v += 1; m.pontos += 3
        v.d += 1
      } else if (j.gols_mandante < j.gols_visitante) {
        v.v += 1; v.pontos += 3
        m.d += 1
      } else {
        m.e += 1; v.e += 1
        m.pontos += 1; v.pontos += 1
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

/** ===== Page ===== */
export default function LigaCopaPage() {
  const [times, setTimes] = useState<TimeRow[]>([])
  const [rodadas, setRodadas] = useState<RodadaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingRodada, setSavingRodada] = useState<number | null>(null)

  // >>>>>>>>>>>>>>>>> ALTERADO: carregar SOMENTE divisões 1 a 3
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

      const payload = listas.map(r => ({ numero: r.numero, jogos: r.jogos }))
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

      try {
        const clas = computeClassificacao(
          rodadas.map(r => (r.numero === numero ? { ...r, jogos: jogosAtualizados } : r)),
          times
        )
        if (clas.length > 0) {
          const { error: delC } = await supabase
            .from('liga_copa_classificacao')
            .delete()
            .neq('id_time', '00000000-0000-0000-0000-000000000000')
          if (delC) console.warn('Aviso ao limpar liga_copa_classificacao:', delC?.message)

          const { error: insC } = await supabase.from('liga_copa_classificacao').insert(
            clas.map(r => ({
              id_time: r.id_time, nome: r.nome, pontos: r.pontos, jogos: r.jogos,
              v: r.v, e: r.e, d: r.d, gp: r.gp, gc: r.gc, sg: r.sg
            }))
          )
          if (insC) console.warn('Aviso ao inserir classificação:', insC?.message)
        }
      } catch (e) {
        console.warn('Não foi possível persistir a classificação (opcional):', e)
      }
    } finally {
      setSavingRodada(null)
    }
  }

  const setGol = (rnum: number, idx: number, field: 'gols_mandante' | 'gols_visitante', val: number | null) => {
    setRodadas(prev => prev.map(r => {
      if (r.numero !== rnum) return r
      const jogos = [...(r.jogos || [])]
      const j = { ...(jogos[idx] || {}) } as Jogo
      ;(j as any)[field] = val
      jogos[idx] = j
      return { ...r, jogos }
    }))
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Liga-Copa (Divisões 1 a 3 • Turno Único)</h1>
        <button
          onClick={gerarLigaCopa}
          disabled={loading || times.length < 2}
          className="rounded-2xl px-4 py-2 bg-black text-white disabled:opacity-50"
        >
          {loading ? 'Gerando…' : 'Gerar Liga-Copa'}
        </button>
      </header>

      {/* Participantes */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Participantes ({times.length})</h2>
        <div className="flex flex-wrap gap-2">
          {times.map(t => (
            <span key={t.id} className="rounded-full border px-3 py-1 text-sm">
              {t.nome}{typeof t.divisao === 'number' ? ` • D${t.divisao}` : ''}
            </span>
          ))}
          {times.length === 0 && <p className="text-sm text-gray-500">Nenhum time das divisões 1, 2 e 3 encontrado.</p>}
        </div>
      </section>

      {/* Classificação */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Classificação</h2>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2">P</th>
                <th className="px-3 py-2">J</th>
                <th className="px-3 py-2">V</th>
                <th className="px-3 py-2">E</th>
                <th className="px-3 py-2">D</th>
                <th className="px-3 py-2">GP</th>
                <th className="px-3 py-2">GC</th>
                <th className="px-3 py-2">SG</th>
              </tr>
            </thead>
            <tbody>
              {computeClassificacao(rodadas, times).map((r, i) => (
                <tr key={r.id_time} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2 text-left">{r.nome}</td>
                  <td className="px-3 py-2 text-center font-semibold">{r.pontos}</td>
                  <td className="px-3 py-2 text-center">{r.jogos}</td>
                  <td className="px-3 py-2 text-center">{r.v}</td>
                  <td className="px-3 py-2 text-center">{r.e}</td>
                  <td className="px-3 py-2 text-center">{r.d}</td>
                  <td className="px-3 py-2 text-center">{r.gp}</td>
                  <td className="px-3 py-2 text-center">{r.gc}</td>
                  <td className="px-3 py-2 text-center">{r.sg}</td>
                </tr>
              ))}
              {classificacao.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-500">
                    Sem jogos finalizados ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rodadas */}
      <section className="space-y-8">
        <h2 className="text-lg font-semibold">Rodadas</h2>
        {rodadas.map((r) => (
          <div key={r.id ?? r.numero} className="rounded-2xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold">Rodada {r.numero}</h3>
              <button
                onClick={() => salvarRodada(r.numero, r.jogos || [])}
                disabled={savingRodada === r.numero}
                className="rounded-xl px-3 py-1.5 bg-black text-white disabled:opacity-50"
              >
                {savingRodada === r.numero ? 'Salvando…' : 'Salvar Resultados e Atualizar Classificação'}
              </button>
            </div>

            <div className="divide-y">
              {(r.jogos || []).map((jogo, idx) => (
                <div key={idx} className="px-4 py-3 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 md:col-span-5 text-right truncate">{jogo.mandante}</div>
                  <div className="col-span-1 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded-lg border px-2 py-1 text-center"
                      value={jogo.gols_mandante ?? ''}
                      onChange={(e) => setGol(r.numero, idx, 'gols_mandante', clampInt(e.target.value))}
                    />
                  </div>
                  <div className="col-span-1 text-center font-semibold">x</div>
                  <div className="col-span-1 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-14 rounded-lg border px-2 py-1 text-center"
                      value={jogo.gols_visitante ?? ''}
                      onChange={(e) => setGol(r.numero, idx, 'gols_visitante', clampInt(e.target.value))}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-5 text-left truncate">{jogo.visitante}</div>
                </div>
              ))}

              {(r.jogos || []).length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-500">
                  Nenhum jogo nesta rodada.
                </div>
              )}
            </div>
          </div>
        ))}

        {rodadas.length === 0 && (
          <div className="rounded-2xl border px-4 py-10 text-center text-gray-500">
            Nenhuma rodada gerada. Clique em <strong>Gerar Liga-Copa</strong>.
          </div>
        )}
      </section>
    </div>
  )
}
