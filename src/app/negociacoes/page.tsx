'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Time = { id: string; nome: string }
type Jogador = {
  id: string
  id_time: string
  nome: string
  posicao: string
  overall: number | null
  valor: number | null
  imagem_url?: string | null
  jogos?: number | null
}

type TipoProposta = 'dinheiro' | 'troca_simples' | 'troca_composta' | 'comprar_percentual'

export default function NegociacoesPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [filtro, setFiltro] = useState('')
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  const [elencoAdversario, setElencoAdversario] = useState<Jogador[]>([])
  const [elencoMeuTime, setElencoMeuTime] = useState<Jogador[]>([])

  const [jogadorSelecionadoId, setJogadorSelecionadoId] = useState<string>('')

  const [tipoProposta, setTipoProposta] = useState<Record<string, TipoProposta>>({})
  const [valorProposta, setValorProposta] = useState<Record<string, string>>({})
  const [percentualDesejado, setPercentualDesejado] = useState<Record<string, string>>({})
  const [jogadoresOferecidos, setJogadoresOferecidos] = useState<Record<string, string[]>>({})
  const [enviando, setEnviando] = useState<Record<string, boolean>>({})

  const [id_time, setIdTime] = useState<string | null>(null)
  const [nome_time, setNomeTime] = useState<string | null>(null)

  // Modal de confirmação pós-envio
  const [modalAberto, setModalAberto] = useState(false)
  const [modalInfo, setModalInfo] = useState<{
    jogadorNome?: string
    tipo?: string
    valor?: string | null
    percentual?: string | null
    qtdOferecidos?: number
  }>({})

  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (userStorage) {
      try {
        const parsed = JSON.parse(userStorage)
        setIdTime(parsed.id_time ?? null)
        setNomeTime(parsed.nome_time ?? null)
      } catch {}
    }
  }, [])

  // Carrega lista de times (exceto o meu)
  useEffect(() => {
    async function buscarTimes() {
      if (!id_time) return
      const { data } = await supabase
        .from('times')
        .select('id, nome')
        .neq('id', id_time)
        .order('nome', { ascending: true })
      if (data) setTimes(data as Time[])
    }
    buscarTimes()
  }, [id_time])

  // Carrega elenco do time alvo
  useEffect(() => {
    async function buscarElencoAdversario() {
      if (!timeSelecionado) {
        setElencoAdversario([])
        return
      }
      const { data } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', timeSelecionado)
      if (data) setElencoAdversario(data as Jogador[])
    }
    buscarElencoAdversario()
  }, [timeSelecionado])

  // Carrega elenco do meu time (para ofertas)
  useEffect(() => {
    async function buscarElencoMeuTime() {
      if (!id_time) return
      const { data } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)
      if (data) setElencoMeuTime(data as Jogador[])
    }
    buscarElencoMeuTime()
  }, [id_time])

  const timesFiltrados = useMemo(
    () => times.filter((t) => t.nome.toLowerCase().includes(filtro.toLowerCase())),
    [times, filtro]
  )

  // Utils
  const parseNumberOrNull = (v: string): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const isUUID = (s?: string | null) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  const toInt32OrNull = (n: number | null | undefined) => {
    if (n == null) return null
    const v = Math.trunc(Number(n))
    const INT32_MAX = 2147483647
    const INT32_MIN = -2147483648
    if (v > INT32_MAX) return INT32_MAX
    if (v < INT32_MIN) return INT32_MIN
    return v
  }
  const formatBRL = (v: number | null | undefined) =>
    `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

  // bloqueia ofertar jogador com < 3 jogos
  const elencoOfertavel = useMemo(() => {
    return (elencoMeuTime || []).map((j) => ({
      ...j,
      podeOferecer: (j.jogos ?? 0) >= 3
    }))
  }, [elencoMeuTime])

  // Toggle seleção no checklist estilizado
  const toggleOferecido = (alvoId: string, jogadorId: string, podeOferecer: boolean) => {
    if (!podeOferecer) return
    setJogadoresOferecidos((prev) => {
      const atual = new Set(prev[alvoId] || [])
      if (atual.has(jogadorId)) atual.delete(jogadorId)
      else atual.add(jogadorId)
      return { ...prev, [alvoId]: Array.from(atual) }
    })
  }

  // Enviar proposta
  const enviarProposta = async (jogadorAlvo: Jogador) => {
    const tipo = (tipoProposta[jogadorAlvo.id] || 'dinheiro') as TipoProposta
    const valorStr = valorProposta[jogadorAlvo.id] || ''
    const percStr = percentualDesejado[jogadorAlvo.id] || ''
    const idsOferecidos = jogadoresOferecidos[jogadorAlvo.id] || []

    if (!id_time || !nome_time) {
      alert('Usuário não identificado. Faça login novamente.')
      return
    }

    if (!window.confirm('Confirmar envio da proposta?')) return

    // Snapshot dos oferecidos (somente meus e com >=3 jogos)
    let oferecidosDetalhes: any[] = []
    if (idsOferecidos.length) {
      const idsValidos = elencoOfertavel
        .filter((j) => idsOferecidos.includes(j.id) && j.podeOferecer)
        .map((j) => j.id)

      if (idsValidos.length !== idsOferecidos.length) {
        alert('Algum jogador oferecido não possui 3 jogos e foi removido da seleção.')
      }

      if (idsValidos.length) {
        const { data } = await supabase
          .from('elenco')
          .select('id, nome, valor, posicao, overall, id_time, jogos')
          .in('id', idsValidos)

        oferecidosDetalhes = (data || []).map((d: any) => ({
          id: d.id,
          nome: d.nome,
          valor_atual: Number(d.valor || 0),
          posicao: d.posicao,
          overall: d.overall,
          id_time: d.id_time,
          jogos: d.jogos ?? 0
        }))
      }
    }

    // Converte valores numéricos
    const valorNumerico = parseNumberOrNull(valorStr)
    const percentualNum = tipo === 'comprar_percentual' ? parseNumberOrNull(percStr) : null

    // Validações por tipo
    if (tipo === 'dinheiro') {
      if (valorNumerico == null || valorNumerico < 0) {
        alert('Informe um valor válido.')
        return
      }
    }
    if (tipo === 'comprar_percentual') {
      if (valorNumerico == null || valorNumerico < 0) {
        alert('Informe um valor válido.')
        return
      }
      if (percentualNum == null || percentualNum <= 0 || percentualNum > 100) {
        alert('Percentual inválido (1 a 100).')
        return
      }
    }
    if (tipo === 'troca_simples') {
      if (oferecidosDetalhes.length === 0) {
        alert('Selecione ao menos 1 jogador para a troca.')
        return
      }
    }
    if (tipo === 'troca_composta') {
      if (oferecidosDetalhes.length === 0) {
        alert('Selecione ao menos 1 jogador (o dinheiro é opcional).')
        return
      }
      // valorNumerico pode ser null aqui — sem problemas (vai como NULL)
    }

    // Nome do time alvo
    const { data: timeAlvoData } = await supabase
      .from('times')
      .select('nome')
      .eq('id', jogadorAlvo.id_time)
      .single()

    // Regras para valor_oferecido
    // - dinheiro / comprar_percentual: usa valor informado (>= 0)
    // - troca_composta: se vazio/0 -> NULL (não altera valor); se > 0, usa o valor
    // - troca_simples: sempre NULL (não redefine valor)
    let valor_oferecido: number | null = null
    if (tipo === 'dinheiro' || tipo === 'comprar_percentual') {
      valor_oferecido = toInt32OrNull(valorNumerico)
    } else if (tipo === 'troca_composta') {
      valor_oferecido = valorNumerico != null && valorNumerico > 0 ? toInt32OrNull(valorNumerico) : null
    } else {
      valor_oferecido = null
    }

    const payload = {
      id_time_origem: id_time,
      nome_time_origem: nome_time,
      id_time_alvo: jogadorAlvo.id_time,
      nome_time_alvo: timeAlvoData?.nome || 'Indefinido',

      jogador_id: jogadorAlvo.id,
      tipo_proposta: tipo,

      valor_oferecido, // int4 | null

      percentual_desejado: tipo === 'comprar_percentual' ? (percentualNum || 0) : 0,
      percentual:          tipo === 'comprar_percentual' ? (percentualNum || 0) : 0,

      jogadores_oferecidos: oferecidosDetalhes || [],

      status: 'pendente',
      created_at: new Date().toISOString()
    } as const

    // Valida UUIDs
    if (!isUUID(payload.id_time_origem) || !isUUID(payload.id_time_alvo) || !isUUID(payload.jogador_id)) {
      alert('IDs inválidos (uuid). Recarregue e faça login novamente.')
      return
    }

    setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: true }))
    try {
      const { error: insertErr } = await supabase
        .from('propostas_app')
        .insert([payload])

      if (insertErr) {
        console.error('❌ INSERT propostas_app', insertErr)
        toast.error(`Erro ao enviar a proposta: ${insertErr.message}`)
        return
      }

      // Confirmação: toast + modal
      const labelValor =
        valor_oferecido == null
          ? '—'
          : `R$ ${Number(valor_oferecido).toLocaleString('pt-BR')}`
      toast.success('✅ Proposta enviada!')

      setModalInfo({
        jogadorNome: jogadorAlvo.nome,
        tipo,
        valor: labelValor,
        percentual: tipo === 'comprar_percentual' ? String(percentualNum) + '%' : null,
        qtdOferecidos: oferecidosDetalhes.length
      })
      setModalAberto(true)

      // Reset dos campos do jogador
      setJogadorSelecionadoId('')
      setTipoProposta((prev) => ({ ...prev, [jogadorAlvo.id]: 'dinheiro' }))
      setValorProposta((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setPercentualDesejado((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setJogadoresOferecidos((prev) => ({ ...prev, [jogadorAlvo.id]: [] }))
    } finally {
      setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: false }))
    }
  }

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">📩 Enviar Proposta</h1>

      <input
        type="text"
        placeholder="🔎 Buscar time por nome"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        className="border p-2 rounded w-full max-w-md mb-4 bg-gray-800 border-gray-600 text-white"
      />

      <select
        value={timeSelecionado}
        onChange={(e) => setTimeSelecionado(e.target.value)}
        className="border p-2 rounded w-full max-w-md mb-6 bg-gray-800 border-gray-600 text-white"
      >
        <option value="">-- Selecione um time --</option>
        {timesFiltrados.map((time) => (
          <option key={time.id} value={time.id}>
            {time.nome}
          </option>
        ))}
      </select>

      {/* Cards de jogadores do time selecionado */}
      <div className="flex flex-wrap gap-4">
        {elencoAdversario.map((jogador) => {
          const sel = jogadorSelecionadoId === jogador.id
          const tp = (tipoProposta[jogador.id] || 'dinheiro') as TipoProposta

          const valorStr = valorProposta[jogador.id] ?? ''
          const precisaValorFixo = tp === 'dinheiro' || tp === 'comprar_percentual' // troca_composta é opcional
          const valorInvalido = precisaValorFixo && (valorStr === '' || isNaN(Number(valorStr)))

          const precisaPercentual = tp === 'comprar_percentual'
          const percStr = percentualDesejado[jogador.id] ?? ''
          const invalidoPercentual = precisaPercentual && (percStr === '' || isNaN(Number(percStr)))

          const precisaJogadores = tp === 'troca_simples' || tp === 'troca_composta'
          const jogadoresSelecionados =
            jogadoresOferecidos[jogador.id] && jogadoresOferecidos[jogador.id].length > 0
          const jogadoresVazios = precisaJogadores && !jogadoresSelecionados

          const disableEnviar = valorInvalido || invalidoPercentual || jogadoresVazios

          return (
            <div key={jogador.id} className="border border-gray-700 rounded-lg p-4 w-[280px] bg-gray-800">
              <img
                src={jogador.imagem_url || '/jogador_padrao.png'}
                alt={jogador.nome}
                className="w-16 h-16 rounded-full object-cover mb-3 mx-auto ring-2 ring-gray-700"
              />
              <div className="text-center font-semibold">{jogador.nome}</div>
              <div className="text-xs text-center text-gray-300">
                {jogador.posicao} • Overall {jogador.overall ?? '-'}
              </div>
              <div className="text-xs text-center text-green-400 font-bold mb-3">
                {formatBRL(jogador.valor)}
              </div>

              <button
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded w-full"
                onClick={() => {
                  setJogadorSelecionadoId(jogador.id)
                  setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
                  setValorProposta((prev) => ({ ...prev, [jogador.id]: '' })) // começa vazio
                  setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '100' }))
                }}
              >
                💬 Fazer Proposta
              </button>

              {sel && (
                <div className="mt-4 text-xs border-t border-gray-700 pt-3 space-y-3">
                  <div>
                    <label className="font-semibold block mb-1">Tipo de proposta</label>
                    <select
                      className="border p-2 w-full bg-gray-800 border-gray-600 text-white rounded"
                      value={tp}
                      onChange={(e) =>
                        setTipoProposta((prev) => ({ ...prev, [jogador.id]: e.target.value as TipoProposta }))
                      }
                    >
                      <option value="dinheiro">💰 Apenas dinheiro</option>
                      <option value="troca_simples">🔁 Troca simples</option>
                      <option value="troca_composta">💶 Troca + dinheiro (opcional)</option>
                      <option value="comprar_percentual">📈 Comprar percentual</option>
                    </select>
                  </div>

                  {(tp === 'dinheiro' || tp === 'troca_composta' || tp === 'comprar_percentual') && (
                    <div>
                      <label className="font-semibold">
                        Valor oferecido (R$){tp === 'troca_composta' ? ' — opcional' : ''}:
                      </label>
                      <input
                        type="number"
                        className="border p-2 w-full mt-1 bg-gray-800 border-gray-600 text-white rounded"
                        value={valorProposta[jogador.id] || ''}
                        onChange={(e) =>
                          setValorProposta((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  {tp === 'comprar_percentual' && (
                    <div>
                      <label className="font-semibold">Percentual desejado (%)</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="border p-2 w-full mt-1 bg-gray-800 border-gray-600 text-white rounded"
                        value={percentualDesejado[jogador.id] || ''}
                        onChange={(e) =>
                          setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  {(tp === 'troca_simples' || tp === 'troca_composta') && (
                    <div>
                      <label className="font-semibold block mb-2">
                        Jogadores oferecidos (mín. 1 / ≥ 3 jogos)
                      </label>

                      {/* Novo layout: checklist em grid */}
                      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                        {elencoOfertavel.map((j) => {
                          const marcado =
                            (jogadoresOferecidos[jogador.id] || []).includes(j.id)
                          const disabled = !j.podeOferecer

                          return (
                            <label
                              key={j.id}
                              className={`flex items-center justify-between gap-2 rounded-lg p-2 border ${
                                marcado ? 'border-green-500 bg-green-900/20' : 'border-gray-700 bg-gray-800'
                              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              onClick={() => toggleOferecido(jogador.id, j.id, j.podeOferecer)}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={marcado}
                                  onChange={() => toggleOferecido(jogador.id, j.id, j.podeOferecer)}
                                  disabled={disabled}
                                  className="accent-green-600"
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-white text-[13px] leading-4">
                                    {j.nome} <span className="text-gray-300">• {j.posicao}</span>
                                  </span>
                                  <span className="text-[12px] text-gray-300">{formatBRL(j.valor)}</span>
                                </div>
                              </div>

                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full ${
                                  j.podeOferecer
                                    ? 'bg-emerald-700 text-white'
                                    : 'bg-gray-700 text-gray-300'
                                }`}
                                title={j.podeOferecer ? 'Apto para troca' : 'Menos de 3 jogos'}
                              >
                                {j.jogos ?? 0} jogos {j.podeOferecer ? '' : '🔒'}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => enviarProposta(jogador)}
                    disabled={disableEnviar || !!enviando[jogador.id]}
                    className={`
                      w-full text-white font-bold py-2 rounded mt-1 text-sm
                      ${disableEnviar || enviando[jogador.id] ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
                    `}
                  >
                    {enviando[jogador.id] ? 'Enviando...' : '✅ Enviar Proposta'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de confirmação */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-2">✅ Proposta enviada!</h2>
            <p className="text-sm text-zinc-300">
              Sua proposta para <span className="font-semibold">{modalInfo.jogadorNome}</span> foi enviada.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400">Tipo</div>
                <div className="font-semibold capitalize">{modalInfo.tipo?.replace('_', ' ')}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400">Valor</div>
                <div className="font-semibold">{modalInfo.valor ?? '—'}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400">Percentual</div>
                <div className="font-semibold">{modalInfo.percentual ?? '—'}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="text-zinc-400">Oferecidos</div>
                <div className="font-semibold">{modalInfo.qtdOferecidos ?? 0}</div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600"
                onClick={() => setModalAberto(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
