'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

// 🔽 motor do estádio (público/renda reais do mandante)
import {
  simulate,
  referencePrices,
  type Sector,
  type PriceMap,
  type EstadioContext,
  sectorProportion,
} from '@/utils/estadioEngine'

/** ===================== Supabase ===================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===================== Tipos ===================== */
type GolEvento = {
  time?: string // id_time
  jogador?: string
  minuto?: number
  detalhe?: string
}

type Jogo = {
  mandante: string
  visitante: string
  gols_mandante?: number
  gols_visitante?: number
  renda?: number
  publico?: number
  bonus_pago?: boolean

  // opcional: eventos vindos do OCR
  gols_eventos?: GolEvento[]

  // campos salvos para estorno
  receita_mandante?: number
  receita_visitante?: number
  salarios_mandante?: number
  salarios_visitante?: number
  premiacao_mandante?: number
  premiacao_visitante?: number

  // 🔥 bônus de patrocinadores (para estorno)
  premiacao_patrocinios_mandante?: number
  premiacao_patrocinios_visitante?: number
}

type Rodada = {
  id: string
  numero: number
  temporada: number
  divisao: number
  jogos: Jogo[]
}

type Time = {
  id: string
  nome: string
  logo_url: string
  divisao?: number | null
}

type HistoricoJogo = {
  gols_pro: number
  gols_contra: number
  resultado: 'vitoria' | 'empate' | 'derrota'
}

type TimeDados = {
  id: string
  divisao: number
  historico: HistoricoJogo[]
}

/** ===================== Util ===================== */
const formatarBRL = (v?: number | null) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })

/** ===================== Regras de premiação (liga) ===================== */
const BONUS_MULTIPLIER = 1.5 // +50% em todos os bônus por partida

function calcularPremiacao(time: TimeDados): number {
  const { divisao, historico } = time
  const ultimaPartida = historico[historico.length - 1]
  const regras = {
    1: { vitoria: 9_000_000, empate: 6_000_000, derrota: 2_500_000, gol: 150_000, gol_sofrido: 30_000 },
    2: { vitoria: 5_000_000, empate: 3_000_000, derrota: 1_750_000, gol: 90_000, gol_sofrido: 20_000 },
    3: { vitoria: 2_000_000, empate: 500_000, derrota: 200_000, gol: 30_000, gol_sofrido: 10_000 },
  } as const

  const regra = regras[divisao as 1 | 2 | 3]
  if (!regra) return 0

  let premiacao = 0
  premiacao +=
    ultimaPartida.resultado === 'vitoria'
      ? regra.vitoria
      : ultimaPartida.resultado === 'empate'
        ? regra.empate
        : regra.derrota

  premiacao += (ultimaPartida.gols_pro ?? 0) * regra.gol
  premiacao -= (ultimaPartida.gols_contra ?? 0) * regra.gol_sofrido

  const ultimos5 = historico.slice(-5)
  const venceuTodas = ultimos5.length === 5 && ultimos5.every((j) => j.resultado === 'vitoria')
  if (venceuTodas) premiacao += 5_000_000

  return Math.round(premiacao * BONUS_MULTIPLIER)
}

/** ===================== Helpers ===================== */
const isPlacarPreenchido = (j: Jogo) => j.gols_mandante !== undefined && j.gols_visitante !== undefined

const contagemDaRodada = (rodada: Rodada) => {
  const total = rodada.jogos.length
  const feitos = rodada.jogos.filter(isPlacarPreenchido).length
  return { feitos, total }
}

const contagemGlobal = (rodadas: Rodada[], timeSelecionado?: string) => {
  const lista = !timeSelecionado
    ? rodadas
    : rodadas
        .map((r) => ({
          ...r,
          jogos: r.jogos.filter((j) => j.mandante === timeSelecionado || j.visitante === timeSelecionado),
        }))
        .filter((r) => r.jogos.length > 0)

  const total = lista.reduce((acc, r) => acc + r.jogos.length, 0)
  const feitos = lista.reduce((acc, r) => acc + r.jogos.filter(isPlacarPreenchido).length, 0)
  return { feitos, total }
}

/** ===================== Stepper (VISÍVEL no dark) ===================== */
function clamp(n: number, min = 0, max = 99) {
  return Math.max(min, Math.min(max, n))
}

