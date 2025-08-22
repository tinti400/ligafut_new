'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import { FiRotateCcw, FiSave, FiTrash2, FiShuffle, FiTarget } from 'react-icons/fi'

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

/** =================== Constantes financeiras =================== */
const TAXA_POR_JOGO = 10_000_000
const BONUS_VITORIA = 15_000_000
const BONUS_EMPATE = 7_500_000
const BONUS_DERROTA = 5_000_000
const PREMIO_GOL_MARCADO = 800_000
const PENALIDADE_GOL_SOFRIDO = 160_000

/** =================== Utils =================== */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))
const keyPair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))
const rand = (n: number) => Math.floor(Math.random() * n)

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Divide em 4 potes (1..4) se não houver `pote` definido: por overall (fallback: valor) */
function atribuirPotes(times: TimeFull[]): Record<string, number> {
  const temPote = times.some(t => t.pote && t.pote >= 1 && t.pote <= 4)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => (out[t.id] = Math.max(1, Math.min(4, Math.floor(t.pote || 1)))))
    return out
  }
  // ordenar por overall desc, fallback por valor desc
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

/** =================== Gerador Champions (modelo suíço) ===================
 * Alvo por time:
 * - 8 partidas (rodadas 1..8)
 * - 2 adversários de cada pote (1..4)
 * - 4 em casa / 4 fora
 * Regras suaves:
 * - Evita duplicar confrontos
 * - Evita mesmo país se "evitarMesmoPais" estiver ON (best-effort)
 * - Fallback solta restrições caso falte pareamentos
 */
type CalendarioItem = { rodada: number; casa: string; fora: string }

