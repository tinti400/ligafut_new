
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

// 🔽 Motor de Estádio
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

/* ================= MODELO FIXO ================= */
type CopaModel = 'div1e2_2grupos_top4_quartas'
const MODELO_FIXO: CopaModel = 'div1e2_2grupos_top4_quartas'

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

/** ✅ Normaliza divisao (pega "1", 1, " 2 " etc.) */
function normDiv(v: any): number | null {
  const s = String(v ?? '').trim()
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * ✅ Fetch robusto: não confia no tipo do campo divisao no Postgres.
 * Puxa todos os times e filtra no client por divisao 1/2.
 * (Isso resolve o caso clássico de divisao ser TEXT em alguns registros e NUMERIC em outros, ou com espaços.)
 */
async function safeSelectTimesDiv1Div2(minimal = false) {
  const tries = minimal
    ? ['id,nome,logo_url,associacao,divisao', 'id,nome,logo_url,divisao', 'id,nome,divisao', '*']
    : [
        'id,nome,logo_url,pote,overall,valor,associacao,divisao',
        'id,nome,logo_url,overall,valor,associacao,divisao',
        'id,nome,logo_url,associacao,divisao',
        'id,nome,logo_url,divisao',
        '*',
      ]

  for (const s of tries) {
    const { data, error } = await supabase.from('times').select(s)
    if (!error && data) {
      const filtrados = (data as any[]).filter(t => {
        const d = normDiv(t.divisao)
        return d === 1 || d === 2
      })
      return filtrados
    }
  }
  return [] as any[]
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

  // 🔒 Modelo fixo
  const modelo: CopaModel = MODELO_FIXO
  void modelo // evita warning se não usar

  const cfg = useMemo(() => {
    return {
      title: 'Copa — 1ª + 2ª Divisão',
      subtitle: '2 Grupos (A/B)',
      divisoes: ['1', '2'], // (mantido apenas pra UI; a busca agora é robusta via client filter)
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
    const rows = await safeSelectTimesDiv1Div2(true)

    // ✅ aviso claro se não vier 16
    if (rows.length !== 16) {
      const nomes = rows.map((t: any) => t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id))
      toast(`⚠️ Times DIV1+DIV2 retornados: ${rows.length} (esperado 16)`, { icon: '⚠️' })
      console.warn('Times retornados:', nomes)
    } else {
      toast(`✅ Times DIV1+DIV2 carregados: ${rows.length}`, { icon: '✅' })
    }

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

  /* ===================== GERAR GRUPOS + CALENDÁRIO (DIV1+DIV2 2 GRUPOS) ===================== */
  const gerarFaseGrupos = async () => {
    if (!isAdmin) {
      toast.error('Apenas admin pode gerar a fase.')
      return
    }

    setGerando(true)
    try {
      const rows = await safeSelectTimesDiv1Div2(false)

      toast(`Times encontrados (DIV1+DIV2): ${rows?.length ?? 0}`, { icon: '🔎' })

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

      // ✅ remove duplicados por id (segurança)
      const uniq = new Map<string, TimeFull>()
      participantes.forEach(t => uniq.set(t.id, t))
      participantes = Array.from(uniq.values())

      // ✅ garante que está pegando TODOS (16)
      if (participantes.length !== 16) {
        toast.error(`⚠️ Era pra ter 16 times (DIV1+DIV2). Estou recebendo ${participantes.length}. Verifique RLS/ENV/valores de "divisao".`)
        console.warn('Participantes recebidos:', participantes.map(t => ({ id: t.id, nome: t.nome, divisao: t.divisao })))
        // mesmo assim continua (se você quiser travar, troque por return)
      }

      if (participantes.length < 8) {
        toast.error('Preciso de pelo menos 8 times somando 1ª+2ª divisão para fazer 2 grupos e quartas.')
        return
      }

      const embaralhados = shuffle(participantes)

      // ✅ divide A/B mesmo quando ímpar (A fica com +1)
      const half = Math.ceil(embaralhados.length / 2)

      const grupos: Record<'A' | 'B', TimeFull[]> = {
        A: embaralhados.slice(0, half),
        B: embaralhados.slice(half),
      }

      const calendario: { grupo: string; rodada: number; casa: string; fora: string }[] = []
      ;(['A', 'B'] as const).forEach(g => {
        const ids = grupos[g].map(t => t.id)
        const jogosG = gerarRoundRobin(ids)
        jogosG.forEach(j => calendario.push({ grupo: g, rodada: j.rodada, casa: j.casa, fora: j.fora }))
      })

      if (!calendario.length) {
        toast.error('Falha ao gerar calendário (2 grupos).')
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
        toast.error('Erro ao inserir confrontos dos grupos.')
        return
      }

      await atualizarClassificacao()
      await buscarJogos()
      await carregarTimesBase()

      await supabase.from('bid').insert([
        {
          tipo_evento: 'Sistema',
          descricao: `Copa (DIV1+DIV2) gerada — 2 grupos (A=${grupos.A.length} / B=${grupos.B.length}) • Top 4 → Quartas.`,
          valor: null,
          data_evento: new Date().toISOString(),
        },
      ])

      toast.success(`✅ Copa gerada: ${rowsInsert.length} jogos (2 grupos)`)
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
💵 ${n1}: R$ ${(receitaMandante + totalPremMandante).toLocaleString('pt-BR')}
💵 ${n2}: R$ ${(receitaVisitante + totalPremVisitante).toLocaleString('pt-BR')}`,
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
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false,
      }))

      const { error: insErr } = await supabase.from(TABELA_MM).insert(rowsInsert)
      if (insErr) {
        console.error(insErr)
        toast.error('Erro ao inserir chaves do mata-mata (quartas).')
        setChavesMM(chaves)
        return
      }

      await supabase.from('bid').insert([
        {
          tipo_evento: 'Sistema',
          descricao: `Mata-mata (Quartas) gerado pela Copa — ${TEMPORADA}`,
          valor: null,
          data_evento: new Date().toISOString(),
        },
      ])

      setChavesMM(chaves)
      toast.success('✅ Quartas de final geradas!')
      setAbrirModalMM(true)
    } finally {
      setGerandoMM(false)
    }
  }

  /* ===================== UI helpers ===================== */
  const nomeTime = (id: string) => timesMap[id]?.nome ?? id
  const logoTime = (id: string) => timesMap[id]?.logo_url ?? '/default.png'

  const jogosFiltrados = useMemo(() => {
    if (filtroTime === 'Todos') return jogos
    return jogos.filter(j => j.time1 === filtroTime || j.time2 === filtroTime)
  }, [jogos, filtroTime])

  const gruposOuRodadas = useMemo(() => {
    const keyset = new Set<string>()
    jogosFiltrados.forEach(j => keyset.add((j.grupo ?? `Rodada ${j.rodada}`) as string))
    return Array.from(keyset)
  }, [jogosFiltrados])

  const toggleSecao = (k: string) => {
    setSecoesAbertas(prev => ({ ...prev, [k]: !prev[k] }))
  }

  function limparTudo() {
    setFiltroTime('Todos')
  }

  /* ===================== RENDER ===================== */
  if (loading) {
    return (
      <div className="p-6 text-zinc-200">
        <div className="animate-pulse">Carregando Copa...</div>
      </div>
    )
  }

    return (
    <div className="p-6 space-y-6 text-zinc-100" ref={topRef}>
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight">{cfg.title}</h1>
              <Badge tone="sky">{TEMPORADA}</Badge>
              <Badge tone="violet">{cfg.subtitle}</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-300">
              Modelo fixo: 2 grupos (A/B). Top {CLASSIFICAM_POR_GRUPO} de cada grupo → {cfg.mataMataLabel}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setLoading(true)
                await Promise.all([carregarTimesBase(), buscarJogos()])
                setLoading(false)
                toast('🔄 Atualizado', { icon: '✅' })
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold hover:bg-white/[0.10]"
            >
              <FiRotateCcw />
              Atualizar
            </button>

            <button
              onClick={limparTudo}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold hover:bg-white/[0.10]"
            >
              Limpar filtros
            </button>

            {isAdmin && (
              <>
                <button
                  disabled={gerando}
                  onClick={gerarFaseGrupos}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-extrabold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {gerando ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                      Gerando...
                    </span>
                  ) : (
                    <>
                      <FiPlus />
                      Gerar Copa (Grupos)
                    </>
                  )}
                </button>

                <button
                  disabled={gerandoMM}
                  onClick={gerarMataMata}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-500/20 px-3 py-2 text-sm font-extrabold text-violet-200 hover:bg-violet-500/30 disabled:opacity-50"
                >
                  {gerandoMM ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
                      Gerando...
                    </span>
                  ) : (
                    <>
                      <FiChevronUp />
                      Gerar {cfg.mataMataLabel}
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filtro time */}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-xs font-bold text-zinc-300">Filtro por time</div>
            <select
              value={filtroTime}
              onChange={e => setFiltroTime(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-white/20"
            >
              <option value="Todos">Todos</option>
              {Object.keys(timesMap)
                .sort((a, b) => nomeTime(a).localeCompare(nomeTime(b)))
                .map(id => (
                  <option key={id} value={id}>
                    {nomeTime(id)}
                  </option>
                ))}
            </select>
            <div className="mt-2 text-xs text-zinc-400">
              Dica: se estiver aparecendo “4 times”, o problema costuma ser RLS/permissão do usuário ou valores inconsistentes
              no campo <span className="font-semibold">divisao</span>. Este page já faz filtro no client para pegar 1/2 mesmo
              com divisao em texto/num.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-zinc-300">Status de colunas</div>
              <Badge tone="amber">auto-detect</Badge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                temporada: <span className="font-semibold">{temColunaTemporada ? 'SIM' : 'NÃO'}</span>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                grupo: <span className="font-semibold">{temColunaGrupo ? 'SIM' : 'NÃO'}</span>
              </div>
              <div className="col-span-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                extras financeiros: <span className="font-semibold">{temExtrasFinanceiros ? 'SIM' : 'NÃO'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Classificação */}
      <div className="grid gap-4 md:grid-cols-2">
        {(GRUPOS as readonly string[]).map(g => {
          const rows = classificacaoPorGrupo[g] || []
          return (
            <div key={g} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold">Grupo {g}</h2>
                  <Badge tone="sky">Top {CLASSIFICAM_POR_GRUPO} passa</Badge>
                </div>
                <div className="text-xs text-zinc-400">{rows.length ? `${rows.length} times` : 'Sem dados'}</div>
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.04] text-xs text-zinc-300">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-2 py-2 text-right">PTS</th>
                      <th className="px-2 py-2 text-right">J</th>
                      <th className="px-2 py-2 text-right">V</th>
                      <th className="px-2 py-2 text-right">E</th>
                      <th className="px-2 py-2 text-right">D</th>
                      <th className="px-2 py-2 text-right">SG</th>
                      <th className="px-2 py-2 text-right">GP</th>
                      <th className="px-2 py-2 text-right">GC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const passa = idx < CLASSIFICAM_POR_GRUPO
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-white/10 ${
                            passa ? 'bg-emerald-500/10' : 'bg-transparent'
                          }`}
                        >
                          <td className="px-3 py-2 font-bold">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={logoTime(r.id)}
                                alt=""
                                className="h-6 w-6 rounded-full border border-white/10 bg-black/40 object-contain"
                              />
                              <span className="font-semibold">{nomeTime(r.id)}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right font-extrabold">{r.pts}</td>
                          <td className="px-2 py-2 text-right">{r.j}</td>
                          <td className="px-2 py-2 text-right">{r.v}</td>
                          <td className="px-2 py-2 text-right">{r.e}</td>
                          <td className="px-2 py-2 text-right">{r.d}</td>
                          <td className="px-2 py-2 text-right">{r.sg}</td>
                          <td className="px-2 py-2 text-right">{r.gp}</td>
                          <td className="px-2 py-2 text-right">{r.gc}</td>
                        </tr>
                      )
                    })}
                    {!rows.length && (
                      <tr>
                        <td className="px-3 py-6 text-center text-sm text-zinc-400" colSpan={10}>
                          Sem jogos com placar salvo ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs text-zinc-400">
                Critérios: Pontos → Saldo de gols → Gols pró.
              </div>
            </div>
          )
        })}
      </div>

      {/* Jogos */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold">Jogos</h2>
            <Badge tone="zinc">{jogosFiltrados.length} jogos</Badge>
          </div>
          {!isAdmin && <Badge tone="amber">Somente leitura (admin salva)</Badge>}
        </div>

        <div className="space-y-3">
          {gruposOuRodadas.map(sec => {
            const aberto = !!secoesAbertas[sec]
            const lista = jogosFiltrados.filter(j => (j.grupo ?? `Rodada ${j.rodada}`) === sec)

            return (
              <div key={sec} className="overflow-hidden rounded-2xl border border-white/10">
                <button
                  onClick={() => toggleSecao(sec)}
                  className="flex w-full items-center justify-between bg-white/[0.04] px-4 py-3 text-left hover:bg-white/[0.07]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold">{sec}</span>
                    <span className="text-xs text-zinc-400">{lista.length} jogos</span>
                  </div>
                  <div className="text-zinc-300">{aberto ? <FiChevronUp /> : <FiChevronDown />}</div>
                </button>

                {aberto && (
                  <div className="divide-y divide-white/10">
                    {lista.map(jogo => {
                      const mand = nomeTime(jogo.time1)
                      const vist = nomeTime(jogo.time2)
                      const gm = jogo.gols_time1 ?? 0
                      const gv = jogo.gols_time2 ?? 0
                      const temPlacar = jogo.gols_time1 != null && jogo.gols_time2 != null

                      const setGol = (id: number, lado: 'm' | 'v', v: string) => {
                        const n = clampInt(Number(v))
                        setJogos(prev =>
                          prev.map(x => {
                            if (x.id !== id) return x
                            return lado === 'm' ? { ...x, gols_time1: n } : { ...x, gols_time2: n }
                          })
                        )
                      }

                      return (
                        <div key={jogo.id} className="bg-black/20 px-4 py-3">
                          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
                            {/* mandante */}
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={logoTime(jogo.time1)}
                                alt=""
                                className="h-8 w-8 rounded-full border border-white/10 bg-black/40 object-contain"
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-extrabold">{mand}</div>
                                <div className="text-xs text-zinc-400">Mandante</div>
                              </div>
                            </div>

                            {/* placar */}
                            <div className="flex items-center justify-center gap-2">
                              <input
                                disabled={!isAdmin}
                                value={String(jogo.gols_time1 ?? '')}
                                onChange={e => setGol(jogo.id, 'm', e.target.value)}
                                inputMode="numeric"
                                className="w-14 rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-center text-sm font-extrabold outline-none focus:border-white/20 disabled:opacity-60"
                                placeholder="-"
                              />
                              <span className="text-zinc-400">x</span>
                              <input
                                disabled={!isAdmin}
                                value={String(jogo.gols_time2 ?? '')}
                                onChange={e => setGol(jogo.id, 'v', e.target.value)}
                                inputMode="numeric"
                                className="w-14 rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-center text-sm font-extrabold outline-none focus:border-white/20 disabled:opacity-60"
                                placeholder="-"
                              />
                            </div>

                            {/* visitante */}
                            <div className="flex items-center justify-end gap-3">
                              <div className="min-w-0 text-right">
                                <div className="truncate text-sm font-extrabold">{vist}</div>
                                <div className="text-xs text-zinc-400">Visitante</div>
                              </div>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={logoTime(jogo.time2)}
                                alt=""
                                className="h-8 w-8 rounded-full border border-white/10 bg-black/40 object-contain"
                              />
                            </div>

                            {/* ações */}
                            <div className="flex items-center justify-end gap-2">
                              {temPlacar && (
                                <Badge tone={jogo.bonus_pago ? 'emerald' : 'amber'}>
                                  {jogo.bonus_pago ? 'Bonus pago' : 'Pendente bônus'}
                                </Badge>
                              )}

                              {isAdmin && (
                                <>
                                  <button
                                    disabled={salvandoId === jogo.id}
                                    onClick={() => salvarPlacar({ ...jogo, gols_time1: gm, gols_time2: gv })}
                                    className="inline-flex items-center gap-2 rounded-xl bg-sky-500/20 px-3 py-2 text-sm font-extrabold text-sky-200 hover:bg-sky-500/30 disabled:opacity-50"
                                  >
                                    <FiSave />
                                    {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                                  </button>

                                  <button
                                    disabled={salvandoId === jogo.id}
                                    onClick={() => excluirPlacar(jogo)}
                                    className="inline-flex items-center gap-2 rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-extrabold text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                                  >
                                    <FiTrash2 />
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* extras (visual) */}
                          {temPlacar && temExtrasFinanceiros && (
                            <div className="mt-3 grid gap-2 md:grid-cols-4">
                              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                <div className="text-[11px] text-zinc-400">Público</div>
                                <div className="text-sm font-extrabold">{(jogo.publico ?? 0).toLocaleString('pt-BR')}</div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                <div className="text-[11px] text-zinc-400">Renda</div>
                                <div className="text-sm font-extrabold">
                                  R$ {(jogo.renda ?? 0).toLocaleString('pt-BR')}
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                <div className="text-[11px] text-zinc-400">Salários (M/V)</div>
                                <div className="text-sm font-extrabold">
                                  R$ {(jogo.salarios_mandante ?? 0).toLocaleString('pt-BR')} / R${' '}
                                  {(jogo.salarios_visitante ?? 0).toLocaleString('pt-BR')}
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                                <div className="text-[11px] text-zinc-400">Bônus total (M/V)</div>
                                <div className="text-sm font-extrabold">
                                  R$ {(jogo.premiacao_mandante ?? 0).toLocaleString('pt-BR')} / R${' '}
                                  {(jogo.premiacao_visitante ?? 0).toLocaleString('pt-BR')}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {!lista.length && (
                      <div className="px-4 py-6 text-center text-sm text-zinc-400">Nenhum jogo nesta seção.</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!gruposOuRodadas.length && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-zinc-300">
              Nenhum jogo encontrado. Se você é admin, clique em <span className="font-extrabold">Gerar Copa</span>.
            </div>
          )}
        </div>
      </div>

      {/* Modal Mata-mata */}
      {abrirModalMM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-5 py-4">
              <div>
                <div className="text-lg font-extrabold">{cfg.mataMataLabel} geradas</div>
                <div className="text-xs text-zinc-400">Chaves salvas em {TABELA_MM} (fase=quartas).</div>
              </div>
              <button
                onClick={() => setAbrirModalMM(false)}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold hover:bg-white/[0.10]"
              >
                Fechar
              </button>
            </div>

            <div className="p-5">
              <div className="grid gap-3 md:grid-cols-2">
                {chavesMM.map(c => (
                  <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 text-sm font-extrabold">{c.label}</div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoTime(c.casaId)}
                          alt=""
                          className="h-7 w-7 rounded-full border border-white/10 bg-black/40 object-contain"
                        />
                        <div className="text-sm font-bold">{nomeTime(c.casaId)}</div>
                      </div>
                      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoTime(c.foraId)}
                          alt=""
                          className="h-7 w-7 rounded-full border border-white/10 bg-black/40 object-contain"
                        />
                        <div className="text-sm font-bold">{nomeTime(c.foraId)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-300">
                <div className="font-extrabold text-zinc-200">Regras financeiras</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Ao salvar placar: público/renda via estádio (fallback aleatório se não achar estádio).</li>
                  <li>Renda: 95% mandante / 5% visitante + participação fixa por jogo (R$ 3.000.000 cada).</li>
                  <li>Bônus por desempenho: vitória/empate/derrota + gols pró - gols contra (COPA padrão).</li>
                  <li>Salários são descontados após a partida (com registro e bid).</li>
                  <li>Excluir placar faz estorno de tudo (renda, bônus total e devolve salários) + ajusta jogos do elenco.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



