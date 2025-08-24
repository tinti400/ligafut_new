export type Sector = 'popular' | 'norte' | 'sul' | 'leste' | 'oeste' | 'camarote'
export const NIVEL_MAXIMO = 10

// Proporção de lugares por setor (soma ~1)
export const sectorProportion: Record<Sector, number> = {
  popular: 0.25,
  norte: 0.15,
  sul: 0.15,
  leste: 0.2,
  oeste: 0.2,
  camarote: 0.05,
}

// Custo variável médio por torcedor (limpeza, segurança leve por setor, insumos)
export const variableCostPerSector: Record<Sector, number> = {
  popular: 6,
  norte: 7,
  sul: 7,
  leste: 10,
  oeste: 12,
  camarote: 25,
}

// Preço de referência base por setor (nível 1)
const baseRef: Record<Sector, number> = {
  popular: 20,
  norte: 30,
  sul: 30,
  leste: 50,
  oeste: 60,
  camarote: 200,
}

// Limites de preço (multiplicadores sobre a referência)
const priceLimitMult: Record<Sector, number> = {
  popular: 3.0,
  norte: 3.2,
  sul: 3.2,
  leste: 3.0,
  oeste: 3.0,
  camarote: 4.0,
}

export function brl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.round(v))
}
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function referencePrices(level: number): Record<Sector, number> {
  const mult = 1 + 0.18 * (level - 1) // cada nível sobe ~18% a referência
  return {
    popular: Math.round(baseRef.popular * mult),
    norte: Math.round(baseRef.norte * mult),
    sul: Math.round(baseRef.sul * mult),
    leste: Math.round(baseRef.leste * mult),
    oeste: Math.round(baseRef.oeste * mult),
    camarote: Math.round(baseRef.camarote * mult),
  }
}
export function priceLimits(level: number): Record<Sector, number> {
  const ref = referencePrices(level)
  return Object.fromEntries(
    (Object.keys(ref) as Sector[]).map((s) => [s, Math.round(ref[s] * priceLimitMult[s])])
  ) as Record<Sector, number>
}

export type Importance = 'normal' | 'decisao' | 'final'
export type Weather = 'bom' | 'chuva'
export type DayType = 'semana' | 'fim'
export type DayTime = 'dia' | 'noite'

export type EstadioContext = {
  importance: Importance
  derby: boolean
  weather: Weather
  dayType: DayType
  dayTime: DayTime
  opponentStrength: number // 0..100
  moraleTec: number // 0..10
  moraleTor: number // 0..100
  sociosPct: number // % lugares p/ sócios (0..50)
  sociosPreco: number
  infraScore: number // 0..100
  level: number // 1..NIVEL_MAXIMO
}

type SegmentId = 'pop' | 'familia' | 'turista' | 'corp'
type Segment = {
  id: SegmentId
  share: number
  priceK: number
  comfortK: number
  attraction: Record<Sector, number>
}

const segments: Segment[] = [
  { id: 'pop', share: 0.40, priceK: 0.95, comfortK: 0.45, attraction: { popular: 1, norte: 0.9, sul: 0.9, leste: 0.55, oeste: 0.5, camarote: 0.15 } },
  { id: 'familia', share: 0.30, priceK: 0.75, comfortK: 0.85, attraction: { popular: 0.6, norte: 0.7, sul: 0.7, leste: 1, oeste: 0.9, camarote: 0.25 } },
  { id: 'turista', share: 0.20, priceK: 0.55, comfortK: 0.65, attraction: { popular: 0.45, norte: 0.55, sul: 0.55, leste: 0.9, oeste: 1, camarote: 0.5 } },
  { id: 'corp', share: 0.10, priceK: 0.35, comfortK: 0.95, attraction: { popular: 0.05, norte: 0.05, sul: 0.05, leste: 0.4, oeste: 0.7, camarote: 1 } },
]