function StepperGol({
  value,
  onChange,
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  ariaLabel: string
}) {
  return (
    <div
      className="inline-flex items-center rounded-2xl border border-white/20 bg-white/10 overflow-hidden shadow
                 ring-1 ring-white/10"
    >
      <button
        type="button"
        onClick={() => onChange(clamp((value ?? 0) - 1))}
        className="h-11 w-11 grid place-items-center text-white hover:bg-white/15 active:bg-white/20"
        aria-label={`${ariaLabel} diminuir`}
        title="Diminuir"
      >
        <span className="text-2xl leading-none font-black">−</span>
      </button>

      <div className="relative">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(clamp(Number(e.target.value || 0)))}
          className="h-11 w-16 text-center text-white font-extrabold text-xl bg-black/30 outline-none
                     border-x border-white/15
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={ariaLabel}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
      </div>

      <button
        type="button"
        onClick={() => onChange(clamp((value ?? 0) + 1))}
        className="h-11 w-11 grid place-items-center text-white hover:bg-white/15 active:bg-white/20"
        aria-label={`${ariaLabel} aumentar`}
        title="Aumentar"
      >
        <span className="text-2xl leading-none font-black">+</span>
      </button>
    </div>
  )
}

/** ===================== Helpers de banco ===================== */
// soma salários sem registrar (fallback p/ estorno de jogos antigos)
async function somarSalarios(timeId: string): Promise<number> {
  const { data } = await supabase.from('elenco').select('salario').eq('id_time', timeId)
  if (!data) return 0
  return data.reduce((acc, j) => acc + (j.salario || 0), 0)
}

async function ajustarJogosElenco(timeId: string, delta: number) {
  const { data: jogadores } = await supabase.from('elenco').select('id, jogos').eq('id_time', timeId)
  if (!jogadores) return
  await Promise.all(
    jogadores.map((j) =>
      supabase
        .from('elenco')
        .update({ jogos: Math.max(0, (j.jogos || 0) + delta) })
        .eq('id', j.id)
    )
  )
}

/** ========= Público & Renda com base no ESTÁDIO do mandante ========= */
function asImportance(s: any): 'normal' | 'decisao' | 'final' {
  return s === 'final' ? 'final' : s === 'decisao' ? 'decisao' : 'normal'
}
function asWeather(s: any): 'bom' | 'chuva' {
  return s === 'chuva' ? 'chuva' : 'bom'
}
function asDayType(s: any): 'semana' | 'fim' {
  return s === 'fim' ? 'fim' : 'semana'
}
function asDayTime(s: any): 'dia' | 'noite' {
  return s === 'dia' ? 'dia' : 'noite'
}

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

/** ===================== Salários (com registro) ===================== */
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

/** ===================== Premiação por jogo (LIGA) ===================== */
async function premiarPorJogo(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
  if (gols_pro === undefined || gols_contra === undefined) return 0

  const { data: timeData, error: errorTime } = await supabase.from('times').select('divisao').eq('id', timeId).single()
  if (errorTime || !timeData) return 0

  const divisao = timeData.divisao

  // pega todas as rodadas e monta histórico
  const { data: partidas } = await supabase.from('rodadas').select('jogos')

  let historico: HistoricoJogo[] = []
  partidas?.forEach((rodada) => {
    rodada.jogos.forEach((jogo: any) => {
      if (
        (jogo.mandante === timeId || jogo.visitante === timeId) &&
        jogo.gols_mandante !== undefined &&
        jogo.gols_visitante !== undefined
      ) {
        const isMandante = jogo.mandante === timeId
        const g_pro = isMandante ? jogo.gols_mandante : jogo.gols_visitante
        const g_contra = isMandante ? jogo.gols_visitante : jogo.gols_mandante
        let resultado: 'vitoria' | 'empate' | 'derrota' = 'empate'
        if (g_pro > g_contra) resultado = 'vitoria'
        if (g_pro < g_contra) resultado = 'derrota'
        historico.push({ gols_pro: g_pro, gols_contra: g_contra, resultado })
      }
    })
  })

  const resultadoAtual: 'vitoria' | 'empate' | 'derrota' =
    gols_pro > gols_contra ? 'vitoria' : gols_pro < gols_contra ? 'derrota' : 'empate'
  historico.push({ gols_pro, gols_contra, resultado: resultadoAtual })

  const valor = calcularPremiacao({ id: timeId, divisao, historico })
  if (valor <= 0) return 0

  await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
  await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'premiacao',
    valor,
    descricao: 'Premiação por desempenho na rodada',
    data: new Date().toISOString(),
  })
  await supabase.from('bid').insert({
    tipo_evento: 'bonus',
    descricao: 'Bônus por desempenho na rodada',
    id_time1: timeId,
    valor,
    data_evento: new Date().toISOString(),
  })
  return valor
}

/** ===================== 🔥 Patrocínios (bônus por jogo) ===================== */
async function obterPatrociniosDoTime(timeId: string) {
  const { data: esc } = await supabase
    .from('patrocinios_escolhidos')
    .select('id_patrocinio_master, id_patrocinio_fornecedor, id_patrocinio_secundario')
    .eq('id_time', timeId)
    .maybeSingle()

  if (!esc) return []

  const ids = [esc.id_patrocinio_master, esc.id_patrocinio_fornecedor, esc.id_patrocinio_secundario].filter(
    Boolean
  ) as string[]

  if (!ids.length) return []

  const { data: pats } = await supabase.from('patrocinios').select('id, nome, categoria, regra').in('id', ids)
  return pats || []
}

