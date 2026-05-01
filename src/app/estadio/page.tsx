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

const Estadio3D = dynamic(() => import('@/components/Estadio3D'), { ssr: false })
const StadiumMini3D = dynamic(() => import('@/components/StadiumMini3D'), { ssr: false })

const BASE_UPGRADE_COST = 150_000_000
const GROWTH_PER_LEVEL = 1.12
const UPGRADE_MULTIPLIER = 1.45

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
  ctx_importancia?: 'normal' | 'decisao' | 'final' | null
  ctx_derby?: boolean | null
  ctx_clima?: 'bom' | 'chuva' | null
  ctx_dia?: 'semana' | 'fim' | null
  ctx_horario?: 'dia' | 'noite' | null
  ctx_forca_adv?: number | null
  ctx_moral_tecnico?: number | null
  ctx_moral_torcida?: number | null
  snapshot_proximo_jogo?: any
  naming_rights_nome?: string | null
  naming_rights_valor?: number | null
  naming_rights_ativo?: boolean | null
}

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<EstadioRow | null>(null)
  const [prices, setPrices] = useState<PriceMap>(() => ({ ...referencePrices(1) }))
  const [saldo, setSaldo] = useState(0)
  const [emprestimoAtivo, setEmprestimoAtivo] = useState(false)

  const [importance, setImportance] = useState<'normal' | 'decisao' | 'final'>('normal')
  const [derby, setDerby] = useState(false)
  const [weather, setWeather] = useState<'bom' | 'chuva'>('bom')
  const [dayType, setDayType] = useState<'semana' | 'fim'>('semana')
  const [dayTime, setDayTime] = useState<'dia' | 'noite'>('noite')
  const [opponentStrength, setOpponentStrength] = useState(70)
  const [moraleTec, setMoraleTec] = useState(7.5)
  const [moraleTor, setMoraleTor] = useState(60)

  const [sociosPct, setSociosPct] = useState(15)
  const [sociosPreco, setSociosPreco] = useState(25)
  const [infraScore, setInfraScore] = useState(55)

  const [previewLevel, setPreviewLevel] = useState(1)
  const [previewNight, setPreviewNight] = useState(false)
  const [balanceWeight, setBalanceWeight] = useState(0.35)

  const [saving, setSaving] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''
  const nomeTime = typeof window !== 'undefined' ? localStorage.getItem('nome_time') || '' : ''

  useEffect(() => {
    if (!idTime) return
    loadAll()
  }, [idTime])

  async function loadAll() {
    await Promise.all([loadEstadio(), loadSaldo(), loadMorais(), verificarEmprestimoAtivo()])
  }

  useEffect(() => {
    if (estadio?.nivel) setPreviewLevel(estadio.nivel)
  }, [estadio?.nivel])

  async function verificarEmprestimoAtivo() {
    const { data } = await supabase
      .from('emprestimos')
      .select('id')
      .eq('id_time', idTime)
      .eq('status', 'ativo')
      .limit(1)

    setEmprestimoAtivo(!!data?.length)
  }

  async function loadEstadio() {
    const { data } = await supabase
      .from('estadios')
      .select('*')
      .eq('id_time', idTime)
      .maybeSingle()

    if (!data) {
      const refLvl1 = referencePrices(1)

      const novo: EstadioRow = {
        id_time: idTime,
        nome: nomeTime ? `Estádio ${nomeTime}` : 'Estádio LigaFut',
        nivel: 1,
        capacidade: 18000,
        ...Object.fromEntries(
          (Object.keys(sectorProportion) as Sector[]).map((s) => [`preco_${s}`, refLvl1[s]])
        ),
        socio_percentual: 15,
        socio_preco: 25,
        infra_score: 55,
      }

      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrices({ ...refLvl1 })
      return
    }

    const lvl = clamp(Number(data.nivel || 1), 1, NIVEL_MAXIMO)
    const refLvl = referencePrices(lvl)
    const loaded: PriceMap = { ...refLvl }
    const patch: any = {}

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

    const d = data as EstadioRow

    setEstadio(d)
    setPrices(loaded)

    if (d.ctx_importancia) setImportance(d.ctx_importancia)
    if (typeof d.ctx_derby === 'boolean') setDerby(d.ctx_derby)
    if (d.ctx_clima) setWeather(d.ctx_clima)
    if (d.ctx_dia) setDayType(d.ctx_dia)
    if (d.ctx_horario) setDayTime(d.ctx_horario)
    if (typeof d.ctx_forca_adv === 'number') setOpponentStrength(d.ctx_forca_adv)
    if (typeof d.ctx_moral_tecnico === 'number') setMoraleTec(d.ctx_moral_tecnico)
    if (typeof d.ctx_moral_torcida === 'number') setMoraleTor(d.ctx_moral_torcida)
    if (typeof d.socio_percentual === 'number') setSociosPct(d.socio_percentual)
    if (typeof d.socio_preco === 'number') setSociosPreco(d.socio_preco)
    if (typeof d.infra_score === 'number') setInfraScore(d.infra_score)
  }

  async function loadSaldo() {
    const { data } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .maybeSingle()

    if (data?.saldo != null) setSaldo(Number(data.saldo))
  }

  async function loadMorais() {
    const { data: c } = await supabase
      .from('classificacao')
      .select('pontos')
      .eq('id_time', idTime)
      .maybeSingle()

    if (c?.pontos != null) {
      const pts = Number(c.pontos) || 0
      const mt = clamp(4 + Math.min(6, pts / 10), 0, 10)
      setMoraleTec(mt)
      await supabase.from('times').update({ moral_tecnico: mt }).eq('id', idTime)
    }

    const { data: t } = await supabase
      .from('times')
      .select('moral_torcida')
      .eq('id', idTime)
      .maybeSingle()

    if (t?.moral_torcida != null) setMoraleTor(Number(t.moral_torcida) || 50)
  }

  const level = estadio?.nivel ?? 1
  const capacity = estadio?.capacidade ?? 10000
  const limits = priceLimits(level)
  const custoUpgrade = Math.round(BASE_UPGRADE_COST * Math.pow(UPGRADE_MULTIPLIER, level - 1))

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
    ]
  )

  const result = useMemo(() => simulate(capacity, prices, ctx), [capacity, prices, ctx])

  const alertas = useMemo(() => {
    const arr: { tipo: 'ok' | 'warn' | 'danger'; texto: string }[] = []

    if (result.occupancy < 0.5) {
      arr.push({ tipo: 'danger', texto: 'Ocupação muito baixa. Reduza preços ou melhore moral/infra.' })
    }

    if (result.occupancy > 0.95) {
      arr.push({ tipo: 'ok', texto: 'Estádio quase lotado. Dá para testar aumento de preço.' })
    }

    if (result.profit < 0) {
      arr.push({ tipo: 'danger', texto: 'Renda líquida negativa. O estádio está dando prejuízo.' })
    }

    if (infraScore < 40) {
      arr.push({ tipo: 'warn', texto: 'Infraestrutura baixa. Pode reduzir público e aumentar custos.' })
    }

    if (weather === 'chuva') {
      arr.push({ tipo: 'warn', texto: 'Chuva reduz demanda e aumenta custo operacional.' })
    }

    if (derby || importance !== 'normal') {
      arr.push({ tipo: 'ok', texto: 'Jogo grande: potencial alto de renda.' })
    }

    return arr
  }, [result.occupancy, result.profit, infraScore, weather, derby, importance])

  const baseCapL1 = useMemo(() => {
    const est = Math.round(capacity / Math.pow(GROWTH_PER_LEVEL, level - 1))
    return Math.max(1000, est)
  }, [capacity, level])

  const projections = useMemo(() => {
    const arr: { lvl: number; cap: number; sim: ReturnType<typeof simulate> }[] = []

    for (let lvl = 1; lvl <= NIVEL_MAXIMO; lvl++) {
      const cap = Math.round(baseCapL1 * Math.pow(GROWTH_PER_LEVEL, lvl - 1))
      const sim = simulate(cap, referencePrices(lvl), { ...ctx, level: lvl })
      arr.push({ lvl, cap, sim })
    }

    return arr
  }, [baseCapL1, ctx])

  function setPrice(s: Sector, v: number) {
    setPrices((p) => ({ ...p, [s]: clamp(Math.round(v || 0), 1, limits[s]) }))
  }

  async function saveEverything() {
    if (!estadio) return

    setSaving(true)
    setMsg(null)

    const payload: any = {
      ctx_importancia: importance,
      ctx_derby: derby,
      ctx_clima: weather,
      ctx_dia: dayType,
      ctx_horario: dayTime,
      ctx_forca_adv: opponentStrength,
      ctx_moral_tecnico: moraleTec,
      ctx_moral_torcida: moraleTor,
      socio_percentual: sociosPct,
      socio_preco: sociosPreco,
      infra_score: infraScore,
    }

    ;(Object.keys(prices) as Sector[]).forEach((s) => {
      payload[`preco_${s}`] = prices[s]
    })

    const { error } = await supabase.from('estadios').update(payload).eq('id_time', idTime)

    setSaving(false)

    if (error) {
      setMsg(`Erro ao salvar: ${error.message}`)
      return
    }

    setEstadio((e) => (e ? ({ ...e, ...payload } as any) : e))
    setMsg('Parâmetros, preços e contexto salvos com sucesso.')
  }

  async function salvarSnapshotProximoJogo() {
    if (!estadio) return

    const snapshot = {
      criado_em: new Date().toISOString(),
      capacidade: capacity,
      nivel: level,
      prices,
      contexto: ctx,
      simulacao: {
        publico: result.totalAudience,
        renda_bruta: result.totalRevenue,
        renda_liquida: result.profit,
        custo_fixo: result.fixedCost,
        custo_variavel: result.variableCost,
        custo_total: result.totalCost,
        ocupacao: result.occupancy,
        renda_ingressos: result.revenueTickets,
        renda_socios: result.revenueSocios,
      },
    }

    const { error } = await supabase
      .from('estadios')
      .update({ snapshot_proximo_jogo: snapshot })
      .eq('id_time', idTime)

    if (error) {
      setMsg(`Erro ao salvar snapshot: ${error.message}`)
      return
    }

    await supabase.from('estadio_snapshots').insert({
      id_time: idTime,
      nome_time: nomeTime,
      nivel: level,
      capacidade: capacity,
      publico_estimado: result.totalAudience,
      renda_bruta: result.totalRevenue,
      renda_liquida: result.profit,
      ocupacao: result.occupancy,
      dados: snapshot,
      criado_em: new Date().toISOString(),
    })

    setMsg('Snapshot salvo para o próximo jogo.')
  }

  function autoPriceRevenue() {
    setPrices(optimizePrices(capacity, prices, ctx, 'maxProfit'))
  }

  function autoPriceOccupancy(target = 0.92) {
    setPrices(optimizePrices(capacity, prices, ctx, 'targetOccupancy', target))
  }

  function autoPriceBalanced() {
    setPrices(optimizePrices(capacity, prices, ctx, 'balanced', balanceWeight))
  }

  async function upgradeLevel() {
    if (!estadio) return

    if (level >= NIVEL_MAXIMO) {
      setMsg('Nível máximo atingido.')
      return
    }

    if (emprestimoAtivo) {
      setMsg('Você possui empréstimo ativo. Quite antes de evoluir o estádio.')
      return
    }

    if (saldo < custoUpgrade) {
      setMsg('Saldo insuficiente para evoluir o estádio.')
      return
    }

    setUpgrading(true)
    setMsg(null)

    const novoNivel = level + 1
    const novaCapacidade = Math.round(capacity * GROWTH_PER_LEVEL)
    const novoSaldo = saldo - custoUpgrade

    const { error: e1 } = await supabase
      .from('estadios')
      .update({ nivel: novoNivel, capacidade: novaCapacidade })
      .eq('id_time', idTime)

    const { error: e2 } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', idTime)

    if (e1 || e2) {
      setUpgrading(false)
      setMsg(e1?.message || e2?.message || 'Erro ao evoluir estádio.')
      return
    }

    await supabase.from('estadios_historico').insert({
      id_time: idTime,
      nome_time: nomeTime,
      nivel_antigo: level,
      nivel_novo: novoNivel,
      capacidade_antiga: capacity,
      capacidade_nova: novaCapacidade,
      custo: custoUpgrade,
      saldo_apos: novoSaldo,
      criado_em: new Date().toISOString(),
    })

    await supabase.from('movimentacoes').insert({
      id_time: idTime,
      tipo: 'saida',
      valor: custoUpgrade,
      descricao: `Evolução do estádio: nível ${level} para ${novoNivel}`,
      data: new Date().toISOString(),
    })

    setEstadio((e) => (e ? ({ ...e, nivel: novoNivel, capacidade: novaCapacidade } as any) : e))
    setSaldo(novoSaldo)
    setUpgrading(false)
    setMsg('Estádio evoluído com sucesso. Histórico registrado.')
  }

  if (!estadio) {
    return (
      <div className="min-h-screen bg-[#05070b] text-white flex items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 font-black">
          Carregando Estádio LigaFut...
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.20),transparent_30%),linear-gradient(180deg,#05070b,#090d14)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                Central do Estádio
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                {estadio.nome}
              </h1>

              <p className="mt-3 text-sm text-slate-300 md:text-base">
                Nível <b>{level}</b> de {NIVEL_MAXIMO} • Capacidade{' '}
                <b>{capacity.toLocaleString('pt-BR')}</b> • Saldo <b>{brl(saldo)}</b>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:min-w-[620px]">
              <KPI label="Público" value={`${result.totalAudience.toLocaleString('pt-BR')}`} />
              <KPI label="Ocupação" value={`${Math.round(result.occupancy * 100)}%`} />
              <KPI label="Renda bruta" value={brl(result.totalRevenue)} />
              <KPI label="Lucro líquido" value={brl(result.profit)} green={result.profit >= 0} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={saveEverything} disabled={saving} className="btn-primary">
              {saving ? 'Salvando...' : 'Salvar parâmetros + preços'}
            </button>

            <button onClick={salvarSnapshotProximoJogo} className="btn-secondary">
              Salvar snapshot do próximo jogo
            </button>
          </div>
        </header>

        {msg && (
          <div className="mb-5 rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-sm font-bold text-slate-100">
            {msg}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card title="Estádio 3D LigaFut" tag="Visual nível FIFA">
              <Estadio3D
                capacidade={capacity}
                publico={result.totalAudience}
                nomeEstadio={estadio.nome}
                corPrimaria="#22c55e"
                corSecundaria="#facc15"
              />
            </Card>

            <Card title="Contexto da Partida" tag="Sistema de demanda">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

                <Slider label={`Força adversário: ${opponentStrength}`} min={0} max={100} step={1} value={opponentStrength} onChange={setOpponentStrength} />
                <Slider label={`Moral técnico: ${moraleTec.toFixed(1)}/10`} min={0} max={10} step={0.1} value={moraleTec} onChange={setMoraleTec} />
                <Slider label={`Moral torcida: ${moraleTor}%`} min={0} max={100} step={1} value={moraleTor} onChange={setMoraleTor} />
                <Slider label={`Infraestrutura: ${infraScore}`} min={0} max={100} step={1} value={infraScore} onChange={setInfraScore} />
              </div>
            </Card>

            <Card title="Autopreço Inteligente" tag="Preço x público x lucro">
              <div className="grid gap-4 md:grid-cols-3">
                <Slider
                  label={`Equilíbrio: ${Math.round(balanceWeight * 100)}% público`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={balanceWeight}
                  onChange={setBalanceWeight}
                />

                <Slider
                  label={`Assentos sócios: ${sociosPct}%`}
                  min={0}
                  max={50}
                  step={1}
                  value={sociosPct}
                  onChange={setSociosPct}
                />

                <NumberInput label="Preço sócio" value={sociosPreco} setValue={setSociosPreco} />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => autoPriceOccupancy(0.92)} className="btn-secondary">Bater 92%</button>
                <button onClick={autoPriceRevenue} className="btn-secondary">Max lucro</button>
                <button onClick={autoPriceBalanced} className="btn-primary">Equilibrado</button>
                <button onClick={() => setPrices(referencePrices(level))} className="btn-muted">Preço referência</button>
              </div>
            </Card>

            <Card title="Preços por Setor" tag="Controle fino da renda">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(Object.keys(sectorProportion) as Sector[]).map((s) => {
                  const row = result.perSector.find((r) => r.sector === s)!
                  const seats = Math.floor(capacity * sectorProportion[s])

                  return (
                    <div key={s} className="rounded-3xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black">{labelSector(s)}</h3>
                          <p className="text-xs text-slate-400">
                            Lugares: {seats.toLocaleString('pt-BR')} • Limite: {brl(limits[s])}
                          </p>
                        </div>

                        <input
                          type="number"
                          min={1}
                          max={limits[s]}
                          value={prices[s]}
                          onChange={(e) => setPrice(s, Number(e.target.value))}
                          className="w-24 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <Info label="Pagantes" value={row.paidSeats.toLocaleString('pt-BR')} />
                        <Info label="Sócios" value={row.sociosSeats.toLocaleString('pt-BR')} />
                        <Info label="Ocupação" value={`${Math.round(row.occupancy * 100)}%`} />
                        <Info label="Renda" value={brl(row.revenuePaid + row.revenueSocios)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card title="Finanças da Partida" tag="Receita detalhada">
              <div className="grid gap-4 md:grid-cols-3">
                <MoneyCard title="Ingressos" value={brl(result.revenueTickets)} />
                <MoneyCard title="Sócios" value={brl(result.revenueSocios)} />
                <MoneyCard title="Renda bruta" value={brl(result.totalRevenue)} />
                <MoneyCard title="Custo fixo" value={brl(result.fixedCost)} />
                <MoneyCard title="Custo variável" value={brl(result.variableCost)} />
                <MoneyCard title="Lucro líquido" value={brl(result.profit)} good={result.profit >= 0} />
              </div>
            </Card>

            <Card title="Mini Estádio" tag="Preview de evolução">
              <div className="mb-4 flex flex-wrap gap-2">
                <button onClick={() => setPreviewNight((v) => !v)} className="btn-secondary">
                  {previewNight ? 'Modo noite' : 'Modo dia'}
                </button>
              </div>

              <StadiumMini3D
                variant="mini"
                level={previewLevel}
                night={previewNight}
                roofProgress={roofProgressForLevel(previewLevel)}
                tierCount={tiersForLevel(previewLevel)}
                lightsCount={lightsForLevel(previewLevel)}
                screens={screensForLevel(previewLevel)}
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPreviewLevel(n)}
                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                      previewLevel === n
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                        : 'border-white/10 bg-black/30 text-slate-300'
                    }`}
                  >
                    Nível {n}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {(() => {
                  const item = projections.find((p) => p.lvl === previewLevel)
                  if (!item) return null
                  return (
                    <>
                      <Info label="Capacidade" value={item.cap.toLocaleString('pt-BR')} />
                      <Info label="Público proj." value={item.sim.totalAudience.toLocaleString('pt-BR')} />
                      <Info label="Renda" value={brl(item.sim.totalRevenue)} />
                      <Info label="Lucro" value={brl(item.sim.profit)} />
                    </>
                  )
                })()}
              </div>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card title="Resumo Executivo" tag="Decisão rápida">
              <div className="space-y-3">
                <KV k="Público" v={`${result.totalAudience.toLocaleString('pt-BR')} / ${result.totalCapacity.toLocaleString('pt-BR')}`} />
                <KV k="Ocupação" v={`${Math.round(result.occupancy * 100)}%`} />
                <KV k="Renda bruta" v={brl(result.totalRevenue)} />
                <KV k="Custos" v={brl(result.totalCost)} />
                <KV k="Lucro líquido" v={brl(result.profit)} />
              </div>
            </Card>

            <Card title="Alertas Inteligentes" tag="Recomendação">
              <div className="space-y-3">
                {alertas.length ? (
                  alertas.map((a, i) => (
                    <div
                      key={i}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                        a.tipo === 'danger'
                          ? 'border-red-400/30 bg-red-400/10 text-red-200'
                          : a.tipo === 'warn'
                          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                          : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      }`}
                    >
                      {a.texto}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-400">Tudo equilibrado no momento.</p>
                )}
              </div>
            </Card>

            <Card title="Evoluir Estádio" tag="Upgrade progressivo">
              {level < NIVEL_MAXIMO ? (
                <>
                  <div className="space-y-3 text-sm">
                    <KV k="Nível atual" v={`${level}`} />
                    <KV k="Próximo nível" v={`${level + 1}`} />
                    <KV k="Capacidade nova" v={Math.round(capacity * GROWTH_PER_LEVEL).toLocaleString('pt-BR')} />
                    <KV k="Custo" v={brl(custoUpgrade)} />
                    <KV k="Saldo" v={brl(saldo)} />
                  </div>

                  {emprestimoAtivo && (
                    <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200">
                      Upgrade bloqueado: existe empréstimo ativo.
                    </div>
                  )}

                  <button
                    onClick={upgradeLevel}
                    disabled={upgrading || emprestimoAtivo || saldo < custoUpgrade}
                    className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-600 px-5 py-4 text-sm font-black uppercase text-white shadow-xl shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {upgrading ? 'Evoluindo...' : 'Melhorar estádio'}
                  </button>
                </>
              ) : (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 font-black text-emerald-300">
                  Nível máximo alcançado.
                </div>
              )}
            </Card>
          </aside>
        </section>
      </div>

      <style jsx global>{`
        .btn-primary {
          border-radius: 16px;
          padding: 12px 18px;
          font-weight: 900;
          background: linear-gradient(90deg, #10b981, #2563eb);
          color: white;
          box-shadow: 0 16px 35px rgba(16, 185, 129, 0.18);
        }

        .btn-secondary {
          border-radius: 16px;
          padding: 12px 18px;
          font-weight: 900;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
        }

        .btn-muted {
          border-radius: 16px;
          padding: 12px 18px;
          font-weight: 900;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgb(203, 213, 225);
        }
      `}</style>
    </main>
  )
}

