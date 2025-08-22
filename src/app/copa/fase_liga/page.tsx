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

/** Atribui potes: já existente > overall desc > valor desc */
function atribuirPotes(times: TimeFull[]): Record<string, number> {
  const temPote = times.some(t => (t.pote ?? 0) >= 1 && (t.pote ?? 0) <= 4)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => { out[t.id] = Math.max(1, Math.min(4, Math.floor(t.pote || 1))) })
    return out
  }
  const ord = [...times].sort((a, b) => {
    const oa = a.overall ?? 0, ob = b.overall ?? 0
    if (ob !== oa) return ob - oa
    const va = a.valor ?? 0, vb = b.valor ?? 0
    return vb - va
  })
  const n = ord.length
  const q = Math.max(1, Math.floor(n / 4))
  const out: Record<string, number> = {}
  ord.forEach((t, i) => { out[t.id] = Math.min(4, Math.floor(i / q) + 1) })
  return out
}

type CalendarioItem = { rodada: number; casa: string; fora: string }

/** ====== Gerador Champions Swiss (8 rodadas, sem BYE) ======
 * - 8 rodadas
 * - 2 adversários de cada pote por time (relaxa se faltar pares)
 * - 4 casa / 4 fora (best-effort)
 * - Evitar mesmo país (opcional, best-effort)
 * Pré-condição: número de participantes PAR.
 */
