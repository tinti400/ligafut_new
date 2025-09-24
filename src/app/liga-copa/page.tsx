'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { useAdmin } from '@/hooks/useAdmin'

/** ========== Supabase client (anon) ========== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ========== Tipos ========== */
type UUID = string

type Time = {
  id: UUID
  nome: string
  logo_url?: string | null
}

type JogoLC = {
  // Suporta ambos formatos: (mandante|visitante) ou (mandante_id|visitante_id)
  mandante?: UUID
  visitante?: UUID
  mandante_id?: UUID
  visitante_id?: UUID

  gols_mandante?: number
  gols_visitante?: number

  // Controle de “primeiro lançamento” (apenas flag, sem finanças na Liga-Copa)
  bonus_pago?: boolean

  // opcional: data exibida
  data_iso?: string | null
}

type RodadaLC = {
  id: UUID
  numero: number
  jogos: JogoLC[]
  created_at?: string
}

/** ========== Helpers ========== */
const getMandanteId = (j: JogoLC) => (j.mandante ?? j.mandante_id) as UUID
const getVisitanteId = (j: JogoLC) => (j.visitante ?? j.visitante_id) as UUID
const isPlacar = (j: JogoLC) =>
  j.gols_mandante !== undefined && j.gols_mandante !== null &&
  j.gols_visitante !== undefined && j.gols_visitante !== null

const resumoRodada = (r: RodadaLC) => {
  const total = r.jogos.length
  const feitos = r.jogos.filter(isPlacar).length
  return { feitos, total }
}

/** ========== Classificação (turno único) ========== */
type RowClass = {
  id_time: UUID
  nome: string
  logo_url?: string | null
  jogos: number
  v: number
  e: number
  d: number
  gp: number
  gc: number
  sg: number
  pontos: number
}