function baseInterest(ctx: EstadioContext) {
  const imp = ctx.importance === 'final' ? 1.35 : ctx.importance === 'decisao' ? 1.18 : 1.0
  const derby = ctx.derby ? 1.12 : 1.0
  const opp = 0.8 + 0.002 * clamp(ctx.opponentStrength, 0, 100)
  const mt = 0.9 + 0.02 * clamp(ctx.moraleTec, 0, 10)
  const tor = 0.9 + 0.002 * clamp(ctx.moraleTor, 0, 100)
  const clima = ctx.weather === 'chuva' ? 0.92 : 1.0
  const dia = ctx.dayType === 'fim' ? 1.08 : 1.0
  const hora = ctx.dayTime === 'noite' ? 1.02 : 1.0
  return clamp(0.65 * imp * derby * opp * mt * tor * clima * dia * hora, 0.3, 1.6)
}

// Custos fixos por jogo (sobe com nível e infra)
function fixedCost(ctx: EstadioContext) {
  const base = 45000
  const lv = 18000 * (ctx.level - 1)
  const infra = 900 * clamp(ctx.infraScore, 0, 100)
  return base + lv + infra
}

// Custo operacional (escala com público) — policiais, staff, energia, limpeza
function operationalCost(audience: number, ctx: EstadioContext) {
  const A = Math.max(0, audience)
  const kDerby = ctx.derby ? 1.30 : 1.0
  const kImp = ctx.importance === 'final' ? 1.25 : ctx.importance === 'decisao' ? 1.15 : 1.0
  const kNoite = ctx.dayTime === 'noite' ? 1.08 : 1.0
  const kChuva = ctx.weather === 'chuva' ? 1.05 : 1.0
  const kNivel = 1 + 0.15 * (ctx.level - 1) // arenas maiores encarecem operação

  const police   = (8000 + 3.2 * A) * kDerby * kImp
  const staff    = (0.9  * A) * kNivel
  const energy   = (6000 + 0.9 * A) * kNoite * kChuva
  const cleaning = 0.65 * A

  return Math.round((police + staff + energy + cleaning) * 1.0) // margem extra
}

export type PriceMap = Record<Sector, number>

export type SectorResult = {
  sector: Sector
  price: number
  seats: number
  sociosSeats: number
  paidSeats: number
  occupancy: number // 0..1
  revenuePaid: number
  revenueSocios: number
  variableCost: number
}

export type SimulationResult = {
  perSector: SectorResult[]
  totalAudience: number
  totalCapacity: number
  totalRevenue: number
  totalCost: number
  variableCost: number          // soma dos custos variáveis por setor (pessoa)
  fixedCost: number
  operationalCost: number       // custo operacional que cresce com o público
  profit: number
  avgTicket: number
  occupancy: number
}

function sociosDistribution(): Record<Sector, number> {
  return { popular: 0.25, norte: 0.2, sul: 0.2, leste: 0.2, oeste: 0.12, camarote: 0.03 }
}