function gerarChampionsSwiss(
  participantes: TimeFull[],
  evitarMesmoPais = true
): CalendarioItem[] {
  const ids = participantes.map(t => t.id)
  const N = ids.length
  if (N < 2 || N % 2 === 1) return [] // deve ser par

  const byId: Record<string, TimeFull> = {}
  participantes.forEach(t => { byId[t.id] = t })
  const potes = atribuirPotes(participantes)

  const needPot: Record<string, Record<number, number>> = {}
  const homeCnt: Record<string, number> = {}
  const awayCnt: Record<string, number> = {}
  const playedPairs: Set<string> = new Set()
  const jogosRestantes: Record<string, number> = {}

  ids.forEach(id => {
    needPot[id] = { 1: ADVERSARIOS_POR_POTE, 2: ADVERSARIOS_POR_POTE, 3: ADVERSARIOS_POR_POTE, 4: ADVERSARIOS_POR_POTE }
    homeCnt[id] = 0
    awayCnt[id] = 0
    jogosRestantes[id] = ROUNDS
  })

  const calendario: CalendarioItem[] = []

  for (let rodada = 1; rodada <= ROUNDS; rodada++) {
    const livres = new Set(ids)

    const scoreTeam = (id: string) => {
      const np = needPot[id]
      const needScore = (np[1] + np[2] + np[3] + np[4])
      const mandoScore = (CASA_MAX - homeCnt[id]) + (FORA_MAX - awayCnt[id])
      return jogosRestantes[id] * 10 + needScore * 2 + mandoScore
    }

    while (livres.size >= 2) {
      const arr = Array.from(livres).sort((a, b) => scoreTeam(b) - scoreTeam(a))
      const a = arr[0]

      // Candidatos para b
      let cand = arr.slice(1).filter(b => !playedPairs.has(keyPair(a, b)))

      // filtro de pote necessário
      const potA = potes[a] ?? 4
      let L = cand.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0 && (needPot[b][potA] ?? 0) > 0)

      if (evitarMesmoPais && byId[a]?.associacao) {
        const pa = byId[a].associacao
        const alt = L.filter(b => byId[b]?.associacao !== pa)
        if (alt.length) L = alt
      }
      if (!L.length) {
        L = cand.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0)
        if (evitarMesmoPais && byId[a]?.associacao) {
          const pa = byId[a].associacao
          const alt = L.filter(b => byId[b]?.associacao !== pa)
          if (alt.length) L = alt
        }
      }
      if (!L.length) L = cand // relaxa totalmente

      // balancear mando
      L.sort((b1, b2) => {
        const sobraAHome = CASA_MAX - homeCnt[a], sobraAAway = FORA_MAX - awayCnt[a]
        const s1H = CASA_MAX - homeCnt[b1], s1A = FORA_MAX - awayCnt[b1]
        const s2H = CASA_MAX - homeCnt[b2], s2A = FORA_MAX - awayCnt[b2]
        const mandoOK1 = (sobraAHome > 0 && s1A > 0) || (sobraAAway > 0 && s1H > 0) ? 1 : 0
        const mandoOK2 = (sobraAHome > 0 && s2A > 0) || (sobraAAway > 0 && s2H > 0) ? 1 : 0
        const needSum1 = (needPot[a][potes[b1] ?? 4] ?? 0) + (needPot[b1][potA] ?? 0)
        const needSum2 = (needPot[a][potes[b2] ?? 4] ?? 0) + (needPot[b2][potA] ?? 0)
        return (mandoOK2 - mandoOK1) || (needSum2 - needSum1)
      })

      const b = L[0]
      if (!b) { livres.delete(a); continue }

      // decide mando
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
      livres.delete(a); livres.delete(b)
      homeCnt[casa] += 1; awayCnt[fora] += 1
      jogosRestantes[a] -= 1; jogosRestantes[b] -= 1

      // consome necessidades
      const pa = potes[a] ?? 4, pb = potes[b] ?? 4
      needPot[a][pb] = Math.max(0, needPot[a][pb] - 1)
      needPot[b][pa] = Math.max(0, needPot[b][pa] - 1)
    }
  }

  return calendario
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
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [abrirModalSwiss, setAbrirModalSwiss] = useState(false)
  const [evitarMesmoPais, setEvitarMesmoPais] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [temColunaTemporada, setTemColunaTemporada] = useState<boolean>(true)

  useEffect(() => {
    Promise.all([detectarColunaTemporada(), buscarJogos(), carregarTimesBase()]).finally(() => setLoading(false))
  }, [])

  async function detectarColunaTemporada() {
    const { error } = await supabase.from('copa_fase_liga').select('id, temporada').limit(1)
    setTemColunaTemporada(!error)
  }

  async function carregarTimesBase() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url')
    if (error) return
    const novo: Record<string, TimeMini> = {}
    ;(data || []).forEach((t: any) => { novo[t.id] = { nome: t.nome, logo_url: t.logo_url } })
    setTimesMap(novo)
  }

  async function buscarJogos() {
    let q = supabase.from('copa_fase_liga').select('*')
    if (temColunaTemporada) q = q.eq('temporada', TEMPORADA)
    const { data, error } = await q.order('rodada', { ascending: true }).order('id', { ascending: true })
    if (error) { toast.error('Erro ao buscar jogos'); return }
    setJogos((data || []) as Jogo[])
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
      // carrega participantes DIRETO do banco (não depende de estado)
      const { data: timesData, error: errTimes } = await supabase
        .from('times')
        .select('id, nome, logo_url, pote, overall, valor, associacao')
      if (errTimes) { toast.error('Erro ao carregar times'); return }

      // exclui Palmeiras
      let participantes: TimeFull[] = (timesData || []).filter(
        (t: any) => !((t.nome || '').toLowerCase().includes('palmeiras'))
      ) as TimeFull[]

      // garante número PAR
      if (participantes.length % 2 === 1) {
        const ord = [...participantes].sort((a, b) => {
          const oa = a.overall ?? 0, ob = b.overall ?? 0
          if (oa !== ob) return oa - ob // remove o mais fraco
          const va = a.valor ?? 0, vb = b.valor ?? 0
          return va - vb
        })
        const removido = ord[0]
        participantes = participantes.filter(t => t.id !== removido.id)
        toast('Participantes ímpares: removi 1 clube para manter par.', { icon: 'ℹ️' })
        await supabase.from('bid').insert([{
          tipo_evento: 'Sistema',
          descricao: `Ajuste de paridade: ${removido.nome} removido da fase liga para manter número par de participantes.`,
          valor: null
        }])
      }

      if (participantes.length < 2) { toast.error('Participantes insuficientes.'); return }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)
      const totalJogos = calendario.length
      if (!totalJogos) { toast.error('Falha ao gerar calendário.'); return }

      // limpa jogos (somente temporada se existir a coluna)
      if (temColunaTemporada) {
        const { error: delErr } = await supabase.from('copa_fase_liga').delete().eq('temporada', TEMPORADA)
        if (delErr) { toast.error('Erro ao limpar jogos da temporada.'); return }
      } else {
        const { error: delErr } = await supabase.from('copa_fase_liga').delete().neq('id', -1)
        if (delErr) { toast.error('Erro ao limpar tabela de jogos.'); return }
      }

      // monta inserts
      const rows = calendario.map(j => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false
      }))

      // insere em lotes
      const BATCH = 1000
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH)
        const { error: insErr } = await supabase.from('copa_fase_liga').insert(chunk)
        if (insErr) { toast.error('Erro ao inserir confrontos.'); return }
      }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([{
        tipo_evento: 'Sistema',
        descricao: `Fase Liga (modelo suíço) gerada ${temColunaTemporada ? `para ${TEMPORADA}` : '(sem coluna de temporada)'}. Corte: 1–8 Oitavas, 9–24 Play-off. Palmeiras excluído.`,
        valor: null
      }])

      toast.success(`✅ Gerado com sucesso: ${totalJogos} jogos em 8 rodadas!`)
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
                UEFA Champions — Fase Liga (modelo suíço){temColunaTemporada ? ` • ${TEMPORADA}` : ''}
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
                title="Gera 8 rodadas no modelo suíço"
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
        message={`Isso apaga os jogos ${temColunaTemporada ? `da temporada "${TEMPORADA}"` : 'atuais'} e cria exatamente 8 rodadas (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio.`}
        confirmText={gerando ? 'Gerando...' : 'Sim, gerar'}
        cancelText="Cancelar"
        onConfirm={gerarSwiss}
        onClose={() => setAbrirModalSwiss(false)}
      />
    </div>
  )
}
