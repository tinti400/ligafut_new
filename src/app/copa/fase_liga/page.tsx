'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import { FiRotateCcw, FiSave, FiTrash2, FiTarget } from 'react-icons/fi'

/** === Supabase === */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** === Temporada atual (escopo de edição) === */
const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || '2025-26'

/** =================== Tipos =================== */
type Jogo = {
  id: number
  rodada: number
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
  temporada?: string | null
}
type TimeMini = { nome: string; logo_url: string }
type TimeFull = {
  id: string
  nome: string
  logo_url: string
  pote?: number | null
  overall?: number | null
  valor?: number | null
  associacao?: string | null
}

/** =================== Financeiro =================== */
const TAXA_POR_JOGO = 10_000_000
const BONUS_VITORIA = 15_000_000
const BONUS_EMPATE = 7_500_000
const BONUS_DERROTA = 5_000_000
const PREMIO_GOL_MARCADO = 800_000
const PENALIDADE_GOL_SOFRIDO = 160_000

/** =================== Swiss Config =================== */
const ROUNDS = 8
const ADVERSARIOS_POR_POTE = 2 // total 8 (2 de cada pote)
const CASA_MAX = 4
const FORA_MAX = 4

/** =================== Utils =================== */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))
const keyPair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))

/** atribui potes por prioridade: já existente > overall desc > valor desc */
function atribuirPotes(times: TimeFull[]): Record<string, number> {
  const temPote = times.some(t => (t.pote ?? 0) >= 1 && (t.pote ?? 0) <= 4)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => { out[t.id] = Math.max(1, Math.min(4, Math.floor(t.pote || 1))) })
    return out
  }
  const ordenados = [...times].sort((a, b) => {
    const oa = a.overall ?? 0, ob = b.overall ?? 0
    if (ob !== oa) return ob - oa
    const va = a.valor ?? 0, vb = b.valor ?? 0
    return vb - va
  })
  const n = ordenados.length
  const q = Math.max(1, Math.floor(n / 4))
  const out: Record<string, number> = {}
  ordenados.forEach((t, idx) => {
    const pote = Math.min(4, Math.floor(idx / q) + 1)
    out[t.id] = pote
  })
  return out
}

type CalendarioItem = { rodada: number; casa: string; fora: string }

