'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { FiRotateCcw, FiSave, FiTrash2, FiTarget, FiMinus, FiPlus, FiChevronDown, FiChevronUp } from 'react-icons/fi'

import {
  simulate,
  referencePrices,
  type Sector,
  type PriceMap,
  type EstadioContext,
  sectorProportion,
} from '@/utils/estadioEngine'

/* ================= SUPABASE & CONFIG ================= */
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || '2025-26'
const TABELA_GRUPOS = 'copa_fase_grupos'
const TABELA_MM = 'copa_mata_mata'

/* ================= TYPES ================= */
type Jogo = {
  id: number
  rodada: number
  grupo?: string | null
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
  temporada?: string | null

  renda?: number | null
  publico?: number | null
  receita_mandante?: number | null
  receita_visitante?: number | null
  salarios_mandante?: number | null
  salarios_visitante?: number | null
  premiacao_mandante?: number | null
  premiacao_visitante?: number | null
}

type TimeMini = { nome: string; logo_url: string; associacao?: string | null }
type TimeFull = {
  id: string
  nome: string
  logo_url: string
  pote?: number | null
  overall?: number | null
  valor?: number | null
  associacao?: string | null
  divisao?: string | number | null
}

/* ================= REGRAS FINANCEIRAS (COPA — PADRÃO) ================= */
const COPA_PARTICIPACAO_POR_JOGO = 3_000_000
const COPA_VITORIA = 8_000_000
const COPA_EMPATE = 4_000_000
const COPA_DERROTA = 2_500_000
const COPA_GOL_MARCADO = 400_000
const COPA_GOL_SOFRIDO = 40_000

/* ================= MODELOS ================= */
type CopaModel = 'champions_4x5_top4_oitavas' | 'div1_2grupos_top4_quartas'

const MODELOS: { id: CopaModel; label: string; desc: string }[] = [
  {
    id: 'champions_4x5_top4_oitavas',
    label: 'Champions (4 grupos de 5)',
    desc: 'DIV 1 + 2 • Top 4 de cada grupo • Oitavas',
  },
  {
    id: 'div1_2grupos_top4_quartas',
    label: '1ª Divisão (2 grupos)',
    desc: 'SÓ DIV 1 • 2 grupos (A/B) • Top 4 • Quartas',
  },
]

/* ================= HELPERS ================= */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** retry simples (reduz "perda de conexão" quando a rede oscila) */
async function withRetry<T>(fn: () => Promise<T>, tries = 3, waitMs = 450): Promise<T> {
  let lastErr: any
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      await new Promise(r => setTimeout(r, waitMs * (i + 1)))
    }
  }
  throw lastErr
}

/** Puxa times por divisões (divisao é TEXT no seu banco) */
async function safeSelectTimesByDivisoes(divisoes: string[], minimal = false) {
  const tries = minimal
    ? ['id,nome,logo_url,associacao,divisao', 'id,nome,logo_url,divisao', '*']
    : [
        'id,nome,logo_url,pote,overall,valor,associacao,divisao',
        'id,nome,logo_url,pote,overall,valor,associacao',
        'id,nome,logo_url,associacao,divisao',
        'id,nome,logo_url,divisao',
        '*',
      ]

  for (const s of tries) {
    const { data, error } = await withRetry(() => supabase.from('times').select(s).in('divisao', divisoes), 3, 350)
    if (!error && data) return data as any[]
  }
  return [] as any[]
}

/** Ordena “mais fracos” (pra cortar extras) */
function sortMaisFracosPrimeiro(a: TimeFull, b: TimeFull) {
  const oa = a.overall ?? 0
  const ob = b.overall ?? 0
  if (oa !== ob) return oa - ob
  return (a.valor ?? 0) - (b.valor ?? 0)
}

/** Round-robin genérico (N times). Se ímpar, adiciona BYE. */
function gerarRoundRobin(ids: string[]) {
  if (ids.length < 2) return []
  const BYE = '__BYE__'
  const list = [...ids]
  if (list.length % 2 === 1) list.push(BYE)

  const n = list.length
  const rounds = n - 1
  const half = n / 2

  let arr = [...list]
  const jogos: { rodada: number; casa: string; fora: string }[] = []

  for (let r = 1; r <= rounds; r++) {
    const left = arr.slice(0, half)
    const right = arr.slice(half).reverse()

    for (let i = 0; i < half; i++) {
      const a = left[i]
      const b = right[i]
      if (a === BYE || b === BYE) continue

      const casa = (r + i) % 2 === 0 ? a : b
      const fora = (r + i) % 2 === 0 ? b : a
      jogos.push({ rodada: r, casa, fora })
    }

    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop() as string)
    arr = [fixed, ...rest]
  }

  return jogos
}

/**
 * Champions: 4 grupos de 5
 * - 5 potes de 4 times
 * - cada grupo recebe 1 por pote
 */
function atribuirPotes5(times: TimeFull[]): Record<string, number> {
  const temPote = times.some(t => (t.pote ?? 0) >= 1 && (t.pote ?? 0) <= 5)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => {
      const p = Math.max(1, Math.min(5, Math.floor(t.pote || 1)))
      out[t.id] = p
    })
    return out
  }

  const ord = [...times].sort((a, b) => {
    const oa = a.overall ?? 0
    const ob = b.overall ?? 0
    if (ob !== oa) return ob - oa
    const va = a.valor ?? 0
    const vb = b.valor ?? 0
    return vb - va
  })

  const out: Record<string, number> = {}
  const n = ord.length
  const q = Math.max(1, Math.floor(n / 5))
  ord.forEach((t, i) => {
    out[t.id] = Math.min(5, Math.floor(i / q) + 1)
  })
  return out
}

