'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import {
  FiRotateCcw, FiSave, FiTrash2, FiTarget,
  FiMinus, FiPlus, FiChevronDown, FiChevronUp
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

/* ================= TYPES ================= */
type Jogo = {
  id: number
  rodada: number
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
}

/* ================= REGRAS FINANCEIRAS (COPA — PADRÃO) ================= */
const COPA_PARTICIPACAO_POR_JOGO = 10_000_000
const COPA_VITORIA = 18_000_000
const COPA_EMPATE  = 9_000_000
const COPA_DERROTA = 5_000_000
const COPA_GOL_MARCADO = 880_000
const COPA_GOL_SOFRIDO = 160_000

/* ================= SWISS CONFIG ================= */
const ROUNDS = 8
const CASA_MAX = 4
const FORA_MAX = 4

/* ================= HELPERS (fora do componente) ================= */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))
const keyPair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

async function safeSelectTimes(minimal = false) {
  const tries = minimal
    ? ['id,nome,logo_url', '*']
    : ['id,nome,logo_url,pote,overall,valor,associacao', 'id,nome,logo_url,pote,overall,valor', 'id,nome,logo_url', '*']
  for (const s of tries) {
    const { data, error } = await supabase.from('times').select(s)
    if (!error) return data as any[]
  }
  return [] as any[]
}

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

/* ===== Gerador Swiss (8 rodadas, sem BYE) ===== */
type CalendarioItem = { rodada: number; casa: string; fora: string }
function gerarChampionsSwiss(participantes: TimeFull[], evitarMesmoPais = true): CalendarioItem[] {
  const ids = participantes.map(t => t.id)
  if (ids.length < 2 || ids.length % 2 === 1) return []

  const byId: Record<string, TimeFull> = {}; participantes.forEach(t => { byId[t.id] = t })
  const potes = atribuirPotes(participantes)
  const needPot: Record<string, Record<number, number>> = {}
  const homeCnt: Record<string, number> = {}
  const awayCnt: Record<string, number> = {}
  const playedPairs = new Set<string>()
  const jogosRestantes: Record<string, number> = {}
  ids.forEach(id => { needPot[id] = { 1: 2, 2: 2, 3: 2, 4: 2 }; homeCnt[id] = 0; awayCnt[id] = 0; jogosRestantes[id] = ROUNDS })

  const calendario: CalendarioItem[] = []
  for (let rodada = 1; rodada <= ROUNDS; rodada++) {
    const livres = new Set(ids)
    const scoreTeam = (id: string) => {
      const np = needPot[id]; const needScore = np[1] + np[2] + np[3] + np[4]
      const mandoScore = (CASA_MAX - homeCnt[id]) + (FORA_MAX - awayCnt[id])
      return jogosRestantes[id] * 10 + needScore * 2 + mandoScore
    }

    while (livres.size >= 2) {
      const arr = Array.from(livres).sort((a, b) => scoreTeam(b) - scoreTeam(a))
      const a = arr[0]

      let cand = arr.slice(1).filter(b => !playedPairs.has(keyPair(a, b)))

      const potA = potes[a] ?? 4
      let L = cand.filter(b =>
        (needPot[a][potes[b] ?? 4] ?? 0) > 0 &&
        (needPot[b][potA] ?? 0) > 0
      )

      if (evitarMesmoPais && byId[a]?.associacao) {
        const alt = L.filter(b => byId[b]?.associacao !== byId[a].associacao)
        if (alt.length) L = alt
      }

      if (!L.length) {
        L = cand.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0)
        if (evitarMesmoPais && byId[a]?.associacao) {
          const alt = L.filter(b => byId[b]?.associacao !== byId[a].associacao)
          if (alt.length) L = alt
        }
      }

      if (!L.length) L = cand

      L.sort((b1, b2) => {
        const sAH = CASA_MAX - homeCnt[a], sAA = FORA_MAX - awayCnt[a]
        const s1H = CASA_MAX - homeCnt[b1], s1A = FORA_MAX - awayCnt[b1]
        const s2H = CASA_MAX - homeCnt[b2], s2A = FORA_MAX - awayCnt[b2]
        const mando1 = (sAH > 0 && s1A > 0) || (sAA > 0 && s1H > 0) ? 1 : 0
        const mando2 = (sAH > 0 && s2A > 0) || (sAA > 0 && s2H > 0) ? 1 : 0
        const need1 = (needPot[a][potes[b1] ?? 4] ?? 0) + (needPot[b1][potA] ?? 0)
        const need2 = (needPot[a][potes[b2] ?? 4] ?? 0) + (needPot[b2][potA] ?? 0)
        return (mando2 - mando1) || (need2 - need1)
      })

      const b = L[0]; if (!b) { livres.delete(a); continue }

      let casa = a, fora = b
      if (homeCnt[a] >= CASA_MAX && awayCnt[a] < FORA_MAX) { casa = b; fora = a }
      else if (homeCnt[b] >= CASA_MAX && awayCnt[b] < FORA_MAX) { casa = a; fora = b }
      else {
        const sAH = CASA_MAX - homeCnt[a], sAA = FORA_MAX - awayCnt[a]
        const sBH = CASA_MAX - homeCnt[b], sBA = FORA_MAX - awayCnt[b]
        if (sBH > sAH && sAA > 0) { casa = b; fora = a }
      }

      calendario.push({ rodada, casa, fora })
      playedPairs.add(keyPair(a, b))
      const potB = potes[b] ?? 4
      // contadores
      const fora = b
      homeCnt[casa]++; awayCnt[fora]++; jogosRestantes[a]--; jogosRestantes[b]--

      // ajusta necessidades por pote
      needPot[a][potB] = Math.max(0, needPot[a][potB] - 1)
      needPot[b][potA] = Math.max(0, needPot[b][potA] - 1)

      // marca como usados na rodada
      livres.delete(a); livres.delete(b)
    }
  }
  return calendario
}

