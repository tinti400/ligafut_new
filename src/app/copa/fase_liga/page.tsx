'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import { FiRotateCcw, FiSave, FiTrash2, FiTarget } from 'react-icons/fi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** =================== Tipos =================== */
type Jogo = {
  id: number
  rodada: number
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
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

/** =============== Gerador Champions Swiss ===============
 * Regras fortes:
 * - 8 rodadas
 * - 1 jogo por time em cada rodada (se número de participantes for ímpar, haverá 1 bye por rodada)
 * - 2 adversários de cada pote por time (relaxa se necessário)
 * - 4 mandos casa / 4 fora (relaxa se necessário)
 * - evitar mesmo país (opcional, best-effort)
 */
function gerarChampionsSwiss(
  participantes: TimeFull[],
  evitarMesmoPais = true
): CalendarioItem[] {
  let teams = [...participantes]

  // ===== Excluir Palmeiras do sorteio =====
  teams = teams.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))

  const N = teams.length
  if (N < 2) return []

  // BYE se ímpar
  const BYE = '__BYE__'
  if (N % 2 === 1) {
    teams.push({
      id: BYE,
      nome: 'BYE',
      logo_url: '',
    } as TimeFull)
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
    // disponíveis (não podem ter jogo duplicado na mesma rodada)
    const disponiveis = new Set(ids)

    // se existir BYE, sempre emparelha alguém com BYE
    if (ids.includes(BYE)) {
      // prioriza o que ainda tem mais jogos remanescentes
      const candidatos = Array.from(disponiveis).filter(id => id !== BYE && remMatches[id] > 0)
      if (candidatos.length) {
        const a = candidatos.sort((x, y) => remMatches[y] - remMatches[x])[0]
        // a folga nessa rodada
        calendario.push({ rodada, casa: BYE, fora: a })
        disponiveis.delete(BYE)
        disponiveis.delete(a)
        remMatches[a] -= 1
        // BYE não conta para casa/fora/potes
      } else {
        // se não encontrou, só remove BYE da rodada
        disponiveis.delete(BYE)
      }
    }

    // tentar parear todos os restantes
    // estratégia: ordenar por "maior necessidade" (soma de needPot + balanceamento de mando)
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

      // Candidatos b
      const candAll = livres.slice(1).filter(b => !playedPairs.has(keyPair(a, b)))

      const candFilt = (mutuo: boolean, respeitaPais: boolean, respeitaMando: boolean) => {
        let C = [...candAll]

        // pote alvo: prefere quem satisfaz necessidade
        const potA = potes[a] ?? 4
        C = C.filter(b => remMatches[b] > 0)
        if (mutuo) {
          C = C.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0 && (needPot[b][potA] ?? 0) > 0)
        } else {
          C = C.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0)
        }

        if (respeitaPais && byId[a]?.associacao && C.length) {
          const pa = byId[a].associacao
          const alt = C.filter(b => byId[b]?.associacao !== pa)
          if (alt.length) C = alt
        }

        // balancear mando
        if (respeitaMando && C.length) {
          C.sort((b1, b2) => {
            const sobraAHome = CASA_MAX - homeCnt[a]
            const sobraAAway = FORA_MAX - awayCnt[a]
            const sobraB1Home = CASA_MAX - homeCnt[b1]
            const sobraB1Away = FORA_MAX - awayCnt[b1]
            const sobraB2Home = CASA_MAX - homeCnt[b2]
            const sobraB2Away = FORA_MAX - awayCnt[b2]
            const mandoOK1 = (sobraAHome > 0 && sobraB1Away > 0) || (sobraAAway > 0 && sobraB1Home > 0) ? 1 : 0
            const mandoOK2 = (sobraAHome > 0 && sobraB2Away > 0) || (sobraAAway > 0 && sobraB2Home > 0) ? 1 : 0
            const needSum1 = (needPot[a][potes[b1] ?? 4] ?? 0) + (needPot[b1][potA] ?? 0)
            const needSum2 = (needPot[a][potes[b2] ?? 4] ?? 0) + (needPot[b2][potA] ?? 0)
            return (mandoOK2 - mandoOK1) || (needSum2 - needSum1)
          })
        }
        return C
      }

      let b =
        candFilt(true, evitarMesmoPais, true)[0] ?? // mutuo+pais+mando
        candFilt(true, evitarMesmoPais, false)[0] ?? // mutuo+pais
        candFilt(true, false, false)[0] ??           // mutuo
        candFilt(false, evitarMesmoPais, true)[0] ?? // so A precisa +pais+mando
        candFilt(false, false, false)[0] ??          // so A precisa
        candAll[0]                                   // qualquer

      if (!b) {
        // não achou parceiro para 'a' nesta rodada; remove 'a' para não travar
        disponiveis.delete(a)
        continue
      }

      // decidir mando
      let casa = a, fora = b
      if (homeCnt[a] >= CASA_MAX && awayCnt[a] < FORA_MAX) { casa = b; fora = a }
      else if (homeCnt[b] >= CASA_MAX && awayCnt[b] < FORA_MAX) { casa = a; fora = b }
      else {
        // prefere quem tem mais "sobra" de mando
        const sobraAHome = CASA_MAX - homeCnt[a]
        const sobraAAway = FORA_MAX - awayCnt[a]
        const sobraBHome = CASA_MAX - homeCnt[b]
        const sobraBAway = FORA_MAX - awayCnt[b]
        if (sobraBHome > sobraAHome && sobraAAway > 0) { casa = b; fora = a }
      }

      // aplica pareamento
      calendario.push({ rodada, casa, fora })
      playedPairs.add(keyPair(a, b))
      disponiveis.delete(a)
      disponiveis.delete(b)
      if (casa !== BYE) { homeCnt[casa] += 1; remMatches[casa] -= 1 }
      if (fora !== BYE) { awayCnt[fora] += 1; remMatches[fora] -= 1 }

      // consome necessidades de pote (se ambos não forem BYE)
      if (a !== BYE && b !== BYE) {
        const pa = potes[a] ?? 4
        const pb = potes[b] ?? 4
        needPot[a][pb] = Math.max(0, (needPot[a][pb] ?? 0) - 1)
        needPot[b][pa] = Math.max(0, (needPot[b][pa] ?? 0) - 1)
      }
    }
  }

  // garante que NÃO criou mais de 1 jogo por rodada por time
  // (o algoritmo já garante, pois pareia dentro de cada rodada com set de disponíveis)
  // e que o total de rodadas é exatamente 8 (ROUNDS)

  // remove partidas com BYE (apenas marcam folga, não inserimos no banco)
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
      .order('rodada', { ascending: true })
      .order('id', { ascending: true })
    if (error) {
      toast.error('Erro ao buscar jogos')
      return
    }
    setJogos((data || []) as Jogo[])
    // garante nomes: baixa qualquer id que não esteja no map
    const ids = uniq((data || []).flatMap((j: any) => [j.time1, j.time2]).filter(Boolean))
    await ensureTimesInMap(ids)
  }

  async function buscarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url, pote, overall, valor, associacao')
    if (error) {
      toast.error('Erro ao buscar times')
      return
    }
    const mini: Record<string, TimeMini> = {}
    const full: Record<string, TimeFull> = {}
    ;(data || []).forEach((t: any) => {
      mini[t.id] = { nome: t.nome, logo_url: t.logo_url }
      full[t.id] = t as TimeFull
    })
    setTimesMap(mini)
    setFullTimes(full)
  }

  /** Busca nomes para IDs que não estão no map (evita mostrar UUID na UI) */
  async function ensureTimesInMap(ids: string[]) {
    const faltantes = ids.filter(id => !timesMap[id])
    if (!faltantes.length) return
    const { data } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .in('id', faltantes)
    const novo: Record<string, TimeMini> = { ...timesMap }
    ;(data || []).forEach((t: any) => {
      novo[t.id] = { nome: t.nome, logo_url: t.logo_url }
    })
    setTimesMap(novo)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) {
      console.error('RPC atualizar_classificacao_copa error:', error)
      toast.error('Erro ao atualizar classificação!')
    }
  }

  /** ======== Gerar Fase Champions (modelo suíço) ======== */
  async function gerarSwiss() {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar a fase.')
      return
    }
    setGerando(true)
    try {
      // participantes: se a tabela já existe, usa ela; senão, usa todos os times
      const { data: existentes } = await supabase.from('copa_fase_liga').select('time1, time2')
      const setIds = new Set<string>()
      if (existentes && existentes.length > 0) {
        existentes.forEach((j: any) => { if (j.time1) setIds.add(j.time1); if (j.time2) setIds.add(j.time2) })
      } else {
        Object.keys(fullTimes).forEach(id => setIds.add(id))
      }
      // monta array de TimeFull (completos)
      let participantes = Array.from(setIds).map(id => fullTimes[id]).filter(Boolean)

      // EXCLUI Palmeiras pelo nome
      participantes = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))

      if (participantes.length < 2) {
        toast.error('Participantes insuficientes (após excluir Palmeiras).')
        setGerando(false)
        return
      }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)

      // limpa jogos antigos
      const { error: erroDel } = await supabase.from('copa_fase_liga').delete().neq('id', -1)
      if (erroDel) {
        toast.error('Erro ao limpar tabela de jogos.')
        setGerando(false)
        return
      }

      // insere novos jogos
      const rows = calendario.map(j => ({
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
          if (erroIns) {
            toast.error('Erro ao inserir confrontos.')
            setGerando(false)
            return
          }
        }
      }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([{
        tipo_evento: 'Sistema',
        descricao: 'Fase Liga (modelo suíço) gerada no formato UEFA Champions 24/25. Corte: 1–8 Oitavas, 9–24 Play-off. Palmeiras excluído do sorteio.',
        valor: null
      }])

      toast.success('✅ Fase Champions (suíço) gerada com 8 rodadas!')
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
                UEFA Champions — Fase Liga (modelo suíço)
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
                title="Apaga jogos atuais e cria NOVOS confrontos no modelo suíço"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Gerar Fase Champions (modelo suíço)'}
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

        {/* Lista de Rodadas */}
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
        title="Gerar Fase Champions (modelo suíço)?"
        message="Isso apaga TODOS os jogos atuais e cria exatamente 8 rodadas novas (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio."
        confirmText={gerando ? 'Gerando...' : 'Sim, gerar'}
        cancelText="Cancelar"
        onConfirm={gerarSwiss}
        onClose={() => setAbrirModalSwiss(false)}
      />
    </div>
  )
}