function calcularBonusPatrocinios(pats: any[], gols_pro: number, gols_contra: number) {
  let total = 0
  const detalhes: string[] = []

  const vitoria = gols_pro > gols_contra
  const cleanSheet = gols_contra === 0
  const gols = gols_pro || 0

  for (const p of pats) {
    const r = (p.regra || {}) as any
    let credito = 0

    if (vitoria && r.por_vitoria) credito += Number(r.por_vitoria) || 0
    if (gols && r.por_gol) credito += (Number(r.por_gol) || 0) * gols
    if (cleanSheet && r.por_clean_sheet) credito += Number(r.por_clean_sheet) || 0

    if (credito > 0) {
      total += credito
      const partes: string[] = []
      if (vitoria && r.por_vitoria) partes.push(`Vitória ${formatarBRL(r.por_vitoria)}`)
      if (gols && r.por_gol) partes.push(`Gols ${gols}×${formatarBRL(r.por_gol)}`)
      if (cleanSheet && r.por_clean_sheet) partes.push(`CS ${formatarBRL(r.por_clean_sheet)}`)
      detalhes.push(`${p.nome}: ${partes.join(' + ')} = ${formatarBRL(credito)}`)
    }
  }

  return { total, detalhes }
}

async function pagarBonusPatrociniosPorJogo(timeId: string, gols_pro: number, gols_contra: number) {
  const pats = await obterPatrociniosDoTime(timeId)
  if (!pats.length) return { total: 0, detalheTexto: '' }

  const { total, detalhes } = calcularBonusPatrocinios(pats, gols_pro, gols_contra)
  if (total <= 0) return { total: 0, detalheTexto: '' }

  const now = new Date().toISOString()

  await supabase.rpc('atualizar_saldo', { id_time: timeId, valor: total })
  await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'bonus_patrocinio',
    valor: total,
    descricao: `Bônus de patrocinadores por jogo: ${detalhes.join(' | ')}`,
    data: now,
  })
  await supabase.from('bid').insert({
    tipo_evento: 'bonus_patrocinio',
    descricao: `Bônus de patrocinadores: ${detalhes.join(' | ')}`,
    id_time1: timeId,
    valor: total,
    data_evento: now,
  })

  return { total, detalheTexto: detalhes.join(' | ') }
}

/** ===================== Helpers OCR ===================== */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] || ''
      resolve(base64)
    }
    reader.readAsDataURL(file)
  })
}

