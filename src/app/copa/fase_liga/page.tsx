'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import {
  FiRotateCcw, FiSave, FiTrash2, FiTarget,
  FiMinus, FiPlus, FiChevronDown, FiChevronUp
} from 'react-icons/fi'

// 🔽 Motor de Estádio (mesma base do arquivo anexo)
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

  // 🔽 extras (opcionais; só atualizamos se as colunas existirem)
  renda?: number | null
  publico?: number | null
  receita_mandante?: number | null
  receita_visitante?: number | null
  salarios_mandante?: number | null
  salarios_visitante?: number | null
  premiacao_mandante?: number | null
  premiacao_visitante?: number | null
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

/* ================= REGRAS FINANCEIRAS (COPA) ================= */
/** Lógica espelhada do arquivo anexo (com bônus +50%) */
const BONUS_MULTIPLIER = 1.5 // +50% em todos os bônus por partida

function calcularPremiacaoPorDivisao(params: {
  divisao: number
  gols_pro: number
  gols_contra: number
  historico: { resultado: 'vitoria'|'empate'|'derrota' }[]
}): number {
  const { divisao, gols_pro, gols_contra, historico } = params
  const regras = {
    1: { vitoria: 13_000_000, empate: 8_000_000,  derrota: 3_000_000, gol: 500_000, gol_sofrido: 80_000 },
    2: { vitoria: 8_500_000,  empate: 4_000_000,  derrota: 1_750_000, gol: 375_000, gol_sofrido: 60_000 },
    3: { vitoria: 5_000_000,  empate: 2_500_000,  derrota: 1_000_000, gol: 250_000, gol_sofrido: 40_000 },
  } as const
  const regra = regras[divisao as 1|2|3]
  if (!regra) return 0

  const resultadoAtual: 'vitoria'|'empate'|'derrota' =
    gols_pro > gols_contra ? 'vitoria' : gols_pro < gols_contra ? 'derrota' : 'empate'

  let premiacao =
    (resultadoAtual === 'vitoria' ? regra.vitoria :
     resultadoAtual === 'empate'  ? regra.empate  : regra.derrota) +
    (gols_pro * regra.gol) -
    (gols_contra * regra.gol_sofrido)

  // bônus por 5 vitórias seguidas
  const ult5 = [...historico, { resultado: resultadoAtual }].slice(-5)
  const venceuTodas = ult5.length === 5 && ult5.every(j => j.resultado === 'vitoria')
  if (venceuTodas) premiacao += 5_000_000

  return Math.round(premiacao * BONUS_MULTIPLIER)
}

/* ================= SWISS CONFIG ================= */
const ROUNDS = 8
const CASA_MAX = 4
const FORA_MAX = 4

/* ================= HELPERS ================= */
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

/* ===== Swiss generator (8 rodadas, sem BYE) ===== */
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
  ids.forEach(id => { needPot[id] = {1:2,2:2,3:2,4:2}; homeCnt[id]=0; awayCnt[id]=0; jogosRestantes[id]=ROUNDS })

  const calendario: CalendarioItem[] = []
  for (let rodada = 1; rodada <= ROUNDS; rodada++) {
    const livres = new Set(ids)
    const scoreTeam = (id: string) => {
      const np = needPot[id]; const needScore = np[1]+np[2]+np[3]+np[4]
      const mandoScore = (CASA_MAX-homeCnt[id])+(FORA_MAX-awayCnt[id])
      return jogosRestantes[id]*10 + needScore*2 + mandoScore
    }

    while (livres.size >= 2) {
      const arr = Array.from(livres).sort((a,b)=>scoreTeam(b)-scoreTeam(a))
      const a = arr[0]

      let cand = arr.slice(1).filter(b => !playedPairs.has(keyPair(a,b)))

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

      L.sort((b1,b2)=>{
        const sAH = CASA_MAX-homeCnt[a], sAA = FORA_MAX-awayCnt[a]
        const s1H = CASA_MAX-homeCnt[b1], s1A = FORA_MAX-awayCnt[b1]
        const s2H = CASA_MAX-homeCnt[b2], s2A = FORA_MAX-awayCnt[b2]
        const mando1 = (sAH>0&&s1A>0)||(sAA>0&&s1H>0)?1:0
        const mando2 = (sAH>0&&s2A>0)||(sAA>0&&s2H>0)?1:0
        const need1 = (needPot[a][potes[b1] ?? 4] ?? 0) + (needPot[b1][potA] ?? 0)
        const need2 = (needPot[a][potes[b2] ?? 4] ?? 0) + (needPot[b2][potA] ?? 0)
        return (mando2-mando1)||(need2-need1)
      })

      const b = L[0]; if (!b) { livres.delete(a); continue }

      let casa=a, fora=b
      if (homeCnt[a]>=CASA_MAX && awayCnt[a]<FORA_MAX) { casa=b; fora=a }
      else if (homeCnt[b]>=CASA_MAX && awayCnt[b]<FORA_MAX) { casa=a; fora=b }
      else {
        const sAH = CASA_MAX-homeCnt[a], sAA = FORA_MAX-awayCnt[a]
        const sBH = CASA_MAX-homeCnt[b], sBA = FORA_MAX-awayCnt[b]
        if (sBH>sAH && sAA>0) { casa=b; fora=a }
      }

      calendario.push({ rodada, casa, fora })
      playedPairs.add(keyPair(a,b))
      livres.delete(a); livres.delete(b)
      homeCnt[casa]++; awayCnt[fora]++; jogosRestantes[a]--; jogosRestantes[b]--

      const pa = potes[a]??4, pb = potes[b]??4
      needPot[a][pb]=Math.max(0,needPot[a][pb]-1)
      needPot[b][pa]=Math.max(0,needPot[b][pa]-1)
    }
  }
  return calendario
}