export function simulate(
  capacity: number,
  prices: PriceMap,
  ctx: EstadioContext
): SimulationResult {
  const ref = referencePrices(ctx.level)
  const base = baseInterest(ctx)

  // capacidade por setor
  const seats: Record<Sector, number> = Object.fromEntries(
    (Object.keys(sectorProportion) as Sector[]).map((s) => [s, Math.floor(capacity * sectorProportion[s])])
  ) as Record<Sector, number>

  // sócios (reserva)
  const totalSocios = Math.floor(capacity * clamp(ctx.sociosPct, 0, 50) / 100)
  const sociosDist = sociosDistribution()
  const sociosSeats: Record<Sector, number> = Object.fromEntries(
    (Object.keys(seats) as Sector[]).map((s) => [s, Math.min(Math.floor(totalSocios * sociosDist[s]), seats[s])])
  ) as Record<Sector, number>

  // demanda potencial por setor
  const infraBoost = 1 + 0.5 * (clamp(ctx.infraScore, 0, 100) / 100 - 0.5) // 0.75..1.25
  const fanBase = capacity * (0.9 + 0.6 * clamp(ctx.opponentStrength, 0, 100) / 100) // ~0.9..1.5x
  const demandPotential: Record<Sector, number> = { popular: 0, norte: 0, sul: 0, leste: 0, oeste: 0, camarote: 0 }

  ;(Object.keys(seats) as Sector[]).forEach((sector) => {
    const p = clamp(prices[sector] ?? ref[sector], 1, priceLimits(ctx.level)[sector])
    const pRatio = p / ref[sector]
    let sum = 0
    for (const seg of segments) {
      const A = base * seg.share * fanBase * seg.attraction[sector]
      const priceEffect = Math.exp(-seg.priceK * (pRatio - 0.9))
      const comfortEffect = 1 + seg.comfortK * (infraBoost - 1)
      sum += A * priceEffect * comfortEffect
    }
    demandPotential[sector] = sum
  })

  // Alocação real
  const perSector: SectorResult[] = []
  let totalPaidTickets = 0
  let totalRevenuePaid = 0
  let totalRevenueSocios = 0
  let totalVarCost = 0
  let totalSeats = 0
  let totalAudience = 0

  ;(Object.keys(seats) as Sector[]).forEach((sector) => {
    const cap = seats[sector]
    const socios = sociosSeats[sector]
    const avail = Math.max(0, cap - socios)
    const wanted = demandPotential[sector]
    const paidSeats = Math.min(avail, Math.floor(wanted))

    const price = clamp(prices[sector] ?? ref[sector], 1, priceLimits(ctx.level)[sector])
    const revenuePaid = paidSeats * price
    const revenueSoc = socios * clamp(ctx.sociosPreco, 0, price)
    const vCost = (paidSeats + socios) * variableCostPerSector[sector]

    totalSeats += cap
    totalPaidTickets += paidSeats
    totalAudience += paidSeats + socios
    totalRevenuePaid += revenuePaid
    totalRevenueSocios += revenueSoc
    totalVarCost += vCost

    perSector.push({
      sector, price, seats: cap, sociosSeats: socios, paidSeats,
      occupancy: (paidSeats + socios) / cap,
      revenuePaid, revenueSocios: revenueSoc, variableCost: vCost,
    })
  })

  const F = fixedCost(ctx)
  const O = operationalCost(totalAudience, ctx)
  const totalRevenue = totalRevenuePaid + totalRevenueSocios
  const totalCost = totalVarCost + F + O
  const profit = totalRevenue - totalCost
  const occupancy = totalSeats > 0 ? totalAudience / totalSeats : 0
  const avgTicket = totalPaidTickets > 0 ? totalRevenuePaid / totalPaidTickets : 0

  return {
    perSector,
    totalAudience,
    totalCapacity: totalSeats,
    totalRevenue,
    totalCost,
    variableCost: totalVarCost,
    fixedCost: F,
    operationalCost: O,
    profit,
    avgTicket,
    occupancy,
  }
}

export type OptimizeMode = 'maxProfit' | 'targetOccupancy'
export function optimizePrices(
  capacity: number,
  current: PriceMap,
  ctx: EstadioContext,
  mode: OptimizeMode,
  targetOcc: number = 0.92
): PriceMap {
  const ref = referencePrices(ctx.level)
  const lim = priceLimits(ctx.level)
  const multipliers = [0.6, 0.75, 0.85, 0.95, 1.0, 1.05, 1.15, 1.3, 1.5, 1.7, 1.8]

  const sectors = Object.keys(sectorProportion) as Sector[]
  let basePrices = { ...current }

  for (let pass = 0; pass < 2; pass++) {
    for (const s of sectors) {
      let localBest = basePrices[s]
      let localScore = -Infinity
      for (const m of multipliers) {
        const trial = { ...basePrices, [s]: clamp(Math.round(ref[s] * m), 1, lim[s]) }
        const sim = simulate(capacity, trial, ctx)
        const score = mode === 'maxProfit'
          ? sim.profit
          : -Math.abs(sim.occupancy - targetOcc) * 1e6 + sim.profit * 0.001
        if (score > localScore) {
          localScore = score
          localBest = trial[s]
        }
      }
      basePrices[s] = localBest
    }
  }
  return basePrices
}
