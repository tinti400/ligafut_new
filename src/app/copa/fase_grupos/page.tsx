'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import {
  FiRotateCcw,
  FiSave,
  FiTrash2,
  FiTarget,
  FiMinus,
  FiPlus,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi'

// 🔽 Motor de Estádio (ajuste o import se seu projeto usar outro caminho/nome)
import {
  simulate,
  referencePrices,
  type Sector,
  type PriceMap,
  type EstadioContext,
  sectorProportion,
} from '@/utils/estadioEngine'

/* ================= SUPABASE & CONFIG ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || '2025-26'
const TABELA_GRUPOS = 'copa_fase_grupos'
const TABELA_MM = 'copa_mata_mata'

/* ================= TYPES ================= */
type Jogo = {
  id: number
  rodada: number
  grupo?: string | null // fase de grupos
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
  temporada?: string | null

  // extras financeiros (opcionais)
  renda?: number | null
  publico?: number | null
  receita_mandante?: number | null
  receita_visitante?: number | null
  salarios_mandante?: number | null
  salarios_visitante?: number | null
  premiacao_mandante?: number | null // total = participação + desempenho
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
const COPA_PARTICIPACAO_POR_JOGO = 10_000_000
const COPA_VITORIA = 18_000_000
const COPA_EMPATE = 9_000_000
const COPA_DERROTA = 5_000_000
const COPA_GOL_MARCADO = 880_000
const COPA_GOL_SOFRIDO = 160_000

/* ================= FASE DE GRUPOS CONFIG ================= */
const GRUPOS = ['A', 'B', 'C', 'D'] as const
const TIMES_POR_GRUPO = 5
const TOTAL_TIMES = GRUPOS.length * TIMES_POR_GRUPO // 20
const RODADAS_GRUPO = 5 // 5 times => 5 rodadas (2 jogos + 1 bye por rodada)

// ✅ AGORA CLASSIFICAM 4 POR GRUPO
const CLASSIFICAM_POR_GRUPO = 4

/* ================= HELPERS (fora do componente) ================= */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * ✅ Puxa times da tabela `times` filtrando divisao "1" e "2"
 * (no seu banco `divisao` é TEXT, então o filtro precisa ser string)
 */
async function safeSelectTimesDiv1e2(minimal = false) {
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
    const { data, error } = await supabase.from('times').select(s).in('divisao', ['1', '2'])
    if (!error && data) return data as any[]
  }
  return [] as any[]
}

/**
 * Para 4 grupos de 5 times, o sorteio “justo” é:
 * - 5 potes com 4 times cada (20 times)
 * - cada grupo recebe 1 time de cada pote
 */
function atribuirPotes5(times: TimeFull[]): Record<string, number> {
  // se já existir pote 1..5, usa
  const temPote = times.some(t => (t.pote ?? 0) >= 1 && (t.pote ?? 0) <= 5)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => {
      const p = Math.max(1, Math.min(5, Math.floor(t.pote || 1)))
      out[t.id] = p
    })
    return out
  }

  // senão, cria potes por força (overall > valor)
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
  const q = Math.max(1, Math.floor(n / 5)) // 4 quando n=20
  ord.forEach((t, i) => {
    out[t.id] = Math.min(5, Math.floor(i / q) + 1)
  })
  return out
}

type CalendarioGrupoItem = { grupo: string; rodada: number; casa: string; fora: string }

/**
 * Gera calendário round-robin para 5 times (odd):
 * - adiciona BYE
 * - método do círculo
 * - 5 rodadas, 2 jogos por rodada
 */
function gerarRoundRobin5(ids: string[]): { rodada: number; casa: string; fora: string }[] {
  if (ids.length !== 5) return []
  const BYE = '__BYE__'
  let arr = [...ids, BYE] // 6
  const n = arr.length // 6
  const rounds = n - 1 // 5
  const half = n / 2 // 3

  const jogos: { rodada: number; casa: string; fora: string }[] = []

  for (let r = 1; r <= rounds; r++) {
    const left = arr.slice(0, half)
    const right = arr.slice(half).reverse()

    for (let i = 0; i < half; i++) {
      const a = left[i]
      const b = right[i]
      if (a === BYE || b === BYE) continue

      // alterna mando pra não ficar “viciado”
      const casa = (r + i) % 2 === 0 ? a : b
      const fora = (r + i) % 2 === 0 ? b : a
      jogos.push({ rodada: r, casa, fora })
    }

    // rotação (fixa arr[0])
    const fixed = arr[0]
    const rest = arr.slice(1)
    rest.unshift(rest.pop() as string)
    arr = [fixed, ...rest]
  }

  return jogos
}

