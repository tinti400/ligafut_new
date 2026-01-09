'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import {
  FiSave,
  FiTrash2,
  FiChevronDown,
  FiChevronUp,
  FiPlus,
  FiMinus,
  FiRefreshCcw,
  FiPlay,
} from 'react-icons/fi'

// 🔽 Motor de Estádio (mesmo do seu arquivo anterior)
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

/* ================= TYPES ================= */
type MMFase = 'oitavas' | 'quartas' | 'semis' | 'final'

type JogoMM = {
  id: string
  fase: MMFase
  perna: 1 | 2
  ordem: number

  id_time1: string
  id_time2: string
  time1: string | null
  time2: string | null

  gols_time1: number | null
  gols_time2: number | null

  seed_time1: number | null
  seed_time2: number | null

  // extras financeiros (opcionais)
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

/* ================= FINANÇAS (COPA — PADRÃO) ================= */
const COPA_PARTICIPACAO_POR_JOGO = 10_000_000
const COPA_VITORIA = 18_000_000
const COPA_EMPATE = 9_000_000
const COPA_DERROTA = 5_000_000
const COPA_GOL_MARCADO = 880_000
const COPA_GOL_SOFRIDO = 160_000

/* ================= HELPERS ================= */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))

const faseTitle: Record<MMFase, string> = {
  oitavas: 'Oitavas',
  quartas: 'Quartas',
  semis: 'Semifinais',
  final: 'Final',
}

const proximaFase: Record<MMFase, MMFase | null> = {
  oitavas: 'quartas',
  quartas: 'semis',
  semis: 'final',
  final: null,
}

function fmtBRL(n: number) {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`
}

function badgeTone(seed: number | null | undefined) {
  if (!seed) return 'zinc'
  if (seed <= 4) return 'emerald'
  if (seed <= 8) return 'sky'
  return 'amber'
}

const Badge: React.FC<{ tone?: 'zinc' | 'emerald' | 'sky' | 'amber'; children: React.ReactNode }> = ({
  children,
  tone = 'zinc',
}) => {
  const cls =
    {
      zinc: 'bg-white/5 text-zinc-200 border-white/10',
      emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
      amber: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    }[tone] || 'bg-white/5 text-zinc-200 border-white/10'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${cls}`}>
      {children}
    </span>
  )
}

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

