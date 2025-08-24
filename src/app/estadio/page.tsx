'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
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
} from '@/utils/estadioEngine'

// componente 3D
const StadiumMini3D = dynamic(() => import('@/components/StadiumMini3D'), { ssr: false })

// ===== Constantes
const UPGRADE_COST = 150_000_000
const GROWTH_PER_LEVEL = 1.12

// ===== Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type EstadioRow = {
  id_time: string
  nome: string
  nivel: number
  capacidade: number
  [k: `preco_${string}`]: number | any
  socio_percentual?: number | null
  socio_preco?: number | null
  infra_score?: number | null

  // Campos OPCIONAIS (se existirem na tabela) para persistir contexto:
  ctx_importance?: 'normal' | 'decisao' | 'final' | null
  ctx_derby?: boolean | null
  ctx_weather?: 'bom' | 'chuva' | null
  ctx_day_type?: 'semana' | 'fim' | null
  ctx_day_time?: 'dia' | 'noite' | null
  ctx_opponent_strength?: number | null
  ctx_morale_tecnico?: number | null
  ctx_morale_torcida?: number | null
}

type PersistedCtx = {
  importance: 'normal' | 'decisao' | 'final'
  derby: boolean
  weather: 'bom' | 'chuva'
  dayType: 'semana' | 'fim'
  dayTime: 'dia' | 'noite'
  opponentStrength: number
  moraleTec: number
  moraleTor: number
  sociosPct: number
  sociosPreco: number
  infraScore: number
  balanceWeight: number
}
type PersistedPrices = PriceMap & { _stamp?: number }

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<EstadioRow | null>(null)
  const [prices, setPrices] = useState<PriceMap>(() => ({ ...referencePrices(1) }))
  const [saldo, setSaldo] = useState(0)

  // contexto (com defaults)
  const [importance, setImportance] = useState<'normal' | 'decisao' | 'final'>('normal')
  const [derby, setDerby] = useState(false)
  const [weather, setWeather] = useState<'bom' | 'chuva'>('bom')
  const [dayType, setDayType] = useState<'semana' | 'fim'>('semana')
  const [dayTime, setDayTime] = useState<'dia' | 'noite'>('noite')
  const [opponentStrength, setOpponentStrength] = useState(70)
  const [moraleTec, setMoraleTec] = useState(7.5)
  const [moraleTor, setMoraleTor] = useState(60)

  // extras
  const [sociosPct, setSociosPct] = useState(15)
  const [sociosPreco, setSociosPreco] = useState(25)
  const [infraScore, setInfraScore] = useState(55)

  // 3D
  const [previewLevel, setPreviewLevel] = useState(1)
  const [previewNight, setPreviewNight] = useState(false)

  // equilíbrio preço x público (0..1)
  const [balanceWeight, setBalanceWeight] = useState(0.35)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') || '' : ''

  // ======= LocalStorage helpers
  const LS_KEYS = {
    ctx: (id: string) => `lf_estadio_ctx_${id}`,
    prices: (id: string) => `lf_estadio_prices_${id}`,
  }
  function loadLSCtx(id: string): PersistedCtx | null {
    try {
      const raw = localStorage.getItem(LS_KEYS.ctx(id))
      return raw ? (JSON.parse(raw) as PersistedCtx) : null
    } catch { return null }
  }
  function saveLSCtx(id: string, ctx: PersistedCtx) {
    try { localStorage.setItem(LS_KEYS.ctx(id), JSON.stringify(ctx)) } catch {}
  }
  function loadLSPrices(id: string): PersistedPrices | null {
    try {
      const raw = localStorage.getItem(LS_KEYS.prices(id))
      return raw ? (JSON.parse(raw) as PersistedPrices) : null
    } catch { return null }
  }
  function saveLSPrices(id: string, p: PriceMap) {
    try { localStorage.setItem(LS_KEYS.prices(id), JSON.stringify({ ...p, _stamp: Date.now() })) } catch {}
  }

  // ======= lifecycle
  useEffect(() => {
    if (!idTime) return

    // 1) aplica os últimos valores locais imediatamente (UX melhor e resistente a ausência de colunas no DB)
    const lsc = loadLSCtx(idTime)
    if (lsc) {
      setImportance(lsc.importance)
      setDerby(lsc.derby)
      setWeather(lsc.weather)
      setDayType(lsc.dayType)
      setDayTime(lsc.dayTime)
      setOpponentStrength(lsc.opponentStrength)
      setMoraleTec(lsc.moraleTec)
      setMoraleTor(lsc.moraleTor)
      setSociosPct(lsc.sociosPct)
      setSociosPreco(lsc.sociosPreco)
      setInfraScore(lsc.infraScore)
      setBalanceWeight(lsc.balanceWeight ?? 0.35)
    }
    const lsp = loadLSPrices(idTime)
    if (lsp) setPrices({ ...lsp })

    // 2) carrega do Supabase (se existir, sobrepõe o que for válido)
    loadEstadio()
    loadSaldo()
    loadMorais()
  }, [idTime])

  useEffect(() => {
    if (estadio?.nivel) setPreviewLevel(estadio.nivel)
  }, [estadio?.nivel])

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
      saveLSPrices(idTime, refLvl1)
      saveLSCtx(idTime, {
        importance, derby, weather, dayType, dayTime,
        opponentStrength, moraleTec, moraleTor,
        sociosPct: 15, sociosPreco: 25, infraScore: 55, balanceWeight
      })
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

    // Preços DB -> estado (mas prefere LS se existir)
    const lsp = loadLSPrices(idTime)
    setPrices(lsp ? { ...lsp } : loaded)

    // Contexto DB/LS -> estado
    const lsc = loadLSCtx(idTime)
    setSociosPct(typeof data.socio_percentual === 'number' ? data.socio_percentual : (lsc?.sociosPct ?? 15))
    setSociosPreco(typeof data.socio_preco === 'number' ? data.socio_preco : (lsc?.sociosPreco ?? 25))
    setInfraScore(typeof data.infra_score === 'number' ? data.infra_score : (lsc?.infraScore ?? 55))

    setImportance((data.ctx_importance as any) || lsc?.importance || 'normal')
    setDerby(typeof data.ctx_derby === 'boolean' ? data.ctx_derby : (lsc?.derby ?? false))
    setWeather((data.ctx_weather as any) || lsc?.weather || 'bom')
    setDayType((data.ctx_day_type as any) || lsc?.dayType || 'semana')
    setDayTime((data.ctx_day_time as any) || lsc?.dayTime || 'noite')
    setOpponentStrength(typeof data.ctx_opponent_strength === 'number' ? data.ctx_opponent_strength : (lsc?.opponentStrength ?? 70))
    setMoraleTec(typeof data.ctx_morale_tecnico === 'number' ? data.ctx_morale_tecnico : (lsc?.moraleTec ?? 7.5))
    setMoraleTor(typeof data.ctx_morale_torcida === 'number' ? data.ctx_morale_torcida : (lsc?.moraleTor ?? 60))
    setBalanceWeight(lsc?.balanceWeight ?? 0.35)

    setEstadio(data as EstadioRow)
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

  // Projeções (para os cards de info)
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

    // salva LS para manter no refresh mesmo sem colunas no DB
    saveLSPrices(idTime, prices)
    saveLSCtx(idTime, {
      importance, derby, weather, dayType, dayTime, opponentStrength,
      moraleTec, moraleTor, sociosPct, sociosPreco, infraScore, balanceWeight
    })

    const { error } = await supabase.from('estadios').update(payload).eq('id_time', idTime)
    if (error) {
      console.warn('[saveAll] erro:', error.message)
      alert('Preços salvos localmente. (Campos extras ignorados no banco, se não existirem).')
    } else {
      alert('💾 Configurações salvas com sucesso!')
      setEstadio({ ...(estadio as any), ...payload })
    }
  }

  async function saveContextOnly() {
    // salva LS sempre
    saveLSCtx(idTime, {
      importance, derby, weather, dayType, dayTime, opponentStrength,
      moraleTec, moraleTor, sociosPct, sociosPreco, infraScore, balanceWeight
    })

    // tenta persistir no DB (se as colunas existirem)
    const payload: Partial<EstadioRow> = {
      ctx_importance: importance,
      ctx_derby: derby,
      ctx_weather: weather,
      ctx_day_type: dayType,
      ctx_day_time: dayTime,
      ctx_opponent_strength: opponentStrength,
      ctx_morale_tecnico: moraleTec,
      ctx_morale_torcida: moraleTor,
      socio_percentual: sociosPct,
      socio_preco: sociosPreco,
      infra_score: infraScore,
    }
    const { error } = await supabase.from('estadios').update(payload).eq('id_time', idTime)
    if (error) {
      console.warn('[saveContextOnly] erro (colunas podem não existir):', error.message)
      alert('Parâmetros salvos localmente. Para salvar no banco, crie as colunas ctx_* na tabela "estadios".')
    } else {
      alert('✅ Parâmetros salvos!')
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
  function autoPriceBalanced() {
    const p = optimizePrices(capacity, prices, ctx, 'balanced', balanceWeight)
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
    return <div className="p-6 text-white">🔄 Carregando Estádio 3D...</div>
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">🎮 Contexto da Partida</h2>
              <button
                onClick={saveContextOnly}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
              >
                Salvar parâmetros
              </button>
            </div>

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

          {/* Sócios & metas / Autopreços */}
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
                <button onClick={autoPriceRevenue} className="px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-semibold">
                  Autopreço (Max Lucro)
                </button>
              </div>
            </div>

            {/* equilíbrio preço x público */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-3">
              <Slider
                label={`Equilíbrio público × lucro: ${Math.round(balanceWeight * 100)}% público`}
                min={0} max={1} step={0.01}
                value={balanceWeight}
                onChange={setBalanceWeight}
              />
              <div className="flex items-end">
                <button onClick={autoPriceBalanced} className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold">
                  Autopreço (Equilíbrio)
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-zinc-300">
              <div>🎟️ Ocupação: <b>{Math.round(result.occupancy * 100)}%</b></div>
              <div>💰 Renda bruta: <b>{brl(result.totalRevenue)}</b></div>
              <div>📉 Custos: <b>{brl(result.totalCost)} (Fixos {brl(result.fixedCost)} / Var {brl(result.variableCost)})</b></div>
            </div>
          </section>

          {/* Finanças / Custos detalhados */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-3">💰 Finanças da Partida</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <MoneyCard title="Renda bruta" value={brl(result.totalRevenue)} subtitle={`Ingressos ${brl(result.revenueTickets)} • Sócios ${brl(result.revenueSocios)}`} />
              <MoneyCard title="Custos totais" value={brl(result.totalCost)} subtitle={`Fixos ${brl(result.fixedCost)} • Variáveis ${brl(result.variableCost)}`} />
              <MoneyCard title="Renda líquida" value={brl(result.profit)} subtitle="Bruta − Custos" />
            </div>

            {/* custos detalhados */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="font-semibold mb-2">🧱 Custos fixos (descrição)</div>
                <ul className="space-y-1 text-zinc-300">
                  <li>• Base operacional: <b>{brl(result.costs.fixed.base)}</b></li>
                  <li>• Acréscimo por nível: <b>{brl(result.costs.fixed.level)}</b></li>
                  <li>• Qualidade/infraestrutura: <b>{brl(result.costs.fixed.infra)}</b></li>
                  <li className="text-zinc-400 mt-1">Total fixos: <b className="text-zinc-200">{brl(result.costs.fixed.total)}</b></li>
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="font-semibold mb-2">👥 Custos variáveis (por setor)</div>
                <ul className="space-y-1 text-zinc-300">
                  {(Object.keys(sectorProportion) as Sector[]).map((s) => (
                    <li key={s}>• {labelSector(s)}: <b>{brl(result.costs.variable.bySector[s])}</b></li>
                  ))}
                </ul>
                <div className="text-xs text-zinc-400 mt-2">
                  Média por espectador: <b className="text-zinc-300">{brl(result.costs.variable.perSpectatorAvg)}</b>
                </div>
                <div className="text-xs text-zinc-400">Total variáveis: <b className="text-zinc-300">{brl(result.costs.variable.total)}</b></div>
              </div>
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
                      <div className="text-zinc-400">💼 Custo var. setor: <b className="text-zinc-300">{brl(row.variableCost)}</b></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Maquete 3D / mini */}
          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">🏗️ Maquete 3D do Estádio</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewNight((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    previewNight ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {previewNight ? '🌙 Noite' : '☀️ Dia'}
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400 mt-1 mb-3">
              Miniatura 3D (sem orbit). Evolução visual do “CT” → “Mega Arena” conforme o nível.
            </p>

            <StadiumMini3D
              variant="mini"
              level={previewLevel}
              night={previewNight}
              roofProgress={roofProgressForLevel(previewLevel)}
              tierCount={tiersForLevel(previewLevel)}
              lightsCount={lightsForLevel(previewLevel)}
              screens={screensForLevel(previewLevel)}
            />

            {/* seletor de nível */}
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPreviewLevel(n)}
                    className={`px-2.5 py-1.5 rounded-md text-sm border ${
                      previewLevel === n
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    Nível {n}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={previewLevel}
                  onChange={(e) => setPreviewLevel(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* dados rápidos do nível escolhido */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              {(() => {
                const item = projections.find(p => p.lvl === previewLevel)
                if (!item) return null
                const { cap, sim } = item
                return (
                  <>
                    <Info label="Capacidade" value={cap.toLocaleString()} />
                    <Info label="Público proj." value={sim.totalAudience.toLocaleString()} />
                    <Info label="Renda bruta" value={brl(sim.totalRevenue)} />
                    <Info label="Líquida" value={brl(sim.profit)} />
                  </>
                )
              })()}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
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

/* ====== Features visuais por nível ====== */
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
  return 0.05
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