function Card({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl">
      {tag && <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">{tag}</p>}
      <h2 className="mb-5 mt-1 text-xl font-black md:text-2xl">{title}</h2>
      {children}
    </section>
  )
}

function KPI({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-black ${green ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function MoneyCard({ title, value, good }: { title: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{title}</p>
      <p className={`mt-2 text-lg font-black ${good ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-slate-500">{label}</p>
      <p className="text-sm font-black">{value}</p>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <span className="text-sm text-slate-400">{k}</span>
      <span className="text-sm font-black">{v}</span>
    </div>
  )
}

function Toggle({ label, on, setOn }: { label: string; on: boolean; setOn: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setOn(!on)}
      className={`rounded-2xl border px-4 py-3 text-left text-sm font-black ${
        on ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300' : 'border-white/10 bg-black/30 text-slate-300'
      }`}
    >
      {label}: {on ? 'Sim' : 'Não'}
    </button>
  )
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <label className="text-sm font-bold text-slate-300">
      <span className="mb-2 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="text-sm font-bold text-slate-300">
      <span className="mb-2 block">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-400"
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  setValue,
  min = 0,
}: {
  label: string
  value: number
  setValue: (n: number) => void
  min?: number
}) {
  return (
    <label className="text-sm font-bold text-slate-300">
      <span className="mb-2 block">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => setValue(Math.max(min, Math.round(Number(e.target.value) || 0)))}
        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-emerald-400"
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