/** ===================== Página ===================== */
export default function Jogos() {
  const { isAdmin, loading } = useAdmin()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [temporada, setTemporada] = useState(1)
  const [divisao, setDivisao] = useState(1)
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  // edição
  const [editandoRodada, setEditandoRodada] = useState<string | null>(null)
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null)
  const [golsMandante, setGolsMandante] = useState<number>(0)
  const [golsVisitante, setGolsVisitante] = useState<number>(0)
  const [isSalvando, setIsSalvando] = useState(false)

  // OCR
  const [lendoOCR, setLendoOCR] = useState(false)

  // gerar temporada
  const [gerando, setGerando] = useState(false)

  const carregarDados = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url, divisao')
    const map: Record<string, Time> = {}
    times?.forEach((t) => {
      map[t.id] = { ...t, logo_url: t.logo_url || '' }
    })
    setTimesMap(map)

    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true })

    setRodadas((rodadasData || []) as Rodada[])
  }

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporada, divisao])

  // ================== NOVO: gerar temporada genérico (inclui T4) ==================
  const gerarTemporada = async (temp: number) => {
    if (!isAdmin) return
    if (!confirm(`Gerar jogos da Temporada ${temp} para as Divisões 1, 2 e 3 (ida+volta)?`)) return
    try {
      setGerando(true)
      toast.loading(`Iniciando Temporada ${temp}...`, { id: 'gerar-t' })

      const resA = await fetch('/api/iniciar-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporada: temp }),
      })
      const a = await resA.json()
      if (!resA.ok || !a?.ok) throw new Error(a?.erro || 'Falha ao iniciar temporada')

      toast.loading(`Gerando rodadas/jogos da T${temp}...`, { id: 'gerar-t' })
      const resB = await fetch('/api/gerar-jogos-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporada: temp, divisoes: [1, 2, 3], duploTurno: true }),
      })
      const b = await resB.json()
      if (!resB.ok || !b?.ok) throw new Error(b?.erro || 'Falha ao gerar jogos')

      toast.success(`✅ Temporada ${temp} gerada! Rodadas: ${b.total_rodadas} | Jogos: ${b.total_jogos}`, { id: 'gerar-t' })
      setTemporada(temp)
      await carregarDados()
    } catch (e: any) {
      toast.error(`❌ ${e.message || e}`, { id: 'gerar-t' })
    } finally {
      setGerando(false)
    }
  }

  /** =============== OCR: ler placar do print e APLICAR NA EDIÇÃO =============== */
  const lerGolsDoPrint = async (file: File) => {
    try {
      setLendoOCR(true)
      toast.loading('🔎 Lendo print (Google Vision)...', { id: 'ocr' })

      const base64 = await fileToBase64(file)

      const res = await fetch('/api/vision/gols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          // dica pro backend: pode ajudar na dedução
          // idioma: 'pt',
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        throw new Error(json?.erro || 'Falha no OCR (resposta inválida).')
      }

      const gm = Number(json.gm)
      const gv = Number(json.gv)

      if (!Number.isFinite(gm) || !Number.isFinite(gv)) {
        throw new Error('OCR não encontrou o placar (gm/gv).')
      }

      // ✅ só “preenche” o stepper (não salva sozinho)
      setGolsMandante(clamp(gm))
      setGolsVisitante(clamp(gv))

      toast.success(`✅ OCR: ${gm} x ${gv} (preenchido no editor)`, { id: 'ocr' })
    } catch (e: any) {
      toast.error(`❌ ${e.message || e}`, { id: 'ocr' })
    } finally {
      setLendoOCR(false)
    }
  }

  /** =============== SALVAR PRIMEIRO LANÇAMENTO (com finanças + patrocínios) =============== */
  const salvarPrimeiroLancamento = async (rodadaId: string, index: number, gm: number, gv: number) => {
    if (isSalvando) return
    setIsSalvando(true)

    const { data: rodadaDB, error: erroR } = await supabase
      .from('rodadas')
      .select('jogos, numero')
      .eq('id', rodadaId)
      .single()

    if (erroR || !rodadaDB) {
      toast.error('Erro ao buscar rodada!')
      setIsSalvando(false)
      return
    }

    const jogoDB: Jogo = rodadaDB.jogos[index]
    if (jogoDB?.bonus_pago === true) {
      await salvarAjusteResultado(rodadaId, index, gm, gv, true)
      setIsSalvando(false)
      return
    }

    const novaLista = [...rodadaDB.jogos]
    const jogo = novaLista[index]
    if (!jogo) {
      setIsSalvando(false)
      return
    }

    const mandanteId = jogo.mandante
    const visitanteId = jogo.visitante

    const gmNum = Number.isFinite(gm) ? gm : 0
    const gvNum = Number.isFinite(gv) ? gv : 0

    // 🔥 público/renda via ESTÁDIO do mandante
    const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
    if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })
    const publico = pr.publico
    const renda = pr.renda

    // receita: 95% mandante / 5% visitante
    const receitaMandante = renda * 0.95
    const receitaVisitante = renda * 0.05
    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })

    // salários (com registro)
    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    // premiação por desempenho (liga) +50%
    const premiacaoMandante = await premiarPorJogo(mandanteId, gmNum, gvNum)
    const premiacaoVisitante = await premiarPorJogo(visitanteId, gvNum, gmNum)

    // 🔥 bônus de patrocinadores
    const bonusPatroMand = await pagarBonusPatrociniosPorJogo(mandanteId, gmNum, gvNum)
    const bonusPatroVis = await pagarBonusPatrociniosPorJogo(visitanteId, gvNum, gmNum)

    // BID de receita (registrar o TOTAL que entrou por time)
    await supabase.from('bid').insert([
      {
        tipo_evento: 'receita_partida',
        descricao: `Receita da partida (renda + bônus liga + bônus patrocínios${
          bonusPatroMand.detalheTexto ? ' — ' + bonusPatroMand.detalheTexto : ''
        })`,
        id_time1: mandanteId,
        valor: receitaMandante + premiacaoMandante + bonusPatroMand.total,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'receita_partida',
        descricao: `Receita da partida (renda + bônus liga + bônus patrocínios${
          bonusPatroVis.detalheTexto ? ' — ' + bonusPatroVis.detalheTexto : ''
        })`,
        id_time1: visitanteId,
        valor: receitaVisitante + premiacaoVisitante + bonusPatroVis.total,
        data_evento: new Date().toISOString(),
      },
    ])

    // elenco (jogos +1)
    await ajustarJogosElenco(mandanteId, +1)
    await ajustarJogosElenco(visitanteId, +1)

    // grava o jogo na rodada com os valores para estorno
    novaLista[index] = {
      ...jogo,
      gols_mandante: gmNum,
      gols_visitante: gvNum,
      renda,
      publico,
      bonus_pago: true,
      receita_mandante: receitaMandante,
      receita_visitante: receitaVisitante,
      salarios_mandante: salariosMandante,
      salarios_visitante: salariosVisitante,
      premiacao_mandante: premiacaoMandante,
      premiacao_visitante: premiacaoVisitante,
      premiacao_patrocinios_mandante: bonusPatroMand.total,
      premiacao_patrocinios_visitante: bonusPatroVis.total,
    }

    const up = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    if (up.error) {
      toast.error('Erro ao salvar placar no banco!')
      setIsSalvando(false)
      return
    }

    // serviços auxiliares
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')

    // estado local
    setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))

    const { feitos, total } = contagemDaRodada({ ...(rodadas.find((r) => r.id === rodadaId) as Rodada), jogos: novaLista })
    const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
    const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

    toast.success(
      `✅ Placar salvo! ${feitos}/${total} jogos desta rodada com placar.\n🎟️ Público (do estádio): ${publico.toLocaleString()}  |  💰 Renda (do estádio): R$ ${renda.toLocaleString()}\n💵 ${mandanteNome}: R$ ${Math.round(receitaMandante).toLocaleString()} + bônus (liga) + patrocínios\n💵 ${visitanteNome}: R$ ${Math.round(receitaVisitante).toLocaleString()} + bônus (liga) + patrocínios`,
      { duration: 9000 }
    )

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)

    // ✅ garante refresh total
    await carregarDados()
  }

  /** =============== AJUSTE DE RESULTADO (sem repetir finanças) =============== */
  const salvarAjusteResultado = async (rodadaId: string, index: number, gm: number, gv: number, silencioso = false) => {
    if (isSalvando) return
    setIsSalvando(true)

    const { data: rodadaDB, error: erroR } = await supabase
      .from('rodadas')
      .select('jogos, numero')
      .eq('id', rodadaId)
      .single()

    if (erroR || !rodadaDB) {
      toast.error('Erro ao buscar rodada!')
      setIsSalvando(false)
      return
    }

    const novaLista = [...rodadaDB.jogos]
    const jogo = novaLista[index]
    if (!jogo) {
      setIsSalvando(false)
      return
    }

    const gmNum = Number.isFinite(gm) ? gm : 0
    const gvNum = Number.isFinite(gv) ? gv : 0
    novaLista[index] = { ...jogo, gols_mandante: gmNum, gols_visitante: gvNum, bonus_pago: true }

    const up = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    if (up.error) {
      toast.error('Erro ao atualizar o resultado!')
      setIsSalvando(false)
      return
    }

    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')

    setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))

    if (!silencioso) {
      const { feitos, total } = contagemDaRodada({ ...(rodadas.find((r) => r.id === rodadaId) as Rodada), jogos: novaLista })
      toast.success(`✏️ Resultado atualizado! ${feitos}/${total} jogos desta rodada com placar (sem repetir bônus).`)
    }

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)

    // ✅ garante refresh total
    await carregarDados()
  }

  /** =============== Excluir placar (com REEMBOLSO TOTAL) =============== */
  const excluirResultado = async (rodadaId: string, index: number) => {
    if (!confirm('Deseja excluir o resultado deste jogo? Isso fará estorno automático de TODAS as finanças.')) return
    const rodada = rodadas.find((r) => r.id === rodadaId)
    if (!rodada) return

    const jogo = rodada.jogos[index]
    if (!jogo) return

    const now = new Date().toISOString()
    const mandanteId = jogo.mandante
    const visitanteId = jogo.visitante

    if (jogo.bonus_pago) {
      const renda = jogo.renda ?? 0

      const receitaMandante = jogo.receita_mandante ?? (renda ? renda * 0.95 : 0)
      const receitaVisitante = jogo.receita_visitante ?? (renda ? renda * 0.05 : 0)

      const salariosMandante = jogo.salarios_mandante ?? (await somarSalarios(mandanteId))
      const salariosVisitante = jogo.salarios_visitante ?? (await somarSalarios(visitanteId))

      const premiacaoMandante = jogo.premiacao_mandante ?? 0
      const premiacaoVisitante = jogo.premiacao_visitante ?? 0

      const bonusPatroMandante = jogo.premiacao_patrocinios_mandante ?? 0
      const bonusPatroVisitante = jogo.premiacao_patrocinios_visitante ?? 0

      const totalCreditosMandante = receitaMandante + premiacaoMandante + bonusPatroMandante
      const totalCreditosVisitante = receitaVisitante + premiacaoVisitante + bonusPatroVisitante

      // 1) Reverter saldos (TUDO que entrou) + devolver salários
      await Promise.all([
        totalCreditosMandante
          ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -totalCreditosMandante })
          : Promise.resolve(),
        totalCreditosVisitante
          ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -totalCreditosVisitante })
          : Promise.resolve(),

        salariosMandante
          ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante })
          : Promise.resolve(),
        salariosVisitante
          ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante })
          : Promise.resolve(),
      ])

      // 2) movimentações (registro completo)
      const movs: any[] = []

      if (receitaMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_receita',
          valor: receitaMandante,
          descricao: 'Estorno receita (renda do estádio) da partida',
          data: now,
        })
      if (receitaVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_receita',
          valor: receitaVisitante,
          descricao: 'Estorno receita (renda do estádio) da partida',
          data: now,
        })

      if (premiacaoMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_premiacao',
          valor: premiacaoMandante,
          descricao: 'Estorno de premiação (partida + gols) da liga',
          data: now,
        })
      if (premiacaoVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_premiacao',
          valor: premiacaoVisitante,
          descricao: 'Estorno de premiação (partida + gols) da liga',
          data: now,
        })

      if (bonusPatroMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_bonus_patrocinio',
          valor: bonusPatroMandante,
          descricao: 'Estorno de bônus de patrocinadores da partida',
          data: now,
        })
      if (bonusPatroVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_bonus_patrocinio',
          valor: bonusPatroVisitante,
          descricao: 'Estorno de bônus de patrocinadores da partida',
          data: now,
        })

      if (salariosMandante)
        movs.push({
          id_time: mandanteId,
          tipo: 'estorno_salario',
          valor: salariosMandante,
          descricao: 'Estorno de salários (devolução) da partida',
          data: now,
        })
      if (salariosVisitante)
        movs.push({
          id_time: visitanteId,
          tipo: 'estorno_salario',
          valor: salariosVisitante,
          descricao: 'Estorno de salários (devolução) da partida',
          data: now,
        })

      if (movs.length) await supabase.from('movimentacoes').insert(movs)

      // 3) BID (espelho completo)
      const bids: any[] = []

      if (receitaMandante)
        bids.push({
          tipo_evento: 'estorno_receita_partida',
          descricao: 'Estorno da receita (renda do estádio) da partida',
          id_time1: mandanteId,
          valor: -receitaMandante,
          data_evento: now,
        })
      if (receitaVisitante)
        bids.push({
          tipo_evento: 'estorno_receita_partida',
          descricao: 'Estorno da receita (renda do estádio) da partida',
          id_time1: visitanteId,
          valor: -receitaVisitante,
          data_evento: now,
        })

      if (premiacaoMandante)
        bids.push({
          tipo_evento: 'estorno_bonus',
          descricao: 'Estorno de premiação (partida + gols) da liga',
          id_time1: mandanteId,
          valor: -premiacaoMandante,
          data_evento: now,
        })
      if (premiacaoVisitante)
        bids.push({
          tipo_evento: 'estorno_bonus',
          descricao: 'Estorno de premiação (partida + gols) da liga',
          id_time1: visitanteId,
          valor: -premiacaoVisitante,
          data_evento: now,
        })

      if (bonusPatroMandante)
        bids.push({
          tipo_evento: 'estorno_bonus_patrocinio',
          descricao: 'Estorno de bônus de patrocinadores da partida',
          id_time1: mandanteId,
          valor: -bonusPatroMandante,
          data_evento: now,
        })
      if (bonusPatroVisitante)
        bids.push({
          tipo_evento: 'estorno_bonus_patrocinio',
          descricao: 'Estorno de bônus de patrocinadores da partida',
          id_time1: visitanteId,
          valor: -bonusPatroVisitante,
          data_evento: now,
        })

      if (salariosMandante)
        bids.push({
          tipo_evento: 'estorno_despesas',
          descricao: 'Estorno de despesas (salários) da partida',
          id_time1: mandanteId,
          valor: +salariosMandante,
          data_evento: now,
        })
      if (salariosVisitante)
        bids.push({
          tipo_evento: 'estorno_despesas',
          descricao: 'Estorno de despesas (salários) da partida',
          id_time1: visitanteId,
          valor: +salariosVisitante,
          data_evento: now,
        })

      if (bids.length) await supabase.from('bid').insert(bids)

      // 4) jogos -1 no elenco (reverte estatística)
      await ajustarJogosElenco(mandanteId, -1)
      await ajustarJogosElenco(visitanteId, -1)
    }

    // limpa placar e campos financeiros
    const novaLista = [...rodada.jogos]
    novaLista[index] = {
      ...novaLista[index],
      gols_mandante: undefined,
      gols_visitante: undefined,
      renda: undefined,
      publico: undefined,
      bonus_pago: false,
      gols_eventos: undefined,
      receita_mandante: undefined,
      receita_visitante: undefined,
      salarios_mandante: undefined,
      salarios_visitante: undefined,
      premiacao_mandante: undefined,
      premiacao_visitante: undefined,
      premiacao_patrocinios_mandante: undefined,
      premiacao_patrocinios_visitante: undefined,
    }

    const up = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    if (up.error) {
      toast.error('Erro ao remover resultado no banco!')
      return
    }

    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')

    setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))
    toast.success('🗑️ Resultado removido e reembolso TOTAL concluído (renda + salários + premiação + patrocínios).')

    // ✅ garante refresh total
    await carregarDados()
  }

  /** =============== Filtro por time (opcional) =============== */
  const rodadasFiltradas = !timeSelecionado
    ? rodadas
    : rodadas
        .map((rodada) => ({
          ...rodada,
          jogos: rodada.jogos.filter((jogo) => jogo.mandante === timeSelecionado || jogo.visitante === timeSelecionado),
        }))
        .filter((rodada) => rodada.jogos.length > 0)

  if (loading) return <p className="text-center text-white">🔄 Verificando permissões...</p>

  const { feitos: feitosGlobais, total: totalGlobais } = contagemGlobal(rodadasFiltradas, timeSelecionado)

  return (
    <div className="relative min-h-screen pb-12">
      {/* glows de fundo */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      {/* Cabeçalho */}
      <header className="max-w-7xl mx-auto px-6 pt-6">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          📅 Jogos da LigaFut
        </h1>
        <p className="text-sm text-white/60 mt-1">Lance resultados, processe finanças e acompanhe o andamento das rodadas.</p>
      </header>

      {/* Painel de filtros (sticky) */}
      <div className="sticky top-0 z-10 mt-4 bg-gradient-to-b from-black/60 to-transparent backdrop-blur px-6 py-3 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
          {/* Temporadas */}
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {[1, 2, 3, 4].map((temp) => (
              <button
                key={temp}
                onClick={() => setTemporada(temp)}
                aria-pressed={temporada === temp}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  temporada === temp
                    ? 'bg-emerald-600 text-white ring-1 ring-emerald-300'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Temporada {temp}
              </button>
            ))}
          </div>

          {/* Divisões */}
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {[1, 2, 3].map((div) => (
              <button
                key={div}
                onClick={() => setDivisao(div)}
                aria-pressed={divisao === div}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  divisao === div ? 'bg-sky-600 text-white ring-1 ring-sky-300' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Divisão {div}
              </button>
            ))}
          </div>

          {/* Filtro de time */}
          <select
            className="ml-2 p-2 bg-white/5 border border-white/10 text-white rounded-lg"
            onChange={(e) => setTimeSelecionado(e.target.value)}
            value={timeSelecionado}
          >
            <option value="">Todos os times</option>
            {Object.values(timesMap).map((time) => (
              <option key={time.id} value={time.id}>
                {time.nome}
              </option>
            ))}
          </select>

          {/* Resumo */}
          <span className="ml-auto text-xs md:text-sm px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80">
            {feitosGlobais}/{totalGlobais} jogos com placar (filtro atual)
          </span>

          {/* Botões admin */}
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => gerarTemporada(temporada)}
                disabled={gerando}
                className={`ml-2 px-4 py-2 rounded-xl font-semibold border ${
                  gerando
                    ? 'bg-gray-700 border-white/10 text-white/70'
                    : 'bg-emerald-600 border-emerald-500/50 text-black hover:bg-emerald-500'
                }`}
                title={`Cria a classificação e gera todas as rodadas (divisões 1–3) da Temporada ${temporada}`}
              >
                {gerando ? 'Processando…' : `⚙️ Gerar Temporada ${temporada}`}
              </button>

              <button
                onClick={() => gerarTemporada(4)}
                disabled={gerando}
                className={`ml-2 px-4 py-2 rounded-xl font-semibold border ${
                  gerando
                    ? 'bg-gray-700 border-white/10 text-white/70'
                    : 'bg-sky-600 border-sky-500/50 text-black hover:bg-sky-500'
                }`}
                title="Gerar imediatamente a Temporada 4 (ida+volta nas divisões 1–3)"
              >
                {gerando ? 'Processando…' : '⚙️ Gerar Temporada 4'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lista de rodadas */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        {rodadasFiltradas.map((rodada) => {
          const { feitos, total } = contagemDaRodada(rodada)

          return (
            <section key={rodada.id} className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold text-white">🏁 Rodada {rodada.numero}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/70">
                  {feitos}/{total} com placar
                </span>
              </div>

              <div className="space-y-2">
                {rodada.jogos.map((jogo, index) => {
                  const mandante = timesMap[jogo.mandante]
                  const visitante = timesMap[jogo.visitante]
                  const estaEditando = editandoRodada === rodada.id && editandoIndex === index
                  const temPlacar = isPlacarPreenchido(jogo)
                  const [gM, gV] = [jogo.gols_mandante ?? 0, jogo.gols_visitante ?? 0]

                  return (
                    <article
                      key={index}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        temPlacar
                          ? 'border-emerald-700/40 bg-emerald-500/[0.06]'
                          : 'border-white/10 bg-white/5 hover:bg-white/7'
                      }`}
                    >
                      <div className="grid grid-cols-12 items-center gap-2">
                        {/* Mandante */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-end gap-2">
                          {mandante?.logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={mandante.logo_url}
                              alt="logo"
                              className="h-6 w-6 rounded-full ring-1 ring-white/10"
                            />
                          )}
                          <span className="font-medium text-right truncate text-white">{mandante?.nome || '???'}</span>
                        </div>

                        {/* Placar / Editor */}
                        <div className="col-span-2 md:col-span-4 text-center">
                          {estaEditando ? (
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="flex items-center justify-center gap-2">
                                <StepperGol value={golsMandante} onChange={setGolsMandante} ariaLabel="Gols do mandante" />
                                <span className="text-white/90 font-extrabold text-lg">x</span>
                                <StepperGol
                                  value={golsVisitante}
                                  onChange={setGolsVisitante}
                                  ariaLabel="Gols do visitante"
                                />
                              </div>

                              {/* OCR bar (aparece só editando) */}
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <label className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white/90 cursor-pointer hover:bg-white/15">
                                  {lendoOCR ? 'Lendo…' : '📷 Ler gols do print (Google Vision)'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    disabled={lendoOCR}
                                    onChange={async (e) => {
                                      const f = e.target.files?.[0]
                                      if (!f) return
                                      await lerGolsDoPrint(f)
                                      // ✅ permite reenviar o mesmo arquivo
                                      e.currentTarget.value = ''
                                    }}
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setGolsMandante(0)
                                    setGolsVisitante(0)
                                  }}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-black/30 border border-white/15 text-white/80 hover:bg-black/40"
                                  title="Zerar placar no editor"
                                >
                                  Limpar
                                </button>
                              </div>
                            </div>
                          ) : temPlacar ? (
                            <span className="text-lg md:text-xl font-extrabold tracking-tight text-white">
                              {gM} <span className="text-white/60">x</span> {gV}
                            </span>
                          ) : (
                            <span className="text-white/50">🆚</span>
                          )}
                        </div>

                        {/* Visitante + ações */}
                        <div className="col-span-5 md:col-span-4 flex items-center justify-start gap-2">
                          <span className="font-medium text-left truncate text-white">{visitante?.nome || '???'}</span>
                          {visitante?.logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={visitante.logo_url}
                              alt="logo"
                              className="h-6 w-6 rounded-full ring-1 ring-white/10"
                            />
                          )}

                          {/* Ações (apenas admin) */}
                          {isAdmin && !estaEditando && (
                            <div className="flex gap-2 ml-2">
                              <button
                                onClick={() => {
                                  setEditandoRodada(rodada.id)
                                  setEditandoIndex(index)
                                  setGolsMandante(jogo.gols_mandante ?? 0)
                                  setGolsVisitante(jogo.gols_visitante ?? 0)
                                  if (jogo.bonus_pago) toast('Modo ajuste: edite e salve sem repetir bônus.', { icon: '✏️' })
                                }}
                                className="text-sm text-yellow-300 hover:text-yellow-200"
                                title={jogo.bonus_pago ? 'Editar (ajuste sem repetir bônus)' : 'Editar (lançamento com finanças)'}
                              >
                                📝
                              </button>

                              {temPlacar && (
                                <button
                                  onClick={() => excluirResultado(rodada.id, index)}
                                  className="text-sm text-red-400 hover:text-red-300"
                                  title="Remover resultado (com reembolso total)"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          )}

                          {isAdmin && estaEditando && (
                            <div className="flex gap-2 ml-2">
                              {!jogo.bonus_pago ? (
                                <button
                                  onClick={() =>
                                    salvarPrimeiroLancamento(rodada.id, index, Number(golsMandante), Number(golsVisitante))
                                  }
                                  disabled={isSalvando}
                                  className="text-sm text-green-300 font-extrabold hover:text-green-200"
                                  title="Salvar e processar finanças + patrocínios"
                                >
                                  💾
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    salvarAjusteResultado(rodada.id, index, Number(golsMandante), Number(golsVisitante))
                                  }
                                  disabled={isSalvando}
                                  className="text-sm text-green-300 font-extrabold hover:text-green-200"
                                  title="Salvar ajuste (sem repetir bônus)"
                                >
                                  ✅
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditandoRodada(null)
                                  setEditandoIndex(null)
                                }}
                                className="text-sm text-red-300 font-extrabold hover:text-red-200"
                                title="Cancelar edição"
                              >
                                ❌
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rodapé do jogo */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 justify-end">
                        {jogo.renda && jogo.publico && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-300">
                            🎟️ {jogo.publico.toLocaleString()} • 💰 R$ {jogo.renda.toLocaleString()}
                          </span>
                        )}
                        {jogo.bonus_pago && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                            ✔️ Lançado com finanças (inclui patrocínios)
                          </span>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

 