/* ===================== Helpers do Playoff (únicos) ===================== */
type ClassRow = {
  posicao?: number | null
  id_time?: string | null
  time_id?: string | null
  time?: string | null
  nome_time?: string | null
  temporada?: string | null
  pontos?: number | null
  saldo?: number | null
  vitorias?: number | null
}

function idFromRow(r: ClassRow): string | null {
  return (r.id_time as any) || (r.time_id as any) || (r.time as any) || null
}

async function readClassificacaoOrdenada(temporada: string): Promise<ClassRow[]> {
  let q = supabase.from('classificacao_copa')
    .select('posicao,id_time,time_id,time,nome_time,temporada,pontos,saldo,vitorias')
    .eq('temporada', temporada)
    .order('posicao', { ascending: true })
  let { data, error } = await q
  if (!error && data?.length) return data as ClassRow[]

  const { data: d2 } = await supabase.from('classificacao_copa')
    .select('posicao,id_time,time_id,time,nome_time,temporada,pontos,saldo,vitorias')
    .eq('temporada', temporada)
    .order('pontos', { ascending: false })
    .order('saldo', { ascending: false })
    .order('vitorias', { ascending: false })
  return (d2 || []) as ClassRow[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ================= BADGES / UI PRIMITIVES ================= */
type BadgeTone = 'zinc' | 'emerald' | 'sky' | 'violet'
const Badge: React.FC<{ tone?: BadgeTone; children: React.ReactNode }> = ({ children, tone = 'zinc' }) => {
  const cls =
    {
      zinc: 'bg-white/5 text-zinc-200 border-white/10',
      emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
      violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    }[tone] || 'bg-white/5 text-zinc-200 border-white/10'
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border ${cls}`}>{children}</span>
  )
}

/* ================= PAGE ================= */
export default function FaseLigaPage() {
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

  // flags de schema financeiro extra
  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  // UI
  const [rodadasAbertas, setRodadasAbertas] = useState<Record<number, boolean>>({})
  const topRef = useRef<HTMLDivElement | null>(null)

  // ====== Playoff (9–24)
  const [sorteandoPO, setSorteandoPO] = useState(false)
  const [evitarMesmoPaisPO, setEvitarMesmoPaisPO] = useState(true)
  const [confrontosPO, setConfrontosPO] = useState<{ seedA:number; seedB:number; idA:string; idB:string }[]>([])
  const [abrirModalPO, setAbrirModalPO] = useState(false)

  useEffect(() => {
    ;(async () => {
      await detectarColunaTemporada()
      await detectarColunasExtras()
      await Promise.all([carregarTimesBase(), buscarJogos()])
      setLoading(false)
    })()
  }, [])

  async function detectarColunaTemporada() {
    const { error } = await supabase.from('copa_fase_liga').select('id,temporada').limit(1)
    setTemColunaTemporada(!error)
  }

  async function detectarColunasExtras() {
    const { error } = await supabase
      .from('copa_fase_liga')
      .select('id,renda,publico,receita_mandante,receita_visitante,salarios_mandante,salarios_visitante,premiacao_mandante,premiacao_visitante')
      .limit(1)
    setTemExtrasFinanceiros(!error)
  }

  async function carregarTimesBase() {
    const rows = await safeSelectTimes(true)
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
    let q = supabase.from('copa_fase_liga').select('*')
    if (temColunaTemporada) q = q.eq('temporada', TEMPORADA)
    const { data, error } = await q.order('rodada', { ascending: true }).order('id', { ascending: true })
    if (error) { toast.error('Erro ao buscar jogos'); return }
    setJogos((data || []) as Jogo[])
    const rds = new Set((data || []).map((j: any) => j.rodada))
    const obj: Record<number, boolean> = {}; Array.from(rds).slice(0, 2).forEach((r: number) => obj[r] = true)
    setRodadasAbertas(obj)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) { console.error(error); toast.error('Erro ao atualizar classificação!') }
  }

  /* ===================== Estádio helpers ===================== */
  const asImportance = (s: any): 'normal' | 'decisao' | 'final' => (s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal')
  const asWeather = (s: any): 'bom' | 'chuva' => (s === 'chuva' ? 'chuva' : 'bom')
  const asDayType = (s: any): 'semana' | 'fim' => (s === 'fim' ? 'fim' : 'semana')
  const asDayTime = (s: any): 'dia' | 'noite' => (s === 'dia' ? 'dia' : 'noite')

  async function calcularPublicoERendaPeloEstadio(mandanteId: string): Promise<{ publico: number; renda: number; erro?: string }> {
    const { data: est, error } = await supabase
      .from('estadios').select('*').eq('id_time', mandanteId).maybeSingle()

    if (error || !est) {
      return {
        publico: Math.floor(Math.random() * 30000) + 10000,
        renda: (Math.floor(Math.random() * 30000) + 10000) * 80,
        erro: 'Estádio não encontrado (usando fallback aleatório).'
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
        supabase.from('elenco')
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
      id_time: timeId, tipo: 'salario', valor: totalSalarios,
      descricao: 'Desconto de salários após partida', data: dataAgora,
    })
    await supabase.from('bid').insert({
      tipo_evento: 'despesas', descricao: 'Desconto de salários após a partida',
      id_time1: timeId, valor: -totalSalarios, data_evento: dataAgora,
    })
    return totalSalarios
  }

  /* ===================== Premiação (COPA — PADRÃO) ===================== */
  async function premiarPorJogoCopa(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
    if (gols_pro == null || gols_contra == null) return 0

    const base =
      gols_pro > gols_contra ? COPA_VITORIA :
      gols_pro < gols_contra ? COPA_DERROTA :
      COPA_EMPATE

    const valor = Math.round(
      base + (gols_pro * COPA_GOL_MARCADO) - (gols_contra * COPA_GOL_SOFRIDO)
    )

    await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
    const agora = new Date().toISOString()

    await supabase.from('movimentacoes').insert({
      id_time: timeId, tipo: 'premiacao', valor,
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

  /* ===================== GERAR SWISS (dentro do componente) ===================== */
  const gerarSwiss = async () => {
    if (!isAdmin) { toast.error('Apenas admin pode gerar a fase.'); return }
    setGerando(true)
    try {
      const rows = await safeSelectTimes(false)
      let participantes: TimeFull[] = rows.map((t: any) => ({
        id: t.id,
        nome: t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id),
        logo_url: t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png',
        pote: t.pote ?? t.pot ?? null,
        overall: t.overall ?? t.rating ?? null,
        valor: t.valor ?? t.value ?? null,
        associacao: t.associacao ?? t.pais ?? null,
      }))

      // regra custom: excluir Palmeiras do sorteio (remova se não quiser)
      participantes = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))

      // precisa ser par — remove o mais fraco se ímpar
      if (participantes.length % 2 === 1) {
        const ord = [...participantes].sort((a, b) => {
          const oa = (a.overall ?? 0) - (b.overall ?? 0)
          if (oa !== 0) return oa
          return (a.valor ?? 0) - (b.valor ?? 0)
        })
        const removido = ord[0]
        participantes = participantes.filter(t => t.id !== removido.id)
        await supabase.from('bid').insert([{
          tipo_evento: 'Sistema',
          descricao: `Ajuste de paridade: ${removido.nome} removido.`,
          valor: null
        }])
        toast('Participantes ímpares: removi 1 clube para manter paridade.', { icon: 'ℹ️' })
      }

      if (participantes.length < 2) { toast.error('Participantes insuficientes.'); return }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)
      if (!calendario.length) { toast.error('Falha ao gerar calendário.'); return }

      // limpa tabela da temporada (se existir coluna) ou tudo
      if (temColunaTemporada) {
        const { error: delErr } = await supabase
          .from('copa_fase_liga')
          .delete()
          .eq('temporada', TEMPORADA)
        if (delErr) { toast.error('Erro ao limpar jogos da temporada.'); return }
      } else {
        const { error: delErr } = await supabase
          .from('copa_fase_liga')
          .delete()
          .neq('id', -1)
        if (delErr) { toast.error('Erro ao limpar tabela de jogos.'); return }
      }

      // insere os jogos
      const rowsInsert = calendario.map(j => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false,
      }))
      const { error: insErr } = await supabase.from('copa_fase_liga').insert(rowsInsert)
      if (insErr) { console.error(insErr); toast.error('Erro ao inserir confrontos.'); return }

      await atualizarClassificacao()
      await buscarJogos()

      await supabase.from('bid').insert([{
        tipo_evento: 'Sistema',
        descricao: `Fase Liga (modelo suíço) gerada ${temColunaTemporada ? `para ${TEMPORADA}` : '(sem coluna de temporada)'}.
Corte: 1–8 Oitavas, 9–24 Play-off. Palmeiras excluído.`,
        valor: null
      }])

      toast.success(`✅ Gerado com sucesso: ${rowsInsert.length} jogos em ${ROUNDS} rodadas!`)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setGerando(false)
    }
  }

  /* ===================== Salvar (primeiro lançamento) ===================== */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    setSalvandoId(jogo.id)

    const { data: existente, error: erroVer } =
      await supabase.from('copa_fase_liga').select('bonus_pago').eq('id', jogo.id).single()
    if (erroVer) { toast.error('Erro ao verificar status do jogo'); setSalvandoId(null); return }
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
      { id_time: mandanteId, tipo: 'participacao_copa', valor: COPA_PARTICIPACAO_POR_JOGO, descricao: 'Participação fixa por jogo (COPA)', data: new Date().toISOString() },
      { id_time: visitanteId, tipo: 'participacao_copa', valor: COPA_PARTICIPACAO_POR_JOGO, descricao: 'Participação fixa por jogo (COPA)', data: new Date().toISOString() },
    ])
    await supabase.from('bid').insert([
      { tipo_evento: 'bonus_participacao_copa', descricao: 'Participação fixa por jogo (COPA)', id_time1: mandanteId, valor: COPA_PARTICIPACAO_POR_JOGO, data_evento: new Date().toISOString() },
      { tipo_evento: 'bonus_participacao_copa', descricao: 'Participação fixa por jogo (COPA)', id_time1: visitanteId, valor: COPA_PARTICIPACAO_POR_JOGO, data_evento: new Date().toISOString() },
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
    const patchExtras: any = temExtrasFinanceiros ? {
      renda,
      publico,
      receita_mandante: receitaMandante,
      receita_visitante: receitaVisitante,
      salarios_mandante: salariosMandante,
      salarios_visitante: salariosVisitante,
      premiacao_mandante: totalPremMandante,
      premiacao_visitante: totalPremVisitante,
    } : {}

    const { error: erroPlacar } = await supabase
      .from('copa_fase_liga')
      .update({ ...patchBase, ...patchExtras })
      .eq('id', jogo.id)
    if (erroPlacar) { toast.error('Erro ao salvar/registrar finanças'); setSalvandoId(null); return }

    await atualizarClassificacao()

    const n1 = timesMap[mandanteId]?.nome ?? 'Mandante'
    const n2 = timesMap[visitanteId]?.nome ?? 'Visitante'
    toast.success(
      `✅ Placar salvo e finanças pagas (COPA)!
🎟️ Público: ${publico.toLocaleString()}  |  💰 Renda: R$ ${renda.toLocaleString()}
💵 ${n1}: ${Math.round(receitaMandante).toLocaleString('pt-BR')} + R$ ${COPA_PARTICIPACAO_POR_JOGO.toLocaleString('pt-BR')} (participação) + bônus
💵 ${n2}: ${Math.round(receitaVisitante).toLocaleString('pt-BR')} + R$ ${COPA_PARTICIPACAO_POR_JOGO.toLocaleString('pt-BR')} (participação) + bônus`,
      { duration: 9000 }
    )

    await buscarJogos()
    setSalvandoId(null)
  }

  /* ===================== Ajuste sem repetir finanças ===================== */
  async function salvarAjusteResultado(jogo: Jogo, gm: number, gv: number, silencioso = false) {
    if (!isAdmin) return
    const { error } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: gm, gols_time2: gv, bonus_pago: true })
      .eq('id', jogo.id)
    if (error) { toast.error('Erro ao ajustar placar'); return }

    await atualizarClassificacao()
    await buscarJogos()
    if (!silencioso) toast.success('✏️ Resultado atualizado (sem repetir bônus).')
  }

  /* ===================== Excluir + Estorno ===================== */
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
      const salariosMandante = jogo.salarios_mandante ?? await somarSalarios(mandanteId)
      const salariosVisitante = jogo.salarios_visitante ?? await somarSalarios(visitanteId)
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
        renda: null, publico: null,
        receita_mandante: null, receita_visitante: null,
        salarios_mandante: null, salarios_visitante: null,
        premiacao_mandante: null, premiacao_visitante: null,
      })
    }
    const { error: erroLimpar } = await supabase
      .from('copa_fase_liga')
      .update(patch)
      .eq('id', jogo.id)
    if (erroLimpar) { toast.error('Erro ao limpar resultado'); setSalvandoId(null); return }

    await atualizarClassificacao()
    await buscarJogos()
    toast.success('🗑️ Resultado removido e estorno financeiro concluído (COPA).')
    setSalvandoId(null)
  }

  /* ===================== Sorteio do PLAYOFF (9–24) — grava em public.copa_playoff ===================== */
  async function gerarPlayoff() {
    if (!isAdmin) { toast.error('Apenas admin pode sortear o playoff.'); return }
    setSorteandoPO(true)
    try {
      await atualizarClassificacao()

      const classif = await readClassificacaoOrdenada(TEMPORADA)
      if (!classif.length) { toast.error('Classificação indisponível.'); return }

      const arr = [...classif]
      const temPos = arr.every(r => typeof r.posicao === 'number' && r.posicao! > 0)
      const ordenada = temPos ? arr.sort((a,b)=>(a.posicao||0)-(b.posicao||0)) : arr
      const faixa = ordenada.slice(8, 24) // 9º..24º
      if (faixa.length !== 16) {
        toast.error(`Esperava 16 equipes (9º–24º). Achei ${faixa.length}.`)
        return
      }

      // Seeds: 9..16 (cabeças) vs 17..24 (desafiantes – embaralhados)
      const potA = faixa.slice(0, 8)                  // 9..16
      const potB = shuffle(faixa.slice(8, 16))        // 17..24

      const pares: { seedA:number; seedB:number; idA:string; idB:string; nomeA?:string|null; nomeB?:string|null }[] = []
      for (let i = 0; i < 8; i++) {
        const a = potA[i], b = potB[i]
        const idA = idFromRow(a), idB = idFromRow(b)
        if (!idA || !idB) { toast.error('ID de time ausente em alguma linha.'); return }
        pares.push({
          seedA: a.posicao ?? (9 + i),
          seedB: b.posicao ?? (17 + i),
          idA, idB,
          nomeA: a.nome_time ?? null,
          nomeB: b.nome_time ?? null
        })
      }

      // Limpa a tabela (não tem coluna temporada)
      const del = await supabase.from('copa_playoff').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (del.error) {
        const del2 = await supabase.from('copa_playoff').delete().gte('ordem', 0)
        if (del2.error) throw del2.error
      }

      // Insere ida (rodada 1) e volta (rodada 2)
      const rowsInsert = pares.flatMap((p, idx) => {
        const ordem = idx + 1
        const nomeA = timesMap[p.idA]?.nome ?? p.nomeA ?? p.idA
        const nomeB = timesMap[p.idB]?.nome ?? p.nomeB ?? p.idB
        return [
          {
            rodada: 1,
            ordem,
            id_time1: p.idA,
            id_time2: p.idB,
            time1: nomeA,
            time2: nomeB,
            gols_time1: null,
            gols_time2: null,
          },
          {
            rodada: 2,
            ordem,
            id_time1: p.idB,
            id_time2: p.idA,
            time1: nomeB,
            time2: nomeA,
            gols_time1: null,
            gols_time2: null,
          }
        ]
      })

      const { error: insErr } = await supabase.from('copa_playoff').insert(rowsInsert)
      if (insErr) throw insErr

      setConfrontosPO(pares)
      toast.success('✅ Playoff (9º–24º) sorteado e gravado em public.copa_playoff (ida/volta)!')

      await supabase.from('bid').insert({
        tipo_evento: 'Sistema',
        descricao: `Playoff sorteado (9º–24º) — gravado em public.copa_playoff (16 partidas).`,
        valor: null,
        data_evento: new Date().toISOString(),
      })
    } catch (e:any) {
      console.error(e)
      toast.error('Erro ao sortear/gravar o Playoff.')
    } finally {
      setSorteandoPO(false)
    }
  }

  /* ===== UI DERIVED ===== */
  const jogosFiltrados = useMemo(
    () =>
      jogos.filter(j =>
        filtroTime === 'Todos' ||
        timesMap[j.time1]?.nome === filtroTime ||
        timesMap[j.time2]?.nome === filtroTime
      ),
    [jogos, filtroTime, timesMap]
  )

  const jogosPorRodada: Record<number, Jogo[]> = useMemo(() => {
    const map: Record<number, Jogo[]> = {}
    jogosFiltrados.forEach(j => { if (!map[j.rodada]) map[j.rodada] = []; map[j.rodada].push(j) })
    return map
  }, [jogosFiltrados])

  const listaRodadas = useMemo(() => Object.keys(jogosPorRodada).map(Number).sort((a, b) => a - b), [jogosPorRodada])
  const nomesDosTimes = useMemo(() => Object.values(timesMap).map(t => t.nome).sort(), [timesMap])

  /* ===== Small UI components ===== */
  const ScoreInput = ({ value, onChange, disabled }: {
    value: number | null; onChange: (v: number) => void; disabled?: boolean
  }) => (
    <div className="group flex items-center gap-1 rounded-full bg-zinc-50/5 border border-zinc-700 px-1 shadow-inner">
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => onChange(clampInt((value ?? 0) - 1))}
        disabled={disabled}
        aria-label="Diminuir"
      >
        <FiMinus />
      </button>
      <input
        type="number"
        min={0}
        className="w-12 text-center bg-transparent outline-none font-extrabold tracking-wider"
        value={value ?? ''}
        onChange={(e) => onChange(clampInt(parseInt(e.target.value || '0', 10)))}
        disabled={disabled}
      />
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={() => onChange(clampInt((value ?? 0) + 1))}
        disabled={disabled}
        aria-label="Aumentar"
      >
        <FiPlus />
      </button>
    </div>
  )

  const RoundHeader = ({ r }: { r: number }) => {
    const open = !!rodadasAbertas[r]
    return (
      <div className="sticky top-[64px] z-20">
        <button
          onClick={() => setRodadasAbertas(s => ({ ...s, [r]: !open }))}
          className="group flex w-full items-center justify-between rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 px-4 py-3 hover:border-zinc-600/50 ring-1 ring-inset ring-white/10 shadow-[0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="flex items-center gap-3">
            <Badge tone="emerald">Rodada</Badge>
            <span className="text-lg font-extrabold text-green-400">{r}</span>
          </div>
          <span className="text-zinc-400 group-hover:text-white">{open ? <FiChevronUp /> : <FiChevronDown />}</span>
        </button>
      </div>
    )
  }

  const totalJogos = jogos.length
  const totalParticipantes = useMemo(() => {
    const ids = new Set<string>()
    jogos.forEach(j => { ids.add(j.time1); ids.add(j.time2) })
    return ids.size
  }, [jogos])

  return (
    <div ref={topRef} className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black text-white">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/50 bg-black/70 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-yellow-500 bg-clip-text text-transparent drop-shadow">
                UEFA Champions — Fase Liga (modelo suíço){temColunaTemporada ? ` • ${TEMPORADA}` : ''}
              </span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="emerald">1–8 Oitavas</Badge>
              <Badge tone="sky">9–24 Play-off</Badge>
              <Badge>8 rodadas • 4 casa / 4 fora</Badge>
            </div>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Swiss */}
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <input type="checkbox" className="accent-emerald-500" checked={evitarMesmoPais} onChange={e => setEvitarMesmoPais(e.target.checked)} />
                <FiTarget /> Evitar mesmo país (Liga)
              </label>
              <button
                onClick={() => setAbrirModalSwiss(true)}
                disabled={gerando}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
                title="Gera 8 rodadas no modelo suíço"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Gerar Fase Champions'}
              </button>

              {/* Playoff */}
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={evitarMesmoPaisPO}
                  onChange={e => setEvitarMesmoPaisPO(e.target.checked)}
                />
                <FiTarget /> Evitar mesmo país (PO)
              </label>
              <button
                onClick={() => setAbrirModalPO(true)}
                disabled={sorteandoPO}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                title="Sorteia confrontos 9º–24º"
              >
                {sorteandoPO ? 'Sorteando…' : 'Sortear Playoff (9–24)'}
              </button>
            </div>
          )}
        </div>

        {/* Metrics bar */}
        <div className="mx-auto max-w-7xl px-4 pb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-white/70">Rodadas</div>
            <div className="text-lg font-bold">{listaRodadas.length || 0}</div>
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
        {/* Filtro & Navegação de Rodadas */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Filtrar por time:</label>
            <select
              value={filtroTime}
              onChange={(e) => setFiltroTime(e.target.value)}
              className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            >
              <option value="Todos">Todos</option>
              {nomesDosTimes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {filtroTime !== 'Todos' && (
              <button
                onClick={() => setFiltroTime('Todos')}
                className="text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
              >Limpar</button>
            )}
          </div>

          {listaRodadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Ir para:</span>
              {listaRodadas.map(r => (
                <button
                  key={r}
                  onClick={() => {
                    const el = document.getElementById(`rodada-${r}`)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                >
                  {r}
                </button>
              ))}
              <span className="ml-auto" />
              <button
                onClick={() => setRodadasAbertas(Object.fromEntries(listaRodadas.map(r => [r, true])) as Record<number, boolean>)}
                className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                expandir tudo
              </button>
              <button
                onClick={() => setRodadasAbertas(Object.fromEntries(listaRodadas.map(r => [r, false])) as Record<number, boolean>)}
                className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                recolher tudo
              </button>
            </div>
          )}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900/60 border border-white/10" />
            ))}
          </div>
        ) : listaRodadas.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center text-zinc-200">
            Nenhum jogo para exibir. Clique em <span className="font-semibold text-white">Gerar Fase Champions (8 rodadas)</span>.
          </div>
        ) : (
          listaRodadas.map((r) => (
            <section id={`rodada-${r}`} key={r} className="mb-6">
              <RoundHeader r={r} />
              {rodadasAbertas[r] && (
                <div className="mt-3 grid gap-3">
                  {jogosPorRodada[r].map((jogo) => (
                    <div
                      key={jogo.id}
                      className="relative rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-zinc-950/70 p-4 shadow hover:border-white/20 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Time 1 */}
                        <div className="flex min-w-[220px] items-center gap-3">
                          <img src={timesMap[jogo.time1]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                          <span className="max-w-[180px] truncate font-semibold">{timesMap[jogo.time1]?.nome || jogo.time1}</span>
                          <Badge>Mandante</Badge>
                        </div>

                        {/* Placar */}
                        <div className="flex items-center gap-2">
                          <ScoreInput
                            value={jogo.gols_time1}
                            onChange={(v) => setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: v } : j))}
                            disabled={!isAdmin}
                          />
                          <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                          <ScoreInput
                            value={jogo.gols_time2}
                            onChange={(v) => setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: v } : j))}
                            disabled={!isAdmin}
                          />
                        </div>

                        {/* Time 2 */}
                        <div className="flex min-w-[220px] items-center justify-end gap-3">
                          <Badge tone="sky">Visitante</Badge>
                          <span className="max-w-[180px] truncate font-semibold text-right">{timesMap[jogo.time2]?.nome || jogo.time2}</span>
                          <img src={timesMap[jogo.time2]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                        </div>

                        {/* Ações */}
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => salvarPlacar(jogo)}
                              disabled={salvandoId === jogo.id}
                              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                              title="Salvar placar e processar finanças (COPA)"
                            >
                              <FiSave />
                              {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
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
                            <span>🎟️ Público: <span className="tabular-nums text-zinc-200">{Number(jogo.publico).toLocaleString()}</span></span>
                            <span>💰 Renda: <span className="tabular-nums text-zinc-200">R$ {Number(jogo.renda).toLocaleString()}</span></span>
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
              )}
            </section>
          ))
        )}

        {/* Resumo dos confrontos do Playoff sorteados agora */}
        {confrontosPO.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-bold text-amber-300 mb-2">Confrontos do Playoff (9–24) — Sorteados agora</h3>
            <ul className="grid md:grid-cols-2 gap-2 text-sm">
              {confrontosPO.map((c, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-between">
                  <span>
                    <b>Chave {i+1}:</b> ({c.seedA}) {timesMap[c.idA]?.nome || c.idA}
                    {' '}×{' '}
                    ({c.seedB}) {timesMap[c.idB]?.nome || c.idB}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modal: gerar Swiss */}
      {abrirModalSwiss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-300">Gerar Fase Champions (8 rodadas)?</h3>
            <p className="mb-6 text-zinc-200">
              Isso apaga os jogos {temColunaTemporada ? `da temporada "${TEMPORADA}"` : 'atuais'} e cria exatamente 8 rodadas
              (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10" onClick={() => setAbrirModalSwiss(false)}>
                Cancelar
              </button>
              <button
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
                onClick={async () => { setAbrirModalSwiss(false); await gerarSwiss() }}
              >
                {gerando ? 'Gerando...' : 'Sim, gerar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: sortear Playoff */}
      {abrirModalPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-300">Sortear Playoff (9º–24º)?</h3>
            <p className="mb-6 text-zinc-200">
              Vamos pegar as equipes nas posições 9 a 24 da classificação e montar os 8 confrontos:
              cabeças de chave (9–16) x desafiantes (17–24).{' '}
              {evitarMesmoPaisPO ? 'Tentaremos evitar confrontos do mesmo país/associação.' : 'Sem restrição de país.'}
              <br/>Confrontos serão salvos em <code>copa_playoff</code>.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                className="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
                onClick={() => setAbrirModalPO(false)}
              >
                Cancelar
              </button>
              <button
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                onClick={async () => { setAbrirModalPO(false); await gerarPlayoff() }}
              >
                {sorteandoPO ? 'Sorteando…' : 'Sim, sortear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