type BadgeTone = 'zinc' | 'emerald' | 'sky' | 'violet' | 'amber'
function Badge({ tone = 'zinc', children }: { tone?: BadgeTone; children: ReactNode }) {
  const cls =
    {
      zinc: 'bg-white/5 text-zinc-200 border-white/10',
      emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
      violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
      amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    }[tone] || 'bg-white/5 text-zinc-200 border-white/10'

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${cls}`}>
      {children}
    </span>
  )
}

/* ================= PAGE ================= */
export default function FaseGruposPage() {
  const { isAdmin } = useAdmin()
  const topRef = useRef<HTMLDivElement | null>(null)

  const [modelo, setModelo] = useState<CopaModel>('div1_2grupos_top4_quartas')
  const [evitarMesmoPais, setEvitarMesmoPais] = useState(true)

  // flags (assumimos TRUE; se seu banco não tiver, o código trata erro sem derrubar)
  const [temColunaTemporada] = useState<boolean>(true)
  const [temColunaGrupo] = useState<boolean>(true)
  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  const cfg = useMemo(() => {
    if (modelo === 'div1_2grupos_top4_quartas') {
      return {
        title: 'Copa — 1ª Divisão',
        subtitle: '2 Grupos (A/B)',
        divisoes: ['1'],
        grupos: ['A', 'B'] as const,
        classificam: 4,
        mataMataFase: 'quartas' as const,
        mataMataLabel: 'Quartas',
      }
    }
    return {
      title: 'UEFA Champions — Fase de Grupos',
      subtitle: '4 Grupos (A–D)',
      divisoes: ['1', '2'],
      grupos: ['A', 'B', 'C', 'D'] as const,
      classificam: 4,
      mataMataFase: 'oitavas' as const,
      mataMataLabel: 'Oitavas',
    }
  }, [modelo])

  const GRUPOS = cfg.grupos
  const CLASSIFICAM_POR_GRUPO = cfg.classificam

  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [gerando, setGerando] = useState(false)
  const [gerandoMM, setGerandoMM] = useState(false)
  const [abrirModalMM, setAbrirModalMM] = useState(false)
  const [chavesMM, setChavesMM] = useState<{ casaId: string; foraId: string; label: string }[]>([])
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({})

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await Promise.all([carregarTimesBase(), buscarJogos(), detectarExtrasFinanceiros()])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelo])

  async function detectarExtrasFinanceiros() {
    // tenta uma vez, se falhar, desliga extras e segue (pra não “cair conexão” por erro)
    try {
      const { error } = await withRetry(
        () =>
          supabase
            .from(TABELA_GRUPOS)
            .select(
              'id,renda,publico,receita_mandante,receita_visitante,salarios_mandante,salarios_visitante,premiacao_mandante,premiacao_visitante'
            )
            .limit(1),
        2,
        300
      )
      setTemExtrasFinanceiros(!error)
    } catch {
      setTemExtrasFinanceiros(false)
    }
  }

  async function carregarTimesBase() {
    const rows = await safeSelectTimesByDivisoes(cfg.divisoes, true)
    const novo: Record<string, TimeMini> = {}
    rows.forEach((t: any) => {
      const nome = t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id)
      const logo = t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png'
      const associacao = t.associacao ?? t.pais ?? null
      novo[String(t.id)] = { nome, logo_url: logo, associacao }
    })
    setTimesMap(novo)
  }

  async function buscarJogos() {
    try {
      let q = supabase.from(TABELA_GRUPOS).select('*')
      if (temColunaTemporada) q = q.eq('temporada', TEMPORADA)

      const { data, error } = await withRetry(
        () => q.order('grupo', { ascending: true }).order('rodada', { ascending: true }).order('id', { ascending: true }),
        3,
        400
      )

      if (error) {
        console.error(error)
        toast.error('Erro ao buscar jogos')
        setJogos([])
        return
      }

      setJogos((data || []) as Jogo[])

      const chaves = new Set<string>()
      ;(data || []).forEach((j: any) => chaves.add((j.grupo ?? `Rodada ${j.rodada}`) as string))
      const first = Array.from(chaves).slice(0, 2)
      const obj: Record<string, boolean> = {}
      first.forEach(k => (obj[k] = true))
      setSecoesAbertas(obj)
    } catch (e) {
      console.error(e)
      toast.error('Falha de conexão ao buscar jogos')
      setJogos([])
    }
  }

  async function atualizarClassificacao() {
    try {
      const { error } = await withRetry(() => supabase.rpc('atualizar_classificacao_copa'), 2, 450)
      if (error) {
        console.error(error)
        toast.error('Erro ao atualizar classificação!')
      }
    } catch (e) {
      console.error(e)
      toast.error('Falha de conexão ao atualizar classificação')
    }
  }

  /* ===================== Estádio helpers ===================== */
  const asImportance = (s: any): 'normal' | 'decisao' | 'final' => (s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal')
  const asWeather = (s: any): 'bom' | 'chuva' => (s === 'chuva' ? 'chuva' : 'bom')
  const asDayType = (s: any): 'semana' | 'fim' => (s === 'fim' ? 'fim' : 'semana')
  const asDayTime = (s: any): 'dia' | 'noite' => (s === 'dia' ? 'dia' : 'noite')

  async function calcularPublicoERendaPeloEstadio(mandanteId: string): Promise<{ publico: number; renda: number; erro?: string }> {
    try {
      const { data: est, error } = await withRetry(
        () => supabase.from('estadios').select('*').eq('id_time', mandanteId).maybeSingle(),
        2,
        350
      )

      if (error || !est) {
        return {
          publico: Math.floor(Math.random() * 30000) + 10000,
          renda: (Math.floor(Math.random() * 30000) + 10000) * 80,
          erro: 'Estádio não encontrado (fallback).',
        }
      }

      const nivel = Number(est.nivel || 1)
      const capacidade = Number(est.capacidade || 18000)

      const ref = referencePrices(nivel)
      const prices: PriceMap = (Object.keys(sectorProportion) as Sector[]).reduce((acc, s) => {
        const col = `preco_${s}`
        const v = Number(est[col])
        acc[s] = Number.isFinite(v) && v > 0 ? Math.round(v) : ref[s]
        return acc
      }, {} as PriceMap)

      const ctx: EstadioContext = {
        importance: asImportance(est.ctx_importancia),
        derby: !!est.ctx_derby,
        weather: asWeather(est.ctx_clima),
        dayType: asDayType(est.ctx_dia),
        dayTime: asDayTime(est.ctx_horario),
        opponentStrength: Number.isFinite(Number(est.ctx_forca_adv)) ? Number(est.ctx_forca_adv) : 70,
        moraleTec: Number.isFinite(Number(est.ctx_moral_tec)) ? Number(est.ctx_moral_tec) : 7.5,
        moraleTor: Number.isFinite(Number(est.ctx_moral_tor)) ? Number(est.ctx_moral_tor) : 60,
        sociosPct: Number.isFinite(Number(est.socio_percentual)) ? Number(est.socio_percentual) : 15,
        sociosPreco: Number.isFinite(Number(est.socio_preco)) ? Number(est.socio_preco) : 25,
        infraScore: Number.isFinite(Number(est.infra_score)) ? Number(est.infra_score) : 55,
        level: nivel,
      }

      const sim = simulate(capacidade, prices, ctx)
      return { publico: Math.round(sim.totalAudience), renda: Math.round(sim.totalRevenue) }
    } catch {
      return {
        publico: Math.floor(Math.random() * 30000) + 10000,
        renda: (Math.floor(Math.random() * 30000) + 10000) * 80,
        erro: 'Falha de conexão (fallback).',
      }
    }
  }

  /* ===================== Salário / Elenco helpers ===================== */
  async function somarSalarios(timeId: string): Promise<number> {
    try {
      const { data } = await withRetry(() => supabase.from('elenco').select('salario').eq('id_time', timeId), 2, 350)
      if (!data) return 0
      return data.reduce((acc, j) => acc + (j.salario || 0), 0)
    } catch {
      return 0
    }
  }

  async function ajustarJogosElenco(timeId: string, delta: number) {
    try {
      const { data: jogadores } = await withRetry(
        () => supabase.from('elenco').select('id, jogos').eq('id_time', timeId),
        2,
        350
      )
      if (!jogadores) return
      // evita Promise.all gigante
      for (const j of jogadores) {
        await withRetry(() => supabase.from('elenco').update({ jogos: Math.max(0, (j.jogos || 0) + delta) }).eq('id', j.id), 2, 250)
      }
    } catch {}
  }

  async function descontarSalariosComRegistro(timeId: string): Promise<number> {
    const totalSalarios = await somarSalarios(timeId)
    if (!totalSalarios) return 0

    const agora = new Date().toISOString()
    try {
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: timeId, valor: -totalSalarios }), 2, 450)
      await withRetry(
        () =>
          supabase.from('movimentacoes').insert({
            id_time: timeId,
            tipo: 'salario',
            valor: totalSalarios,
            descricao: 'Desconto de salários após partida',
            data: agora,
          }),
        2,
        450
      )
      await withRetry(
        () =>
          supabase.from('bid').insert({
            tipo_evento: 'despesas',
            descricao: 'Desconto de salários após a partida',
            id_time1: timeId,
            valor: -totalSalarios,
            data_evento: agora,
          }),
        2,
        450
      )
    } catch {}
    return totalSalarios
  }

  /* ===================== Premiação (COPA — PADRÃO) ===================== */
  async function premiarPorJogoCopa(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
    const base = gols_pro > gols_contra ? COPA_VITORIA : gols_pro < gols_contra ? COPA_DERROTA : COPA_EMPATE
    const valor = Math.round(base + gols_pro * COPA_GOL_MARCADO - gols_contra * COPA_GOL_SOFRIDO)

    const agora = new Date().toISOString()
    try {
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: timeId, valor }), 2, 450)
      await withRetry(
        () =>
          supabase.from('movimentacoes').insert({
            id_time: timeId,
            tipo: 'premiacao',
            valor,
            descricao: 'Premiação por desempenho (COPA padrão)',
            data: agora,
          }),
        2,
        450
      )
      await withRetry(
        () =>
          supabase.from('bid').insert({
            tipo_evento: 'bonus',
            descricao: 'Bônus por desempenho (COPA padrão)',
            id_time1: timeId,
            valor,
            data_evento: agora,
          }),
        2,
        450
      )
    } catch {}
    return valor
  }

  /* ===================== GERAR GRUPOS + CALENDÁRIO ===================== */
  const gerarFaseGrupos = async () => {
    if (!isAdmin) return toast.error('Apenas admin pode gerar a fase.')

    setGerando(true)
    try {
      const rows = await safeSelectTimesByDivisoes(cfg.divisoes, false)

      let participantes: TimeFull[] = (rows || []).map((t: any) => ({
        id: String(t.id),
        nome: t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id),
        logo_url: t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png',
        pote: t.pote ?? t.pot ?? null,
        overall: t.overall ?? t.rating ?? null,
        valor: t.valor ?? t.value ?? null,
        associacao: t.associacao ?? t.pais ?? null,
        divisao: t.divisao ?? null,
      }))

      // ===== MODELO DIV1: 2 grupos
      if (modelo === 'div1_2grupos_top4_quartas') {
        if (participantes.length < 8) return toast.error('Preciso de pelo menos 8 times na 1ª divisão.')

        if (participantes.length % 2 === 1) {
          const ord = [...participantes].sort(sortMaisFracosPrimeiro)
          const removido = ord[0]
          participantes = participantes.filter(t => t.id !== removido.id)
          toast(`⚠️ Nº ímpar. Removi 1 mais fraco: ${removido.nome}`, { icon: 'ℹ️' })
        }

        const half = participantes.length / 2
        const embaralhados = shuffle(participantes)
        const grupos: Record<'A' | 'B', TimeFull[]> = {
          A: embaralhados.slice(0, half),
          B: embaralhados.slice(half),
        }

        const calendario: { grupo: string; rodada: number; casa: string; fora: string }[] = []
        ;(['A', 'B'] as const).forEach(g => {
          const ids = grupos[g].map(t => t.id)
          gerarRoundRobin(ids).forEach(j => calendario.push({ grupo: g, rodada: j.rodada, casa: j.casa, fora: j.fora }))
        })

        // limpa temporada
        await withRetry(() => supabase.from(TABELA_GRUPOS).delete().eq('temporada', TEMPORADA), 2, 500)

        const rowsInsert = calendario.map(j => ({
          temporada: TEMPORADA,
          grupo: j.grupo,
          rodada: j.rodada,
          time1: j.casa,
          time2: j.fora,
          gols_time1: null,
          gols_time2: null,
          bonus_pago: false,
        }))

        await withRetry(() => supabase.from(TABELA_GRUPOS).insert(rowsInsert), 2, 600)

        await atualizarClassificacao()
        await buscarJogos()
        toast.success(`✅ Copa DIV1 gerada: ${rowsInsert.length} jogos`)
        topRef.current?.scrollIntoView({ behavior: 'smooth' })
        return
      }

      // ===== CHAMPIONS: 4 grupos de 5 (20)
      const GRUPOS_CH = ['A', 'B', 'C', 'D'] as const
      const TIMES_POR_GRUPO = 5
      const TOTAL_TIMES = GRUPOS_CH.length * TIMES_POR_GRUPO

      if (participantes.length < TOTAL_TIMES) return toast.error(`Preciso de ${TOTAL_TIMES} times (DIV 1 + 2). Achei ${participantes.length}.`)

      if (participantes.length > TOTAL_TIMES) {
        const ord = [...participantes].sort(sortMaisFracosPrimeiro)
        const extras = ord.slice(0, participantes.length - TOTAL_TIMES)
        const extraIds = new Set(extras.map(e => e.id))
        participantes = participantes.filter(t => !extraIds.has(t.id))
        toast(`Removi ${extras.length} clubes mais fracos para fechar em 20.`, { icon: 'ℹ️' })
      }

      const potes = atribuirPotes5(participantes)
      const porPote: Record<number, TimeFull[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
      participantes.forEach(t => porPote[potes[t.id] ?? 5].push(t))
      ;(Object.keys(porPote) as any).forEach((p: any) => (porPote[Number(p)] = shuffle(porPote[Number(p)])))

      const tentativaMax = 250
      let grupos: Record<(typeof GRUPOS_CH)[number], TimeFull[]> | null = null

      for (let tentativa = 1; tentativa <= tentativaMax; tentativa++) {
        const p1 = shuffle(porPote[1])
        const p2 = shuffle(porPote[2])
        const p3 = shuffle(porPote[3])
        const p4 = shuffle(porPote[4])
        const p5 = shuffle(porPote[5])

        const gtmp: Record<(typeof GRUPOS_CH)[number], TimeFull[]> = { A: [], B: [], C: [], D: [] }
        GRUPOS_CH.forEach((g, idx) => gtmp[g].push(p1[idx], p2[idx], p3[idx], p4[idx], p5[idx]))

        if (!evitarMesmoPais) {
          grupos = gtmp
          break
        }

        const ok = GRUPOS_CH.every(g => {
          const ass = gtmp[g].map(t => t.associacao).filter(Boolean) as string[]
          return new Set(ass).size === ass.length
        })

        if (ok) {
          grupos = gtmp
          break
        }
      }

      if (!grupos) {
        grupos = { A: [], B: [], C: [], D: [] }
        const byPote: Record<number, TimeFull[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
        participantes.forEach(t => byPote[potes[t.id] ?? 5].push(t))
        ;(Object.keys(byPote) as any).forEach((k: any) => (byPote[Number(k)] = shuffle(byPote[Number(k)])))
        GRUPOS_CH.forEach((g, idx) => grupos![g].push(byPote[1][idx], byPote[2][idx], byPote[3][idx], byPote[4][idx], byPote[5][idx]))
      }

      const calendario: { grupo: string; rodada: number; casa: string; fora: string }[] = []
      GRUPOS_CH.forEach(g => {
        const ids = grupos![g].map(t => t.id)
        gerarRoundRobin(ids).forEach(j => calendario.push({ grupo: g, rodada: j.rodada, casa: j.casa, fora: j.fora }))
      })

      await withRetry(() => supabase.from(TABELA_GRUPOS).delete().eq('temporada', TEMPORADA), 2, 500)

      const rowsInsert = calendario.map(j => ({
        temporada: TEMPORADA,
        grupo: j.grupo,
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false,
      }))

      await withRetry(() => supabase.from(TABELA_GRUPOS).insert(rowsInsert), 2, 600)
      await atualizarClassificacao()
      await buscarJogos()
      toast.success(`✅ Champions gerada: ${rowsInsert.length} jogos`)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } catch (e: any) {
      console.error(e)
      toast.error('Falha ao gerar a fase (conexão oscilando). Tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  /* ===================== Salvar / Ajuste / Excluir ===================== */
  async function salvarAjusteResultado(jogo: Jogo, gm: number, gv: number, silencioso = false) {
    if (!isAdmin) return
    try {
      const { error } = await withRetry(
        () => supabase.from(TABELA_GRUPOS).update({ gols_time1: gm, gols_time2: gv, bonus_pago: true }).eq('id', jogo.id),
        2,
        500
      )
      if (error) throw error
      await atualizarClassificacao()
      await buscarJogos()
      if (!silencioso) toast.success('✏️ Resultado atualizado (sem repetir bônus).')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao ajustar placar (conexão).')
    }
  }

  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    setSalvandoId(jogo.id)

    try {
      const { data: existente, error: erroVer } = await withRetry(
        () => supabase.from(TABELA_GRUPOS).select('bonus_pago').eq('id', jogo.id).single(),
        2,
        450
      )
      if (erroVer) throw erroVer

      if (existente?.bonus_pago) {
        await salvarAjusteResultado(jogo, jogo.gols_time1 ?? 0, jogo.gols_time2 ?? 0, true)
        return
      }

      if (jogo.gols_time1 == null || jogo.gols_time2 == null) {
        toast.error('Preencha os gols antes de salvar.')
        return
      }

      const now = new Date().toISOString()
      const mandanteId = jogo.time1
      const visitanteId = jogo.time2

      const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
      if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })

      const publico = pr.publico
      const renda = pr.renda

      const receitaMandante = Math.round(renda * 0.95)
      const receitaVisitante = Math.round(renda * 0.05)

      // 1) receita de renda
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante }), 2, 500)
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante }), 2, 500)

      // 2) participação fixa
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: COPA_PARTICIPACAO_POR_JOGO }), 2, 500)
      await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: COPA_PARTICIPACAO_POR_JOGO }), 2, 500)

      // logs participação
      await withRetry(
        () =>
          supabase.from('movimentacoes').insert([
            {
              id_time: mandanteId,
              tipo: 'participacao_copa',
              valor: COPA_PARTICIPACAO_POR_JOGO,
              descricao: 'Participação fixa por jogo (COPA)',
              data: now,
            },
            {
              id_time: visitanteId,
              tipo: 'participacao_copa',
              valor: COPA_PARTICIPACAO_POR_JOGO,
              descricao: 'Participação fixa por jogo (COPA)',
              data: now,
            },
          ]),
        2,
        600
      )

      await withRetry(
        () =>
          supabase.from('bid').insert([
            {
              tipo_evento: 'bonus_participacao_copa',
              descricao: 'Participação fixa por jogo (COPA)',
              id_time1: mandanteId,
              valor: COPA_PARTICIPACAO_POR_JOGO,
              data_evento: now,
            },
            {
              tipo_evento: 'bonus_participacao_copa',
              descricao: 'Participação fixa por jogo (COPA)',
              id_time1: visitanteId,
              valor: COPA_PARTICIPACAO_POR_JOGO,
              data_evento: now,
            },
          ]),
        2,
        600
      )

      // 3) bônus desempenho
      const premiacaoMandanteDesempenho = await premiarPorJogoCopa(mandanteId, jogo.gols_time1, jogo.gols_time2)
      const premiacaoVisitanteDesempenho = await premiarPorJogoCopa(visitanteId, jogo.gols_time2, jogo.gols_time1)

      // 4) salários
      const salariosMandante = await descontarSalariosComRegistro(mandanteId)
      const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

      const totalPremMandante = premiacaoMandanteDesempenho + COPA_PARTICIPACAO_POR_JOGO
      const totalPremVisitante = premiacaoVisitanteDesempenho + COPA_PARTICIPACAO_POR_JOGO

      // 5) jogos no elenco
      await ajustarJogosElenco(mandanteId, +1)
      await ajustarJogosElenco(visitanteId, +1)

      // 6) salva jogo + extras
      const patchBase: any = { gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2, bonus_pago: true }
      const patchExtras: any = temExtrasFinanceiros
        ? {
            renda,
            publico,
            receita_mandante: receitaMandante,
            receita_visitante: receitaVisitante,
            salarios_mandante: salariosMandante,
            salarios_visitante: salariosVisitante,
            premiacao_mandante: totalPremMandante,
            premiacao_visitante: totalPremVisitante,
          }
        : {}

      const { error: erroPlacar } = await withRetry(
        () => supabase.from(TABELA_GRUPOS).update({ ...patchBase, ...patchExtras }).eq('id', jogo.id),
        2,
        650
      )
      if (erroPlacar) throw erroPlacar

      await atualizarClassificacao()
      await buscarJogos()

      const n1 = timesMap[mandanteId]?.nome ?? 'Mandante'
      const n2 = timesMap[visitanteId]?.nome ?? 'Visitante'

      toast.success(
        `✅ Placar salvo!
🎟️ Público: ${publico.toLocaleString()} | 💰 Renda: R$ ${renda.toLocaleString()}
💵 ${n1}: R$ ${(receitaMandante + totalPremMandante).toLocaleString('pt-BR')}
💵 ${n2}: R$ ${(receitaVisitante + totalPremVisitante).toLocaleString('pt-BR')}`,
        { duration: 7000 }
      )
    } catch (e) {
      console.error(e)
      toast.error('Falha ao salvar (perda de conexão). Tente de novo.')
    } finally {
      setSalvandoId(null)
    }
  }

  async function excluirPlacar(jogo: Jogo) {
    if (!isAdmin) return
    if (!window.confirm('Excluir resultado deste jogo? Estorno financeiro será aplicado.')) return
    setSalvandoId(jogo.id)

    const mandanteId = jogo.time1
    const visitanteId = jogo.time2
    const now = new Date().toISOString()

    try {
      if (jogo.bonus_pago) {
        const receitaMandante = jogo.receita_mandante ?? (jogo.renda ? Math.round(jogo.renda * 0.95) : 0)
        const receitaVisitante = jogo.receita_visitante ?? (jogo.renda ? Math.round(jogo.renda * 0.05) : 0)

        const salariosMandante = jogo.salarios_mandante ?? (await somarSalarios(mandanteId))
        const salariosVisitante = jogo.salarios_visitante ?? (await somarSalarios(visitanteId))

        const premiacaoMandante = jogo.premiacao_mandante ?? 0
        const premiacaoVisitante = jogo.premiacao_visitante ?? 0

        // estornos (sequencial, mais estável)
        if (receitaMandante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante }), 2, 450)
        if (receitaVisitante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante }), 2, 450)
        if (salariosMandante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }), 2, 450)
        if (salariosVisitante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }), 2, 450)
        if (premiacaoMandante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante }), 2, 450)
        if (premiacaoVisitante) await withRetry(() => supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante }), 2, 450)

        // logs
        const movs: any[] = []
        if (receitaMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_receita', valor: receitaMandante, descricao: 'Estorno receita de partida (COPA)', data: now })
        if (receitaVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_receita', valor: receitaVisitante, descricao: 'Estorno receita de partida (COPA)', data: now })
        if (salariosMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_salario', valor: salariosMandante, descricao: 'Estorno de salários (COPA)', data: now })
        if (salariosVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_salario', valor: salariosVisitante, descricao: 'Estorno de salários (COPA)', data: now })
        if (premiacaoMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_bonus_total', valor: premiacaoMandante, descricao: 'Estorno de bônus (COPA)', data: now })
        if (premiacaoVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_bonus_total', valor: premiacaoVisitante, descricao: 'Estorno de bônus (COPA)', data: now })
        if (movs.length) await withRetry(() => supabase.from('movimentacoes').insert(movs), 2, 650)

        await ajustarJogosElenco(mandanteId, -1)
        await ajustarJogosElenco(visitanteId, -1)
      }

      const patch: any = { gols_time1: null, gols_time2: null, bonus_pago: false }
      if (temExtrasFinanceiros) {
        Object.assign(patch, {
          renda: null,
          publico: null,
          receita_mandante: null,
          receita_visitante: null,
          salarios_mandante: null,
          salarios_visitante: null,
          premiacao_mandante: null,
          premiacao_visitante: null,
        })
      }

      const { error: erroLimpar } = await withRetry(() => supabase.from(TABELA_GRUPOS).update(patch).eq('id', jogo.id), 2, 650)
      if (erroLimpar) throw erroLimpar

      await atualizarClassificacao()
      await buscarJogos()
      toast.success('🗑️ Resultado removido e estorno concluído.')
    } catch (e) {
      console.error(e)
      toast.error('Falha ao excluir (conexão).')
    } finally {
      setSalvandoId(null)
    }
  }

  /* ===================== CLASSIFICAÇÃO (client-side) ===================== */
  type RowGrupo = { id: string; grupo: string; pts: number; j: number; v: number; e: number; d: number; gp: number; gc: number; sg: number }

  const classificacaoPorGrupo = useMemo(() => {
    const map: Record<string, Record<string, RowGrupo>> = {}
    const ensure = (grupo: string, id: string) => {
      map[grupo] ||= {}
      map[grupo][id] ||= { id, grupo, pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 }
      return map[grupo][id]
    }

    jogos.forEach(j => {
      const g = (j.grupo ?? 'A') as string
      ensure(g, j.time1)
      ensure(g, j.time2)

      if (j.gols_time1 == null || j.gols_time2 == null) return

      const a = map[g][j.time1]
      const b = map[g][j.time2]
      const ga = j.gols_time1
      const gb = j.gols_time2

      a.j++
      b.j++
      a.gp += ga
      a.gc += gb
      b.gp += gb
      b.gc += ga

      if (ga > gb) {
        a.v++
        b.d++
        a.pts += 3
      } else if (ga < gb) {
        b.v++
        a.d++
        b.pts += 3
      } else {
        a.e++
        b.e++
        a.pts += 1
        b.pts += 1
      }
    })

    const out: Record<string, RowGrupo[]> = {}
    Object.keys(map).forEach(grupo => {
      const rows = Object.values(map[grupo]).map(r => ({ ...r, sg: r.gp - r.gc }))
      rows.sort((x, y) => y.pts - x.pts || y.sg - x.sg || y.gp - x.gp)
      out[grupo] = rows
    })
    return out
  }, [jogos])

  /* ===================== GERAR MATA-MATA ===================== */
  async function gerarMataMata() {
    if (!isAdmin) return toast.error('Apenas admin pode gerar o mata-mata.')

    setGerandoMM(true)
    try {
      const gruposOk = (cfg.grupos as readonly string[]).every(g => (classificacaoPorGrupo[g]?.length ?? 0) >= CLASSIFICAM_POR_GRUPO)
      if (!gruposOk) return toast.error(`Preciso de pelo menos ${CLASSIFICAM_POR_GRUPO} times classificados em cada grupo.`)

      // montar chaves
      let chaves: { casaId: string; foraId: string; label: string }[] = []

      if (modelo === 'div1_2grupos_top4_quartas') {
        const A = classificacaoPorGrupo['A']
        const B = classificacaoPorGrupo['B']
        chaves = [
          { casaId: A[0].id, foraId: B[3].id, label: 'QF1 — A1 x B4' },
          { casaId: B[1].id, foraId: A[2].id, label: 'QF2 — B2 x A3' },
          { casaId: B[0].id, foraId: A[3].id, label: 'QF3 — B1 x A4' },
          { casaId: A[1].id, foraId: B[2].id, label: 'QF4 — A2 x B3' },
        ]
      } else {
        const A = classificacaoPorGrupo['A']
        const B = classificacaoPorGrupo['B']
        const C = classificacaoPorGrupo['C']
        const D = classificacaoPorGrupo['D']
        chaves = [
          { casaId: A[0].id, foraId: B[3].id, label: 'OIT1 — A1 x B4' },
          { casaId: B[1].id, foraId: A[2].id, label: 'OIT2 — B2 x A3' },
          { casaId: B[0].id, foraId: A[3].id, label: 'OIT3 — B1 x A4' },
          { casaId: A[1].id, foraId: B[2].id, label: 'OIT4 — A2 x B3' },
          { casaId: C[0].id, foraId: D[3].id, label: 'OIT5 — C1 x D4' },
          { casaId: D[1].id, foraId: C[2].id, label: 'OIT6 — D2 x C3' },
          { casaId: D[0].id, foraId: C[3].id, label: 'OIT7 — D1 x C4' },
          { casaId: C[1].id, foraId: D[2].id, label: 'OIT8 — C2 x D3' },
        ]
      }

      const fase = cfg.mataMataFase

      // limpar fase (corrigido)
      await withRetry(() => supabase.from(TABELA_MM).delete().eq('fase', fase).eq('temporada', TEMPORADA), 2, 650)

      const rowsInsert = chaves.map((c, idx) => ({
        temporada: TEMPORADA,
        fase,
        ordem: idx + 1,
        id_time1: c.casaId,
        id_time2: c.foraId,
        time1: timesMap[c.casaId]?.nome ?? c.casaId,
        time2: timesMap[c.foraId]?.nome ?? c.foraId,
        gols_time1: null,
        gols_time2: null,
      }))

      await withRetry(() => supabase.from(TABELA_MM).insert(rowsInsert), 2, 700)

      setChavesMM(chaves)
      toast.success(`✅ ${cfg.mataMataLabel} geradas!`)
    } catch (e) {
      console.error(e)
      toast.error('Falha ao gerar mata-mata (conexão).')
    } finally {
      setGerandoMM(false)
    }
  }

  /* ===== UI DERIVED ===== */
  const jogosFiltrados = useMemo(
    () =>
      jogos.filter(j => filtroTime === 'Todos' || timesMap[j.time1]?.nome === filtroTime || timesMap[j.time2]?.nome === filtroTime),
    [jogos, filtroTime, timesMap]
  )

  const jogosPorGrupoRodada = useMemo(() => {
    const map: Record<string, Record<number, Jogo[]>> = {}
    jogosFiltrados.forEach(j => {
      const g = (j.grupo ?? 'A') as string
      map[g] ||= {}
      map[g][j.rodada] ||= []
      map[g][j.rodada].push(j)
    })
    return map
  }, [jogosFiltrados])

  const listaGrupos = useMemo(() => Object.keys(jogosPorGrupoRodada).sort(), [jogosPorGrupoRodada])
  const nomesDosTimes = useMemo(() => Object.values(timesMap).map(t => t.nome).sort(), [timesMap])

  const totalJogos = jogos.length
  const totalParticipantes = useMemo(() => {
    const ids = new Set<string>()
    jogos.forEach(j => {
      ids.add(j.time1)
      ids.add(j.time2)
    })
    return ids.size
  }, [jogos])

  const ScoreInput = ({ value, onChange, disabled }: { value: number | null; onChange: (v: number) => void; disabled?: boolean }) => (
    <div className="group flex items-center gap-1 rounded-full bg-zinc-50/5 border border-zinc-700 px-1 shadow-inner">
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => onChange(clampInt((value ?? 0) - 1))}
        disabled={disabled}
        aria-label="Diminuir"
        type="button"
      >
        <FiMinus />
      </button>
      <input
        type="number"
        min={0}
        className="w-12 text-center bg-transparent outline-none font-extrabold tracking-wider"
        value={value ?? ''}
        onChange={e => onChange(clampInt(parseInt(e.target.value || '0', 10)))}
        disabled={disabled}
      />
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => onChange(clampInt((value ?? 0) + 1))}
        disabled={disabled}
        aria-label="Aumentar"
        type="button"
      >
        <FiPlus />
      </button>
    </div>
  )

  const SectionHeader = ({ keyName, title, subtitle }: { keyName: string; title: ReactNode; subtitle?: ReactNode }) => {
    const open = !!secoesAbertas[keyName]
    return (
      <div className="sticky top-[64px] z-20">
        <button
          type="button"
          onClick={() => setSecoesAbertas(s => ({ ...s, [keyName]: !open }))}
          className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 px-4 py-3 hover:border-zinc-600/50 ring-1 ring-inset ring-white/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="flex items-center gap-3">
            {title}
            {subtitle}
          </div>
          <span className="text-zinc-400 group-hover:text-white">{open ? <FiChevronUp /> : <FiChevronDown />}</span>
        </button>
      </div>
    )
  }

  return (
    <div
      ref={topRef}
      className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black text-white"
    >
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/50 bg-black/70 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-500 bg-clip-text text-transparent drop-shadow">
                {cfg.title} • {TEMPORADA}
              </span>
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="emerald">{cfg.subtitle}</Badge>
              <Badge tone="sky">
                Top {CLASSIFICAM_POR_GRUPO} → {cfg.mataMataLabel}
              </Badge>
              <Badge>Divisões: {cfg.divisoes.join(' + ')}</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de modelo */}
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
              <span className="text-white/80 font-semibold">Modelo:</span>
              <select
                value={modelo}
                onChange={e => setModelo(e.target.value as CopaModel)}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400/60"
              >
                {MODELOS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-white/60 hidden md:inline">• {MODELOS.find(m => m.id === modelo)?.desc}</span>
            </div>

            {isAdmin && (
              <>
                {modelo === 'champions_4x5_top4_oitavas' && (
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      className="accent-emerald-500"
                      checked={evitarMesmoPais}
                      onChange={e => setEvitarMesmoPais(e.target.checked)}
                    />
                    <FiTarget /> Evitar mesmo país (grupos)
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const ok = window.confirm(
                      `Gerar Copa?\n\nIsso apaga os jogos da temporada "${TEMPORADA}" e cria os grupos conforme o modelo selecionado.\n\nModelo: ${
                        MODELOS.find(m => m.id === modelo)?.label
                      }\nDivisões: ${cfg.divisoes.join(' + ')}\nClassificação: Top ${CLASSIFICAM_POR_GRUPO} → ${cfg.mataMataLabel}`
                    )
                    if (ok) gerarFaseGrupos()
                  }}
                  disabled={gerando}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
                >
                  <FiRotateCcw />
                  {gerando ? 'Gerando...' : 'Gerar Fase de Grupos'}
                </button>

                <button
                  type="button"
                  onClick={() => setAbrirModalMM(true)}
                  disabled={gerandoMM}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                >
                  {gerandoMM ? 'Gerando…' : `Gerar Mata-mata (${cfg.mataMataLabel})`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metrics bar */}
        <div className="mx-auto max-w-7xl px-4 pb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-white/70">Grupos</div>
            <div className="text-lg font-bold">{listaGrupos.length || 0}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-white/70">Jogos</div>
            <div className="text-lg font-bold tabular-nums">{totalJogos}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-white/70">Participantes</div>
            <div className="text-lg font-bold tabular-nums">{totalParticipantes}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Filtro */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Filtrar por time:</label>
            <select
              value={filtroTime}
              onChange={e => setFiltroTime(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              <option value="Todos">Todos</option>
              {nomesDosTimes.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {filtroTime !== 'Todos' && (
              <button
                type="button"
                onClick={() => setFiltroTime('Todos')}
                className="text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* CONTEÚDO */}
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900/60 border border-white/10" />
            ))}
          </div>
        ) : listaGrupos.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center text-zinc-200">
            Nenhum jogo para exibir. Clique em <span className="font-semibold text-white">Gerar Fase de Grupos</span>.
          </div>
        ) : (
          listaGrupos.map(grupo => {
            const rodadas = Object.keys(jogosPorGrupoRodada[grupo] || {})
              .map(Number)
              .sort((a, b) => a - b)
            const keyName = `GRUPO-${grupo}`
            return (
              <section key={grupo} className="mb-8">
                <SectionHeader
                  keyName={keyName}
                  title={
                    <>
                      <Badge tone="emerald">Grupo</Badge>
                      <span className="text-lg font-extrabold text-green-400">{grupo}</span>
                    </>
                  }
                  subtitle={<span className="text-xs text-zinc-400">{rodadas.length} rodadas</span>}
                />

                {secoesAbertas[keyName] && (
                  <div className="mt-3 grid gap-4">
                    {/* Tabela do grupo */}
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-amber-300">Classificação — Grupo {grupo}</h3>
                        <Badge tone="sky">Top {CLASSIFICAM_POR_GRUPO} avançam</Badge>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-white/70">
                            <tr className="border-b border-white/10">
                              <th className="py-2 text-left">#</th>
                              <th className="py-2 text-left">Time</th>
                              <th className="py-2 text-right">P</th>
                              <th className="py-2 text-right">J</th>
                              <th className="py-2 text-right">V</th>
                              <th className="py-2 text-right">E</th>
                              <th className="py-2 text-right">D</th>
                              <th className="py-2 text-right">GP</th>
                              <th className="py-2 text-right">GC</th>
                              <th className="py-2 text-right">SG</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(classificacaoPorGrupo[grupo] || []).map((r, idx) => {
                              const isTop = idx < CLASSIFICAM_POR_GRUPO
                              return (
                                <tr key={r.id} className={`border-b border-white/5 ${isTop ? 'bg-emerald-500/5' : ''}`}>
                                  <td className="py-2">{idx + 1}</td>
                                  <td className="py-2">
                                    <div className="flex items-center gap-2">
                                      <img
                                        src={timesMap[r.id]?.logo_url || '/default.png'}
                                        className="h-6 w-6 rounded-full border bg-white object-cover"
                                        alt=""
                                      />
                                      <span className="font-semibold">{timesMap[r.id]?.nome || r.id}</span>
                                      {isTop && <Badge tone="emerald">Classifica</Badge>}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right font-bold">{r.pts}</td>
                                  <td className="py-2 text-right">{r.j}</td>
                                  <td className="py-2 text-right">{r.v}</td>
                                  <td className="py-2 text-right">{r.e}</td>
                                  <td className="py-2 text-right">{r.d}</td>
                                  <td className="py-2 text-right">{r.gp}</td>
                                  <td className="py-2 text-right">{r.gc}</td>
                                  <td className="py-2 text-right">{r.sg}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Rodadas */}
                    {rodadas.map(rodada => (
                      <div
                        key={rodada}
                        className="rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-950/70 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge tone="violet">Rodada</Badge>
                            <span className="text-sm font-bold text-violet-200">{rodada}</span>
                          </div>
                          <span className="text-[11px] text-zinc-400">Grupo {grupo}</span>
                        </div>

                        <div className="grid gap-3">
                          {(jogosPorGrupoRodada[grupo]?.[rodada] || []).map(jogo => (
                            <div
                              key={jogo.id}
                              className="relative rounded-xl border border-white/10 bg-black/20 p-4 hover:border-white/20 transition"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                {/* Time 1 */}
                                <div className="flex min-w-[220px] items-center gap-3">
                                  <img
                                    src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                                    alt=""
                                    className="h-10 w-10 rounded-full border bg-white object-cover"
                                  />
                                  <span className="max-w-[180px] truncate font-semibold">
                                    {timesMap[jogo.time1]?.nome || jogo.time1}
                                  </span>
                                  <Badge>Mandante</Badge>
                                </div>

                                {/* Placar */}
                                <div className="flex items-center gap-2">
                                  <ScoreInput
                                    value={jogo.gols_time1}
                                    onChange={v => setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, gols_time1: v } : j)))}
                                    disabled={!isAdmin}
                                  />
                                  <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                                  <ScoreInput
                                    value={jogo.gols_time2}
                                    onChange={v => setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, gols_time2: v } : j)))}
                                    disabled={!isAdmin}
                                  />
                                </div>

                                {/* Time 2 */}
                                <div className="flex min-w-[220px] items-center justify-end gap-3">
                                  <Badge tone="sky">Visitante</Badge>
                                  <span className="max-w-[180px] truncate font-semibold text-right">
                                    {timesMap[jogo.time2]?.nome || jogo.time2}
                                  </span>
                                  <img
                                    src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                                    alt=""
                                    className="h-10 w-10 rounded-full border bg-white object-cover"
                                  />
                                </div>

                                {/* Ações */}
                                {isAdmin && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => salvarPlacar(jogo)}
                                      disabled={salvandoId === jogo.id}
                                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                                    >
                                      <FiSave />
                                      {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => excluirPlacar(jogo)}
                                      disabled={salvandoId === jogo.id}
                                      className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-400/60"
                                    >
                                      <FiTrash2 />
                                      {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                                {jogo.renda != null && jogo.publico != null ? (
                                  <div className="flex items-center gap-3">
                                    <span>
                                      🎟️ Público:{' '}
                                      <span className="tabular-nums text-zinc-200">{Number(jogo.publico).toLocaleString()}</span>
                                    </span>
                                    <span>
                                      💰 Renda:{' '}
                                      <span className="tabular-nums text-zinc-200">R$ {Number(jogo.renda).toLocaleString()}</span>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-zinc-500">Sem relatório financeiro ainda</div>
                                )}

                                {jogo.bonus_pago ? <Badge tone="emerald">Finanças lançadas</Badge> : <Badge tone="zinc">Aguardando lançamento</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })
        )}

        {/* Preview das chaves geradas */}
        {chavesMM.length > 0 && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-bold text-amber-300 mb-2">
              Mata-mata — {cfg.mataMataLabel} (Top {CLASSIFICAM_POR_GRUPO} por grupo)
            </h3>
            <ul className="grid md:grid-cols-2 gap-2 text-sm">
              {chavesMM.map((c, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <b>{c.label}:</b> {timesMap[c.casaId]?.nome || c.casaId} × {timesMap[c.foraId]?.nome || c.foraId}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal: gerar mata-mata */}
      {abrirModalMM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-300">Gerar Mata-mata ({cfg.mataMataLabel})?</h3>
            <p className="mb-6 text-zinc-200">
              Isso pega o <b>Top {CLASSIFICAM_POR_GRUPO}</b> de cada grupo e cria <b>{cfg.mataMataLabel.toLowerCase()}</b>.
              <br />
              Será salvo em <code>{TABELA_MM}</code> (fase={cfg.mataMataFase}).
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
                onClick={() => setAbrirModalMM(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                onClick={async () => {
                  setAbrirModalMM(false)
                  await gerarMataMata()
                }}
              >
                {gerandoMM ? 'Gerando…' : `Sim, gerar ${cfg.mataMataLabel.toLowerCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