/** =============== Gerador Champions Swiss (8 rodadas) =============== */
function gerarChampionsSwiss(
  participantes: TimeFull[],
  evitarMesmoPais = true
): CalendarioItem[] {
  // Excluir Palmeiras
  let teams = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))
  const N = teams.length
  if (N < 2) return []

  const BYE = '__BYE__'
  if (N % 2 === 1) {
    teams = [...teams, { id: BYE, nome: 'BYE', logo_url: '' } as TimeFull]
  }

  const ids = teams.map(t => t.id)
  const byId: Record<string, TimeFull> = {}
  teams.forEach(t => { byId[t.id] = t })

  const potes = atribuirPotes(teams.filter(t => t.id !== BYE))
  const needPot: Record<string, Record<number, number>> = {}
  const remMatches: Record<string, number> = {}
  const homeCnt: Record<string, number> = {}
  const awayCnt: Record<string, number> = {}
  const playedPairs: Set<string> = new Set()

  ids.forEach(id => {
    if (id === BYE) return
    needPot[id] = { 1: ADVERSARIOS_POR_POTE, 2: ADVERSARIOS_POR_POTE, 3: ADVERSARIOS_POR_POTE, 4: ADVERSARIOS_POR_POTE }
    remMatches[id] = ROUNDS
    homeCnt[id] = 0
    awayCnt[id] = 0
  })

  const calendario: CalendarioItem[] = []

  for (let rodada = 1; rodada <= ROUNDS; rodada++) {
    const disponiveis = new Set(ids)

    // Se há BYE, um time “folga” nesta rodada
    if (ids.includes(BYE)) {
      const candidatos = Array.from(disponiveis).filter(id => id !== BYE && remMatches[id] > 0)
      if (candidatos.length) {
        const a = candidatos.sort((x, y) => remMatches[y] - remMatches[x])[0]
        // Não insere jogo com BYE no calendário, apenas consome uma rodada do time
        disponiveis.delete(BYE)
        disponiveis.delete(a)
        remMatches[a] -= 1
      } else {
        disponiveis.delete(BYE)
      }
    }

    const scoreTeam = (id: string) => {
      if (id === BYE) return -1
      const np = needPot[id]
      const needScore = (np?.[1] ?? 0) + (np?.[2] ?? 0) + (np?.[3] ?? 0) + (np?.[4] ?? 0)
      const mandoScore = (CASA_MAX - homeCnt[id]) + (FORA_MAX - awayCnt[id])
      return (remMatches[id] ?? 0) * 10 + needScore * 2 + mandoScore
    }

    while (true) {
      const livres = Array.from(disponiveis).filter(id => id !== BYE && remMatches[id] > 0)
      if (livres.length < 2) break
      livres.sort((a, b) => scoreTeam(b) - scoreTeam(a))
      const a = livres[0]

      const candAll = livres.slice(1).filter(b => !playedPairs.has(keyPair(a, b)))
      const potA = potes[a] ?? 4

      const escolher = () => {
        const trySet = (mutuo: boolean, pais: boolean, mando: boolean) => {
          let C = [...candAll].filter(b => remMatches[b] > 0)
          if (mutuo) C = C.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0 && (needPot[b][potA] ?? 0) > 0)
          else C = C.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0)
          if (pais && byId[a]?.associacao) {
            const pa = byId[a].associacao
            const alt = C.filter(b => byId[b]?.associacao !== pa)
            if (alt.length) C = alt
          }
          if (mando) {
            C.sort((b1, b2) => {
              const score = (x: string) => {
                const sAHome = CASA_MAX - homeCnt[a]
                const sAAway = FORA_MAX - awayCnt[a]
                const sXHome = CASA_MAX - homeCnt[x]
                const sXAway = FORA_MAX - awayCnt[x]
                const mandoOk = (sAHome > 0 && sXAway > 0) || (sAAway > 0 && sXHome > 0) ? 2 : 0
                const needSum = (needPot[a][potes[x] ?? 4] ?? 0) + (needPot[x][potA] ?? 0)
                return mandoOk + needSum
              }
              return score(b2) - score(b1)
            })
          }
          return C[0]
        }
        return (
          trySet(true, true, true) ??
          trySet(true, true, false) ??
          trySet(true, false, false) ??
          trySet(false, true, true) ??
          trySet(false, false, false) ??
          candAll[0]
        )
      }

      const b = escolher()
      if (!b) { disponiveis.delete(a); continue }

      // Decide mando (balanceando 4/4)
      let casa = a, fora = b
      if (homeCnt[a] >= CASA_MAX && awayCnt[a] < FORA_MAX) { casa = b; fora = a }
      else if (homeCnt[b] >= CASA_MAX && awayCnt[b] < FORA_MAX) { casa = a; fora = b }
      else {
        const sobraAHome = CASA_MAX - homeCnt[a], sobraAAway = FORA_MAX - awayCnt[a]
        const sobraBHome = CASA_MAX - homeCnt[b], sobraBAway = FORA_MAX - awayCnt[b]
        if (sobraBHome > sobraAHome && sobraAAway > 0) { casa = b; fora = a }
      }

      calendario.push({ rodada, casa, fora })
      playedPairs.add(keyPair(a, b))
      disponiveis.delete(a)
      disponiveis.delete(b)
      homeCnt[casa] += 1
      awayCnt[fora] += 1
      remMatches[a] -= 1
      remMatches[b] -= 1

      // consome necessidades de pote
      const pa = potes[a] ?? 4
      const pb = potes[b] ?? 4
      if (needPot[a]) needPot[a][pb] = Math.max(0, (needPot[a][pb] ?? 0) - 1)
      if (needPot[b]) needPot[b][pa] = Math.max(0, (needPot[b][pa] ?? 0) - 1)
    }
  }

  // remove jogos com BYE (não são inseridos)
  return calendario.filter(m => m.casa !== '__BYE__' && m.fora !== '__BYE__')
}

