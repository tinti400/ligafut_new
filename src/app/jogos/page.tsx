'use client'

import { useEffect, useRef, useState } from 'react'
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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

/** ===================== Tipos ===================== */
type Jogo = {
  mandante: string
  visitante: string

  // ✅ JSONB: use number | null (NUNCA undefined)
  gols_mandante?: number | null
  gols_visitante?: number | null
  renda?: number | null
  publico?: number | null
  bonus_pago?: boolean

  // campos salvos para estorno
  receita_mandante?: number | null
  receita_visitante?: number | null
  salarios_mandante?: number | null
  salarios_visitante?: number | null
  premiacao_mandante?: number | null
  premiacao_visitante?: number | null

  // 🔥 bônus de patrocinadores (para estorno)
  premiacao_patrocinios_mandante?: number | null
  premiacao_patrocinios_visitante?: number | null
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

  // bônus por 5 vitórias seguidas
  const ultimos5 = historico.slice(-5)
  const venceuTodas = ultimos5.length === 5 && ultimos5.every((j) => j.resultado === 'vitoria')
  if (venceuTodas) premiacao += 5_000_000

  return Math.round(premiacao)
}

/** ===================== Helpers ===================== */
// ✅ Com null, o “preenchido” vira != null
const isPlacarPreenchido = (j: Jogo) => j.gols_mandante != null && j.gols_visitante != null

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

/** ===================== Stepper (visível no dark) ===================== */
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
      className="inline-flex items-center rounded-2xl border border-white/15 bg-black/35 overflow-hidden shadow-sm ring-1 ring-white/10"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onChange(clamp((value ?? 0) - 1))}
        className="h-11 w-11 grid place-items-center text-white hover:bg-white/10 active:bg-white/20"
        aria-label={`${ariaLabel} diminuir`}
        title="Diminuir"
      >
        <span className="text-2xl leading-none">−</span>
      </button>

      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(clamp(Number(e.target.value || 0)))}
        className="h-11 w-16 text-center text-white font-extrabold text-xl bg-transparent outline-none
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={ariaLabel}
      />

      <button
        type="button"
        onClick={() => onChange(clamp((value ?? 0) + 1))}
        className="h-11 w-11 grid place-items-center text-white hover:bg-white/10 active:bg-white/20"
        aria-label={`${ariaLabel} aumentar`}
        title="Aumentar"
      >
        <span className="text-2xl leading-none">+</span>
      </button>
    </div>
  )
}

/** ===================== OCR (upload -> base64) ===================== */
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

/** ===================== Finanças helpers ===================== */
// soma salários sem registrar (fallback p/ estorno de jogos antigos)
async function somarSalarios(timeId: string): Promise<number> {
  const { data, error } = await supabase.from('elenco').select('salario').eq('id_time', timeId)
  if (error) return 0
  if (!data) return 0
  return data.reduce((acc, j) => acc + (j.salario || 0), 0)
}

async function ajustarJogosElenco(timeId: string, delta: number) {
  const { data: jogadores, error } = await supabase.from('elenco').select('id, jogos').eq('id_time', timeId)
  if (error || !jogadores) return
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
  const { data: elenco, error } = await supabase.from('elenco').select('salario').eq('id_time', timeId)
  if (error || !elenco) return 0
  const totalSalarios = elenco.reduce((acc, j) => acc + (j.salario || 0), 0)

  const { error: erpc } = await supabase.rpc('atualizar_saldo', { id_time: timeId, valor: -totalSalarios })
  if (erpc) throw new Error('RPC atualizar_saldo (salários) falhou: ' + erpc.message)

  const dataAgora = new Date().toISOString()
  const { error: emov } = await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'salario',
    valor: totalSalarios,
    descricao: 'Desconto de salários após partida',
    data: dataAgora,
  })
  if (emov) throw new Error('Insert movimentacoes (salários) falhou: ' + emov.message)

  const { error: ebid } = await supabase.from('bid').insert({
    tipo_evento: 'despesas',
    descricao: 'Desconto de salários após a partida',
    id_time1: timeId,
    valor: -totalSalarios,
    data_evento: dataAgora,
  })
  if (ebid) throw new Error('Insert BID (salários) falhou: ' + ebid.message)

  return totalSalarios
}

