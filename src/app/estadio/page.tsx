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
} from '@/utils/estadioEngine'

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
  // opcionais (se tiver na tabela; se não, seguimos sem persistir)
  socio_percentual?: number | null
  socio_preco?: number | null
  infra_score?: number | null
}

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<EstadioRow | null>(null)
  const [prices, setPrices] = useState<PriceMap>(() => {
    const ref = referencePrices(1)
    return { ...ref }
  })
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
      // cria com padrão
      const ref = referencePrices(1)
      const novo: EstadioRow = {
        id_time: idTime,
        nome: nomeTime ? `Estádio ${nomeTime}` : 'Estádio LigaFut',
        nivel: 1,
        capacidade: 18000,
        ...Object.fromEntries((Object.keys(sectorProportion) as Sector[]).map((s) => [`preco_${s}`, ref[s]])),
        socio_percentual: 15,
        socio_preco: 25,
        infra_score: 55,
      }
      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrices({ ...ref })
      setSociosPct(15)
      setSociosPreco(25)
      setInfraScore(55)
      return
    }

    const lvl = Math.max(1, Math.min(NIVEL_MAXIMO, Number(data.nivel || 1)))
    const patch: Partial<EstadioRow> = {}
    const ref = referencePrices(lvl)
    const loaded: PriceMap = { ...ref }

    ;(Object.keys(sectorProportion) as Sector[]).forEach((s) => {
      const col = `preco_${s}` as const
      const v = Number((data as any)[col])
      if (!Number.isFinite(v) || v <= 0) {
        patch[col] = ref[s]
        loaded[s] = ref[s]
      } else {
        loaded[s] = v
      }
    })

    if (Object.keys(patch).length) {
      await supabase.from('estadios').update(patch).eq('id_time', idTime)
    }

    setEstadio(data as EstadioRow)
    setPrices(loaded)

    // extras (se existirem)
    if (typeof data.socio_percentual === 'number') setSociosPct(data.socio_percentual || 0)
    if (typeof data.socio_preco === 'number') setSociosPreco(data.socio_preco || 0)
    if (typeof data.infra_score === 'number') setInfraScore(data.infra_score || 50)
  }

  async function loadSaldo() {
    const { data } = await supabase.from('times').select('saldo').eq('id', idTime).maybeSingle()
    if (data?.saldo != null) setSaldo(data.saldo)
  }

  async function loadMorais() {
    // moral técnica baseada em pontos atuais (se quiser mantém sua lógica antiga)
    const { data: c } = await supabase.from('classificacao').select('pontos').eq('id_time', idTime).maybeSingle()
    if (c?.pontos != null) {
      const pts = Number(c.pontos) || 0
      const mt = clamp(4 + Math.min(6, pts / 10), 0, 10) // simples: ~4..10
      setMoraleTec(mt)
      // tenta persistir (se houver coluna)
      await supabase.from('times').update({ moral_tecnico: mt }).eq('id', idTime)
    }
    const { data: t } = await supabase.from('times').select('moral_torcida').eq('id', idTime).maybeSingle()
    if (t?.moral_torcida != null) setMoraleTor(t.moral_torcida || 50)
  }

  // ======= helpers
  const level = estadio?.nivel ?? 1
  const capacity = estadio?.capacidade ?? 10000
  const ref = referencePrices(level)
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

  // ======= ações
  function setPrice(s: Sector, v: number) {
    setPrices((p) => ({ ...p, [s]: clamp(Math.round(v || 0), 1, limits[s]) }))
  }

  async function saveAll() {
    if (!estadio) return
    const payload: any = {}
    ;(Object.keys(prices) as Sector[]).forEach((s) => (payload[`preco_${s}`] = prices[s]))
    // extras se existir no schema
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
    // custo de upgrade simples (você pode plugar seu cálculo antigo)
    const custo = Math.round(250000 + 150000 * level)
    if (saldo < custo) return alert('💸 Saldo insuficiente para evoluir o estádio.')

    const novoNivel = level + 1
    const novaCapacidade = Math.round(capacity * 1.12) // +12% por nível (ajuste à vontade)

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

          <div className="grid grid-cols-2 gap-4">
            <KPI label="Público" value={`${result.totalAudience.toLocaleString()} / ${result.totalCapacity.toLocaleString()}`} />
            <KPI label="Lucro estimado" value={brl(result.profit)} />
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
              <div>💸 Receita: <b>{brl(result.totalRevenue)}</b></div>
              <div>📉 Custos: <b>{brl(result.totalCost)} (Fixos {brl(result.fixedCost)} / Var {brl(result.variableCost)})</b></div>
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
                const refPrice = referencePrices(level)[sector]

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
                      <div>💰 Receita setor: <b>{brl(row.revenuePaid + row.revenueSocios)}</b></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* coluna lateral */}
        <aside className="space-y-6">
          <section className="sticky top-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">📊 Resumo</h3>
            <div className="mt-3 space-y-2 text-sm">
              <KV k="Público total" v={`${result.totalAudience.toLocaleString()} / ${result.totalCapacity.toLocaleString()} (${Math.round(result.occupancy * 100)}%)`} />
              <KV k="Receita total" v={brl(result.totalRevenue)} />
              <KV k="Custos (fixos/var)" v={`${brl(result.fixedCost)} / ${brl(result.variableCost)}`} />
              <KV k="Lucro" v={brl(result.profit)} />
            </div>
          </section>

          <section className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">🏗️ Evoluir Estádio</h3>
            {level < NIVEL_MAXIMO ? (
              <>
                <p className="text-sm text-zinc-300 mt-1">
                  Próximo nível: <b>{level + 1}</b> • Capacidade estimada:{' '}
                  <b>{Math.round(capacity * 1.12).toLocaleString()}</b>
                </p>
                <p className="text-sm text-zinc-300">Custo: <b>{brl(250000 + 150000 * level)}</b></p>
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