function computeClassificacao(rodadas: RodadaLC[], timesMap: Record<string, Time>): RowClass[] {
  const map = new Map<UUID, RowClass>()

  const ensure = (id: UUID) => {
    if (!map.has(id)) {
      const t = timesMap[id]
      map.set(id, {
        id_time: id,
        nome: t?.nome || '—',
        logo_url: t?.logo_url || null,
        jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pontos: 0
      })
    }
    return map.get(id)!
  }

  for (const r of rodadas) {
    for (const j of r.jogos) {
      const mid = getMandanteId(j)
      const vid = getVisitanteId(j)
      if (!mid || !vid) continue
      if (j.gols_mandante == null || j.gols_visitante == null) continue

      const M = ensure(mid)
      const V = ensure(vid)

      M.jogos += 1
      V.jogos += 1
      M.gp += j.gols_mandante
      M.gc += j.gols_visitante
      V.gp += j.gols_visitante
      V.gc += j.gols_mandante

      if (j.gols_mandante > j.gols_visitante) { M.v++; M.pontos += 3; V.d++ }
      else if (j.gols_mandante < j.gols_visitante) { V.v++; V.pontos += 3; M.d++ }
      else { M.e++; V.e++; M.pontos++; V.pontos++ }
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

/** ========== Página ========== */
export default function LigaCopa() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [rodadas, setRodadas] = useState<RodadaLC[]>([])
  const [filtroRodada, setFiltroRodada] = useState<number | ''>('')
  const [mostrarClassificacao, setMostrarClassificacao] = useState(false)

  // edição inline (igual ao Jogos)
  const [editRodadaId, setEditRodadaId] = useState<UUID | null>(null)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [gM, setGM] = useState<number>(0)
  const [gV, setGV] = useState<number>(0)
  const [salvando, setSalvando] = useState(false)
  const [gerando, setGerando] = useState(false)

  /** Carregar Times (para nomes/logos) */
  const loadTimes = async () => {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url')
    if (error) {
      console.error(error)
      return
    }
    const map: Record<string, Time> = {}
    for (const t of (data || [])) map[t.id] = t as Time
    setTimesMap(map)
  }

  /** Carregar Rodadas Liga-Copa */
  const loadRodadas = async () => {
    const { data, error } = await supabase
      .from('liga_copa_rodadas')
      .select('id, numero, jogos, created_at')
      .order('numero', { ascending: true })

    if (error) {
      console.warn('Erro ao buscar liga_copa_rodadas', error)
      setRodadas([])
      return
    }
    setRodadas((data as any as RodadaLC[]) || [])
  }

  useEffect(() => {
    loadTimes()
    loadRodadas()
  }, [])

  /** Gerar/Resetar via API (admin) */
  const gerarViaAPI = async () => {
    if (!isAdmin) return
    setGerando(true)
    const id = 'gera-lc'
    try {
      toast.loading('Gerando confrontos da Liga-Copa…', { id })
      const res = await fetch('/api/liga-copa/gerar', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Erro ${res.status}`)
      await loadRodadas()
      toast.success(`✅ Rodadas geradas (${json.rodadas})`, { id })
    } catch (e: any) {
      console.error(e)
      toast.error(`❌ ${e?.message || 'Falha ao gerar rodadas'}`, { id })
    } finally {
      setGerando(false)
    }
  }

  /** Salvar PRIMEIRO lançamento (Liga-Copa: só grava placar e marca flag) */
  const salvarPrimeiroLancamento = async (rodadaId: UUID, index: number, gm: number, gv: number) => {
    if (salvando) return
    setSalvando(true)
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()

      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: JogoLC[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }

      // grava placar e marca “bonus_pago” como feito (apenas semântica de 1º lançamento)
      jogo.gols_mandante = Number.isFinite(gm) ? Number(gm) : 0
      jogo.gols_visitante = Number.isFinite(gv) ? Number(gv) : 0
      jogo.bonus_pago = true

      lista[index] = jogo
      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)

      if (updErr) throw updErr

      setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: lista } : r))
      toast.success('✅ Placar salvo!')
      setEditRodadaId(null); setEditIndex(null)
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar placar')
    } finally {
      setSalvando(false)
    }
  }

  /** Salvar AJUSTE (sem “repetir bônus”) */
  const salvarAjuste = async (rodadaId: UUID, index: number, gm: number, gv: number) => {
    if (salvando) return
    setSalvando(true)
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()

      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: JogoLC[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }
      jogo.gols_mandante = Number.isFinite(gm) ? Number(gm) : 0
      jogo.gols_visitante = Number.isFinite(gv) ? Number(gv) : 0
      jogo.bonus_pago = true // mantém true

      lista[index] = jogo
      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)

      if (updErr) throw updErr

      setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: lista } : r))
      toast.success('✏️ Resultado ajustado!')
      setEditRodadaId(null); setEditIndex(null)
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao ajustar placar')
    } finally {
      setSalvando(false)
    }
  }

  /** Excluir resultado (apenas limpar campos) */
  const excluirResultado = async (rodadaId: UUID, index: number) => {
    if (!confirm('Deseja excluir o resultado deste jogo?')) return
    try {
      const { data, error } = await supabase
        .from('liga_copa_rodadas')
        .select('jogos')
        .eq('id', rodadaId)
        .maybeSingle()

      if (error || !data) throw new Error('Rodada não encontrada')

      const lista: JogoLC[] = [...(data.jogos || [])]
      const jogo = { ...(lista[index] || {}) }
      delete jogo.gols_mandante
      delete jogo.gols_visitante
      jogo.bonus_pago = false
      lista[index] = jogo

      const { error: updErr } = await supabase
        .from('liga_copa_rodadas')
        .update({ jogos: lista })
        .eq('id', rodadaId)
      if (updErr) throw updErr

      setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: lista } : r))
      toast.success('🗑️ Resultado removido.')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover resultado')
    }
  }

  /** Filtro por rodada */
  const rodadasFiltradas = useMemo(() => {
    if (filtroRodada === '') return rodadas
    return rodadas.filter(r => r.numero === filtroRodada)
  }, [rodadas, filtroRodada])

  /** Contagem global (do filtro atual) */
  const feitosGlobais = useMemo(
    () => rodadasFiltradas.reduce((acc, r) => acc + resumoRodada(r).feitos, 0),
    [rodadasFiltradas]
  )
  const totalGlobais = useMemo(
    () => rodadasFiltradas.reduce((acc, r) => acc + r.jogos.length, 0),
    [rodadasFiltradas]
  )

  const classificacao = useMemo(
    () => computeClassificacao(rodadas, timesMap),
    [rodadas, timesMap]
  )

  if (loadingAdmin) return <p className="text-center text-white mt-6">🔄 Verificando permissões…</p>

  return (
    <div className="relative min-h-screen pb-12">
      {/* glows de fundo */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      {/* Cabeçalho */}
      <header className="max-w-7xl mx-auto px-6 pt-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          🏟️ Liga-Copa • Turno Único (D1–D3)
        </h1>
        <p className="text-sm text-white/60 mt-1">
          Confrontos em turno único entre todos os times das Divisões 1, 2 e 3.
        </p>
      </header>

      {/* Painel de filtros (sticky) */}
      <div className="sticky top-0 z-10 mt-4 bg-gradient-to-b from-black/60 to-transparent backdrop-blur px-6 py-3 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
          {/* Filtro por rodada */}
          <div className="inline-flex items-center gap-2">
            <label className="text-white/70 text-sm">Rodada:</label>
            <select
              value={filtroRodada}
              onChange={(e) => setFiltroRodada(e.target.value === '' ? '' : Number(e.target.value))}
              className="p-2 bg-white/5 border border-white/10 text-white rounded-lg"
            >
              <option value="">Todas</option>
              {rodadas.map(r => (
                <option key={r.id} value={r.numero}>Rodada {r.numero}</option>
              ))}
            </select>
          </div>

          {/* Toggle classificação */}
          <button
            onClick={() => setMostrarClassificacao(v => !v)}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
            title={mostrarClassificacao ? 'Ocultar classificação' : 'Mostrar classificação'}
          >
            {mostrarClassificacao ? 'Ocultar Classificação' : 'Mostrar Classificação'}
          </button>

          {/* Resumo */}
          <span className="ml-auto text-xs md:text-sm px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80">
            {feitosGlobais}/{totalGlobais} jogos com placar {filtroRodada ? `(Rodada ${filtroRodada})` : ''}
          </span>

          {/* Botão de gerar (admin) */}
          {isAdmin && (
            <button
              onClick={gerarViaAPI}
              disabled={gerando}
              className={`ml-2 px-4 py-2 rounded-xl font-semibold border ${
                gerando ? 'bg-gray-700 border-white/10 text-white/70'
                        : 'bg-emerald-600 border-emerald-500/50 text-black hover:bg-emerald-500'
              }`}
              title="Gera/Reseta todas as rodadas da Liga-Copa via API"
            >
              {gerando ? 'Processando…' : '⚙️ Gerar Rodadas'}
            </button>
          )}
        </div>
      </div>

      {/* Classificação (opcional) */}
      {mostrarClassificacao && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
            <table className="min-w-full text-sm">
              <thead className="bg-black/60 text-emerald-300">
                <tr>
                  <th className="py-3 px-3 text-left">#</th>
                  <th className="py-3 px-3 text-left">Time</th>
                  <th className="py-3 px-2 text-center">Pts</th>
                  <th className="py-3 px-2 text-center">J</th>
                  <th className="py-3 px-2 text-center">V</th>
                  <th className="py-3 px-2 text-center">E</th>
                  <th className="py-3 px-2 text-center">D</th>
                  <th className="py-3 px-2 text-center">GP</th>
                  <th className="py-3 px-2 text-center">GC</th>
                  <th className="py-3 px-2 text-center">SG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {classificacao.map((row, i) => (
                  <tr key={row.id_time} className="hover:bg-white/5 transition">
                    <td className="py-2.5 px-3">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {row.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.logo_url} alt="" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                        ) : (
                          <span className="h-6 w-6 grid place-items-center rounded-full bg-gray-700 text-[10px] ring-1 ring-white/10">
                            {row.nome.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium">{row.nome}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-yellow-300">{row.pontos}</td>
                    <td className="py-2.5 px-2 text-center">{row.jogos}</td>
                    <td className="py-2.5 px-2 text-center">{row.v}</td>
                    <td className="py-2.5 px-2 text-center">{row.e}</td>
                    <td className="py-2.5 px-2 text-center">{row.d}</td>
                    <td className="py-2.5 px-2 text-center">{row.gp}</td>
                    <td className="py-2.5 px-2 text-center">{row.gc}</td>
                    <td className="py-2.5 px-2 text-center">{row.sg}</td>
                  </tr>
                ))}
                {classificacao.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-white/60">Sem jogos finalizados ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de rodadas (layout igual “Jogos”) */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        {rodadasFiltradas.map((rodada) => {
          const { feitos, total } = resumoRodada(rodada)
          return (
            <section key={rodada.id} className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold text-white">🏁 Rodada {rodada.numero}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/70">
                  {feitos}/{total} com placar
                </span>
              </div>

              <div className="space-y-2">
                {rodada.jogos.map((jogo, idx) => {
                  const mId = getMandanteId(jogo)
                  const vId = getVisitanteId(jogo)
                  const mand = timesMap[mId || '']
                  const vist = timesMap[vId || '']

                  const editando = editRodadaId === rodada.id && editIndex === idx
                  const temPlacar = isPlacar(jogo)
                  const gm = jogo.gols_mandante ?? 0
                  const gv = jogo.gols_visitante ?? 0

                  return (
                    <article
                      key={idx}
                      className={`rounded-2xl border px-4 py-3 transition
                        ${temPlacar ? 'border-emerald-700/40 bg-emerald-500/[0.06]'
                                     : 'border-white/10 bg-white/5 hover:bg-white/7'}
                      `}
                    >
                      <div className="grid grid-cols-12 items-center gap-2">
                        {/* Mandante */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-end gap-2">
                          {mand?.logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mand.logo_url} alt="logo" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                          )}
                          <span className="font-medium text-right truncate">{mand?.nome || '—'}</span>
                        </div>

                        {/* Placar */}
                        <div className="col-span-2 md:col-span-4 text-center">
                          {editando ? (
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="number"
                                defaultValue={gm}
                                onChange={(e) => setGM(Number(e.target.value))}
                                className="w-12 text-black text-center rounded-lg px-2 py-1"
                                placeholder="0" min={0}
                              />
                              <span className="text-white/70 font-semibold">x</span>
                              <input
                                type="number"
                                defaultValue={gv}
                                onChange={(e) => setGV(Number(e.target.value))}
                                className="w-12 text-black text-center rounded-lg px-2 py-1"
                                placeholder="0" min={0}
                              />
                            </div>
                          ) : temPlacar ? (
                            <span className="text-lg md:text-xl font-extrabold tracking-tight text-white">
                              {gm} <span className="text-white/60">x</span> {gv}
                            </span>
                          ) : (
                            <span className="text-white/50">🆚</span>
                          )}
                        </div>

                        {/* Visitante + ações */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-start gap-2">
                          <span className="font-medium text-left truncate">{vist?.nome || '—'}</span>
                          {vist?.logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={vist.logo_url} alt="logo" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                          )}

                          {/* Ações (somente admin) */}
                          {isAdmin && !editando && (
                            <div className="flex gap-2 ml-2">
                              <button
                                onClick={() => {
                                  setEditRodadaId(rodada.id)
                                  setEditIndex(idx)
                                  setGM(gm); setGV(gv)
                                  if (jogo.bonus_pago) {
                                    toast('Modo ajuste: edite e salve sem repetir bônus.', { icon: '✏️' })
                                  }
                                }}
                                className="text-sm text-yellow-300 hover:text-yellow-200"
                                title={jogo.bonus_pago ? 'Editar (ajuste, sem repetir bônus)' : 'Editar (primeiro lançamento)'}
                              >
                                📝
                              </button>

                              {temPlacar && (
                                <button
                                  onClick={() => excluirResultado(rodada.id, idx)}
                                  className="text-sm text-red-400 hover:text-red-300"
                                  title="Remover resultado"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}

                          {isAdmin && editando && (
                            <div className="flex gap-2 ml-2">
                              {!jogo.bonus_pago ? (
                                <button
                                  onClick={() => salvarPrimeiroLancamento(rodada.id, idx, Number(gM), Number(gV))}
                                  disabled={salvando}
                                  className="text-sm text-green-400 font-semibold hover:text-green-300"
                                  title="Salvar (primeiro lançamento)"
                                >
                                  💾
                                </button>
                              ) : (
                                <button
                                  onClick={() => salvarAjuste(rodada.id, idx, Number(gM), Number(gV))}
                                  disabled={salvando}
                                  className="text-sm text-green-400 font-semibold hover:text-green-300"
                                  title="Salvar ajuste (sem repetir bônus)"
                                >
                                  ✅
                                </button>
                              )}
                              <button
                                onClick={() => { setEditRodadaId(null); setEditIndex(null) }}
                                className="text-sm text-red-400 font-semibold hover:text-red-300"
                                title="Cancelar edição"
                              >
                                ❌
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rodapé do jogo (data) */}
                      {jogo?.data_iso && (
                        <div className="mt-1 text-right text-[11px] text-white/60">
                          {new Date(jogo.data_iso).toLocaleString('pt-BR', {
                            weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}

        {rodadasFiltradas.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 px-4 md:px-6 py-10 text-center text-gray-400 mt-6">
            Nenhuma rodada encontrada. {isAdmin ? 'Use "Gerar Rodadas".' : 'Aguarde a geração pelos administradores.'}
          </div>
        )}
      </div>
    </div>
  )
}