/** ===================== Premiação por jogo (LIGA) ===================== */
async function premiarPorJogo(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
  if (gols_pro === undefined || gols_contra === undefined) return 0

  const { data: timeData, error: errorTime } = await supabase.from('times').select('divisao').eq('id', timeId).single()
  if (errorTime || !timeData) return 0

  const divisao = timeData.divisao

  const { data: partidas, error: epart } = await supabase.from('rodadas').select('jogos')
  if (epart) return 0

  let historico: HistoricoJogo[] = []
  partidas?.forEach((rodada) => {
    rodada.jogos.forEach((jogo: any) => {
      if (
        (jogo.mandante === timeId || jogo.visitante === timeId) &&
        jogo.gols_mandante != null &&
        jogo.gols_visitante != null
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

  const { error: erpc } = await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
  if (erpc) throw new Error('RPC atualizar_saldo (premiação) falhou: ' + erpc.message)

  const now = new Date().toISOString()

  const { error: emov } = await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'premiacao',
    valor,
    descricao: 'Premiação por desempenho na rodada',
    data: now,
  })
  if (emov) throw new Error('Insert movimentacoes (premiação) falhou: ' + emov.message)

  const { error: ebid } = await supabase.from('bid').insert({
    tipo_evento: 'bonus',
    descricao: 'Bônus por desempenho na rodada',
    id_time1: timeId,
    valor,
    data_evento: now,
  })
  if (ebid) throw new Error('Insert BID (premiação) falhou: ' + ebid.message)

  return valor
}

/** ===================== 🔥 Patrocínios (bônus por jogo) ===================== */
async function obterPatrociniosDoTime(timeId: string) {
  const { data: esc, error: eesc } = await supabase
    .from('patrocinios_escolhidos')
    .select('id_patrocinio_master, id_patrocinio_fornecedor, id_patrocinio_secundario')
    .eq('id_time', timeId)
    .maybeSingle()

  if (eesc || !esc) return []

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

  const { error: erpc } = await supabase.rpc('atualizar_saldo', { id_time: timeId, valor: total })
  if (erpc) throw new Error('RPC atualizar_saldo (bônus patrocínio) falhou: ' + erpc.message)

  const { error: emov } = await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'bonus_patrocinio',
    valor: total,
    descricao: `Bônus de patrocinadores por jogo: ${detalhes.join(' | ')}`,
    data: now,
  })
  if (emov) throw new Error('Insert movimentacoes (bônus patrocínio) falhou: ' + emov.message)

  const { error: ebid } = await supabase.from('bid').insert({
    tipo_evento: 'bonus_patrocinio',
    descricao: `Bônus de patrocinadores: ${detalhes.join(' | ')}`,
    id_time1: timeId,
    valor: total,
    data_evento: now,
  })
  if (ebid) throw new Error('Insert BID (bônus patrocínio) falhou: ' + ebid.message)

  return { total, detalheTexto: detalhes.join(' | ') }
}

/** ===================== OCR (Google Vision -> nosso endpoint) ===================== */
async function extrairPlacarDoPrint(file: File): Promise<{
  mandante: string
  visitante: string
  gols_mandante: number
  gols_visitante: number
  gols?: { nome: string; minuto?: string }[]
} | null> {
  const base64 = await fileToBase64(file)

  const res = await fetch('/api/parse-goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      images: [{ base64 }],
    }),
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || 'Falha ao ler placar')
  }

  // Caso A)
  if (Array.isArray(json.goals)) {
    const gm = json.goals.filter((g: any) => g?.team === 'M').length
    const gv = json.goals.filter((g: any) => g?.team === 'V').length
    return {
      mandante: '',
      visitante: '',
      gols_mandante: gm,
      gols_visitante: gv,
      gols: json.goals.map((g: any) => ({ nome: g?.name || g?.nome || '', minuto: g?.minute || g?.minuto })),
    }
  }

  // Caso B)
  const d = json.data || {}
  const placar = d.placar || {}
  const gm = Number(placar.mandante ?? d.gols_mandante ?? 0)
  const gv = Number(placar.visitante ?? d.gols_visitante ?? 0)

  return {
    mandante: String(d.mandante || ''),
    visitante: String(d.visitante || ''),
    gols_mandante: Number.isFinite(gm) ? gm : 0,
    gols_visitante: Number.isFinite(gv) ? gv : 0,
    gols: Array.isArray(d.gols) ? d.gols : [],
  }
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

  // gerar temporada
  const [gerando, setGerando] = useState(false)

  // OCR modal
  const [ocrAberto, setOcrAberto] = useState(false)
  const [ocrRodadaId, setOcrRodadaId] = useState<string | null>(null)
  const [ocrIndex, setOcrIndex] = useState<number | null>(null)
  const [ocrLendo, setOcrLendo] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const carregarDados = async () => {
    const { data: times, error: et } = await supabase.from('times').select('id, nome, logo_url')
    if (et) toast.error('Erro ao carregar times: ' + et.message)

    const map: Record<string, Time> = {}
    times?.forEach((t) => {
      map[t.id] = { ...t, logo_url: t.logo_url || '' }
    })
    setTimesMap(map)

    const { data: rodadasData, error: er } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true })

    if (er) toast.error('Erro ao carregar rodadas: ' + er.message)
    setRodadas((rodadasData || []) as Rodada[])
  }

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporada, divisao])

  // ================== gerar temporada ==================
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

      toast.success(`✅ Temporada ${temp} gerada! Rodadas: ${b.total_rodadas} | Jogos: ${b.total_jogos}`, {
        id: 'gerar-t',
      })
      setTemporada(temp)
      await carregarDados()
    } catch (e: any) {
      toast.error(`❌ ${e.message || e}`, { id: 'gerar-t' })
    } finally {
      setGerando(false)
    }
  }

  /** =============== SALVAR PRIMEIRO LANÇAMENTO (com finanças + patrocínios) =============== */
  const salvarPrimeiroLancamento = async (rodadaId: string, index: number, gm: number, gv: number) => {
    if (isSalvando) return
    setIsSalvando(true)

    try {
      const { data: rodadaDB, error: erroR } = await supabase.from('rodadas').select('jogos, numero').eq('id', rodadaId).single()
      if (erroR || !rodadaDB) throw new Error(erroR?.message || 'Erro ao buscar rodada')

      const jogoDB: Jogo = rodadaDB.jogos[index]
      if (jogoDB?.bonus_pago === true) {
        await salvarAjusteResultado(rodadaId, index, gm, gv, true)
        return
      }

      const novaLista = [...rodadaDB.jogos]
      const jogo = novaLista[index]
      if (!jogo) throw new Error('Jogo não encontrado')

      const mandanteId = jogo.mandante
      const visitanteId = jogo.visitante

      const pr = await calcularPublicoERendaPeloEstadio(mandanteId)
      if (pr.erro) toast('⚠️ ' + pr.erro, { icon: 'ℹ️' })
      const publico = pr.publico
      const renda = pr.renda

      const receitaMandante = renda * 0.95
      const receitaVisitante = renda * 0.05

      {
        const { error: e1 } = await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
        if (e1) throw new Error('RPC atualizar_saldo (mandante) falhou: ' + e1.message)
        const { error: e2 } = await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })
        if (e2) throw new Error('RPC atualizar_saldo (visitante) falhou: ' + e2.message)
      }

      const salariosMandante = await descontarSalariosComRegistro(mandanteId)
      const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

      const premiacaoMandante = await premiarPorJogo(mandanteId, gm, gv)
      const premiacaoVisitante = await premiarPorJogo(visitanteId, gv, gm)

      const bonusPatroMand = await pagarBonusPatrociniosPorJogo(mandanteId, gm, gv)
      const bonusPatroVis = await pagarBonusPatrociniosPorJogo(visitanteId, gv, gm)

      // ✅ BID resumo
      {
        const { error: eb } = await supabase.from('bid').insert([
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
        if (eb) throw new Error('Insert BID (resumo partida) falhou: ' + eb.message)
      }

      await ajustarJogosElenco(mandanteId, +1)
      await ajustarJogosElenco(visitanteId, +1)

      const gmNum = Number.isFinite(gm) ? gm : 0
      const gvNum = Number.isFinite(gv) ? gv : 0

      // ✅ JSONB: NUNCA undefined. Use null.
      novaLista[index] = {
        ...jogo,
        gols_mandante: gmNum,
        gols_visitante: gvNum,
        renda: renda ?? null,
        publico: publico ?? null,
        bonus_pago: true,
        receita_mandante: receitaMandante ?? null,
        receita_visitante: receitaVisitante ?? null,
        salarios_mandante: salariosMandante ?? null,
        salarios_visitante: salariosVisitante ?? null,
        premiacao_mandante: premiacaoMandante ?? null,
        premiacao_visitante: premiacaoVisitante ?? null,
        premiacao_patrocinios_mandante: bonusPatroMand.total ?? null,
        premiacao_patrocinios_visitante: bonusPatroVis.total ?? null,
      }

      // ✅ checa erro do update
      const { error: eupd } = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
      if (eupd) throw new Error('Update rodadas falhou: ' + eupd.message)

      // classificação + moral (não quebra o save se falhar, mas avisa)
      const c = await fetch(`/api/classificacao?temporada=${temporada}`).catch(() => null)
      if (c && !c.ok) toast('⚠️ Falha ao atualizar classificação', { icon: 'ℹ️' })
      const m = await fetch('/api/atualizar-moral').catch(() => null)
      if (m && !m.ok) toast('⚠️ Falha ao atualizar moral', { icon: 'ℹ️' })

      setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))

      const { feitos, total } = contagemDaRodada({
        ...(rodadas.find((r) => r.id === rodadaId) as Rodada),
        jogos: novaLista,
      })
      const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
      const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

      toast.success(
        `✅ Placar salvo! ${feitos}/${total} jogos desta rodada com placar.\n🎟️ Público (do estádio): ${publico.toLocaleString()}  |  💰 Renda (do estádio): R$ ${renda.toLocaleString()}\n💵 ${mandanteNome}: R$ ${Math.round(receitaMandante).toLocaleString()} + bônus (liga) + patrocínios\n💵 ${visitanteNome}: R$ ${Math.round(receitaVisitante).toLocaleString()} + bônus (liga) + patrocínios`,
        { duration: 9000 }
      )

      setEditandoRodada(null)
      setEditandoIndex(null)

      // ✅ garante que o UI está sincronizado
      await carregarDados()
    } catch (e: any) {
      console.error(e)
      toast.error(`❌ Não salvou: ${e?.message || e}`)
    } finally {
      setIsSalvando(false)
    }
  }

  /** =============== AJUSTE DE RESULTADO (sem repetir finanças) =============== */
  const salvarAjusteResultado = async (
    rodadaId: string,
    index: number,
    gm: number,
    gv: number,
    silencioso = false
  ) => {
    if (isSalvando) return
    setIsSalvando(true)

    try {
      const { data: rodadaDB, error: erroR } = await supabase.from('rodadas').select('jogos, numero').eq('id', rodadaId).single()
      if (erroR || !rodadaDB) throw new Error(erroR?.message || 'Erro ao buscar rodada')

      const novaLista = [...rodadaDB.jogos]
      const jogo = novaLista[index]
      if (!jogo) throw new Error('Jogo não encontrado')

      const gmNum = Number.isFinite(gm) ? gm : 0
      const gvNum = Number.isFinite(gv) ? gv : 0

      // ✅ JSONB: NUNCA undefined
      novaLista[index] = { ...jogo, gols_mandante: gmNum, gols_visitante: gvNum, bonus_pago: true }

      const { error: eupd } = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
      if (eupd) throw new Error('Update rodadas falhou: ' + eupd.message)

      const c = await fetch(`/api/classificacao?temporada=${temporada}`).catch(() => null)
      if (c && !c.ok) toast('⚠️ Falha ao atualizar classificação', { icon: 'ℹ️' })
      const m = await fetch('/api/atualizar-moral').catch(() => null)
      if (m && !m.ok) toast('⚠️ Falha ao atualizar moral', { icon: 'ℹ️' })

      setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))

      if (!silencioso) {
        const { feitos, total } = contagemDaRodada({
          ...(rodadas.find((r) => r.id === rodadaId) as Rodada),
          jogos: novaLista,
        })
        toast.success(`✏️ Resultado atualizado! ${feitos}/${total} jogos desta rodada com placar (sem repetir bônus).`)
      }

      setEditandoRodada(null)
      setEditandoIndex(null)
      await carregarDados()
    } catch (e: any) {
      console.error(e)
      toast.error(`❌ Não salvou: ${e?.message || e}`)
    } finally {
      setIsSalvando(false)
    }
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

    try {
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

        await Promise.all([
          totalCreditosMandante
            ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -totalCreditosMandante })
            : Promise.resolve(),
          totalCreditosVisitante
            ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -totalCreditosVisitante })
            : Promise.resolve(),
          salariosMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }) : Promise.resolve(),
          salariosVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }) : Promise.resolve(),
        ])

        const movs: any[] = []
        if (receitaMandante)
          movs.push({ id_time: mandanteId, tipo: 'estorno_receita', valor: receitaMandante, descricao: 'Estorno receita (renda do estádio) da partida', data: now })
        if (receitaVisitante)
          movs.push({ id_time: visitanteId, tipo: 'estorno_receita', valor: receitaVisitante, descricao: 'Estorno receita (renda do estádio) da partida', data: now })
        if (premiacaoMandante)
          movs.push({ id_time: mandanteId, tipo: 'estorno_premiacao', valor: premiacaoMandante, descricao: 'Estorno de premiação (partida + gols) da liga', data: now })
        if (premiacaoVisitante)
          movs.push({ id_time: visitanteId, tipo: 'estorno_premiacao', valor: premiacaoVisitante, descricao: 'Estorno de premiação (partida + gols) da liga', data: now })
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
        if (movs.length) {
          const { error: emov } = await supabase.from('movimentacoes').insert(movs)
          if (emov) throw new Error('Insert movimentacoes (estornos) falhou: ' + emov.message)
        }

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
        if (bids.length) {
          const { error: ebid } = await supabase.from('bid').insert(bids)
          if (ebid) throw new Error('Insert BID (estornos) falhou: ' + ebid.message)
        }

        await ajustarJogosElenco(mandanteId, -1)
        await ajustarJogosElenco(visitanteId, -1)
      }

      // ✅ zerar placar no JSONB: use null (NUNCA undefined)
      const novaLista = [...rodada.jogos]
      novaLista[index] = {
        ...novaLista[index],
        gols_mandante: null,
        gols_visitante: null,
        renda: null,
        publico: null,
        bonus_pago: false,
        receita_mandante: null,
        receita_visitante: null,
        salarios_mandante: null,
        salarios_visitante: null,
        premiacao_mandante: null,
        premiacao_visitante: null,
        premiacao_patrocinios_mandante: null,
        premiacao_patrocinios_visitante: null,
      }

      const { error: eupd } = await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
      if (eupd) throw new Error('Update rodadas (limpar placar) falhou: ' + eupd.message)

      const c = await fetch(`/api/classificacao?temporada=${temporada}`).catch(() => null)
      if (c && !c.ok) toast('⚠️ Falha ao atualizar classificação', { icon: 'ℹ️' })
      const m = await fetch('/api/atualizar-moral').catch(() => null)
      if (m && !m.ok) toast('⚠️ Falha ao atualizar moral', { icon: 'ℹ️' })

      setRodadas((prev) => prev.map((r) => (r.id === rodadaId ? { ...r, jogos: novaLista } : r)))

      toast.success('🗑️ Resultado removido e reembolso TOTAL concluído (renda + salários + premiação + patrocínios).')

      await carregarDados()
    } catch (e: any) {
      console.error(e)
      toast.error(`❌ Falha ao excluir: ${e?.message || e}`)
    }
  }
