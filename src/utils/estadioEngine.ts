'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Sector,
  NIVEL_MAXIMO,
  sectorProportion,
  referencePrices,
  priceLimits,
  brl,
  simulate,
  optimizePrices,
  type EstadioContext,
  type PriceMap,
} from '@/utils/estadioEngine' // se não tiver alias, use '../../utils/estadioEngine'

// ===== Constantes
const UPGRADE_COST = 150_000_000 // custo fixo de evolução: 150 mi
const GROWTH_PER_LEVEL = 1.12     // crescimento de capacidade por nível

// ===== Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ===== Tipos locais
type EstadioRow = {
  id_time: string
  nome: string
  nivel: number
  capacidade: number
  [k: `preco_${string}`]: number | any
  // opcionais
  socio_percentual?: number | null
  socio_preco?: number | null
  infra_score?: number | null
}

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<EstadioRow | null>(null)
  const [prices, setPrices] = useState<PriceMap>(() => ({ ...referencePrices(1) }))
  const [saldo, setSaldo] = useState(0)

  // contexto
  const [importance, setImportance] = useState<'normal' | 'decisao' | 'final'>('normal')
  const [derby, setDerby] = useState(false)
  const [weather, setWeather] = useState<'bom' | 'chuva'>('bom')
  const [dayType, setDayType] = useState<'semana' | 'fim'>('semana')
  const [dayTime, setDayTime] = useState<'dia' | 'noite'>('noite')
  const [opponentStrength, setOpponentStrength] = useState(70) // 0..100
  const [moraleTec, setMoraleTec] = useState(7.5) // 0..10
  const [moraleTor, setMoraleTor] = useState(60) // 0..100

  // extras
  const [sociosPct, setSociosPct] = useState(15) // % dos lugares
  const [sociosPreco, setSociosPreco] = useState(25)
  const [infraScore, setInfraScore] = useState(55)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') || '' : ''

  useEffect(() => {
    if (!idTime) return
    loadEstadio()
    loadSaldo()
    loadMorais()
  }, [idTime])

  async function loadEstadio() {
    const { data } = await supabase.from('estadios').select('*').eq('id_time', idTime).maybeSingle()

    if (!data) {
      const refLvl1 = referencePrices(1)
      const novo: EstadioRow = {
        id_time: idTime,
        nome: nomeTime ? `Estádio ${nomeTime}` : 'Estádio LigaFut',
        nivel: 1,
        capacidade: 18000,
        ...Object.fromEntries((Object.keys(sectorProportion) as Sector[]).map((s) => [`preco_${s}`, refLvl1[s]])),
        socio_percentual: 15,
        socio_preco: 25,
        infra_score: 55,
      }
      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrices({ ...refLvl1 })
      setSociosPct(15)
      setSociosPreco(25)
      setInfraScore(55)
      return
    }

    const lvl = clamp(Number(data.nivel || 1), 1, NIVEL_MAXIMO)
    const patch: Partial<EstadioRow> = {}
    const refLvl = referencePrices(lvl)
    const loaded: PriceMap = { ...refLvl }

    ;(Object.keys(sectorProportion) as Sector[]).forEach((s) => {
      const col = `preco_${s}` as const
      const v = Number((data as any)[col])
      if (!Number.isFinite(v) || v <= 0) {
        patch[col] = refLvl[s]
        loaded[s] = refLvl[s]
      } else {
        loaded[s] = v
      }
    })

    if (Object.keys(patch).length) {
      await supabase.from('estadios').update(patch).eq('id_time', idTime)
    }

    setEstadio(data as EstadioRow)
    setPrices(loaded)

    if (typeof data.socio_percentual === 'number') setSociosPct(data.socio_percentual || 0)
    if (typeof data.socio_preco === 'number') setSociosPreco(data.socio_preco || 0)
    if (typeof data.infra_score === 'number') setInfraScore(data.infra_score || 50)
  }

  async function loadSaldo() {
    const { data } = await supabase.from('times').select('saldo').eq('id', idTime).maybeSingle()
    if (data?.saldo != null) setSaldo(data.saldo)
  }

  async function loadMorais() {
    const { data: c } = await supabase.from('classificacao').select('pontos').eq('id_time', idTime).maybeSingle()
    if (c?.pontos != null) {
      const pts = Number(c.pontos) || 0
      const mt = clamp(4 + Math.min(6, pts / 10), 0, 10)
      setMoraleTec(mt)
      await supabase.from('times').update({ moral_tecnico: mt }).eq('id', idTime)
    }
    const { data: t } = await supabase.from('times').select('moral_torcida').eq('id', idTime).maybeSingle()
    if (t?.moral_torcida != null) setMoraleTor(t.moral_torcida || 50)
  }

  // ======= helpers
  const level = estadio?.nivel ?? 1
  const capacity = estadio?.capacidade ?? 10000
  const refPrices = referencePrices(level)
  const limits = priceLimits(level)

  const ctx: EstadioContext = useMemo(
    () => ({
      importance,
      derby,
      weather,
      dayType,
      dayTime,
      opponentStrength,
      moraleTec,
      moraleTor,
      sociosPct,
      sociosPreco,
      infraScore,
      level,
    }),
    [
      importance, derby, weather, dayType, dayTime, opponentStrength,
      moraleTec, moraleTor, sociosPct, sociosPreco, infraScore, level
    ]
  )

  const result = useMemo(() => simulate(capacity, prices, ctx), [capacity, prices, ctx])

  // Projeção por nível (1..10) – para a maquete
  const baseCapL1 = useMemo(() => {
    const est = Math.round(capacity / Math.pow(GROWTH_PER_LEVEL, level - 1))
    return Math.max(1000, est)
  }, [capacity, level])

  const projections = useMemo(() => {
    const arr: { lvl: number; cap: number; sim: ReturnType<typeof simulate> }[] = []
    for (let lvl = 1; lvl <= NIVEL_MAXIMO; lvl++) {
      const cap = Math.round(baseCapL1 * Math.pow(GROWTH_PER_LEVEL, lvl - 1))
      const pricesRef = referencePrices(lvl)
      const ctxLvl: EstadioContext = { ...ctx, level: lvl }
      const sim = simulate(cap, pricesRef, ctxLvl)
      arr.push({ lvl, cap, sim })
    }
    return arr
  }, [baseCapL1, ctx])

  // ======= ações
  function setPrice(s: Sector, v: number) {
    setPrices((p) => ({ ...p, [s]: clamp(Math.round(v || 0), 1, limits[s]) }))
  }

  async function saveAll() {
    if (!estadio) return
    const payload: any = {}
    ;(Object.keys(prices) as Sector[]).forEach((s) => (payload[`preco_${s}`] = prices[s]))
    payload.socio_percentual = sociosPct
    payload.socio_preco = sociosPreco
    payload.infra_score = infraScore

    const { error } = await supabase.from('estadios').update(payload).eq('id_time', idTime)
    if (error) {
      console.warn('[saveAll] erro (provável coluna que não existe):', error.message)
      alert('Preços salvos (campos extras ignorados, se não existirem).')
    } else {
      alert('💾 Configurações salvas com sucesso!')
      setEstadio({ ...(estadio as any), ...payload })
    }
  }

  function autoPriceRevenue() {
    const p = optimizePrices(capacity, prices, ctx, 'maxProfit')
    setPrices(p)
  }

  function autoPriceOccupancy(target = 0.92) {
    const p = optimizePrices(capacity, prices, ctx, 'targetOccupancy', target)
    setPrices(p)
  }

  async function upgradeLevel() {
    if (!estadio) return
    if (level >= NIVEL_MAXIMO) return alert('Nível máximo atingido.')

    const custo = UPGRADE_COST
    if (saldo < custo) return alert('💸 Saldo insuficiente para evoluir o estádio.')

    const novoNivel = level + 1
    const novaCapacidade = Math.round(capacity * GROWTH_PER_LEVEL)

    const { error: e1 } = await supabase
      .from('estadios')
      .update({ nivel: novoNivel, capacidade: novaCapacidade })
      .eq('id_time', idTime)

    const { error: e2 } = await supabase
      .from('times')
      .update({ saldo: saldo - custo })
      .eq('id', idTime)

    if (e1 || e2) {
      console.warn(e1?.message || e2?.message)
      return alert('Não foi possível melhorar agora.')
    }
    alert('🏗️ Estádio evoluído com sucesso!')
    setEstadio((e) => (e ? { ...e, nivel: novoNivel, capacidade: novaCapacidade } as any : e))
    setSaldo((s) => s - custo)
  }

  if (!estadio) {
    return <div className="p-6 text-white">🔄 Carregando Estádio 2.0...</div>
  }

  // ======= UI
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold">🏟️ {estadio.nome}</h1>
            <p className="text-zinc-400">
              Nível <b>{level}</b> de {NIVEL_MAXIMO} • Capacidade <b>{capacity.toLocaleString()}</b> • Saldo {brl(saldo)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPI label="Público" value={`${result.totalAudience.toLocaleString()} / ${result.totalCapacity.toLocaleString()}`} />
            <KPI label="Renda bruta" value={brl(result.totalRevenue)} />
            <KPI label="Renda líquida" value={brl(result.profit)} />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contexto & Controles */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-3">🎮 Contexto da Partida</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select label="Importância" value={importance} onChange={setImportance} options={[
                { value: 'normal', label: 'Normal' },
                { value: 'decisao', label: 'Decisão' },
                { value: 'final', label: 'Final' },
              ]} />
              <Toggle label="Clássico" on={derby} setOn={setDerby} />
              <Select label="Clima" value={weather} onChange={setWeather} options={[
                { value: 'bom', label: 'Tempo bom' },
                { value: 'chuva', label: 'Chuva' },
              ]} />

              <Select label="Dia" value={dayType} onChange={setDayType} options={[
                { value: 'semana', label: 'Semana' },
                { value: 'fim', label: 'Fim de semana' },
              ]} />
              <Select label="Horário" value={dayTime} onChange={setDayTime} options={[
                { value: 'dia', label: 'Dia' },
                { value: 'noite', label: 'Noite' },
              ]} />
              <Slider label={`Força do adversário: ${opponentStrength}`} min={0} max={100} step={1}
                value={opponentStrength} onChange={setOpponentStrength} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Slider label={`Moral técnico: ${moraleTec.toFixed(1)}/10`} min={0} max={10} step={0.1}
                value={moraleTec} onChange={setMoraleTec} />
              <Slider label={`Moral torcida: ${moraleTor}%`} min={0} max={100} step={1}
                value={moraleTor} onChange={setMoraleTor} />
              <Slider label={`Infra/Qualidade: ${infraScore}`} min={0} max={100} step={1}
                value={infraScore} onChange={setInfraScore} />
            </div>
          </section>

          {/* Sócios & metas */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-3">👥 Sócios & Metas</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Slider label={`% de assentos para sócios: ${sociosPct}%`} min={0} max={50} step={1}
                value={sociosPct} onChange={setSociosPct} />
              <NumberInput label="Preço do sócio" value={sociosPreco} setValue={setSociosPreco} min={0} />
              <div className="flex items-end gap-2">
                <button onClick={() => autoPriceOccupancy(0.92)} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold">
                  Autopreço (Bater 92%)
                </button>
                <button onClick={() => autoPriceRevenue()} className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-semibold">
                  Autopreço (Max Lucro)
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-zinc-300">
              <div>🎟️ Ocupação: <b>{Math.round(result.occupancy * 100)}%</b></div>
              <div>
                💰 Renda bruta: <b>{brl(result.totalRevenue)}</b>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Ingressos {brl(result.revenueTickets)} • Sócios {brl(result.revenueSocios)}
                </div>
              </div>
              <div>
                📉 Custos: <b>{brl(result.totalCost)}</b>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Fixos {brl(result.fixedCost)} • Var (pessoa) {brl(result.variableCostSpectator)} • Operacional {brl(result.operationalOverhead)}
                </div>
              </div>
            </div>
          </section>

          {/* Finanças detalhadas */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-3">💰 Finanças da Partida</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MoneyCard
                title="Renda bruta"
                value={brl(result.totalRevenue)}
                subtitle={`Ingressos ${brl(result.revenueTickets)} • Sócios ${brl(result.revenueSocios)}`}
              />
              <MoneyCard
                title="Custos totais"
                value={brl(result.totalCost)}
                subtitle={`Fixos ${brl(result.fixedCost)} • Var (pessoa) ${brl(result.variableCostSpectator)} • Operacional ${brl(result.operationalOverhead)}`}
              />
              <MoneyCard title="Renda líquida" value={brl(result.profit)} subtitle="Bruta − Custos" />
            </div>
          </section>

          {/* Preços por setor */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">💵 Preços por setor</h2>
              <div className="flex gap-2">
                <button onClick={() => setPrices(referencePrices(level))}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Ref. do nível</button>
                <button onClick={saveAll}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold">Salvar</button>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(sectorProportion) as Sector[]).map((s) => {
                const sector = s
                const lim = limits[sector]
                const seats = Math.floor(capacity * sectorProportion[sector])
                const row = result.perSector.find((r) => r.sector === sector)!
                const refPrice = refPrices[sector]

                return (
                  <div key={sector} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold capitalize">{labelSector(sector)}</div>
                      <div className="text-xs text-zinc-400">Ref: {brl(refPrice)} • Lim: {brl(lim)}</div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={lim}
                        value={prices[sector]}
                        onChange={(e) => setPrice(sector, Number(e.target.value))}
                        className="w-28 border border-zinc-800 rounded-lg bg-zinc-900 px-2 py-1.5 text-sm outline-none"
                      />
                      <span className="text-xs text-zinc-400">Lugares: {seats.toLocaleString()}</span>
                    </div>

                    <div className="mt-3 text-xs text-zinc-300 space-y-1">
                      <div>🎫 Pagantes: <b>{row.paidSeats.toLocaleString()}</b></div>
                      <div>🪪 Sócios: <b>{row.sociosSeats.toLocaleString()}</b></div>
                      <div>🏁 Ocupação: <b>{Math.round(row.occupancy * 100)}%</b></div>
                      <div>💵 Renda setor: <b>{brl(row.revenuePaid + row.revenueSocios)}</b></div>
                      <div className="text-zinc-400">💼 Custo setor (pessoa): <b className="text-zinc-300">{brl(row.variableCost)}</b></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Maquete / Projeção visual */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-3">🧱 Maquete do Estádio (Níveis 1 → {NIVEL_MAXIMO})</h2>
            <p className="text-xs text-zinc-400 mb-3">
              Cada miniatura usa preços de referência e o contexto atual para simular público, custos e renda. Visual evolui de “CT” até “Mega Arena”.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {projections.map(({ lvl, cap, sim }) => (
                <MiniCard key={lvl} active={lvl === level}>
                  <StadiumMiniature
                    level={lvl}
                    night={dayTime === 'noite'}
                    roofProgress={roofProgressForLevel(lvl)}
                    tierCount={tiersForLevel(lvl)}
                    lightsCount={lightsForLevel(lvl)}
                    screens={screensForLevel(lvl)}
                  />
                  <div className="mt-2 text-xs text-zinc-300 flex items-center justify-between">
                    <span className="font-semibold">Nível {lvl}</span>
                    <span>{cap.toLocaleString()} lugares</span>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Público: <b className="text-zinc-200">{sim.totalAudience.toLocaleString()}</b> •
                    Ocup.: <b className="text-zinc-200">{Math.round(sim.occupancy * 100)}%</b>
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400">
                    Bruta: <b className="text-zinc-200">{brl(sim.totalRevenue)}</b>
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    Custos: <b className="text-zinc-200">{brl(sim.totalCost)}</b>
                  </div>
                  <div className="mt-0.5 text-[11px]">
                    <span className={`font-semibold ${sim.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      Líquida: {brl(sim.profit)}
                    </span>
                  </div>
                </MiniCard>
              ))}
            </div>
          </section>
        </div>

        {/* coluna lateral */}
        <aside className="space-y-6">
          <section className="sticky top-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">📊 Resumo</h3>
            <div className="mt-3 space-y-2 text-sm">
              <KV k="Público total" v={`${result.totalAudience.toLocaleString()} / ${result.totalCapacity.toLocaleString()} (${Math.round(result.occupancy * 100)}%)`} />
              <KV k="Renda bruta" v={brl(result.totalRevenue)} />
              <KV k="Custos (fixos/var)" v={`${brl(result.fixedCost)} / ${brl(result.variableCost)}`} />
              <div className="text-[11px] text-zinc-400">
                Var detalhado: pessoa {brl(result.variableCostSpectator)} • operacional {brl(result.operationalOverhead)}
              </div>
              <KV k="Renda líquida" v={brl(result.profit)} />
            </div>
          </section>

          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">🏗️ Evoluir Estádio</h3>
            {level < NIVEL_MAXIMO ? (
              <>
                <p className="text-sm text-zinc-300 mt-1">
                  Próximo nível: <b>{level + 1}</b> • Capacidade estimada:{' '}
                  <b>{Math.round(capacity * GROWTH_PER_LEVEL).toLocaleString()}</b>
                </p>
                <p className="text-sm text-zinc-300">Custo: <b>{brl(UPGRADE_COST)}</b></p>
                <p className="text-xs text-zinc-500 mt-1">Saldo: {brl(saldo)}</p>
                <button onClick={upgradeLevel}
                  className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold">Melhorar Estádio</button>
              </>
            ) : (
              <div className="text-green-400 font-semibold">🏆 Nível máximo alcançado</div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

/* ====== Maquete SVG ====== */
function StadiumMiniature({
  level,
  night,
  roofProgress, // 0..1
  tierCount,    // 1..3
  lightsCount,  // 0..6
  screens,      // 0..2
}: {
  level: number
  night: boolean
  roofProgress: number
  tierCount: number
  lightsCount: number
  screens: number
}) {
  // dimensões básicas
  const W = 220
  const H = 130

  // altura de arquibancada por nível
  const standH = 18 + level * 5
  const pad = 10

  // cores base
  const grass = '#1f8b3f'
  const dirt = '#4b5563'
  const stand = '#9ca3af'
  const standDark = '#6b7280'
  const roof = '#d4d4d8'
  const roofDark = '#a1a1aa'
  const pole = '#94a3b8'
  const lightOn = night ? '#ffe16b' : '#cbd5e1'
  const screen = '#111827'
  const screenGlow = '#22d3ee'

  // helpers geom
  function tier(y: number, scaleX = 1) {
    const baseW = (W - pad * 2) * scaleX
    const x1 = (W - baseW) / 2
    const y1 = y
    const x2 = W - x1
    const y2 = y + standH
    return `M ${x1} ${y2} L ${x1 + 8} ${y1} L ${x2 - 8} ${y1} L ${x2} ${y2} Z`
  }

  const tiers = []
  const tiersGap = 6
  for (let i = 0; i < tierCount; i++) {
    tiers.push(tier(20 + i * (standH + tiersGap), 1 - i * 0.1))
  }

  // cobertura (progresso cobre do 0 ao total)
  const roofY = 18
  const roofX1 = 22
  const roofX2 = W - roofX1
  const roofW = roofX2 - roofX1
  const roofCoverW = roofW * roofProgress

  // postes de luz
  const lightPositions = [
    { x: 22, y: 12 },
    { x: W - 22, y: 12 },
    { x: 60, y: 8 },
    { x: W - 60, y: 8 },
    { x: 100, y: 6 },
    { x: W - 100, y: 6 },
  ].slice(0, lightsCount)

  // telões
  const screenPositions = [
    { x: W / 2 - 28, y: 6, w: 56, h: 10 },
    { x: W / 2 - 20, y: H - 20, w: 40, h: 8 },
  ].slice(0, screens)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Céu */}
      <rect x="0" y="0" width={W} height={H} fill={night ? '#0b1020' : '#0b1324'} opacity={night ? 0.9 : 0.6} />

      {/* Gramado */}
      <rect x={pad} y={H - 38} width={W - pad * 2} height={24} fill={grass} stroke="#0f172a" strokeWidth="1" />
      {/* Linha central */}
      <rect x={W / 2 - 1} y={H - 38} width="2" height="24" fill="#e5e7eb" opacity="0.6" />

      {/* Pista/entorno */}
      <rect x={pad - 4} y={H - 14} width={W - (pad - 4) * 2} height={8} fill={dirt} opacity="0.8" />

      {/* Arquibancadas (camadas) */}
      {tiers.map((d, i) => (
        <path key={i} d={d} fill={i % 2 === 0 ? stand : standDark} stroke="#0f172a" strokeWidth="1" opacity={0.95 - i * 0.05} />
      ))}

      {/* Cobertura */}
      <g>
        <rect x={roofX1} y={roofY} width={roofW} height="8" fill={roofDark} opacity="0.6" />
        <rect x={roofX1} y={roofY} width={roofCoverW} height="8" fill={roof} />
      </g>

      {/* Postes e luzes */}
      {lightPositions.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 1.2} y={p.y} width="2.4" height={H - p.y - 20} fill={pole} />
          <circle cx={p.x} cy={p.y} r="4" fill={lightOn} opacity={night ? 1 : 0.7} />
          {night && <circle cx={p.x} cy={p.y} r="8" fill={lightOn} opacity="0.25" />}
        </g>
      ))}

      {/* Telões */}
      {screenPositions.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={screen} stroke="#374151" strokeWidth="1" />
          <rect x={s.x + 3} y={s.y + 3} width={s.w - 6} height={s.h - 6} fill={screenGlow} opacity={night ? 0.5 : 0.25} />
        </g>
      ))}

      {/* Fachada / base */}
      <rect x={pad - 6} y={H - 10} width={W - (pad - 6) * 2} height="6" fill="#374151" />
    </svg>
  )
}

/* ====== Lógica de features por nível ====== */
function tiersForLevel(lvl: number) {
  if (lvl >= 9) return 3
  if (lvl >= 5) return 2
  return 1
}

function roofProgressForLevel(lvl: number) {
  if (lvl >= 9) return 1
  if (lvl >= 7) return 0.75
  if (lvl >= 5) return 0.5
  if (lvl >= 3) return 0.25
  return 0.05 // quase sem cobertura, “CTzão”
}

function lightsForLevel(lvl: number) {
  if (lvl >= 9) return 6
  if (lvl >= 6) return 4
  if (lvl >= 3) return 2
  return 0
}

function screensForLevel(lvl: number) {
  if (lvl >= 8) return 2
  if (lvl >= 5) return 1
  return 0
}

/* ====== UI helpers ====== */
function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

function MoneyCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-zinc-400">{title}</div>
      <div className="text-lg font-bold">{value}</div>
      {subtitle && <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>}
    </div>
  )
}

function MiniCard({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-3 transition-all ${
        active
          ? 'border-emerald-500/70 bg-emerald-500/5 shadow-sm'
          : 'border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60'
      }`}
    >
      {children}
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  )
}

function Toggle({ label, on, setOn }: { label: string; on: boolean; setOn: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOn(!on)}
        className={`px-3 py-2 rounded-lg text-sm border ${
          on ? 'bg-emerald-600/20 border-emerald-600 text-emerald-300'
             : 'bg-zinc-900 border-zinc-700 text-zinc-300'
        }`}
      >
        {label}
      </button>
    </div>
  )
}

function Select<T extends string>({
  label, value, onChange, options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <label className="text-sm">
      <span className="block mb-1 text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full border border-zinc-800 rounded-lg bg-zinc-900 px-2 py-2 text-sm outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function Slider({
  label, min, max, step, value, onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="text-sm">
      <span className="block mb-1 text-zinc-300">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  )
}

function NumberInput({
  label, value, setValue, min = 0,
}: {
  label: string
  value: number
  setValue: (n: number) => void
  min?: number
}) {
  return (
    <label className="text-sm">
      <span className="block mb-1 text-zinc-300">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => setValue(Math.max(min, Math.round(Number(e.target.value) || 0)))}
        className="w-full border border-zinc-800 rounded-lg bg-zinc-900 px-2 py-2 text-sm outline-none"
      />
    </label>
  )
}

function labelSector(s: Sector) {
  const map: Record<Sector, string> = {
    popular: 'Popular',
    norte: 'Arquibancada Norte',
    sul: 'Arquibancada Sul',
    leste: 'Leste',
    oeste: 'Oeste',
    camarote: 'Camarotes / VIP',
  }
  return map[s]
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}