function gerarChampionsSwiss(
  times: TimeFull[],
  evitarMesmoPais = true
): CalendarioItem[] {
  const ids = times.map(t => t.id)
  const N = ids.length
  if (N < 2) return []

  const porId: Record<string, TimeFull> = {}
  times.forEach(t => (porId[t.id] = t))

  const potes = atribuirPotes(times) // id -> 1..4

  // necessidades por time: 2 adversários de cada pote
  const need: Record<string, Record<number, number>> = {}
  ids.forEach(id => {
    need[id] = { 1: 2, 2: 2, 3: 2, 4: 2 }
  })

  // controle por rodada e por time
  const rounds = 8
  const homes: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const aways: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  const played: Set<string> = new Set()

  // sorteia ordem de trabalho para diversidade
  const order = shuffle(ids)

  const calendario: CalendarioItem[] = []
  for (let r = 1; r <= rounds; r++) {
    const disponiveis = new Set(order) // todos no início
    const tentativasMax = N * 5 // anti-loop
    let tentativas = 0

    while (disponiveis.size >= 2 && tentativas < tentativasMax) {
      tentativas++
      const arr = Array.from(disponiveis)
      const a = arr[rand(arr.length)]
      if (!a) break

      // candidatos b
      const cand = arr
        .filter(b => b !== a)
        .filter(b => !played.has(keyPair(a, b)))

      // filtros por necessidade mútua de potes
      const potA = potes[a]
      const escolher = () => {
        // 1) hard: ambos precisam do pote um do outro
        let L = shuffle(
          cand.filter(b => need[a][potes[b]] > 0 && need[b][potA] > 0)
        )

        // 2) se vazio, relaxa: a precisa do pote de b
        if (L.length === 0) {
          L = shuffle(cand.filter(b => need[a][potes[b]] > 0))
        }
        // 3) se vazio, qualquer
        if (L.length === 0) L = shuffle(cand)

        // evitar mesmo país (best-effort)
        if (evitarMesmoPais) {
          const lp = L.filter(b => porId[b]?.associacao && porId[b]?.associacao !== porId[a]?.associacao)
          if (lp.length) L = lp
        }

        // prefere opções que não estorem mandos
        L.sort((b1, b2) => {
          const score = (x: string) => {
            const sobraHomeA = 4 - homes[a]
            const sobraAwayA = 4 - aways[a]
            const sobraHomeX = 4 - homes[x]
            const sobraAwayX = 4 - aways[x]
            // mais necessidade -> maior score
            const needScore = Object.values(need[a]).reduce((s, v) => s + v, 0) +
              Object.values(need[x]).reduce((s, v) => s + v, 0)
            // favorece par que permite algum mando sem estourar
            const mandoOk = (sobraHomeA > 0 && sobraAwayX > 0) || (sobraAwayA > 0 && sobraHomeX > 0) ? 5 : 0
            return needScore + mandoOk
          }
          return score(b2) - score(b1)
        })

        return L[0]
      }

      const b = escolher()
      if (!b) {
        // não casou agora, tenta outro 'a'
        disponiveis.delete(a)
        continue
      }

      // decide mando sem ultrapassar 4/4 quando possível
      let casa = a, fora = b
      const preferirAEmCasa = homes[a] < 4 && aways[b] < 4
      const preferirBEmCasa = homes[b] < 4 && aways[a] < 4
      if (preferirBEmCasa && !preferirAEmCasa) {
        casa = b; fora = a
      }

      // aplica pareamento
      calendario.push({ rodada: r, casa, fora })
      played.add(keyPair(a, b))
      disponiveis.delete(a)
      disponiveis.delete(b)
      homes[casa] += 1
      aways[fora] += 1

      // consome necessidades
      need[a][potes[b]] = Math.max(0, (need[a][potes[b]] ?? 0) - 1)
      need[b][potes[a]] = Math.max(0, (need[b][potes[a]] ?? 0) - 1)
    }
  }

  // Passo de reparo: garante 8 jogos por time
  const jogosPorTime: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]))
  calendario.forEach(j => {
    jogosPorTime[j.casa]++
    jogosPorTime[j.fora]++
  })

  const faltantes = ids.filter(id => jogosPorTime[id] < 8)
  let rodadaExtra = 1
  for (const a of faltantes) {
    while (jogosPorTime[a] < 8) {
      const cand = ids
        .filter(b => b !== a)
        .filter(b => jogosPorTime[b] < 8)
        .filter(b => !played.has(keyPair(a, b)))
      if (cand.length === 0) break
      const b = cand[rand(cand.length)]
      const casa = homes[a] < 4 ? a : b
      const fora = casa === a ? b : a
      calendario.push({ rodada: Math.min(8, rodadaExtra++), casa, fora })
      played.add(keyPair(a, b))
      jogosPorTime[a]++
      jogosPorTime[b]++
      homes[casa]++
      aways[fora]++
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
  const [fullTimes, setFullTimes] = useState<Record<string, TimeFull>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  // geração
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
  }

  async function buscarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url, pote, overall, valor, associacao')
    if (error) {
      toast.error('Erro ao buscar times')
      return
    }

    const mapMini: Record<string, TimeMini> = {}
    const mapFull: Record<string, TimeFull> = {}
    ;(data || []).forEach((t: any) => {
      mapMini[t.id] = { nome: t.nome, logo_url: t.logo_url }
      mapFull[t.id] = t as TimeFull
    })
    setTimesMap(mapMini)
    setFullTimes(mapFull)
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
      // Detectar participantes: se já há tabela, usa ids dali; senão, usa todos de `times`
      const { data: existentes } = await supabase.from('copa_fase_liga').select('time1, time2')
      const participantesSet = new Set<string>()
      if (existentes && existentes.length > 0) {
        existentes.forEach((j: any) => {
          if (j.time1) participantesSet.add(j.time1)
          if (j.time2) participantesSet.add(j.time2)
        })
      } else {
        Object.keys(fullTimes).forEach(id => participantesSet.add(id))
      }

      const participantes = Array.from(participantesSet).map(id => fullTimes[id]).filter(Boolean)
      if (participantes.length < 2) {
        toast.error('Participantes insuficientes para gerar confrontos.')
        setGerando(false)
        return
      }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)

      // Limpa jogos antigos
      const { error: erroDelete } = await supabase.from('copa_fase_liga').delete().neq('id', -1)
      if (erroDelete) {
        toast.error('Erro ao limpar tabela de jogos.')
        setGerando(false)
        return
      }

      // Insere novos jogos
      const rows = calendario.map(j => ({
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false
      }))

      if (rows.length > 0) {
        const BATCH = 1000
        for (let i = 0; i < rows.length; i += BATCH) {
          const pedaço = rows.slice(i, i + BATCH)
          const { error: erroInsert } = await supabase.from('copa_fase_liga').insert(pedaço)
          if (erroInsert) {
            toast.error('Erro ao inserir novos confrontos.')
            setGerando(false)
            return
          }
        }
      }

      await atualizarClassificacao()

      await supabase.from('bid').insert([{
        tipo_evento: 'Sistema',
        descricao: 'Fase Liga (modelo suíço) gerada no formato UEFA Champions 24/25. Critérios: 1–8 Oitavas, 9–24 Play-off.',
        valor: null
      }])

      await buscarJogos()
      toast.success('✅ Fase Champions (suíço) gerada!')
    } finally {
      setGerando(false)
    }
  }

  /** ======== Salvar placar + pagamentos ======== */
  async function salvarPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)

    // trava de pagamento
    const { data: existente, error: erroVer } = await supabase
      .from('copa_fase_liga')
      .select('bonus_pago')
      .eq('id', jogo.id)
      .single()
    if (erroVer) {
      toast.error('Erro ao verificar status do jogo')
      setSalvandoId(null)
      return
    }
    if (existente?.bonus_pago) {
      toast.error('❌ Pagamento já efetuado para esse jogo!')
      setSalvandoId(null)
      return
    }

    // atualiza placar
    const { error: erroPlacar } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 })
      .eq('id', jogo.id)
    if (erroPlacar) {
      toast.error('Erro ao salvar placar!')
      setSalvandoId(null)
      return
    }

    await atualizarClassificacao()

    // marca como pago ANTES de creditar
    const { error: erroPago } = await supabase
      .from('copa_fase_liga')
      .update({ bonus_pago: true })
      .eq('id', jogo.id)
    if (erroPago) {
      toast.error('Erro ao travar pagamento!')
      setSalvandoId(null)
      return
    }

    // cálculo financeiro
    const time1Id = jogo.time1
    const time2Id = jogo.time2
    const g1 = jogo.gols_time1 ?? 0
    const g2 = jogo.gols_time2 ?? 0

    let bonus1 = BONUS_EMPATE
    let bonus2 = BONUS_EMPATE
    if (g1 > g2) { bonus1 = BONUS_VITORIA; bonus2 = BONUS_DERROTA }
    else if (g2 > g1) { bonus1 = BONUS_DERROTA; bonus2 = BONUS_VITORIA }

    const total1 =
      TAXA_POR_JOGO + bonus1 + (g1 * PREMIO_GOL_MARCADO) - (g2 * PENALIDADE_GOL_SOFRIDO)
    const total2 =
      TAXA_POR_JOGO + bonus2 + (g2 * PREMIO_GOL_MARCADO) - (g1 * PENALIDADE_GOL_SOFRIDO)

    // atualiza saldos
    const { error: erroSaldo1 } = await supabase.rpc('atualizar_saldo', { id_time: time1Id, valor: total1 })
    if (erroSaldo1) toast.error('Erro ao atualizar saldo do time 1')

    const { error: erroSaldo2 } = await supabase.rpc('atualizar_saldo', { id_time: time2Id, valor: total2 })
    if (erroSaldo2) toast.error('Erro ao atualizar saldo do time 2')

    // registra movimentações
    await registrarMovimentacao({
      id_time: time1Id,
      tipo: 'entrada',
      valor: total1,
      descricao: `Fase Liga (suíço): ${g1}x${g2}`
    })
    await registrarMovimentacao({
      id_time: time2Id,
      tipo: 'entrada',
      valor: total2,
      descricao: `Fase Liga (suíço): ${g2}x${g1}`
    })

    // BID
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

  // ====== Derivados para UI ======
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
              Linha de corte: <span className="text-green-400 font-semibold">1–8 Oitavas</span>,{' '}
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
        message="Isso apaga TODOS os jogos atuais e cria 8 rodadas novas no formato suíço (2 adversários por pote, 4 casa / 4 fora, sem confrontos repetidos)."
        confirmText={gerando ? 'Gerando...' : 'Sim, gerar'}
        cancelText="Cancelar"
        onConfirm={gerarSwiss}
        onClose={() => setAbrirModalSwiss(false)}
      />
    </div>
  )
}