/**
 * Sorteia 4 grupos de 5:
 * - 5 potes de 4 times
 * - cada grupo recebe 1 por pote
 * - tenta evitar mesmo país dentro do grupo (se ativado)
 */
function sortearGrupos(
  participantes: TimeFull[],
  evitarMesmoPais: boolean
): Record<(typeof GRUPOS)[number], TimeFull[]> {
  const potes = atribuirPotes5(participantes)

  const porPote: Record<number, TimeFull[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  participantes.forEach(t => porPote[potes[t.id] ?? 5].push(t))
  ;(Object.keys(porPote) as any).forEach((p: any) => {
    porPote[Number(p)] = shuffle(porPote[Number(p)])
  })

  const tentativaMax = 300
  for (let tentativa = 1; tentativa <= tentativaMax; tentativa++) {
    const p1 = shuffle(porPote[1])
    const p2 = shuffle(porPote[2])
    const p3 = shuffle(porPote[3])
    const p4 = shuffle(porPote[4])
    const p5 = shuffle(porPote[5])

    const grupos: Record<(typeof GRUPOS)[number], TimeFull[]> = { A: [], B: [], C: [], D: [] }
    GRUPOS.forEach((g, idx) => {
      grupos[g].push(p1[idx], p2[idx], p3[idx], p4[idx], p5[idx])
    })

    if (!evitarMesmoPais) return grupos

    const ok = GRUPOS.every(g => {
      const ass = grupos[g].map(t => t.associacao).filter(Boolean) as string[]
      return new Set(ass).size === ass.length
    })

    if (ok) return grupos
  }

  // fallback sem restrição
  const grupos: Record<(typeof GRUPOS)[number], TimeFull[]> = { A: [], B: [], C: [], D: [] }
  const p = atribuirPotes5(participantes)
  const byPote: Record<number, TimeFull[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] }
  participantes.forEach(t => byPote[p[t.id] ?? 5].push(t))
  ;(Object.keys(byPote) as any).forEach((k: any) => (byPote[Number(k)] = shuffle(byPote[Number(k)])))
  GRUPOS.forEach((g, idx) => {
    grupos[g].push(byPote[1][idx], byPote[2][idx], byPote[3][idx], byPote[4][idx], byPote[5][idx])
  })
  return grupos
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

  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [evitarMesmoPais, setEvitarMesmoPais] = useState(true)
  const [gerando, setGerando] = useState(false)

  const [temColunaTemporada, setTemColunaTemporada] = useState<boolean>(true)
  const [temColunaGrupo, setTemColunaGrupo] = useState<boolean>(true)
  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  // UI
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({})
  const topRef = useRef<HTMLDivElement | null>(null)

  // ===== Mata-mata (AGORA: OITAVAS, porque classificam 16)
  const [gerandoMM, setGerandoMM] = useState(false)
  const [abrirModalMM, setAbrirModalMM] = useState(false)
  const [chavesMM, setChavesMM] = useState<{ casaId: string; foraId: string; label: string }[]>([])

  useEffect(() => {
    ;(async () => {
      await detectarColunaTemporada()
      await detectarColunaGrupo()
      await detectarColunasExtras()
      await Promise.all([carregarTimesBase(), buscarJogos()])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function detectarColunaTemporada() {
    const { error } = await supabase.from(TABELA_GRUPOS).select('id,temporada').limit(1)
    setTemColunaTemporada(!error)
  }

  async function detectarColunaGrupo() {
    const { error } = await supabase.from(TABELA_GRUPOS).select('id,grupo').limit(1)
    setTemColunaGrupo(!error)
  }

  async function detectarColunasExtras() {
    const { error } = await supabase
      .from(TABELA_GRUPOS)
      .select(
        'id,renda,publico,receita_mandante,receita_visitante,salarios_mandante,salarios_visitante,premiacao_mandante,premiacao_visitante'
      )
      .limit(1)
    setTemExtrasFinanceiros(!error)
  }

  async function carregarTimesBase() {
    const rows = await safeSelectTimesDiv1e2(true)
    const novo: Record<string, TimeMini> = {}
    rows.forEach((t: any) => {
      const nome = t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id)
      const logo = t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png'
      const associacao = t.associacao ?? t.pais ?? null
      novo[t.id] = { nome, logo_url: logo, associacao }
    })
    setTimesMap(novo)
  }

  async function buscarJogos() {
    let q = supabase.from(TABELA_GRUPOS).select('*')
    if (temColunaTemporada) q = q.eq('temporada', TEMPORADA)

    const { data, error } = temColunaGrupo
      ? await q.order('grupo', { ascending: true }).order('rodada', { ascending: true }).order('id', { ascending: true })
      : await q.order('rodada', { ascending: true }).order('id', { ascending: true })

    if (error) {
      console.error(error)
      toast.error('Erro ao buscar jogos')
      return
    }

    setJogos((data || []) as Jogo[])

    // abre A e B por padrão, ou as duas primeiras chaves
    const chaves = new Set<string>()
    ;(data || []).forEach((j: any) => chaves.add((j.grupo ?? `Rodada ${j.rodada}`) as string))
    const first = Array.from(chaves).slice(0, 2)
    const obj: Record<string, boolean> = {}
    first.forEach(k => (obj[k] = true))
    setSecoesAbertas(obj)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) {
      console.error(error)
      toast.error('Erro ao atualizar classificação!')
    }
  }

  /* ===================== Estádio helpers ===================== */
  const asImportance = (s: any): 'normal' | 'decisao' | 'final' =>
    s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal'
  const asWeather = (s: any): 'bom' | 'chuva' => (s === 'chuva' ? 'chuva' : 'bom')
  const asDayType = (s: any): 'semana' | 'fim' => (s === 'fim' ? 'fim' : 'semana')
  const asDayTime = (s: any): 'dia' | 'noite' => (s === 'dia' ? 'dia' : 'noite')

  async function calcularPublicoERendaPeloEstadio(
    mandanteId: string
  ): Promise<{ publico: number; renda: number; erro?: string }> {
    const { data: est, error } = await supabase
      .from('estadios')
      .select('*')
      .eq('id_time', mandanteId)
      .maybeSingle()

    if (error || !est) {
      return {
        publico: Math.floor(Math.random() * 30000) + 10000,
        renda: (Math.floor(Math.random() * 30000) + 10000) * 80,
        erro: 'Estádio não encontrado (usando fallback aleatório).',
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
  }

  /* ===================== Salário / Elenco helpers ===================== */
  async function somarSalarios(timeId: string): Promise<number> {
    const { data } = await supabase.from('elenco').select('salario').eq('id_time', timeId)
    if (!data) return 0
    return data.reduce((acc, j) => acc + (j.salario || 0), 0)
  }

  async function ajustarJogosElenco(timeId: string, delta: number) {
    const { data: jogadores } = await supabase.from('elenco').select('id, jogos').eq('id_time', timeId)
    if (!jogadores) return
    await Promise.all(
      jogadores.map(j =>
        supabase.from('elenco').update({ jogos: Math.max(0, (j.jogos || 0) + delta) }).eq('id', j.id)
      )
    )
  }

  async function descontarSalariosComRegistro(timeId: string): Promise<number> {
    const { data: elenco } = await supabase.from('elenco').select('salario').eq('id_time', timeId)
    if (!elenco) return 0
    const totalSalarios = elenco.reduce((acc, j) => acc + (j.salario || 0), 0)

    await supabase.rpc('atualizar_saldo', { id_time: timeId, valor: -totalSalarios })
    const dataAgora = new Date().toISOString()

    await supabase.from('movimentacoes').insert({
      id_time: timeId,
      tipo: 'salario',
      valor: totalSalarios,
      descricao: 'Desconto de salários após partida',
      data: dataAgora,
    })
    await supabase.from('bid').insert({
      tipo_evento: 'despesas',
      descricao: 'Desconto de salários após a partida',
      id_time1: timeId,
      valor: -totalSalarios,
      data_evento: dataAgora,
    })
    return totalSalarios
  }

  /* ===================== Premiação (COPA — PADRÃO) ===================== */
  async function premiarPorJogoCopa(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
    const base = gols_pro > gols_contra ? COPA_VITORIA : gols_pro < gols_contra ? COPA_DERROTA : COPA_EMPATE
    const valor = Math.round(base + gols_pro * COPA_GOL_MARCADO - gols_contra * COPA_GOL_SOFRIDO)

    await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
    const agora = new Date().toISOString()

    await supabase.from('movimentacoes').insert({
      id_time: timeId,
      tipo: 'premiacao',
      valor,
      descricao: 'Premiação por desempenho (COPA padrão)',
      data: agora,
    })

    await supabase.from('bid').insert({
      tipo_evento: 'bonus',
      descricao: 'Bônus por desempenho (COPA padrão)',
      id_time1: timeId,
      valor,
      data_evento: agora,
    })

    return valor
  }

  /* ===================== GERAR GRUPOS + CALENDÁRIO ===================== */
  const gerarFaseGrupos = async () => {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar a fase.')
      return
    }

    setGerando(true)
    try {
      const rows = await safeSelectTimesDiv1e2(false)

      // DEBUG na tela
      toast(`Times encontrados (DIV 1+2): ${rows?.length ?? 0}`, { icon: '🔎' })

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

      // ✅ NÃO REMOVE PALMEIRAS (tiramos aquela linha)
      // participantes = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))

      if (participantes.length < TOTAL_TIMES) {
        toast.error(`Preciso de ${TOTAL_TIMES} times (DIV 1 + 2) para 4 grupos de 5. Achei ${participantes.length}.`)
        return
      }

      if (participantes.length > TOTAL_TIMES) {
        // remove os “mais fracos” para fechar em 20
        const ord = [...participantes].sort((a, b) => {
          const oa = a.overall ?? 0
          const ob = b.overall ?? 0
          if (oa !== ob) return oa - ob
          return (a.valor ?? 0) - (b.valor ?? 0)
        })
        const extras = ord.slice(0, participantes.length - TOTAL_TIMES)
        const extraIds = new Set(extras.map(e => e.id))
        participantes = participantes.filter(t => !extraIds.has(t.id))
        toast(`Tinha mais de ${TOTAL_TIMES}. Removi ${extras.length} clubes mais fracos para fechar em 20.`, { icon: 'ℹ️' })
      }

      const grupos = sortearGrupos(participantes, evitarMesmoPais)

      const calendario: CalendarioGrupoItem[] = []
      GRUPOS.forEach(g => {
        const ids = grupos[g].map(t => t.id)
        const jogosG = gerarRoundRobin5(ids)
        jogosG.forEach(j => calendario.push({ grupo: g, rodada: j.rodada, casa: j.casa, fora: j.fora }))
      })

      if (!calendario.length) {
        toast.error('Falha ao gerar calendário de grupos.')
        return
      }

      // limpa tabela (temporada ou tudo)
      if (temColunaTemporada) {
        const { error: delErr } = await supabase.from(TABELA_GRUPOS).delete().eq('temporada', TEMPORADA)
        if (delErr) {
          console.error(delErr)
          toast.error('Erro ao limpar jogos da temporada.')
          return
        }
      } else {
        const { error: delErr } = await supabase.from(TABELA_GRUPOS).delete().neq('id', -1)
        if (delErr) {
          console.error(delErr)
          toast.error('Erro ao limpar tabela de jogos.')
          return
        }
      }

      // insere os jogos
      const rowsInsert = calendario.map(j => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        ...(temColunaGrupo ? { grupo: j.grupo } : {}),
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false,
      }))

      const { error: insErr } = await supabase.from(TABELA_GRUPOS).insert(rowsInsert)
      if (insErr) {
        console.error(insErr)
        toast.error('Erro ao inserir confrontos dos grupos.')
        return
      }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([
        {
          tipo_evento: 'Sistema',
          descricao: `Fase de Grupos gerada (${GRUPOS.length} grupos de ${TIMES_POR_GRUPO} times, ${RODADAS_GRUPO} rodadas por grupo).`,
          valor: null,
          data_evento: new Date().toISOString(),
        },
      ])

      toast.success(`✅ Grupos gerados: ${rowsInsert.length} jogos (4 grupos x 10)`)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setGerando(false)
    }
  }

  /* ===================== Salvar / Ajuste / Excluir ===================== */
  async function salvarAjusteResultado(jogo: Jogo, gm: number, gv: number, silencioso = false) {
    if (!isAdmin) return
    const { error } = await supabase
      .from(TABELA_GRUPOS)
      .update({ gols_time1: gm, gols_time2: gv, bonus_pago: true })
      .eq('id', jogo.id)

    if (error) {
      console.error(error)
      toast.error('Erro ao ajustar placar')
      return
    }
    await atualizarClassificacao()
    await buscarJogos()
    if (!silencioso) toast.success('✏️ Resultado atualizado (sem repetir bônus).')
  }

  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    setSalvandoId(jogo.id)

    const { data: existente, error: erroVer } = await supabase
      .from(TABELA_GRUPOS)
      .select('bonus_pago')
      .eq('id', jogo.id)
      .single()

    if (erroVer) {
      console.error(erroVer)
      toast.error('Erro ao verificar status do jogo')
      setSalvandoId(null)
      return
    }

    if (existente?.bonus_pago) {
      await salvarAjusteResultado(jogo, jogo.gols_time1 ?? 0, jogo.gols_time2 ?? 0, true)
      setSalvandoId(null)
      return
    }

    if (jogo.gols_time1 == null || jogo.gols_time2 == null) {
      toast.error('Preencha os gols antes de salvar.')
      setSalvandoId(null)
      return
    }

    const mandanteId = jogo.time1
    const visitanteId = jogo.time2

    const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
    if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })
    const publico = pr.publico
    const renda = pr.renda

    const receitaMandante = Math.round(renda * 0.95)
    const receitaVisitante = Math.round(renda * 0.05)

    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })

    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: COPA_PARTICIPACAO_POR_JOGO })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: COPA_PARTICIPACAO_POR_JOGO })

    await supabase.from('movimentacoes').insert([
      {
        id_time: mandanteId,
        tipo: 'participacao_copa',
        valor: COPA_PARTICIPACAO_POR_JOGO,
        descricao: 'Participação fixa por jogo (COPA)',
        data: new Date().toISOString(),
      },
      {
        id_time: visitanteId,
        tipo: 'participacao_copa',
        valor: COPA_PARTICIPACAO_POR_JOGO,
        descricao: 'Participação fixa por jogo (COPA)',
        data: new Date().toISOString(),
      },
    ])

    await supabase.from('bid').insert([
      {
        tipo_evento: 'bonus_participacao_copa',
        descricao: 'Participação fixa por jogo (COPA)',
        id_time1: mandanteId,
        valor: COPA_PARTICIPACAO_POR_JOGO,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'bonus_participacao_copa',
        descricao: 'Participação fixa por jogo (COPA)',
        id_time1: visitanteId,
        valor: COPA_PARTICIPACAO_POR_JOGO,
        data_evento: new Date().toISOString(),
      },
    ])

    const premiacaoMandanteDesempenho = await premiarPorJogoCopa(mandanteId, jogo.gols_time1, jogo.gols_time2)
    const premiacaoVisitanteDesempenho = await premiarPorJogoCopa(visitanteId, jogo.gols_time2, jogo.gols_time1)

    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    const totalPremMandante = premiacaoMandanteDesempenho + COPA_PARTICIPACAO_POR_JOGO
    const totalPremVisitante = premiacaoVisitanteDesempenho + COPA_PARTICIPACAO_POR_JOGO

    await supabase.from('bid').insert([
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus) — COPA',
        id_time1: mandanteId,
        valor: receitaMandante + totalPremMandante,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus) — COPA',
        id_time1: visitanteId,
        valor: receitaVisitante + totalPremVisitante,
        data_evento: new Date().toISOString(),
      },
    ])

    await ajustarJogosElenco(mandanteId, +1)
    await ajustarJogosElenco(visitanteId, +1)

    const patchBase: any = {
      gols_time1: jogo.gols_time1,
      gols_time2: jogo.gols_time2,
      bonus_pago: true,
    }
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

    const { error: erroPlacar } = await supabase
      .from(TABELA_GRUPOS)
      .update({ ...patchBase, ...patchExtras })
      .eq('id', jogo.id)

    if (erroPlacar) {
      console.error(erroPlacar)
      toast.error('Erro ao salvar/registrar finanças')
      setSalvandoId(null)
      return
    }

    await atualizarClassificacao()

    const n1 = timesMap[mandanteId]?.nome ?? 'Mandante'
    const n2 = timesMap[visitanteId]?.nome ?? 'Visitante'
    toast.success(
      `✅ Placar salvo e finanças pagas (COPA)!
🎟️ Público: ${publico.toLocaleString()}  |  💰 Renda: R$ ${renda.toLocaleString()}
💵 ${n1}: ${Math.round(receitaMandante).toLocaleString('pt-BR')} + R$ ${COPA_PARTICIPACAO_POR_JOGO.toLocaleString(
        'pt-BR'
      )} (participação) + bônus
💵 ${n2}: ${Math.round(receitaVisitante).toLocaleString('pt-BR')} + R$ ${COPA_PARTICIPACAO_POR_JOGO.toLocaleString(
        'pt-BR'
      )} (participação) + bônus`,
      { duration: 9000 }
    )

    await buscarJogos()
    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: Jogo) {
    if (!isAdmin) return
    if (!confirm('Excluir resultado deste jogo? Estorno financeiro será aplicado.')) return
    setSalvandoId(jogo.id)

    const mandanteId = jogo.time1
    const visitanteId = jogo.time2
    const now = new Date().toISOString()

    if (jogo.bonus_pago) {
      const receitaMandante = jogo.receita_mandante ?? (jogo.renda ? Math.round(jogo.renda * 0.95) : 0)
      const receitaVisitante = jogo.receita_visitante ?? (jogo.renda ? Math.round(jogo.renda * 0.05) : 0)
      const salariosMandante = jogo.salarios_mandante ?? (await somarSalarios(mandanteId))
      const salariosVisitante = jogo.salarios_visitante ?? (await somarSalarios(visitanteId))
      const premiacaoMandante = jogo.premiacao_mandante ?? 0
      const premiacaoVisitante = jogo.premiacao_visitante ?? 0

      await Promise.all([
        receitaMandante
          ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante })
          : Promise.resolve(),
        receitaVisitante
          ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante })
          : Promise.resolve(),
        salariosMandante
          ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante })
          : Promise.resolve(),
        salariosVisitante
          ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante })
          : Promise.resolve(),
        premiacaoMandante
          ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante })
          : Promise.resolve(),
        premiacaoVisitante
          ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante })
          : Promise.resolve(),
      ])

      const movs: any[] = []
      if (receitaMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_receita',
          valor: receitaMandante,
          descricao: 'Estorno receita de partida (COPA)',
          data: now,
        })
      if (receitaVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_receita',
          valor: receitaVisitante,
          descricao: 'Estorno receita de partida (COPA)',
          data: now,
        })
      if (salariosMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_salario',
          valor: salariosMandante,
          descricao: 'Estorno de salários (COPA)',
          data: now,
        })
      if (salariosVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_salario',
          valor: salariosVisitante,
          descricao: 'Estorno de salários (COPA)',
          data: now,
        })
      if (premiacaoMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_bonus_total',
          valor: premiacaoMandante,
          descricao: 'Estorno de bônus (participação + desempenho) — COPA',
          data: now,
        })
      if (premiacaoVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_bonus_total',
          valor: premiacaoVisitante,
          descricao: 'Estorno de bônus (participação + desempenho) — COPA',
          data: now,
        })
      if (movs.length) await supabase.from('movimentacoes').insert(movs)

      const bids: any[] = []
      if (receitaMandante)
        bids.push({
          tipo_evento: 'estorno_receita_partida',
          descricao: 'Estorno da receita da partida (COPA)',
          id_time1: mandanteId,
          valor: -receitaMandante,
          data_evento: now,
        })
      if (receitaVisitante)
        bids.push({
          tipo_evento: 'estorno_receita_partida',
          descricao: 'Estorno da receita da partida (COPA)',
          id_time1: visitanteId,
          valor: -receitaVisitante,
          data_evento: now,
        })
      if (salariosMandante)
        bids.push({
          tipo_evento: 'estorno_despesas',
          descricao: 'Estorno de despesas (salários) — COPA',
          id_time1: mandanteId,
          valor: +salariosMandante,
          data_evento: now,
        })
      if (salariosVisitante)
        bids.push({
          tipo_evento: 'estorno_despesas',
          descricao: 'Estorno de despesas (salários) — COPA',
          id_time1: visitanteId,
          valor: +salariosVisitante,
          data_evento: now,
        })
      if (premiacaoMandante)
        bids.push({
          tipo_evento: 'estorno_bonus',
          descricao: 'Estorno de bônus (participação + desempenho) — COPA',
          id_time1: mandanteId,
          valor: -premiacaoMandante,
          data_evento: now,
        })
      if (premiacaoVisitante)
        bids.push({
          tipo_evento: 'estorno_bonus',
          descricao: 'Estorno de bônus (participação + desempenho) — COPA',
          id_time1: visitanteId,
          valor: -premiacaoVisitante,
          data_evento: now,
        })
      if (bids.length) await supabase.from('bid').insert(bids)

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

    const { error: erroLimpar } = await supabase.from(TABELA_GRUPOS).update(patch).eq('id', jogo.id)
    if (erroLimpar) {
      console.error(erroLimpar)
      toast.error('Erro ao limpar resultado')
      setSalvandoId(null)
      return
    }

    await atualizarClassificacao()
    await buscarJogos()
    toast.success('🗑️ Resultado removido e estorno financeiro concluído (COPA).')
    setSalvandoId(null)
  }

  /* ===================== CLASSIFICAÇÃO (client-side) ===================== */
  type RowGrupo = {
    id: string
    grupo: string
    pts: number
    j: number
    v: number
    e: number
    d: number
    gp: number
    gc: number
    sg: number
  }

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

  /* ===================== GERAR MATA-MATA (OITAVAS) ===================== */
  async function gerarOitavas() {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar o mata-mata.')
      return
    }

    setGerandoMM(true)
    try {
      // valida: 4 grupos com pelo menos 4 classificados
      const gruposOk = GRUPOS.every(g => (classificacaoPorGrupo[g]?.length ?? 0) >= CLASSIFICAM_POR_GRUPO)
      if (!gruposOk) {
        toast.error(`Preciso de pelo menos ${CLASSIFICAM_POR_GRUPO} times classificados em cada grupo (A–D).`)
        return
      }

      // pega top4
      const A = classificacaoPorGrupo['A']
      const B = classificacaoPorGrupo['B']
      const C = classificacaoPorGrupo['C']
      const D = classificacaoPorGrupo['D']

      const A1 = A[0].id, A2 = A[1].id, A3 = A[2].id, A4 = A[3].id
      const B1 = B[0].id, B2 = B[1].id, B3 = B[2].id, B4 = B[3].id
      const C1 = C[0].id, C2 = C[1].id, C3 = C[2].id, C4 = C[3].id
      const D1 = D[0].id, D2 = D[1].id, D3 = D[2].id, D4 = D[3].id

      // ✅ OITAVAS (16 times): cruza A×B e C×D evitando mesmo grupo
      const chaves = [
        { casaId: A1, foraId: B4, label: 'OIT1 — A1 x B4' },
        { casaId: B2, foraId: A3, label: 'OIT2 — B2 x A3' },
        { casaId: B1, foraId: A4, label: 'OIT3 — B1 x A4' },
        { casaId: A2, foraId: B3, label: 'OIT4 — A2 x B3' },

        { casaId: C1, foraId: D4, label: 'OIT5 — C1 x D4' },
        { casaId: D2, foraId: C3, label: 'OIT6 — D2 x C3' },
        { casaId: D1, foraId: C4, label: 'OIT7 — D1 x C4' },
        { casaId: C2, foraId: D3, label: 'OIT8 — C2 x D3' },
      ]

      // tenta limpar a fase "oitavas" da temporada
      let del = await supabase.from(TABELA_MM).delete().eq('fase', 'oitavas')
      if (temColunaTemporada) {
        del = await supabase.from(TABELA_MM).delete().eq('fase', 'oitavas').eq('temporada', TEMPORADA)
      }

      // se der erro (ex: tabela não existe), avisa e mostra as chaves na tela
      // @ts-ignore
      if (del?.error) {
        toast('⚠️ Não consegui limpar/usar tabela copa_mata_mata. Verifique se ela existe no banco.', { icon: 'ℹ️' })
        setChavesMM(chaves)
        return
      }

      const rowsInsert = chaves.map((c, idx) => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        fase: 'oitavas',
        ordem: idx + 1,
        id_time1: c.casaId,
        id_time2: c.foraId,
        time1: timesMap[c.casaId]?.nome ?? c.casaId,
        time2: timesMap[c.foraId]?.nome ?? c.foraId,
        gols_time1: null,
        gols_time2: null,
      }))

      const { error: insErr } = await supabase.from(TABELA_MM).insert(rowsInsert)
      if (insErr) {
        console.error(insErr)
        toast.error('Erro ao gravar oitavas no banco (copa_mata_mata).')
        setChavesMM(chaves)
        return
      }

      setChavesMM(chaves)

      await supabase.from('bid').insert({
        tipo_evento: 'Sistema',
        descricao: `Mata-mata gerado (Oitavas) a partir dos grupos — salvo em ${TABELA_MM}.`,
        valor: null,
        data_evento: new Date().toISOString(),
      })

      toast.success('✅ Oitavas geradas (classificam 4 por grupo)!')
    } finally {
      setGerandoMM(false)
    }
  }

  /* ===== UI DERIVED ===== */
  const jogosFiltrados = useMemo(
    () =>
      jogos.filter(
        j => filtroTime === 'Todos' || timesMap[j.time1]?.nome === filtroTime || timesMap[j.time2]?.nome === filtroTime
      ),
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

  /* ===== Small UI components ===== */
  const ScoreInput = ({
    value,
    onChange,
    disabled,
  }: {
    value: number | null
    onChange: (v: number) => void
    disabled?: boolean
  }) => (
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

  const SectionHeader = ({
    keyName,
    title,
    subtitle,
  }: {
    keyName: string
    title: ReactNode
    subtitle?: ReactNode
  }) => {
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
                UEFA Champions — Fase de Grupos{temColunaTemporada ? ` • ${TEMPORADA}` : ''}
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="emerald">4 grupos • 5 times</Badge>
              <Badge tone="sky">Top {CLASSIFICAM_POR_GRUPO} → Oitavas</Badge>
              <Badge>5 rodadas por grupo</Badge>
              {!temColunaGrupo && <Badge tone="amber">⚠️ Sem coluna "grupo"</Badge>}
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={evitarMesmoPais}
                  onChange={e => setEvitarMesmoPais(e.target.checked)}
                />
                <FiTarget /> Evitar mesmo país (grupos)
              </label>

              <button
                type="button"
                onClick={() => {
                  const ok = confirm(
                    `Gerar Fase de Grupos?\n\nIsso apaga os jogos ${
                      temColunaTemporada ? `da temporada "${TEMPORADA}"` : 'atuais'
                    } e cria 4 grupos com 5 times.\n\n✅ Usa times da tabela "times" com divisao IN ('1','2')\n✅ Palmeiras participa do sorteio`
                  )
                  if (ok) gerarFaseGrupos()
                }}
                disabled={gerando}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
                title="Gera 4 grupos com 5 times e 5 rodadas por grupo"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Gerar Fase de Grupos'}
              </button>

              <button
                type="button"
                onClick={() => setAbrirModalMM(true)}
                disabled={gerandoMM}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                title="Gera Oitavas a partir do Top 4 de cada grupo"
              >
                {gerandoMM ? 'Gerando…' : 'Gerar Mata-mata (Oitavas)'}
              </button>
            </div>
          )}
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
                                <tr
                                  key={r.id}
                                  className={`border-b border-white/5 ${isTop ? 'bg-emerald-500/5' : ''}`}
                                >
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
                                    onChange={v =>
                                      setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, gols_time1: v } : j)))
                                    }
                                    disabled={!isAdmin}
                                  />
                                  <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                                  <ScoreInput
                                    value={jogo.gols_time2}
                                    onChange={v =>
                                      setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, gols_time2: v } : j)))
                                    }
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
                                      title="Salvar placar e processar finanças (COPA)"
                                    >
                                      <FiSave />
                                      {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => excluirPlacar(jogo)}
                                      disabled={salvandoId === jogo.id}
                                      className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-400/60"
                                      title="Zerar placar deste jogo (estorno)"
                                    >
                                      <FiTrash2 />
                                      {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Info extra */}
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                                {jogo.renda != null && jogo.publico != null ? (
                                  <div className="flex items-center gap-3">
                                    <span>
                                      🎟️ Público:{' '}
                                      <span className="tabular-nums text-zinc-200">
                                        {Number(jogo.publico).toLocaleString()}
                                      </span>
                                    </span>
                                    <span>
                                      💰 Renda:{' '}
                                      <span className="tabular-nums text-zinc-200">
                                        R$ {Number(jogo.renda).toLocaleString()}
                                      </span>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="text-zinc-500">Sem relatório financeiro ainda</div>
                                )}

                                {jogo.bonus_pago ? (
                                  <Badge tone="emerald">Finanças lançadas</Badge>
                                ) : (
                                  <Badge tone="zinc">Aguardando lançamento</Badge>
                                )}
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

        {/* Preview das chaves de Oitavas geradas */}
        {chavesMM.length > 0 && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-bold text-amber-300 mb-2">Mata-mata — Oitavas (Top {CLASSIFICAM_POR_GRUPO} por grupo)</h3>
            <ul className="grid md:grid-cols-2 gap-2 text-sm">
              {chavesMM.map((c, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between"
                >
                  <span>
                    <b>{c.label}:</b> {timesMap[c.casaId]?.nome || c.casaId} × {timesMap[c.foraId]?.nome || c.foraId}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal: gerar Oitavas */}
      {abrirModalMM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-300">Gerar Mata-mata (Oitavas)?</h3>
            <p className="mb-6 text-zinc-200">
              Isso pega o <b>Top {CLASSIFICAM_POR_GRUPO}</b> de cada grupo e cria as <b>oitavas</b> (16 times).
              <br />
              <span className="text-zinc-300">
                A×B e C×D (sem confronto do mesmo grupo).
              </span>
              <br />
              Será salvo em <code>{TABELA_MM}</code> (fase=oitavas).
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
                  await gerarOitavas()
                }}
              >
                {gerandoMM ? 'Gerando…' : 'Sim, gerar oitavas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
