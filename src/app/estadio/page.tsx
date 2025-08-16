'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  NIVEL_MAXIMO,
  capacidadePorNivel,
  setoresBase,
  precosPadrao,
  limitesPrecos,
  calcularPublicoSetor,
  calcularMelhoriaEstadio,
  mensagemDesempenho,
  calcularMoralTecnico,
  sugerirPrecoParaSetor,
  precoReferencia,
  brl,
} from '@/utils/estadioUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type EstadioRow = {
  id_time: string
  nome: string
  nivel: number
  capacidade: number
  // os campos preco_<setor> são dinâmicos
  [k: `preco_${string}`]: number | any
}

export default function EstadioPage() {
  const [estadio, setEstadio] = useState<EstadioRow | null>(null)
  const [precos, setPrecos] = useState<Record<keyof typeof setoresBase, number>>({ ...precosPadrao })
  const [publicoTotal, setPublicoTotal] = useState(0)
  const [rendaTotal, setRendaTotal] = useState(0)
  const [saldo, setSaldo] = useState(0)

  const [pontos, setPontos] = useState(0)
  const [moralTecnico, setMoralTecnico] = useState(10)
  const [moralTorcida, setMoralTorcida] = useState(50)

  // Contexto de simulação
  const [jogoImportante, setJogoImportante] = useState(false)
  const [classico, setClassico] = useState(false)
  const [chuva, setChuva] = useState(false)

  const idTime =
    typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''
  const nomeTime =
    typeof window !== 'undefined' ? localStorage.getItem('nome_time') || '' : ''

  /** ======= Carregamentos ======= */
  useEffect(() => {
    if (!idTime) return
    buscarEstadio()
    buscarSaldo()
    buscarDesempenhoEMoral()
  }, [idTime])

  async function buscarEstadio() {
    const { data } = await supabase
      .from('estadios')
      .select('*')
      .eq('id_time', idTime)
      .maybeSingle()

    if (!data) {
      const novo: EstadioRow = {
        id_time: idTime,
        nome: nomeTime ? `Estádio ${nomeTime}` : 'Estádio da LigaFut',
        nivel: 1,
        capacidade: capacidadePorNivel[1],
        ...Object.fromEntries(
          (Object.keys(setoresBase) as (keyof typeof setoresBase)[]).map((k) => [
            `preco_${k}`,
            precosPadrao[k],
          ])
        ),
      }
      await supabase.from('estadios').insert(novo)
      setEstadio(novo)
      setPrecos(
        Object.fromEntries(
          (Object.keys(setoresBase) as (keyof typeof setoresBase)[]).map((k) => [
            k,
            precosPadrao[k],
          ])
        ) as any
      )
      return
    }

    // Garantir campos de preço (caso antigos registros não possuam)
    const patch: Partial<EstadioRow> = {}
    const precosCarregados: Record<keyof typeof setoresBase, number> = { ...precosPadrao }
    ;(Object.keys(setoresBase) as (keyof typeof setoresBase)[]).forEach((k) => {
      const coluna = `preco_${k}` as const
      const val = (data as any)[coluna]
      if (typeof val !== 'number' || Number.isNaN(val)) {
        patch[coluna] = precosPadrao[k]
        precosCarregados[k] = precosPadrao[k]
      } else {
        precosCarregados[k] = val
      }
    })

    if (Object.keys(patch).length) {
      await supabase.from('estadios').update(patch).eq('id_time', idTime)
    }

    setEstadio(data as EstadioRow)
    setPrecos(precosCarregados)
  }

  async function buscarSaldo() {
    const { data } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .maybeSingle()
    if (data?.saldo != null) setSaldo(data.saldo)
  }

  async function buscarDesempenhoEMoral() {
    const { data: classData } = await supabase
      .from('classificacao')
      .select('pontos')
      .eq('id_time', idTime)
      .maybeSingle()

    if (classData) {
      const pts = classData.pontos || 0
      setPontos(pts)
      const novaMoral = calcularMoralTecnico(pts)
      setMoralTecnico(novaMoral)
      await supabase.from('times').update({ moral_tecnico: novaMoral }).eq('id', idTime)
    }

    const { data: moralData } = await supabase
      .from('times')
      .select('moral_torcida')
      .eq('id', idTime)
      .maybeSingle()

    if (moralData) {
      setMoralTorcida(moralData.moral_torcida ?? 50)
    }
  }

  /** ======= Helpers ======= */
  const nivel = estadio?.nivel ?? 1
  const capacidade = capacidadePorNivel[nivel]
  const contexto = useMemo(
    () => ({
      importancia: jogoImportante ? 1.2 : 1.0,
      classico,
      clima: chuva ? ('chuva' as const) : ('bom' as const),
    }),
    [jogoImportante, classico, chuva]
  )

  /** ======= Simulação ======= */
  useEffect(() => {
    if (!estadio) return
    let totalPublico = 0
    let totalRenda = 0

    ;(Object.entries(setoresBase) as [keyof typeof setoresBase, number][]).forEach(
      ([setor, proporcao]) => {
        const lugares = Math.floor(capacidade * proporcao)
        const preco = precos[setor] ?? 0

        const { publicoPara } = calcularPublicoSetor(
          lugares,
          preco,
          pontos,
          0,
          0,
          0,
          nivel,
          moralTecnico,
          moralTorcida,
          contexto
        )
        const { publicoEstimado, renda } = publicoPara(setor)
        totalPublico += publicoEstimado
        totalRenda += renda
      }
    )

    setPublicoTotal(totalPublico)
    setRendaTotal(totalRenda)
  }, [precos, estadio, pontos, moralTecnico, moralTorcida, contexto, capacidade, nivel])

  /** ======= Ações ======= */
  function setPreco(setor: keyof typeof setoresBase, v: number) {
    setPrecos((p) => ({ ...p, [setor]: Number.isFinite(v) ? v : 0 }))
  }

  async function salvarPrecos() {
    if (!estadio) return
    const updateObj: any = {}
    ;(Object.keys(setoresBase) as (keyof typeof setoresBase)[]).forEach((k) => {
      updateObj[`preco_${k}`] = precos[k]
    })
    await supabase.from('estadios').update(updateObj).eq('id_time', idTime)
    alert('💾 Preços salvos!')
  }

  function resetarParaReferencia() {
    if (!estadio) return
    const next: any = {}
    ;(Object.keys(setoresBase) as (keyof typeof setoresBase)[]).forEach((k) => {
      next[k] = precoReferencia(k, nivel)
    })
    setPrecos(next)
  }

  function ajustarPercentual(deltaPct: number) {
    setPrecos((p) => {
      const out: any = {}
      ;(Object.keys(p) as (keyof typeof setoresBase)[]).forEach((k) => {
        const novo = Math.max(1, Math.round(p[k] * (1 + deltaPct / 100)))
        out[k] = novo
      })
      return out
    })
  }

  function autoPrecoMaxRenda() {
    const out: any = {}
    ;(Object.entries(setoresBase) as [keyof typeof setoresBase, number][]).forEach(
      ([setor, proporcao]) => {
        const lugares = Math.floor(capacidade * proporcao)
        const limite = limitesPrecos[nivel][setor]
        out[setor] = sugerirPrecoParaSetor(
          setor,
          nivel,
          lugares,
          pontos,
          moralTecnico,
          moralTorcida,
          limite,
          contexto
        )
      }
    )
    setPrecos(out)
  }

  async function melhorarEstadio() {
    if (!estadio) return
    if (nivel >= NIVEL_MAXIMO) return

    const custo = calcularMelhoriaEstadio(nivel)
    if (saldo < custo) {
      alert('💸 Saldo insuficiente para melhorar o estádio!')
      return
    }

    const proxNivel = nivel + 1
    const novaCapacidade = capacidadePorNivel[proxNivel]

    // Atualiza estádio e saldo
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase
        .from('estadios')
        .update({ nivel: proxNivel, capacidade: novaCapacidade })
        .eq('id_time', idTime),
      supabase.from('times').update({ saldo: saldo - custo }).eq('id', idTime),
    ])

    if (e1 || e2) {
      alert('Não foi possível melhorar agora. Tente novamente.')
      return
    }

    alert('✅ Estádio melhorado com sucesso!')
    await Promise.all([buscarEstadio(), buscarSaldo()])
    // Ajusta preços para referência do novo nível (opcional)
    resetarParaReferencia()
  }

  if (!estadio)
    return <div className="p-6 text-white">🔄 Carregando informações do estádio...</div>

  /** ======= UI ======= */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-zinc-800">
        <div className="mx-auto max-w-6xl p-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold">
                🏟️ {estadio.nome}
              </h1>
              <p className="text-zinc-400">
                Nível <b>{nivel}</b> de {NIVEL_MAXIMO} • Capacidade{' '}
                <b>{capacidade.toLocaleString()}</b> lugares
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ResumoKPI label="Público estimado" value={publicoTotal.toLocaleString()}/>
              <ResumoKPI label="Renda estimada" value={brl(rendaTotal)}/>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Aviso desempenho e moral */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold text-yellow-300 mb-2">📣 Clima e Desempenho</h2>
            <p className="text-zinc-300">{mensagemDesempenho(pontos)}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <Gauge label="Moral do técnico" perc={(moralTecnico / 10) * 100} text={`${moralTecnico.toFixed(1)}/10`} />
              <Gauge label="Moral da torcida" perc={moralTorcida} text={`${moralTorcida.toFixed(0)}%`} />
              <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3">
                <p className="text-sm text-zinc-400 mb-2">🎮 Contexto de jogo</p>
                <div className="flex flex-wrap gap-2">
                  <Toggle label="Importante" on={jogoImportante} setOn={setJogoImportante}/>
                  <Toggle label="Clássico" on={classico} setOn={setClassico}/>
                  <Toggle label="Chuva" on={chuva} setOn={setChuva}/>
                </div>
              </div>
            </div>
          </div>

          {/* Preços por setor */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl">
            <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center gap-2 justify-between">
              <h2 className="text-lg font-bold">💵 Preços por setor</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => ajustarPercentual(-10)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
                >
                  −10%
                </button>
                <button
                  onClick={() => ajustarPercentual(10)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
                >
                  +10%
                </button>
                <button
                  onClick={resetarParaReferencia}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm"
                >
                  Ref. do nível
                </button>
                <button
                  onClick={autoPrecoMaxRenda}
                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-sm font-semibold"
                >
                  Auto-preço (max renda)
                </button>
                <button
                  onClick={salvarPrecos}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
                >
                  Salvar tudo
                </button>
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.entries(setoresBase) as [keyof typeof setoresBase, number][])
                .map(([setor, proporcao]) => {
                  const limite = limitesPrecos[nivel][setor]
                  const lugares = Math.floor(capacidade * proporcao)
                  const preco = precos[setor] ?? 0

                  const { publicoPara } = calcularPublicoSetor(
                    lugares,
                    preco,
                    pontos,
                    0, 0, 0,
                    nivel,
                    moralTecnico,
                    moralTorcida,
                    contexto
                  )
                  const { publicoEstimado, renda, ocupacao } = publicoPara(setor)

                  const pRef = precoReferencia(setor, nivel)
                  const pctRef = preco > 0 ? (preco / pRef) : 0

                  return (
                    <div key={setor} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold capitalize">{labelSetor(setor)}</div>
                        <div className="text-xs text-zinc-400">
                          Ref: {brl(pRef)}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={limite}
                          value={preco}
                          onChange={(e) => setPreco(setor, Math.min(limite, Math.max(1, Math.round(Number(e.target.value) || 0))))}
                          className="w-28 border border-zinc-800 rounded-lg bg-zinc-900 px-2 py-1.5 text-sm outline-none"
                        />
                        <span className="text-xs text-zinc-400">Limite: {brl(limite)}</span>
                      </div>

                      <div className="mt-3">
                        <Bar label="Ocupação" value={ocupacao} />
                        <div className="text-xs text-zinc-400 mt-1">
                          Público: <b className="text-zinc-200">{publicoEstimado.toLocaleString()}</b> /
                          {lugares.toLocaleString()} • Renda: <b className="text-zinc-200">{brl(renda)}</b>
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] text-zinc-400">
                        {pctRef >= 1
                          ? `+${Math.round((pctRef - 1) * 100)}% acima`
                          : `${Math.round((1 - pctRef) * 100)}% abaixo`} do preço de referência
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Visualização de lotação total */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h2 className="text-lg font-bold mb-2">🎟️ Lotação total</h2>
            <Bar label="Geral" value={publicoTotal / Math.max(capacidade, 1)} />
            <p className="text-xs text-zinc-400 mt-2">
              {publicoTotal.toLocaleString()} / {capacidade.toLocaleString()} lugares ocupados
            </p>
          </div>
        </div>

        {/* Coluna lateral (resumo & upgrade) */}
        <aside className="space-y-6">
          {/* Resumo */}
          <div className="sticky top-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">📊 Resumo da Simulação</h3>
            <div className="mt-3 space-y-2 text-sm">
              <LinhaKV k="Pontos" v={pontos.toString()} />
              <LinhaKV k="Moral técnico" v={`${moralTecnico.toFixed(1)}/10`} />
              <LinhaKV k="Moral torcida" v={`${moralTorcida.toFixed(0)}%`} />
              <LinhaKV k="Contexto"
                v={[
                  jogoImportante ? 'Importante' : 'Normal',
                  classico ? 'Clássico' : null,
                  chuva ? 'Chuva' : 'Tempo bom',
                ].filter(Boolean).join(' • ')}/>
            </div>
            <div className="mt-4 border-t border-zinc-800 pt-3 space-y-1">
              <LinhaKV k="Público total" v={publicoTotal.toLocaleString()} />
              <LinhaKV k="Renda estimada" v={brl(rendaTotal)} />
            </div>
          </div>

          {/* Upgrade */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-lg font-bold">🏗️ Evoluir Estádio</h3>
            {nivel < NIVEL_MAXIMO ? (
              <>
                <p className="text-sm text-zinc-300 mt-1">
                  Próximo nível: <b>{nivel + 1}</b> • Capacidade:{' '}
                  <b>{capacidadePorNivel[nivel + 1].toLocaleString()}</b>
                </p>
                <p className="text-sm text-zinc-300">Custo: <b>{brl(calcularMelhoriaEstadio(nivel))}</b></p>
                <p className="text-xs text-zinc-500 mt-1">Saldo atual: {brl(saldo)}</p>
                <button
                  onClick={melhorarEstadio}
                  className="w-full mt-3 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold"
                >
                  Melhorar Estádio
                </button>
              </>
            ) : (
              <div className="text-green-400 font-semibold">🏆 Estádio já está no nível máximo!</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** ======= Componentes visuais ======= */
function ResumoKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

function LinhaKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-zinc-300">{label}</span>
        <span className="text-zinc-400">{Math.round(pct * 100)}%</span>
      </div>
      <div className="w-full h-3 bg-zinc-800 rounded-lg overflow-hidden">
        <div
          className="h-3 bg-emerald-500"
          style={{ width: `${pct * 100}%`, transition: 'width 250ms ease' }}
        />
      </div>
    </div>
  )
}

function Gauge({ label, perc, text }: { label: string; perc: number; text: string }) {
  const pct = Math.max(0, Math.min(100, perc))
  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 w-full h-3 bg-zinc-800 rounded">
        <div
          className="h-3 bg-emerald-500 rounded"
          style={{ width: `${pct}%`, transition: 'width 250ms ease' }}
        />
      </div>
      <div className="text-xs text-zinc-400 mt-1 text-right">{text}</div>
    </div>
  )
}

function Toggle({
  label,
  on,
  setOn,
}: {
  label: string
  on: boolean
  setOn: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => setOn(!on)}
      className={`px-3 py-1.5 rounded-lg text-sm border ${
        on
          ? 'bg-emerald-600/20 border-emerald-600 text-emerald-300'
          : 'bg-zinc-900 border-zinc-700 text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

function labelSetor(s: keyof typeof setoresBase) {
  const map: Record<keyof typeof setoresBase, string> = {
    popular: 'Popular',
    norte: 'Arquibancada Norte',
    sul: 'Arquibancada Sul',
    leste: 'Leste',
    oeste: 'Oeste',
    camarote: 'Camarotes / VIP',
  }
  return map[s]
}