/* ================= Estádio helpers ================= */
const asImportance = (s: any): 'normal' | 'decisao' | 'final' => (s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal')
const asWeather = (s: any): 'bom' | 'chuva' => (s === 'chuva' ? 'chuva' : 'bom')
const asDayType = (s: any): 'semana' | 'fim' => (s === 'fim' ? 'fim' : 'semana')
const asDayTime = (s: any): 'dia' | 'noite' => (s === 'dia' ? 'dia' : 'noite')

async function calcularPublicoERendaPeloEstadio(mandanteId: string): Promise<{ publico: number; renda: number; erro?: string }> {
  const { data: est, error } = await supabase.from('estadios').select('*').eq('id_time', mandanteId).maybeSingle()

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

/* ================= Elenco / salários helpers ================= */
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
      supabase
        .from('elenco')
        .update({ jogos: Math.max(0, (j.jogos || 0) + delta) })
        .eq('id', j.id)
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

/* ================= Winner / Agregado / Seed ================= */
function melhorSeed(seedA: number | null, seedB: number | null) {
  // seed menor = melhor
  const a = seedA ?? 9999
  const b = seedB ?? 9999
  return a <= b ? 'A' : 'B'
}

function calcAgregado(ida: JogoMM, volta: JogoMM) {
  // ida: time1 vs time2
  // volta: geralmente invertido
  // Vamos somar por ID (mais confiável)
  const map: Record<string, { gf: number; ga: number }> = {}
  const add = (id: string, gf: number, ga: number) => {
    if (!map[id]) map[id] = { gf: 0, ga: 0 }
    map[id].gf += gf
    map[id].ga += ga
  }

  const g1 = ida.gols_time1 ?? 0
  const g2 = ida.gols_time2 ?? 0
  const h1 = volta.gols_time1 ?? 0
  const h2 = volta.gols_time2 ?? 0

  add(ida.id_time1, g1, g2)
  add(ida.id_time2, g2, g1)

  add(volta.id_time1, h1, h2)
  add(volta.id_time2, h2, h1)

  return map
}

function vencedorConfronto(ida: JogoMM, volta: JogoMM): { vencedorId: string; vencedorNome: string; seed: number } | null {
  if (ida.gols_time1 == null || ida.gols_time2 == null) return null
  if (volta.gols_time1 == null || volta.gols_time2 == null) return null

  const ag = calcAgregado(ida, volta)

  const aId = ida.id_time1
  const bId = ida.id_time2

  const a = ag[aId] || { gf: 0, ga: 0 }
  const b = ag[bId] || { gf: 0, ga: 0 }

  const aGoals = a.gf
  const bGoals = b.gf

  if (aGoals > bGoals) {
    const seed = Math.min(ida.seed_time1 ?? 9999, volta.seed_time2 ?? 9999, ida.seed_time1 ?? 9999)
    return { vencedorId: aId, vencedorNome: ida.time1 || aId, seed }
  }
  if (bGoals > aGoals) {
    const seed = Math.min(ida.seed_time2 ?? 9999, volta.seed_time1 ?? 9999, ida.seed_time2 ?? 9999)
    return { vencedorId: bId, vencedorNome: ida.time2 || bId, seed }
  }

  // empate no agregado → melhor seed
  const melhor = melhorSeed(ida.seed_time1 ?? null, ida.seed_time2 ?? null)
  if (melhor === 'A') {
    return { vencedorId: aId, vencedorNome: ida.time1 || aId, seed: ida.seed_time1 ?? 9999 }
  }
  return { vencedorId: bId, vencedorNome: ida.time2 || bId, seed: ida.seed_time2 ?? 9999 }
}

/* ================= PAGE ================= */
export default function CopaMataMataPage() {
  const { isAdmin } = useAdmin()
  const topRef = useRef<HTMLDivElement | null>(null)

  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [jogos, setJogos] = useState<JogoMM[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const [abertos, setAbertos] = useState<Record<string, boolean>>({
    oitavas: true,
    quartas: true,
    semis: true,
    final: true,
  })

  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  useEffect(() => {
    ;(async () => {
      await detectarExtras()
      await carregarTimesBase()
      await carregarJogos()
      setLoading(false)
    })()
  }, [])

  async function detectarExtras() {
    const e = await supabase
      .from('copa_mata_mata')
      .select(
        'id,renda,publico,receita_mandante,receita_visitante,salarios_mandante,salarios_visitante,premiacao_mandante,premiacao_visitante'
      )
      .limit(1)
    setTemExtrasFinanceiros(!e.error)
  }

  async function carregarTimesBase() {
    const { data } = await supabase.from('times').select('id,nome,logo_url,associacao')
    const novo: Record<string, TimeMini> = {}
    ;(data || []).forEach((t: any) => {
      novo[t.id] = {
        nome: t.nome ?? String(t.id),
        logo_url: t.logo_url ?? '/default.png',
        associacao: t.associacao ?? null,
      }
    })
    setTimesMap(novo)
  }

  async function carregarJogos() {
    const { data, error } = await supabase
      .from('copa_mata_mata')
      .select('*')
      .order('fase', { ascending: true })
      .order('ordem', { ascending: true })
      .order('perna', { ascending: true })

    if (error) {
      console.error(error)
      toast.error('Erro ao carregar mata-mata.')
      setJogos([])
      return
    }
    setJogos((data || []) as JogoMM[])
  }

  async function atualizarClassificacao() {
    // se você quiser usar em algum lugar
    await supabase.rpc('atualizar_classificacao_copa')
  }

  /* ================= Salvar placar (com finanças) ================= */
  async function salvarPlacar(jogo: JogoMM) {
    if (!isAdmin) return
    if (jogo.gols_time1 == null || jogo.gols_time2 == null) {
      toast.error('Preencha os gols antes de salvar.')
      return
    }

    setSalvandoId(jogo.id)

    const mandanteId = jogo.id_time1
    const visitanteId = jogo.id_time2

    const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
    if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })
    const publico = pr.publico
    const renda = pr.renda

    const receitaMandante = Math.round(renda * 0.95)
    const receitaVisitante = Math.round(renda * 0.05)

    // renda
    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })

    // participação fixa
    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: COPA_PARTICIPACAO_POR_JOGO })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: COPA_PARTICIPACAO_POR_JOGO })

    await supabase.from('movimentacoes').insert([
      {
        id_time: mandanteId,
        tipo: 'participacao_copa',
        valor: COPA_PARTICIPACAO_POR_JOGO,
        descricao: `Participação fixa por jogo (COPA) — ${jogo.fase.toUpperCase()} P${jogo.perna}`,
        data: new Date().toISOString(),
      },
      {
        id_time: visitanteId,
        tipo: 'participacao_copa',
        valor: COPA_PARTICIPACAO_POR_JOGO,
        descricao: `Participação fixa por jogo (COPA) — ${jogo.fase.toUpperCase()} P${jogo.perna}`,
        data: new Date().toISOString(),
      },
    ])

    // bônus desempenho
    const premiacaoMandanteDesempenho = await premiarPorJogoCopa(mandanteId, jogo.gols_time1, jogo.gols_time2)
    const premiacaoVisitanteDesempenho = await premiarPorJogoCopa(visitanteId, jogo.gols_time2, jogo.gols_time1)

    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    const totalPremMandante = premiacaoMandanteDesempenho + COPA_PARTICIPACAO_POR_JOGO
    const totalPremVisitante = premiacaoVisitanteDesempenho + COPA_PARTICIPACAO_POR_JOGO

    await ajustarJogosElenco(mandanteId, +1)
    await ajustarJogosElenco(visitanteId, +1)

    const patchBase: any = {
      gols_time1: jogo.gols_time1,
      gols_time2: jogo.gols_time2,
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

    const upd = await supabase.from('copa_mata_mata').update({ ...patchBase, ...patchExtras }).eq('id', jogo.id)
    if (upd.error) {
      console.error(upd.error)
      toast.error('Erro ao salvar jogo do mata-mata.')
      setSalvandoId(null)
      return
    }

    toast.success(
      `✅ Salvo (${faseTitle[jogo.fase]} • Perna ${jogo.perna})
🎟️ Público: ${publico.toLocaleString()} | 💰 Renda: ${fmtBRL(renda)}
🏠 Mandante recebeu: ${fmtBRL(receitaMandante + COPA_PARTICIPACAO_POR_JOGO)}
🚌 Visitante recebeu: ${fmtBRL(receitaVisitante + COPA_PARTICIPACAO_POR_JOGO)}`,
      { duration: 8000 }
    )

    await carregarJogos()
    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: JogoMM) {
    if (!isAdmin) return
    if (!confirm('Excluir resultado deste jogo? (irá estornar finanças deste jogo)')) return
    setSalvandoId(jogo.id)

    const mandanteId = jogo.id_time1
    const visitanteId = jogo.id_time2
    const now = new Date().toISOString()

    // Estorno (só se tiver extras; se não tiver, estorna o mínimo)
    const receitaMandante = jogo.receita_mandante ?? 0
    const receitaVisitante = jogo.receita_visitante ?? 0
    const salariosMandante = jogo.salarios_mandante ?? (await somarSalarios(mandanteId))
    const salariosVisitante = jogo.salarios_visitante ?? (await somarSalarios(visitanteId))
    const premiacaoMandante = jogo.premiacao_mandante ?? 0
    const premiacaoVisitante = jogo.premiacao_visitante ?? 0

    // remove receita / bônus, devolve salários
    await Promise.all([
      receitaMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante }) : Promise.resolve(),
      receitaVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante }) : Promise.resolve(),
      premiacaoMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante }) : Promise.resolve(),
      premiacaoVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante }) : Promise.resolve(),
      salariosMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }) : Promise.resolve(),
      salariosVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }) : Promise.resolve(),
    ])

    await supabase.from('movimentacoes').insert([
      {
        id_time: mandanteId,
        tipo: 'estorno_partida',
        valor: 0,
        descricao: `Estorno de partida — ${faseTitle[jogo.fase]} P${jogo.perna}`,
        data: now,
      },
      {
        id_time: visitanteId,
        tipo: 'estorno_partida',
        valor: 0,
        descricao: `Estorno de partida — ${faseTitle[jogo.fase]} P${jogo.perna}`,
        data: now,
      },
    ])

    await ajustarJogosElenco(mandanteId, -1)
    await ajustarJogosElenco(visitanteId, -1)

    const patch: any = { gols_time1: null, gols_time2: null }
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

    const { error } = await supabase.from('copa_mata_mata').update(patch).eq('id', jogo.id)
    if (error) {
      console.error(error)
      toast.error('Erro ao limpar placar.')
      setSalvandoId(null)
      return
    }

    toast.success('🗑️ Placar removido e estorno aplicado.')
    await carregarJogos()
    setSalvandoId(null)
  }

  /* ================= NEXT PHASE GENERATION ================= */

  // pega jogos por fase e por ordem
  const jogosPorFase = useMemo(() => {
    const map: Record<MMFase, Record<number, { ida?: JogoMM; volta?: JogoMM }>> = {
      oitavas: {},
      quartas: {},
      semis: {},
      final: {},
    }
    jogos.forEach(j => {
      if (!map[j.fase][j.ordem]) map[j.fase][j.ordem] = {}
      if (j.perna === 1) map[j.fase][j.ordem].ida = j
      else map[j.fase][j.ordem].volta = j
    })
    return map
  }, [jogos])

  function faseCompleta(fase: MMFase) {
    const ordens = Object.keys(jogosPorFase[fase]).map(Number)
    if (ordens.length === 0) return false
    for (const o of ordens) {
      const par = jogosPorFase[fase][o]
      if (!par.ida || !par.volta) return false
      if (par.ida.gols_time1 == null || par.ida.gols_time2 == null) return false
      if (par.volta.gols_time1 == null || par.volta.gols_time2 == null) return false
    }
    return true
  }

  function vencedoresDaFase(fase: MMFase) {
    const ordens = Object.keys(jogosPorFase[fase]).map(Number).sort((a, b) => a - b)
    const winners: Array<{ id: string; nome: string; seed: number }> = []
    for (const o of ordens) {
      const par = jogosPorFase[fase][o]
      if (!par.ida || !par.volta) return null
      const v = vencedorConfronto(par.ida, par.volta)
      if (!v) return null
      winners.push({ id: v.vencedorId, nome: v.vencedorNome, seed: v.seed })
    }
    return winners
  }

  function normalizaNomeTime(id: string, fallback?: string | null) {
    return timesMap[id]?.nome || fallback || id
  }

  async function gerarProximaFase(faseAtual: MMFase) {
    if (!isAdmin) return toast.error('Apenas admin pode gerar fases.')
    const prox = proximaFase[faseAtual]
    if (!prox) return toast.error('Não existe próxima fase (já é a final).')

    if (!faseCompleta(faseAtual)) {
      toast.error(`Ainda falta terminar todos os jogos de ${faseTitle[faseAtual]} (ida e volta).`)
      return
    }

    const winners = vencedoresDaFase(faseAtual)
    if (!winners) {
      toast.error('Não foi possível calcular os vencedores (confira placares).')
      return
    }

    // número de confrontos da próxima fase
    const qtdConfrontos = prox === 'quartas' ? 4 : prox === 'semis' ? 2 : 1
    if (winners.length !== qtdConfrontos * 2) {
      toast.error(`Quantidade de vencedores inesperada para gerar ${faseTitle[prox]}.`)
      return
    }

    // Limpa a próxima fase (se já existir)
    const del = await supabase.from('copa_mata_mata').delete().eq('fase', prox)
    if (del.error) {
      console.error(del.error)
      toast.error(`Erro ao limpar ${faseTitle[prox]} anteriores.`)
      return
    }

    // PAREAMENTO DO BRACKET:
    // - mantém ordem natural: (1 vs 2), (3 vs 4)...
    // - mando: seed melhor joga a volta em casa
    const rowsInsert: any[] = []
    for (let i = 0; i < qtdConfrontos; i++) {
      const A = winners[i * 2 + 0]
      const B = winners[i * 2 + 1]

      // decide quem tem seed melhor (menor)
      const melhor = (A.seed ?? 9999) <= (B.seed ?? 9999) ? A : B
      const pior = melhor.id === A.id ? B : A

      const ordem = i + 1

      // perna 1: pior em casa
      rowsInsert.push({
        fase: prox,
        perna: 1,
        ordem,
        id_time1: pior.id,
        id_time2: melhor.id,
        time1: normalizaNomeTime(pior.id, pior.nome),
        time2: normalizaNomeTime(melhor.id, melhor.nome),
        gols_time1: null,
        gols_time2: null,
        seed_time1: pior.seed,
        seed_time2: melhor.seed,
      })

      // perna 2: melhor em casa
      rowsInsert.push({
        fase: prox,
        perna: 2,
        ordem,
        id_time1: melhor.id,
        id_time2: pior.id,
        time1: normalizaNomeTime(melhor.id, melhor.nome),
        time2: normalizaNomeTime(pior.id, pior.nome),
        gols_time1: null,
        gols_time2: null,
        seed_time1: melhor.seed,
        seed_time2: pior.seed,
      })
    }

    const ins = await supabase.from('copa_mata_mata').insert(rowsInsert)
    if (ins.error) {
      console.error(ins.error)
      toast.error(`Erro ao criar ${faseTitle[prox]}.`)
      return
    }

    await supabase.from('bid').insert({
      tipo_evento: 'Sistema',
      descricao: `${faseTitle[prox]} geradas (ida/volta). Critério do agregado: melhor seed no empate.`,
      valor: null,
      data_evento: new Date().toISOString(),
    })

    toast.success(`✅ ${faseTitle[prox]} geradas!`)
    await carregarJogos()
    document.getElementById(`fase-${prox}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ================= RENDER HELPERS ================= */
  function renderConfrontoResumo(ida?: JogoMM, volta?: JogoMM) {
    if (!ida || !volta) return null
    const completos = ida.gols_time1 != null && ida.gols_time2 != null && volta.gols_time1 != null && volta.gols_time2 != null
    if (!completos) return <Badge tone="zinc">Aguardando jogos</Badge>

    const ag = calcAgregado(ida, volta)
    const aId = ida.id_time1
    const bId = ida.id_time2
    const a = ag[aId] || { gf: 0, ga: 0 }
    const b = ag[bId] || { gf: 0, ga: 0 }

    const emp = a.gf === b.gf
    const v = vencedorConfronto(ida, volta)
    const nomeV = v ? normalizaNomeTime(v.vencedorId, v.vencedorNome) : '—'
    const seedV = v?.seed ?? null

    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="sky">
          Agregado: {a.gf}-{b.gf}
        </Badge>
        {emp ? <Badge tone="amber">Empate no agregado → melhor seed</Badge> : <Badge tone="emerald">Vencedor no agregado</Badge>}
        <Badge tone={badgeTone(seedV) as any}>Classificado: {nomeV}</Badge>
      </div>
    )
  }

  /* ================= UI ================= */
  const fases: MMFase[] = ['oitavas', 'quartas', 'semis', 'final']

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
                COPA — Mata-mata (Ida e Volta) • {TEMPORADA}
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="amber">Empate no agregado: melhor seed</Badge>
              <Badge tone="sky">Volta em casa: seed melhor</Badge>
              <Badge tone="emerald">Finanças por jogo (COPA padrão)</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setLoading(true)
                await Promise.all([carregarTimesBase(), carregarJogos()])
                setLoading(false)
                toast.success('Atualizado.')
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
              type="button"
            >
              <FiRefreshCcw /> Atualizar
            </button>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => gerarProximaFase('oitavas')}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700"
                  type="button"
                >
                  <FiPlay /> Gerar Quartas
                </button>
                <button
                  onClick={() => gerarProximaFase('quartas')}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700"
                  type="button"
                >
                  <FiPlay /> Gerar Semis
                </button>
                <button
                  onClick={() => gerarProximaFase('semis')}
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700"
                  type="button"
                >
                  <FiPlay /> Gerar Final
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick nav */}
        <div className="mx-auto max-w-7xl px-4 pb-3 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-zinc-400">Ir para:</span>
          {fases.map(f => (
            <button
              key={f}
              onClick={() => document.getElementById(`fase-${f}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
              type="button"
            >
              {faseTitle[f]}
            </button>
          ))}
          <span className="ml-auto" />
          <button
            onClick={() => setAbertos({ oitavas: true, quartas: true, semis: true, final: true })}
            className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
            type="button"
          >
            expandir tudo
          </button>
          <button
            onClick={() => setAbertos({ oitavas: false, quartas: false, semis: false, final: false })}
            className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
            type="button"
          >
            recolher tudo
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900/60 border border-white/10" />
            ))}
          </div>
        ) : jogos.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center text-zinc-200">
            Nenhum jogo do mata-mata encontrado em <code>copa_mata_mata</code>.
            <br />
            Gere as oitavas na sua tela de grupos.
          </div>
        ) : (
          fases.map(fase => {
            const blocos = jogosPorFase[fase]
            const ordens = Object.keys(blocos).map(Number).sort((a, b) => a - b)
            const open = abertos[fase]

            return (
              <section id={`fase-${fase}`} key={fase} className="mb-8">
                <div className="sticky top-[64px] z-20">
                  <button
                    onClick={() => setAbertos(s => ({ ...s, [fase]: !open }))}
                    className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 px-4 py-3 hover:border-zinc-600/50 ring-1 ring-inset ring-white/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]"
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <Badge tone="emerald">{faseTitle[fase]}</Badge>
                      {faseCompleta(fase) ? <Badge tone="emerald">Fase completa</Badge> : <Badge tone="zinc">Em andamento</Badge>}
                    </div>
                    <span className="text-zinc-400 group-hover:text-white">{open ? <FiChevronUp /> : <FiChevronDown />}</span>
                  </button>
                </div>

                {open && (
                  <div className="mt-3 grid gap-3">
                    {ordens.map(ordem => {
                      const ida = blocos[ordem].ida
                      const volta = blocos[ordem].volta

                      // nomes/ids base do confronto (pela ida)
                      const idA = ida?.id_time1 || volta?.id_time2
                      const idB = ida?.id_time2 || volta?.id_time1

                      const nomeA = idA ? timesMap[idA]?.nome || ida?.time1 || idA : '—'
                      const nomeB = idB ? timesMap[idB]?.nome || ida?.time2 || idB : '—'

                      return (
                        <div key={`${fase}-${ordem}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge tone="sky">Confronto</Badge>
                              <span className="font-extrabold text-sky-200">#{ordem}</span>
                              <span className="text-zinc-300">•</span>
                              <span className="font-semibold">{nomeA}</span>
                              <span className="text-zinc-400">vs</span>
                              <span className="font-semibold">{nomeB}</span>
                            </div>

                            {renderConfrontoResumo(ida, volta)}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {/* Ida */}
                            {ida && (
                              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-950/70 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge tone="amber">Perna 1</Badge>
                                    <Badge tone={badgeTone(ida.seed_time1) as any}>Seed {ida.seed_time1 ?? '—'}</Badge>
                                    <span className="text-xs text-zinc-400">Mandante</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex min-w-[220px] items-center gap-3">
                                    <img
                                      src={timesMap[ida.id_time1]?.logo_url || '/default.png'}
                                      alt=""
                                      className="h-10 w-10 rounded-full border bg-white object-cover"
                                    />
                                    <span className="max-w-[180px] truncate font-semibold">
                                      {timesMap[ida.id_time1]?.nome || ida.time1 || ida.id_time1}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <ScoreInput
                                      value={ida.gols_time1}
                                      onChange={v =>
                                        setJogos(prev => prev.map(j => (j.id === ida.id ? { ...j, gols_time1: v } : j)))
                                      }
                                      disabled={!isAdmin}
                                    />
                                    <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                                    <ScoreInput
                                      value={ida.gols_time2}
                                      onChange={v =>
                                        setJogos(prev => prev.map(j => (j.id === ida.id ? { ...j, gols_time2: v } : j)))
                                      }
                                      disabled={!isAdmin}
                                    />
                                  </div>

                                  <div className="flex min-w-[220px] items-center justify-end gap-3">
                                    <span className="max-w-[180px] truncate font-semibold text-right">
                                      {timesMap[ida.id_time2]?.nome || ida.time2 || ida.id_time2}
                                    </span>
                                    <img
                                      src={timesMap[ida.id_time2]?.logo_url || '/default.png'}
                                      alt=""
                                      className="h-10 w-10 rounded-full border bg-white object-cover"
                                    />
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-400">
                                  {ida.renda != null && ida.publico != null ? (
                                    <span>
                                      🎟️ {Number(ida.publico).toLocaleString()} • 💰 {fmtBRL(Number(ida.renda))}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500">Sem relatório financeiro</span>
                                  )}

                                  {isAdmin && (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => salvarPlacar(ida)}
                                        disabled={salvandoId === ida.id}
                                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                        type="button"
                                      >
                                        <FiSave />
                                        {salvandoId === ida.id ? 'Salvando...' : 'Salvar'}
                                      </button>
                                      <button
                                        onClick={() => excluirPlacar(ida)}
                                        disabled={salvandoId === ida.id}
                                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                        type="button"
                                      >
                                        <FiTrash2 />
                                        {salvandoId === ida.id ? '...' : 'Excluir'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Volta */}
                            {volta && (
                              <div className="rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-950/70 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge tone="amber">Perna 2</Badge>
                                    <Badge tone={badgeTone(volta.seed_time1) as any}>Seed {volta.seed_time1 ?? '—'}</Badge>
                                    <span className="text-xs text-zinc-400">Mandante</span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex min-w-[220px] items-center gap-3">
                                    <img
                                      src={timesMap[volta.id_time1]?.logo_url || '/default.png'}
                                      alt=""
                                      className="h-10 w-10 rounded-full border bg-white object-cover"
                                    />
                                    <span className="max-w-[180px] truncate font-semibold">
                                      {timesMap[volta.id_time1]?.nome || volta.time1 || volta.id_time1}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <ScoreInput
                                      value={volta.gols_time1}
                                      onChange={v =>
                                        setJogos(prev => prev.map(j => (j.id === volta.id ? { ...j, gols_time1: v } : j)))
                                      }
                                      disabled={!isAdmin}
                                    />
                                    <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                                    <ScoreInput
                                      value={volta.gols_time2}
                                      onChange={v =>
                                        setJogos(prev => prev.map(j => (j.id === volta.id ? { ...j, gols_time2: v } : j)))
                                      }
                                      disabled={!isAdmin}
                                    />
                                  </div>

                                  <div className="flex min-w-[220px] items-center justify-end gap-3">
                                    <span className="max-w-[180px] truncate font-semibold text-right">
                                      {timesMap[volta.id_time2]?.nome || volta.time2 || volta.id_time2}
                                    </span>
                                    <img
                                      src={timesMap[volta.id_time2]?.logo_url || '/default.png'}
                                      alt=""
                                      className="h-10 w-10 rounded-full border bg-white object-cover"
                                    />
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-400">
                                  {volta.renda != null && volta.publico != null ? (
                                    <span>
                                      🎟️ {Number(volta.publico).toLocaleString()} • 💰 {fmtBRL(Number(volta.renda))}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500">Sem relatório financeiro</span>
                                  )}

                                  {isAdmin && (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => salvarPlacar(volta)}
                                        disabled={salvandoId === volta.id}
                                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                        type="button"
                                      >
                                        <FiSave />
                                        {salvandoId === volta.id ? 'Salvando...' : 'Salvar'}
                                      </button>
                                      <button
                                        onClick={() => excluirPlacar(volta)}
                                        disabled={salvandoId === volta.id}
                                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                        type="button"
                                      >
                                        <FiTrash2 />
                                        {salvandoId === volta.id ? '...' : 'Excluir'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* botão de gerar próxima fase contextual */}
                          {isAdmin && proximaFase[fase] && (
                            <div className="mt-3 flex items-center justify-end">
                              <button
                                onClick={() => gerarProximaFase(fase)}
                                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700"
                                type="button"
                              >
                                <FiPlay />
                                Gerar {faseTitle[proximaFase[fase] as MMFase]}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