/* ================= PAGE ================= */
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

  // novas flags para campos extras
  const [temExtrasFinanceiros, setTemExtrasFinanceiros] = useState<boolean>(true)

  // UI
  const [rodadasAbertas, setRodadasAbertas] = useState<Record<number, boolean>>({})
  const topRef = useRef<HTMLDivElement>(null)

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
      novo[t.id] = { nome, logo_url: logo }
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
    const obj: Record<number, boolean> = {}; Array.from(rds).slice(0,2).forEach((r:number)=>obj[r]=true)
    setRodadasAbertas(obj)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) { console.error(error); toast.error('Erro ao atualizar classificação!') }
  }

  /* ===================== Estádio helpers (iguais ao anexo) ===================== */
  const asImportance = (s: any): 'normal'|'decisao'|'final' => (s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal')
  const asWeather = (s: any): 'bom'|'chuva' => (s === 'chuva' ? 'chuva' : 'bom')
  const asDayType = (s: any): 'semana'|'fim' => (s === 'fim' ? 'fim' : 'semana')
  const asDayTime = (s: any): 'dia'|'noite' => (s === 'dia' ? 'dia' : 'noite')

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

  /* ===================== Premiação (COPA) ===================== */
  async function premiarPorJogoCopa(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
    if (gols_pro === undefined || gols_contra === undefined) return 0

    const { data: timeData, error: eTime } = await supabase
      .from('times').select('divisao').eq('id', timeId).single()
    if (eTime || !timeData) return 0

    // monta histórico a partir da tabela da COPA
    const { data: partidas } = await supabase
      .from('copa_fase_liga')
      .select('time1,time2,gols_time1,gols_time2')
      .or(`time1.eq.${timeId},time2.eq.${timeId}`)
      .not('gols_time1','is',null)
      .not('gols_time2','is',null)

    const historico: { resultado:'vitoria'|'empate'|'derrota' }[] = []
    partidas?.forEach((j: any) => {
      const isMandante = j.time1 === timeId
      const gp = isMandante ? j.gols_time1 : j.gols_time2
      const gc = isMandante ? j.gols_time2 : j.gols_time1
      let r: 'vitoria'|'empate'|'derrota' = 'empate'
      if (gp > gc) r = 'vitoria'
      if (gp < gc) r = 'derrota'
      historico.push({ resultado: r })
    })

    const valor = calcularPremiacaoPorDivisao({
      divisao: timeData.divisao,
      gols_pro,
      gols_contra,
      historico
    })
    if (valor <= 0) return 0

    await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
    await supabase.from('movimentacoes').insert({
      id_time: timeId, tipo: 'premiacao', valor,
      descricao: 'Premiação por desempenho (COPA)', data: new Date().toISOString(),
    })
    await supabase.from('bid').insert({
      tipo_evento: 'bonus', descricao: 'Bônus por desempenho (COPA)',
      id_time1: timeId, valor, data_evento: new Date().toISOString(),
    })
    return valor
  }

  /* ===================== Salvar (1º lançamento) com finanças ===================== */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    setSalvandoId(jogo.id)

    // evita pagar 2x
    const { data: existente, error: erroVer } =
      await supabase.from('copa_fase_liga').select('bonus_pago').eq('id', jogo.id).single()
    if (erroVer) { toast.error('Erro ao verificar status do jogo'); setSalvandoId(null); return }
    if (existente?.bonus_pago) {
      await salvarAjusteResultado(jogo, jogo.gols_time1 ?? 0, jogo.gols_time2 ?? 0, true)
      setSalvandoId(null)
      return
    }

    // precisa de gols preenchidos
    if (jogo.gols_time1 == null || jogo.gols_time2 == null) {
      toast.error('Preencha os gols antes de salvar.')
      setSalvandoId(null)
      return
    }

    const mandanteId = jogo.time1
    const visitanteId = jogo.time2

    // público/renda pelo estádio do mandante
    const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
    if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })
    const publico = pr.publico
    const renda = pr.renda

    // receita 95/5
    const receitaMandante = Math.round(renda * 0.95)
    const receitaVisitante = Math.round(renda * 0.05)
    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })

    // salários com registro
    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    // premiação COPA (+50%)
    const premiacaoMandante = await premiarPorJogoCopa(mandanteId, jogo.gols_time1, jogo.gols_time2)
    const premiacaoVisitante = await premiarPorJogoCopa(visitanteId, jogo.gols_time2, jogo.gols_time1)

    // BID de receita (renda + bônus)
    await supabase.from('bid').insert([
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus) — COPA',
        id_time1: mandanteId,
        valor: receitaMandante + premiacaoMandante,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus) — COPA',
        id_time1: visitanteId,
        valor: receitaVisitante + premiacaoVisitante,
        data_evento: new Date().toISOString(),
      },
    ])

    // atualiza elenco (jogos +1)
    await ajustarJogosElenco(mandanteId, +1)
    await ajustarJogosElenco(visitanteId, +1)

    // atualiza placar + marca bonus_pago + (extras se existir)
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
      premiacao_mandante: premiacaoMandante,
      premiacao_visitante: premiacaoVisitante,
    } : {}

    const { error: erroPlacar } = await supabase
      .from('copa_fase_liga')
      .update({ ...patchBase, ...patchExtras })
      .eq('id', jogo.id)
    if (erroPlacar) { toast.error('Erro ao salvar/registrar finanças'); setSalvandoId(null); return }

    // atualiza classificação
    await atualizarClassificacao()

    const n1 = timesMap[mandanteId]?.nome ?? 'Mandante'
    const n2 = timesMap[visitanteId]?.nome ?? 'Visitante'
    toast.success(
      `✅ Placar salvo e finanças pagas (COPA)!
🎟️ Público: ${publico.toLocaleString()}  |  💰 Renda: R$ ${renda.toLocaleString()}
💵 ${n1}: R$ ${Math.round(receitaMandante).toLocaleString()} + bônus
💵 ${n2}: R$ ${Math.round(receitaVisitante).toLocaleString()} + bônus`,
      { duration: 9000 }
    )

    await buscarJogos()
    setSalvandoId(null)
  }

  /* ===================== Ajuste de resultado (sem repetir finanças) ===================== */
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

  /* ===================== Excluir placar (com estorno automático) ===================== */
  async function excluirPlacar(jogo: Jogo) {
    if (!isAdmin) return
    if (!confirm('Excluir resultado deste jogo? Estorno financeiro será aplicado.')) return
    setSalvandoId(jogo.id)

    const mandanteId = jogo.time1
    const visitanteId = jogo.time2
    const now = new Date().toISOString()

    if (jogo.bonus_pago) {
      // valores para estorno (fallback se colunas não existirem)
      const receitaMandante = jogo.receita_mandante ?? (jogo.renda ? Math.round(jogo.renda * 0.95) : 0)
      const receitaVisitante = jogo.receita_visitante ?? (jogo.renda ? Math.round(jogo.renda * 0.05) : 0)
      const salariosMandante = jogo.salarios_mandante ?? await somarSalarios(mandanteId)
      const salariosVisitante = jogo.salarios_visitante ?? await somarSalarios(visitanteId)
      const premiacaoMandante = jogo.premiacao_mandante ?? 0
      const premiacaoVisitante = jogo.premiacao_visitante ?? 0

      // 1) Reverter saldos
      await Promise.all([
        receitaMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante }) : Promise.resolve(),
        receitaVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante }) : Promise.resolve(),
        salariosMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }) : Promise.resolve(),
        salariosVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }) : Promise.resolve(),
        premiacaoMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante }) : Promise.resolve(),
        premiacaoVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante }) : Promise.resolve(),
      ])

      // 2) Registrar estornos em movimentacoes
      const movs: any[] = []
      if (receitaMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_receita', valor: receitaMandante, descricao: 'Estorno receita de partida (COPA)', data: now })
      if (receitaVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_receita', valor: receitaVisitante, descricao: 'Estorno receita de partida (COPA)', data: now })
      if (salariosMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_salario', valor: salariosMandante, descricao: 'Estorno de salários (COPA)', data: now })
      if (salariosVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_salario', valor: salariosVisitante, descricao: 'Estorno de salários (COPA)', data: now })
      if (premiacaoMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_premiacao', valor: premiacaoMandante, descricao: 'Estorno de bônus por desempenho (COPA)', data: now })
      if (premiacaoVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_premiacao', valor: premiacaoVisitante, descricao: 'Estorno de bônus por desempenho (COPA)', data: now })
      if (movs.length) await supabase.from('movimentacoes').insert(movs)

      // 3) Registrar estornos no BID
      const bids: any[] = []
      if (receitaMandante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida (COPA)', id_time1: mandanteId, valor: -receitaMandante, data_evento: now })
      if (receitaVisitante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida (COPA)', id_time1: visitanteId, valor: -receitaVisitante, data_evento: now })
      if (salariosMandante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários) — COPA', id_time1: mandanteId, valor: +salariosMandante, data_evento: now })
      if (salariosVisitante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários) — COPA', id_time1: visitanteId, valor: +salariosVisitante, data_evento: now })
      if (premiacaoMandante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus por desempenho (COPA)', id_time1: mandanteId, valor: -premiacaoMandante, data_evento: now })
      if (premiacaoVisitante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus por desempenho (COPA)', id_time1: visitanteId, valor: -premiacaoVisitante, data_evento: now })
      if (bids.length) await supabase.from('bid').insert(bids)

      // 4) Decrementa 1 jogo no elenco dos dois times
      await ajustarJogosElenco(mandanteId, -1)
      await ajustarJogosElenco(visitanteId, -1)
    }

    // 5) Zera placar e limpa extras se houver
    const patch: any = {
      gols_time1: null, gols_time2: null, bonus_pago: false
    }
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

  /* ===== UI DERIVED ===== */
  const jogosFiltrados = useMemo(() =>
    jogos.filter(j =>
      filtroTime === 'Todos' ||
      timesMap[j.time1]?.nome === filtroTime ||
      timesMap[j.time2]?.nome === filtroTime
    ), [jogos, filtroTime, timesMap]
  )
  const jogosPorRodada: Record<number, Jogo[]> = useMemo(() => {
    const map: Record<number, Jogo[]> = {}
    jogosFiltrados.forEach(j => { if (!map[j.rodada]) map[j.rodada]=[]; map[j.rodada].push(j) })
    return map
  }, [jogosFiltrados])
  const listaRodadas = useMemo(()=>Object.keys(jogosPorRodada).map(Number).sort((a,b)=>a-b),[jogosPorRodada])
  const nomesDosTimes = useMemo(()=>Object.values(timesMap).map(t=>t.nome).sort(),[timesMap])

  /* ===== Small UI components ===== */
  const ScoreInput = ({ value, onChange, disabled }:{
    value: number | null; onChange: (v:number)=>void; disabled?: boolean
  }) => (
    <div className="flex items-center gap-1 rounded-full bg-zinc-950/70 border border-zinc-700 px-1">
      <button className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40" onClick={()=>onChange(clampInt((value ?? 0)-1))} disabled={disabled} aria-label="Diminuir">
        <FiMinus />
      </button>
      <input
        type="number" min={0}
        className="w-12 text-center bg-transparent outline-none font-bold"
        value={value ?? ''} onChange={(e)=>onChange(clampInt(parseInt(e.target.value||'0',10)))} disabled={disabled}
      />
      <button className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40" onClick={()=>onChange(clampInt((value ?? 0)+1))} disabled={disabled} aria-label="Aumentar">
        <FiPlus />
      </button>
    </div>
  )

  const RoundHeader = ({ r }: { r: number }) => {
    const open = !!rodadasAbertas[r]
    return (
      <button
        onClick={()=>setRodadasAbertas(s=>({ ...s, [r]: !open }))}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 hover:border-zinc-700"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-400 text-xs font-semibold border border-emerald-700/30">
            Rodada
          </span>
          <span className="text-lg font-bold text-green-400">{r}</span>
        </div>
        <span className="text-zinc-400 group-hover:text-white">{open ? <FiChevronUp/> : <FiChevronDown/>}</span>
      </button>
    )
  }

  return (
    <div ref={topRef} className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black text-white">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/40 bg-black/60 border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
                UEFA Champions — Fase Liga (modelo suíço){temColunaTemporada ? ` • ${TEMPORADA}` : ''}
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Corte: <span className="text-green-400 font-semibold">1–8 Oitavas</span>, <span className="text-sky-400 font-semibold">9–24 Play-off</span>
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
                <input type="checkbox" checked={evitarMesmoPais} onChange={e=>setEvitarMesmoPais(e.target.checked)} />
                <FiTarget /> Evitar mesmo país
              </label>
              <button
                onClick={()=>setAbrirModalSwiss(true)}
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
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Filtro & Navegação de Rodadas */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Filtrar por time:</label>
            <select
              value={filtroTime}
              onChange={(e)=>setFiltroTime(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="Todos">Todos</option>
              {nomesDosTimes.map(n=> <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {listaRodadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Ir para:</span>
              {listaRodadas.map(r=>(
                <button
                  key={r}
                  onClick={()=>{
                    const el = document.getElementById(`rodada-${r}`)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs hover:border-zinc-600"
                >
                  {r}
                </button>
              ))}
              <span className="ml-auto" />
              <button
                onClick={()=>setRodadasAbertas(Object.fromEntries(listaRodadas.map(r=>[r,true])))}
                className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                expandir tudo
              </button>
              <button
                onClick={()=>setRodadasAbertas(Object.fromEntries(listaRodadas.map(r=>[r,false])))}
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
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900/60 border border-zinc-800" />
            ))}
          </div>
        ) : listaRodadas.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-10 text-center text-zinc-300">
            Nenhum jogo para exibir. Clique em <span className="font-semibold text-white">Gerar Fase Champions (8 rodadas)</span>.
          </div>
        ) : (
          listaRodadas.map((r)=>(
            <section id={`rodada-${r}`} key={r} className="mb-6">
              <RoundHeader r={r} />
              {rodadasAbertas[r] && (
                <div className="mt-3 grid gap-3">
                  {jogosPorRodada[r].map((jogo)=>(
                    <div key={jogo.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow hover:border-zinc-700">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Time 1 */}
                        <div className="flex min-w-[220px] items-center gap-3">
                          <img src={timesMap[jogo.time1]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                          <span className="max-w-[180px] truncate font-semibold">{timesMap[jogo.time1]?.nome || jogo.time1}</span>
                        </div>

                        {/* Placar */}
                        <div className="flex items-center gap-2">
                          <ScoreInput
                            value={jogo.gols_time1}
                            onChange={(v)=>setJogos(prev=>prev.map(j=>j.id===jogo.id?{...j,gols_time1:v}:j))}
                            disabled={!isAdmin}
                          />
                          <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                          <ScoreInput
                            value={jogo.gols_time2}
                            onChange={(v)=>setJogos(prev=>prev.map(j=>j.id===jogo.id?{...j,gols_time2:v}:j))}
                            disabled={!isAdmin}
                          />
                        </div>

                        {/* Time 2 */}
                        <div className="flex min-w-[220px] items-center justify-end gap-3">
                          <span className="max-w-[180px] truncate font-semibold">{timesMap[jogo.time2]?.nome || jogo.time2}</span>
                          <img src={timesMap[jogo.time2]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                        </div>

                        {/* Ações */}
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={()=>salvarPlacar(jogo)}
                              disabled={salvandoId === jogo.id}
                              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                              title="Salvar placar e processar finanças (COPA)"
                            >
                              <FiSave />
                              {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              onClick={()=>excluirPlacar(jogo)}
                              disabled={salvandoId === jogo.id}
                              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                              title="Zerar placar deste jogo (estorno)"
                            >
                              <FiTrash2 />
                              {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Info de renda/público se houver */}
                      {jogo.renda != null && jogo.publico != null && (
                        <div className="text-xs text-zinc-400 text-right mt-1 mr-10">
                          🎟️ Público: {Number(jogo.publico).toLocaleString()} | 💰 Renda: R$ {Number(jogo.renda).toLocaleString()}
                        </div>
                      )}

                      {jogo.bonus_pago && (
                        <div className="mt-2 text-[11px] text-emerald-300/80">
                          ✔️ Lançado com finanças. Edições futuras não repetem bônus/salários — apenas atualizam o placar e a classificação.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      {/* Modal */}
      {abrirModalSwiss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-400">Gerar Fase Champions (8 rodadas)?</h3>
            <p className="mb-6 text-zinc-200">
              Isso apaga os jogos {temColunaTemporada ? `da temporada "${TEMPORADA}"` : 'atuais'} e cria exatamente 8 rodadas
              (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800" onClick={()=>setAbrirModalSwiss(false)}>
                Cancelar
              </button>
              <button
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                onClick={async ()=>{
                  setAbrirModalSwiss(false)
                  await gerarSwiss() // mantém seu gerador atual
                }}
              >
                {gerando ? 'Gerando...' : 'Sim, gerar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
