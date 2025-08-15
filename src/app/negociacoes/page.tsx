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
  const [mensagemSucesso, setMensagemSucesso] = useState<Record<string, boolean>>({})
  const [enviando, setEnviando] = useState<Record<string, boolean>>({})

  const [id_time, setIdTime] = useState<string | null>(null)
  const [nome_time, setNomeTime] = useState<string | null>(null)

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
      const { data, error } = await supabase
        .from('times')
        .select('id, nome')
        .neq('id', id_time)
        .order('nome', { ascending: true })
      if (!error && data) setTimes(data as Time[])
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
      const { data, error } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', timeSelecionado)
      if (!error && data) setElencoAdversario(data as Jogador[])
    }
    buscarElencoAdversario()
  }, [timeSelecionado])

  // Carrega elenco do meu time (para ofertas)
  useEffect(() => {
    async function buscarElencoMeuTime() {
      if (!id_time) return
      const { data, error } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)
      if (!error && data) setElencoMeuTime(data as Jogador[])
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

  // bloqueia ofertar jogador com < 3 jogos
  const elencoOfertavel = useMemo(() => {
    return (elencoMeuTime || []).map((j) => ({
      ...j,
      podeOferecer: (j.jogos ?? 0) >= 3
    }))
  }, [elencoMeuTime])

  // Enviar proposta (alinhado ao schema de `propostas_app`)
  const enviarProposta = async (jogadorAlvo: Jogador) => {
    const tipo = (tipoProposta[jogadorAlvo.id] || 'dinheiro') as TipoProposta
    const valorStr = valorProposta[jogadorAlvo.id] || ''
    const percStr = percentualDesejado[jogadorAlvo.id] || ''
    const idsOferecidos = jogadoresOferecidos[jogadorAlvo.id] || []

    if (!id_time || !nome_time) {
      alert('Usuário não identificado. Faça login novamente.')
      return
    }

    // Confirmação
    if (!window.confirm('Deseja realmente enviar esta proposta?')) return

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
      // valorNumerico pode ser null aqui — sem problemas
    }

    // Nome do time alvo
    const { data: timeAlvoData } = await supabase
      .from('times')
      .select('nome')
      .eq('id', jogadorAlvo.id_time)
      .single()

    // === Regras para valor_oferecido (CRÍTICO para não zerar) ===
    // - 'dinheiro' e 'comprar_percentual': usa o valor informado (>= 0)
    // - 'troca_composta': só envia quando > 0; se vazio/0 -> NULL (não altera valor no aceite)
    // - 'troca_simples': SEMPRE NULL (não altera valor no aceite)
    let valor_oferecido: number | null = null
    if (tipo === 'dinheiro' || tipo === 'comprar_percentual') {
      valor_oferecido = toInt32OrNull(valorNumerico)
    } else if (tipo === 'troca_composta') {
      if (valorNumerico != null && valorNumerico > 0) {
        valor_oferecido = toInt32OrNull(valorNumerico)
      } else {
        valor_oferecido = null
      }
    } else {
      // troca_simples
      valor_oferecido = null
    }

    const payload = {
      id_time_origem: id_time,                         // uuid (string)
      nome_time_origem: nome_time,                     // text
      id_time_alvo: jogadorAlvo.id_time,               // uuid (string)
      nome_time_alvo: timeAlvoData?.nome || 'Indefinido',

      jogador_id: jogadorAlvo.id,                      // uuid
      tipo_proposta: tipo,                             // text

      // AGORA PERMITE NULL
      valor_oferecido,                                 // int4 | null

      percentual_desejado: tipo === 'comprar_percentual' ? (percentualNum || 0) : 0, // numeric
      percentual:          tipo === 'comprar_percentual' ? (percentualNum || 0) : 0, // numeric

      jogadores_oferecidos: oferecidosDetalhes || [],  // jsonb (array de objetos)

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
        console.error('❌ INSERT propostas_app', {
          code: insertErr.code,
          message: insertErr.message,
          details: insertErr.details,
          hint: insertErr.hint,
        })
        toast.error(`Erro ao enviar a proposta: ${insertErr.message}`)
        return
      }

      // Sucesso
      const valorToast =
        valor_oferecido == null
          ? 'Sem redefinir valor (troca).'
          : `R$ ${Number(valor_oferecido).toLocaleString('pt-BR')}`

      toast.success(`Proposta enviada com sucesso! ${valorToast}`)

      setMensagemSucesso((prev) => ({ ...prev, [jogadorAlvo.id]: true }))
      setTimeout(() => {
        setMensagemSucesso((prev) => ({ ...prev, [jogadorAlvo.id]: false }))
      }, 3000)

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

          // ===== NOVA LÓGICA DE HABILITAÇÃO DO BOTÃO =====
          const temValor = valorProposta[jogador.id] !== undefined && valorProposta[jogador.id] !== ''
          const valorInvalido = temValor && isNaN(Number(valorProposta[jogador.id]))
          const precisaValor = tp === 'dinheiro' || tp === 'comprar_percentual' // troca_composta: opcional
          const precisaJogadores = tp === 'troca_simples' || tp === 'troca_composta'
          const jogadoresSelecionadosVazios = precisaJogadores && (!jogadoresOferecidos[jogador.id] || jogadoresOferecidos[jogador.id].length === 0)
          const invalidoPercentual = tp === 'comprar_percentual' && (!percentualDesejado[jogador.id] || isNaN(Number(percentualDesejado[jogador.id])))

          const disableEnviar =
            (precisaValor && (!temValor || valorInvalido)) ||
            invalidoPercentual ||
            jogadoresSelecionadosVazios

          return (
            <div key={jogador.id} className="border border-gray-700 rounded p-3 w-[260px] bg-gray-800">
              <img
                src={jogador.imagem_url || '/jogador_padrao.png'}
                alt={jogador.nome}
                className="w-16 h-16 rounded-full object-cover mb-2 mx-auto"
              />
              <div className="text-center font-semibold">{jogador.nome}</div>
              <div className="text-xs text-center text-gray-300">
                {jogador.posicao} • Overall {jogador.overall ?? '-'}
              </div>
              <div className="text-xs text-center text-green-400 font-bold mb-2">
                R$ {Number(jogador.valor || 0).toLocaleString('pt-BR')}
              </div>

              <button
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1 rounded w-full"
                onClick={() => {
                  setJogadorSelecionadoId(jogador.id)
                  setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
                  // deixa o valor preenchido apenas como sugestão; se limpar, virará NULL no payload (nas trocas)
                  setValorProposta((prev) => ({ ...prev, [jogador.id]: String(jogador.valor ?? 0) }))
                  setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '100' }))
                }}
              >
                💬 Fazer Proposta
              </button>

              {sel && (
                <div className="mt-3 text-xs border-t border-gray-700 pt-2">
                  <label className="font-semibold block mb-1">Tipo de proposta:</label>
                  <select
                    className="border p-1 w-full mb-3 bg-gray-800 border-gray-600 text-white"
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

                  {(tp === 'dinheiro' || tp === 'troca_composta' || tp === 'comprar_percentual') && (
                    <div className="mb-3">
                      <label className="font-semibold">
                        Valor oferecido (R$){tp === 'troca_composta' ? ' — opcional' : ''}:
                      </label>
                      <input
                        type="number"
                        className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white"
                        value={valorProposta[jogador.id] || ''}
                        onChange={(e) =>
                          setValorProposta((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  {tp === 'comprar_percentual' && (
                    <div className="mb-3">
                      <label className="font-semibold">Percentual desejado (%):</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white"
                        value={percentualDesejado[jogador.id] || ''}
                        onChange={(e) =>
                          setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                        }
                      />
                    </div>
                  )}

                  {(tp === 'troca_simples' || tp === 'troca_composta') && (
                    <div className="mb-3">
                      <label className="font-semibold">
                        Jogadores oferecidos (mín. 1 / precisam ter ≥ 3 jogos):
                      </label>
                      <select
                        multiple
                        className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white h-28"
                        value={jogadoresOferecidos[jogador.id] || []}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions)
                            .filter((opt) => {
                              const j = elencoOfertavel.find((x) => x.id === opt.value)
                              return j?.podeOferecer
                            })
                            .map((opt) => opt.value)
                          setJogadoresOferecidos((prev) => ({ ...prev, [jogador.id]: selected }))
                        }}
                      >
                        {elencoOfertavel.map((j) => (
                          <option key={j.id} value={j.id} disabled={!j.podeOferecer}>
                            {j.nome} - {j.posicao} - R$ {Number(j.valor || 0).toLocaleString('pt-BR')}
                            {!j.podeOferecer ? ' (menos de 3 jogos)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => enviarProposta(jogador)}
                    disabled={disableEnviar || !!enviando[jogador.id]}
                    className={`
                      w-full text-white font-bold py-1 rounded mt-2 text-xs
                      ${disableEnviar || enviando[jogador.id] ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
                    `}
                  >
                    {enviando[jogador.id] ? 'Enviando...' : '✅ Enviar Proposta'}
                  </button>

                  {mensagemSucesso[jogador.id] && (
                    <div className="text-green-400 text-xs mt-2 text-center">✅ Proposta enviada!</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