/** =================== Modal =================== */
function ModalConfirm({
  open, title, message, confirmText = 'Confirmar', cancelText = 'Cancelar',
  danger = false, onConfirm, onClose
}: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="mb-2 text-xl font-bold text-yellow-400">{title}</h3>
        <p className="mb-6 text-zinc-200">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

/** =================== Página =================== */
export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [fullTimes, setFullTimes] = useState<Record<string, TimeFull>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [abrirModalSwiss, setAbrirModalSwiss] = useState(false)
  const [evitarMesmoPais, setEvitarMesmoPais] = useState(true)
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    Promise.all([buscarTimes(), buscarJogos()]).finally(() => setLoading(false))
  }, [])

  async function buscarJogos() {
    const { data, error } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .eq('temporada', TEMPORADA)         // <-- filtra pela temporada
      .order('rodada', { ascending: true })
      .order('id', { ascending: true })
    if (error) { toast.error('Erro ao buscar jogos'); return }
    setJogos((data || []) as Jogo[])
    const ids = uniq((data || []).flatMap((j: any) => [j.time1, j.time2]).filter(Boolean))
    await ensureTimesInMap(ids)
  }

  async function buscarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url, pote, overall, valor, associacao')
    if (error) { toast.error('Erro ao buscar times'); return }
    const mini: Record<string, TimeMini> = {}
    const full: Record<string, TimeFull> = {}
    ;(data || []).forEach((t: any) => {
      mini[t.id] = { nome: t.nome, logo_url: t.logo_url }
      full[t.id] = t as TimeFull
    })
    setTimesMap(mini)
    setFullTimes(full)
  }

  async function ensureTimesInMap(ids: string[]) {
    const faltantes = ids.filter(id => !timesMap[id])
    if (!faltantes.length) return
    const { data } = await supabase.from('times').select('id, nome, logo_url').in('id', faltantes)
    const novo: Record<string, TimeMini> = { ...timesMap }
    ;(data || []).forEach((t: any) => { novo[t.id] = { nome: t.nome, logo_url: t.logo_url } })
    setTimesMap(novo)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) { console.error(error); toast.error('Erro ao atualizar classificação!') }
  }

  /** ======== Gerar Fase Champions (modelo suíço) ======== */
  async function gerarSwiss() {
    if (!isAdmin) { toast.error('Apenas admin pode gerar a fase.'); return }
    setGerando(true)
    try {
      // participantes: prioriza ids já existentes da temporada; senão, todos de `times`
      const { data: existentes } = await supabase
        .from('copa_fase_liga')
        .select('time1, time2')
        .eq('temporada', TEMPORADA)

      const setIds = new Set<string>()
      if (existentes && existentes.length > 0) {
        existentes.forEach((j: any) => { if (j.time1) setIds.add(j.time1); if (j.time2) setIds.add(j.time2) })
      } else {
        Object.keys(fullTimes).forEach(id => setIds.add(id))
      }

      let participantes = Array.from(setIds).map(id => fullTimes[id]).filter(Boolean)
      participantes = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))

      if (participantes.length < 2) { toast.error('Participantes insuficientes.'); setGerando(false); return }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)

      // limpa SOMENTE a temporada atual
      const { error: erroDel } = await supabase
        .from('copa_fase_liga')
        .delete()
        .eq('temporada', TEMPORADA)
      if (erroDel) { toast.error('Erro ao limpar jogos da temporada.'); setGerando(false); return }

      // insere novos jogos desta temporada (rodadas 1..8)
      const rows = calendario.map(j => ({
        temporada: TEMPORADA,
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false
      }))
      if (rows.length) {
        const BATCH = 1000
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH)
          const { error: erroIns } = await supabase.from('copa_fase_liga').insert(chunk)
          if (erroIns) { toast.error('Erro ao inserir confrontos.'); setGerando(false); return }
        }
      }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([{
        tipo_evento: 'Sistema',
        descricao: `Fase Liga (modelo suíço) gerada para ${TEMPORADA}. Corte: 1–8 Oitavas, 9–24 Play-off. Palmeiras excluído.`,
        valor: null
      }])

      toast.success('✅ Fase Champions gerada com 8 rodadas!')
    } finally {
      setGerando(false)
    }
  }

  /** ======== Salvar placar + pagamentos ======== */
  async function salvarPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)

    const { data: existente, error: erroVer } = await supabase
      .from('copa_fase_liga')
      .select('bonus_pago')
      .eq('id', jogo.id)
      .single()
    if (erroVer) { toast.error('Erro ao verificar status do jogo'); setSalvandoId(null); return }
    if (existente?.bonus_pago) { toast.error('❌ Pagamento já efetuado para esse jogo!'); setSalvandoId(null); return }

    const { error: erroPlacar } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 })
      .eq('id', jogo.id)
    if (erroPlacar) { toast.error('Erro ao salvar placar!'); setSalvandoId(null); return }

    await atualizarClassificacao()

    const { error: erroPago } = await supabase
      .from('copa_fase_liga')
      .update({ bonus_pago: true })
      .eq('id', jogo.id)
    if (erroPago) { toast.error('Erro ao travar pagamento!'); setSalvandoId(null); return }

    // cálculo financeiro
    const time1Id = jogo.time1
    const time2Id = jogo.time2
    const g1 = jogo.gols_time1 ?? 0
    const g2 = jogo.gols_time2 ?? 0

    let bonus1 = BONUS_EMPATE
    let bonus2 = BONUS_EMPATE
    if (g1 > g2) { bonus1 = BONUS_VITORIA; bonus2 = BONUS_DERROTA }
    else if (g2 > g1) { bonus1 = BONUS_DERROTA; bonus2 = BONUS_VITORIA }

    const total1 = TAXA_POR_JOGO + bonus1 + (g1 * PREMIO_GOL_MARCADO) - (g2 * PENALIDADE_GOL_SOFRIDO)
    const total2 = TAXA_POR_JOGO + bonus2 + (g2 * PREMIO_GOL_MARCADO) - (g1 * PENALIDADE_GOL_SOFRIDO)

    const { error: erroSaldo1 } = await supabase.rpc('atualizar_saldo', { id_time: time1Id, valor: total1 })
    if (erroSaldo1) toast.error('Erro ao atualizar saldo do time 1')
    const { error: erroSaldo2 } = await supabase.rpc('atualizar_saldo', { id_time: time2Id, valor: total2 })
    if (erroSaldo2) toast.error('Erro ao atualizar saldo do time 2')

    await registrarMovimentacao({ id_time: time1Id, tipo: 'entrada', valor: total1, descricao: `Fase Liga (suíço): ${g1}x${g2}` })
    await registrarMovimentacao({ id_time: time2Id, tipo: 'entrada', valor: total2, descricao: `Fase Liga (suíço): ${g2}x${g1}` })

    const n1 = timesMap[time1Id]?.nome ?? 'Time 1'
    const n2 = timesMap[time2Id]?.nome ?? 'Time 2'
    let tag = '🤝 Empate'
    if (g1 > g2) tag = `🏆 Vitória de ${n1}`
    else if (g2 > g1) tag = `🏆 Vitória de ${n2}`

    await supabase.from('bid').insert([{
      tipo_evento: 'Jogo',
      descricao: `${n1} ${g1}x${g2} ${n2} — ${tag} • 💰 Taxa por jogo: R$ ${TAXA_POR_JOGO.toLocaleString('pt-BR')}.`,
      id_time1: time1Id,
      id_time2: time2Id,
      valor: null
    }])

    toast.success('✅ Placar salvo e pagamentos efetuados!')
    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)
    const { error } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: null, gols_time2: null, bonus_pago: false })
      .eq('id', jogo.id)
    if (error) toast.error('Erro ao excluir resultado!')
    else {
      await atualizarClassificacao()
      toast.success('🗑️ Resultado excluído!')
      await buscarJogos()
    }
    setSalvandoId(null)
  }

  // ====== UI derivado ======
  const jogosFiltrados = useMemo(() => {
    return jogos.filter(
      (j) =>
        filtroTime === 'Todos' ||
        timesMap[j.time1]?.nome === filtroTime ||
        timesMap[j.time2]?.nome === filtroTime
    )
  }, [jogos, filtroTime, timesMap])

  const jogosPorRodada: Record<number, Jogo[]> = useMemo(() => {
    const map: Record<number, Jogo[]> = {}
    jogosFiltrados.forEach((j) => {
      if (!map[j.rodada]) map[j.rodada] = []
      map[j.rodada].push(j)
    })
    return map
  }, [jogosFiltrados])

  const nomesDosTimes = useMemo(
    () => Object.values(timesMap).map((t) => t.nome).sort(),
    [timesMap]
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-white">
      <div className="mx-auto max-w-7xl p-4">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div>
            <h1 className="text-center text-3xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
                UEFA Champions — Fase Liga (modelo suíço) • {TEMPORADA}
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Corte: <span className="text-green-400 font-semibold">1–8 Oitavas</span>,{' '}
              <span className="text-sky-400 font-semibold">9–24 Play-off</span>.
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={evitarMesmoPais}
                  onChange={(e) => setEvitarMesmoPais(e.target.checked)}
                />
                <FiTarget /> Evitar mesmo país
              </label>
              <button
                onClick={() => setAbrirModalSwiss(true)}
                disabled={gerando}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-60"
                title="Apaga jogos da temporada atual e cria 8 rodadas novas"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Gerar Fase Champions (8 rodadas)'}
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <label className="text-sm text-zinc-300">Filtrar por time:</label>
          <select
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="Todos">Todos</option>
            {nomesDosTimes.map((nome) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>
        </div>

        {/* Lista de Rodadas (1..8) */}
        {loading ? (
          <div className="py-10 text-center text-zinc-300">🔄 Carregando jogos...</div>
        ) : (
          Object.entries(jogosPorRodada).map(([rodada, lista]) => (
            <div key={rodada} className="mb-8">
              <h2 className="mb-3 text-xl font-bold text-green-400">📅 Rodada {rodada}</h2>
              <div className="grid gap-3">
                {lista.map((jogo) => (
                  <div
                    key={jogo.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow hover:border-zinc-700"
                  >
                    {/* Time 1 */}
                    <div className="flex min-w-[200px] items-center gap-3">
                      <img
                        src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                        alt={timesMap[jogo.time1]?.nome || ''}
                        className="h-10 w-10 rounded-full border bg-white object-cover"
                      />
                      <span className="font-semibold">{timesMap[jogo.time1]?.nome || jogo.time1}</span>
                    </div>

                    {/* Placar */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="h-10 w-14 rounded-md border border-zinc-700 bg-zinc-950 text-center text-lg font-bold text-white"
                        placeholder="0"
                        value={jogo.gols_time1 ?? ''}
                        onChange={(e) => {
                          const valor = clampInt(parseInt(e.target.value || '0', 10))
                          setJogos((prev) => prev.map((j) => (j.id === jogo.id ? { ...j, gols_time1: valor } : j)))
                        }}
                        disabled={!isAdmin}
                      />
                      <span className="px-2 text-xl font-extrabold">x</span>
                      <input
                        type="number"
                        className="h-10 w-14 rounded-md border border-zinc-700 bg-zinc-950 text-center text-lg font-bold text-white"
                        placeholder="0"
                        value={jogo.gols_time2 ?? ''}
                        onChange={(e) => {
                          const valor = clampInt(parseInt(e.target.value || '0', 10))
                          setJogos((prev) => prev.map((j) => (j.id === jogo.id ? { ...j, gols_time2: valor } : j)))
                        }}
                        disabled={!isAdmin}
                      />
                    </div>

                    {/* Time 2 */}
                    <div className="flex min-w-[200px] items-center justify-end gap-3">
                      <span className="font-semibold">{timesMap[jogo.time2]?.nome || jogo.time2}</span>
                      <img
                        src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                        alt={timesMap[jogo.time2]?.nome || ''}
                        className="h-10 w-10 rounded-full border bg-white object-cover"
                      />
                    </div>

                    {/* Ações */}
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          onClick={() => salvarPlacar(jogo)}
                          disabled={salvandoId === jogo.id}
                          title="Salvar placar e pagar bônus"
                        >
                          <FiSave />
                          {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          onClick={() => excluirPlacar(jogo)}
                          disabled={salvandoId === jogo.id}
                          title="Zerar placar deste jogo"
                        >
                          <FiTrash2 />
                          {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal geração suíço */}
      <ModalConfirm
        open={abrirModalSwiss}
        danger
        title="Gerar Fase Champions (8 rodadas)?"
        message={`Isso apaga TODOS os jogos da temporada "${TEMPORADA}" e cria exatamente 8 rodadas (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio.`}
        confirmText={gerando ? 'Gerando...' : 'Sim, gerar'}
        cancelText="Cancelar"
        onConfirm={gerarSwiss}
        onClose={() => setAbrirModalSwiss(false)}
      />
    </div>
  )
}
