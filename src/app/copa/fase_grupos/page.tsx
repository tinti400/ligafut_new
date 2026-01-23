'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import {
  FiRotateCcw,
  FiSave,
  FiTrash2,
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

/* ================= MODELO FIXO (REGULAMENTO) =================
✅ 2 grupos (A/B)
✅ APENAS times da 1ª divisão
✅ TOP 4 de cada grupo classifica
✅ Mata-mata começa nas Quartas
============================================================== */
type CopaModel = 'div1_2grupos_top4_quartas'
const MODELO_FIXO: CopaModel = 'div1_2grupos_top4_quartas'

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
    const { data, error } = await supabase.from('times').select(s).in('divisao', divisoes)
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

      // alterna mando para equilibrar
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

  // 🔒 Modelo fixo (2 grupos, só div1, top4 classifica)
  const modelo: CopaModel = MODELO_FIXO

  const cfg = useMemo(() => {
    return {
      title: 'Copa — 1ª Divisão',
      subtitle: '2 Grupos (A/B)',
      divisoes: ['1'],
      grupos: ['A', 'B'] as const,
      classificam: 4,
      mataMataFase: 'quartas' as const,
      mataMataLabel: 'Quartas',
    }
  }, [])

  const GRUPOS = cfg.grupos
  const CLASSIFICAM_POR_GRUPO = cfg.classificam

  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [gerando, setGerando] = useState(false)

  const [temColunaTemporada, setTemColunaTemporada] = useState<boolean>(true)
  const [temColunaGrupo, setTemColunaGrupo] = useState<boolean>(true)
  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  // UI
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>({})
  const topRef = useRef<HTMLDivElement | null>(null)

  // Mata-mata
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
    const rows = await safeSelectTimesByDivisoes(cfg.divisoes, true)
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
      jogadores.map(j => supabase.from('elenco').update({ jogos: Math.max(0, (j.jogos || 0) + delta) }).eq('id', j.id))
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

  /* ===================== GERAR GRUPOS + CALENDÁRIO (FIXO DIV1 2 GRUPOS) ===================== */
  const gerarFaseGrupos = async () => {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar a fase.')
      return
    }

    setGerando(true)
    try {
      const rows = await safeSelectTimesByDivisoes(cfg.divisoes, false)
      toast(`Times encontrados (DIV1): ${rows?.length ?? 0}`, { icon: '🔎' })

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

      if (participantes.length < 8) {
        toast.error('Preciso de pelo menos 8 times na 1ª divisão para fazer 2 grupos e quartas.')
        return
      }

      // precisa ser par pra dividir em 2
      if (participantes.length % 2 === 1) {
        const ord = [...participantes].sort(sortMaisFracosPrimeiro)
        const removido = ord[0]
        participantes = participantes.filter(t => t.id !== removido.id)
        toast(`⚠️ Nº ímpar de times na 1ª divisão. Removi 1 mais fraco: ${removido.nome}`, { icon: 'ℹ️' })
      }

      const half = participantes.length / 2
      const embaralhados = shuffle(participantes)

      const grupos: Record<'A' | 'B', TimeFull[]> = {
        A: embaralhados.slice(0, half),
        B: embaralhados.slice(half),
      }

      // calendário de cada grupo
      const calendario: { grupo: string; rodada: number; casa: string; fora: string }[] = []
      ;(['A', 'B'] as const).forEach(g => {
        const ids = grupos[g].map(t => t.id)
        const jogosG = gerarRoundRobin(ids)
        jogosG.forEach(j => calendario.push({ grupo: g, rodada: j.rodada, casa: j.casa, fora: j.fora }))
      })

      if (!calendario.length) {
        toast.error('Falha ao gerar calendário (DIV1 2 grupos).')
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
        toast.error('Erro ao inserir confrontos dos grupos (DIV1).')
        return
      }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([
        {
          tipo_evento: 'Sistema',
          descricao: `Copa (DIV1) gerada — 2 grupos (${half} times por grupo) • Top 4 → Quartas.`,
          valor: null,
          data_evento: new Date().toISOString(),
        },
      ])

      toast.success(`✅ Copa DIV1 gerada: ${rowsInsert.length} jogos (2 grupos)`)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setGerando(false)
    }
  }

  /* ===================== Salvar / Ajuste / Excluir ===================== */
  async function salvarAjusteResultado(jogo: Jogo, gm: number, gv: number, silencioso = false) {
    if (!isAdmin) return
    const { error } = await supabase.from(TABELA_GRUPOS).update({ gols_time1: gm, gols_time2: gv, bonus_pago: true }).eq('id', jogo.id)

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

    const { data: existente, error: erroVer } = await supabase.from(TABELA_GRUPOS).select('bonus_pago').eq('id', jogo.id).single()
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

    const { error: erroPlacar } = await supabase.from(TABELA_GRUPOS).update({ ...patchBase, ...patchExtras }).eq('id', jogo.id)
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
        receitaMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante }) : Promise.resolve(),
        receitaVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante }) : Promise.resolve(),
        salariosMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }) : Promise.resolve(),
        salariosVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }) : Promise.resolve(),
        premiacaoMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante }) : Promise.resolve(),
        premiacaoVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante }) : Promise.resolve(),
      ])

      const movs: any[] = []
      if (receitaMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_receita', valor: receitaMandante, descricao: 'Estorno receita de partida (COPA)', data: now })
      if (receitaVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_receita', valor: receitaVisitante, descricao: 'Estorno receita de partida (COPA)', data: now })
      if (salariosMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_salario', valor: salariosMandante, descricao: 'Estorno de salários (COPA)', data: now })
      if (salariosVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_salario', valor: salariosVisitante, descricao: 'Estorno de salários (COPA)', data: now })
      if (premiacaoMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_bonus_total', valor: premiacaoMandante, descricao: 'Estorno de bônus (participação + desempenho) — COPA', data: now })
      if (premiacaoVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_bonus_total', valor: premiacaoVisitante, descricao: 'Estorno de bônus (participação + desempenho) — COPA', data: now })
      if (movs.length) await supabase.from('movimentacoes').insert(movs)

      const bids: any[] = []
      if (receitaMandante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida (COPA)', id_time1: mandanteId, valor: -receitaMandante, data_evento: now })
      if (receitaVisitante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida (COPA)', id_time1: visitanteId, valor: -receitaVisitante, data_evento: now })
      if (salariosMandante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários) — COPA', id_time1: mandanteId, valor: +salariosMandante, data_evento: now })
      if (salariosVisitante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários) — COPA', id_time1: visitanteId, valor: +salariosVisitante, data_evento: now })
      if (premiacaoMandante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus (participação + desempenho) — COPA', id_time1: mandanteId, valor: -premiacaoMandante, data_evento: now })
      if (premiacaoVisitante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus (participação + desempenho) — COPA', id_time1: visitanteId, valor: -premiacaoVisitante, data_evento: now })
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

  /* ===================== GERAR MATA-MATA (QUARTAS) ===================== */
  async function gerarMataMata() {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar o mata-mata.')
      return
    }

    setGerandoMM(true)
    try {
      const gruposOk = (cfg.grupos as readonly string[]).every(g => (classificacaoPorGrupo[g]?.length ?? 0) >= CLASSIFICAM_POR_GRUPO)
      if (!gruposOk) {
        toast.error(`Preciso de pelo menos ${CLASSIFICAM_POR_GRUPO} times classificados em cada grupo.`)
        return
      }

      // 2 grupos -> QUARTAS (8 times)
      const A = classificacaoPorGrupo['A']
      const B = classificacaoPorGrupo['B']
      const A1 = A[0].id, A2 = A[1].id, A3 = A[2].id, A4 = A[3].id
      const B1 = B[0].id, B2 = B[1].id, B3 = B[2].id, B4 = B[3].id

      const chaves = [
        { casaId: A1, foraId: B4, label: 'QF1 — A1 x B4' },
        { casaId: B2, foraId: A3, label: 'QF2 — B2 x A3' },
        { casaId: B1, foraId: A4, label: 'QF3 — B1 x A4' },
        { casaId: A2, foraId: B3, label: 'QF4 — A2 x B3' },
      ]

      // limpar fase no banco (quartas) — com temporada se existir
      const del = temColunaTemporada
        ? await supabase.from(TABELA_MM).delete().eq('fase', 'quartas').eq('temporada', TEMPORADA)
        : await supabase.from(TABELA_MM).delete().eq('fase', 'quartas')

      // @ts-ignore
      if (del?.error) {
        toast('⚠️ Não consegui limpar/usar tabela copa_mata_mata. Verifique se ela existe no banco.', { icon: 'ℹ️' })
        setChavesMM(chaves)
        return
      }

      const rowsInsert = chaves.map((c, idx) => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        fase: 'quartas',
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
        toast.error('Erro ao gravar quartas no banco (copa_mata_mata).')
        setChavesMM(chaves)
        return
      }

      setChavesMM(chaves)

      await supabase.from('bid').insert({
        tipo_evento: 'Sistema',
        descricao: `Mata-mata gerado (Quartas) — Copa DIV1 — salvo em ${TABELA_MM}.`,
        valor: null,
        data_evento: new Date().toISOString(),
      })

      toast.success('✅ Quartas geradas (Top 4 de cada grupo)!')
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

    const Score = ({
    value,
    onChange,
    disabled,
  }: {
    value: number | null
    onChange: (v: number) => void
    disabled?: boolean
  }) => {
    const v = value ?? 0
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(clampInt(v - 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-40"
          title="Diminuir"
        >
          <FiMinus />
        </button>

        <input
          value={v}
          disabled={disabled}
          onChange={e => onChange(clampInt(Number(e.target.value)))}
          inputMode="numeric"
          className="h-8 w-14 rounded-md border border-white/10 bg-black/40 text-center text-sm text-zinc-100 outline-none focus:border-white/25 disabled:opacity-50"
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(clampInt(v + 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 disabled:opacity-40"
          title="Aumentar"
        >
          <FiPlus />
        </button>
      </div>
    )
  }

  const toggleSecao = (key: string) =>
    setSecoesAbertas(prev => ({
      ...prev,
      [key]: !prev[key],
    }))

  const setGol = (id: number, side: 't1' | 't2', v: number) => {
    setJogos(prev =>
      prev.map(j => {
        if (j.id !== id) return j
        return {
          ...j,
          gols_time1: side === 't1' ? v : j.gols_time1,
          gols_time2: side === 't2' ? v : j.gols_time2,
        }
      })
    )
  }

  const resetarInputsLocais = () => {
    // volta para o que está no banco (recarrega)
    buscarJogos()
    toast('Revertido para os dados do banco.', { icon: '↩️' })
  }

  const renderTimeChip = (id: string) => {
    const t = timesMap[id]
    return (
      <div className="flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t?.logo_url || '/default.png'}
          alt=""
          className="h-7 w-7 rounded-full border border-white/10 bg-white/5 object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{t?.nome ?? id}</div>
          {t?.associacao ? (
            <div className="truncate text-[11px] text-zinc-400">{t.associacao}</div>
          ) : (
            <div className="text-[11px] text-zinc-500">—</div>
          )}
        </div>
      </div>
    )
  }

  const SecaoHeader = ({ title, open }: { title: string; open: boolean }) => (
    <button
      type="button"
      onClick={() => toggleSecao(title)}
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
    >
      <div className="flex items-center gap-3">
        <Badge tone="sky">{cfg.subtitle}</Badge>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
      </div>
      <div className="text-zinc-300">{open ? <FiChevronUp /> : <FiChevronDown />}</div>
    </button>
  )

  if (loading) {
    return (
      <div className="min-h-[60vh] rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-200">
        Carregando Copa…
      </div>
    )
  }

  return (
    <div ref={topRef} className="space-y-5">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-black/40 p-5">
        <div className="absolute inset-0 opacity-20 [mask-image:radial-gradient(circle_at_top,black,transparent_60%)]">
          <div className="h-full w-full bg-[url('/watermarks/ligafut26.png')] bg-center bg-no-repeat opacity-50" />
        </div>

        <div className="relative flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white">{cfg.title}</h1>
              <Badge tone="violet">{TEMPORADA}</Badge>
              <Badge tone="emerald">Modelo fixo</Badge>
              <Badge tone="amber">Top {CLASSIFICAM_POR_GRUPO} → {cfg.mataMataLabel}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-300">
              Somente times da 1ª divisão • 2 grupos (A/B) • Calendário round-robin por grupo
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                Participantes: <b className="text-white">{totalParticipantes}</b>
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                Jogos: <b className="text-white">{totalJogos}</b>
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                Financeiro: <b className="text-white">{temExtrasFinanceiros ? 'ON' : 'OFF'}</b>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-xs text-zinc-300">Filtrar time</span>
              <select
                value={filtroTime}
                onChange={e => setFiltroTime(e.target.value)}
                className="h-9 rounded-lg border border-white/10 bg-black/50 px-2 text-sm text-zinc-100 outline-none focus:border-white/25"
              >
                <option value="Todos">Todos</option>
                {nomesDosTimes.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={resetarInputsLocais}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-100 hover:bg-white/10"
            >
              <FiRotateCcw />
              Reverter
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  disabled={gerando}
                  onClick={gerarFaseGrupos}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-extrabold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
                >
                  {gerando ? 'Gerando…' : 'Gerar Grupos & Jogos'}
                </button>

                <button
                  type="button"
                  disabled={gerandoMM}
                  onClick={async () => {
                    await gerarMataMata()
                    setAbrirModalMM(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm font-extrabold text-sky-200 hover:bg-sky-500/15 disabled:opacity-40"
                >
                  {gerandoMM ? 'Gerando…' : `Gerar ${cfg.mataMataLabel}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CLASSIFICAÇÃO */}
      <div className="grid gap-4 md:grid-cols-2">
        {GRUPOS.map(g => {
          const rows = classificacaoPorGrupo[g] || []
          return (
            <div key={g} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone={g === 'A' ? 'sky' : 'violet'}>Grupo {g}</Badge>
                  <span className="text-sm font-semibold text-zinc-100">Classificação</span>
                </div>
                <span className="text-xs text-zinc-400">Critérios: Pts • SG • GP</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="grid grid-cols-[36px_1fr_40px_40px_40px_40px_50px_50px_50px] gap-0 bg-white/5 px-3 py-2 text-[11px] font-bold uppercase text-zinc-300">
                  <div>#</div>
                  <div>Time</div>
                  <div className="text-right">Pts</div>
                  <div className="text-right">J</div>
                  <div className="text-right">V</div>
                  <div className="text-right">E</div>
                  <div className="text-right">D</div>
                  <div className="text-right">SG</div>
                  <div className="text-right">GP</div>
                </div>

                {rows.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-zinc-400">Sem dados ainda (salve placares).</div>
                ) : (
                  rows.map((r, idx) => {
                    const classifica = idx < CLASSIFICAM_POR_GRUPO
                    const linhaCls = classifica
                      ? 'bg-emerald-500/10'
                      : 'bg-black/10'

                    return (
                      <div
                        key={r.id}
                        className={`grid grid-cols-[36px_1fr_40px_40px_40px_40px_50px_50px_50px] items-center gap-0 px-3 py-2 text-sm text-zinc-100 border-t border-white/10 ${linhaCls}`}
                      >
                        <div className="text-zinc-300">{idx + 1}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={timesMap[r.id]?.logo_url || '/default.png'}
                              alt=""
                              className="h-6 w-6 rounded-full border border-white/10 bg-white/5 object-cover"
                            />
                            <div className="truncate font-semibold">{timesMap[r.id]?.nome ?? r.id}</div>
                            {classifica && <Badge tone="emerald">TOP {CLASSIFICAM_POR_GRUPO}</Badge>}
                          </div>
                        </div>
                        <div className="text-right font-extrabold text-white">{r.pts}</div>
                        <div className="text-right text-zinc-200">{r.j}</div>
                        <div className="text-right text-zinc-200">{r.v}</div>
                        <div className="text-right text-zinc-200">{r.e}</div>
                        <div className="text-right text-zinc-200">{r.d}</div>
                        <div className="text-right text-zinc-200">{r.sg}</div>
                        <div className="text-right text-zinc-200">{r.gp}</div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* JOGOS */}
      <div className="space-y-3">
        {listaGrupos.map(grupo => {
          const rodadas = Object.keys(jogosPorGrupoRodada[grupo] || {})
            .map(Number)
            .sort((a, b) => a - b)

          return (
            <div key={grupo} className="space-y-3">
              <SecaoHeader title={`Grupo ${grupo}`} open={!!secoesAbertas[`Grupo ${grupo}`]} />
              {!!secoesAbertas[`Grupo ${grupo}`] && (
                <div className="space-y-3">
                  {rodadas.map(r => {
                    const key = `Grupo ${grupo} — Rodada ${r}`
                    const open = secoesAbertas[key] ?? (r <= 2)
                    const itens = jogosPorGrupoRodada[grupo]?.[r] || []

                    return (
                      <div key={key} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => toggleSecao(key)}
                          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left hover:bg-white/5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge tone="zinc">Rodada {r}</Badge>
                            <span className="text-sm font-semibold text-zinc-100">{itens.length} jogos</span>
                          </div>
                          <div className="text-zinc-300">{open ? <FiChevronUp /> : <FiChevronDown />}</div>
                        </button>

                        {open && (
                          <div className="grid gap-2">
                            {itens.map(j => {
                              const disabled = !isAdmin || salvandoId === j.id
                              const temPlacar = j.gols_time1 != null && j.gols_time2 != null
                              const pago = !!j.bonus_pago

                              return (
                                <div
                                  key={j.id}
                                  className="rounded-2xl border border-white/10 bg-black/40 p-4"
                                >
                                  <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
                                    <div className="flex items-center justify-between gap-3">
                                      {renderTimeChip(j.time1)}
                                      <Badge tone="zinc">Mandante</Badge>
                                    </div>

                                    <div className="flex items-center justify-center gap-2">
                                      <Score
                                        value={j.gols_time1}
                                        disabled={disabled}
                                        onChange={v => setGol(j.id, 't1', v)}
                                      />
                                      <span className="px-2 text-zinc-400">x</span>
                                      <Score
                                        value={j.gols_time2}
                                        disabled={disabled}
                                        onChange={v => setGol(j.id, 't2', v)}
                                      />
                                    </div>

                                    <div className="flex items-center justify-between gap-3 md:justify-end">
                                      <Badge tone="zinc">Visitante</Badge>
                                      {renderTimeChip(j.time2)}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      {temPlacar ? (
                                        pago ? <Badge tone="emerald">Bônus pago</Badge> : <Badge tone="amber">Sem bônus</Badge>
                                      ) : (
                                        <Badge tone="zinc">Sem placar</Badge>
                                      )}

                                      {isAdmin && (
                                        <>
                                          <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => salvarPlacar(j)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-extrabold text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-40"
                                          >
                                            <FiSave />
                                            {salvandoId === j.id ? 'Salvando…' : 'Salvar'}
                                          </button>

                                          <button
                                            type="button"
                                            disabled={disabled || !pago}
                                            onClick={() => excluirPlacar(j)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-extrabold text-rose-200 hover:bg-rose-500/15 disabled:opacity-40"
                                          >
                                            <FiTrash2 />
                                            Excluir
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {temExtrasFinanceiros && temPlacar && pago && (
                                    <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-zinc-200 md:grid-cols-3">
                                      <div>
                                        <div className="text-zinc-400">Público</div>
                                        <div className="font-bold">{(j.publico ?? 0).toLocaleString('pt-BR')}</div>
                                      </div>
                                      <div>
                                        <div className="text-zinc-400">Renda</div>
                                        <div className="font-bold">
                                          {(j.renda ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                                        </div>
                                      </div>
                                      <div className="md:text-right">
                                        <div className="text-zinc-400">Receita (M/V)</div>
                                        <div className="font-bold">
                                          {(j.receita_mandante ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}{' '}
                                          /{' '}
                                          {(j.receita_visitante ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {isAdmin && temPlacar && pago && (
                                    <div className="mt-2 text-[11px] text-zinc-400">
                                      Dica: se quiser só corrigir o placar sem “pagar bônus de novo”, basta editar os gols e clicar em <b>Salvar</b>.
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODAL CHAVES (simples) */}
      {abrirModalMM && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <div className="text-sm font-extrabold text-white">{cfg.mataMataLabel} — Chaves</div>
                <div className="text-xs text-zinc-400">
                  Gerado por classificação (A1×B4, B2×A3, B1×A4, A2×B3)
                </div>
              </div>
              <button
                onClick={() => setAbrirModalMM(false)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-2 p-4">
              {chavesMM.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                  Ainda não foi possível gerar as chaves. Verifique se há classificados suficientes e se a tabela{' '}
                  <b>{TABELA_MM}</b> existe no banco.
                </div>
              ) : (
                chavesMM.map(c => (
                  <div
                    key={c.label}
                    className="rounded-xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="text-xs font-bold text-zinc-300">{c.label}</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        {renderTimeChip(c.casaId)}
                      </div>
                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        {renderTimeChip(c.foraId)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-white/10 p-4 text-xs text-zinc-400">
              Observação: este page apenas gera e salva as Quartas (fase “quartas”) na tabela <b>{TABELA_MM}</b>.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


