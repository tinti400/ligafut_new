'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function NegociacoesPage() {
  const [times, setTimes] = useState<any[]>([])
  const [filtro, setFiltro] = useState('')
  const [timeSelecionado, setTimeSelecionado] = useState('')
  const [elencoAdversario, setElencoAdversario] = useState<any[]>([])
  const [elencoMeuTime, setElencoMeuTime] = useState<any[]>([])
  const [jogadorSelecionadoId, setJogadorSelecionadoId] = useState('')
  const [tipoProposta, setTipoProposta] = useState<{ [key: string]: string }>({})
  const [valorProposta, setValorProposta] = useState<{ [key: string]: string }>({})
  const [percentualDesejado, setPercentualDesejado] = useState<{ [key: string]: string }>({})
  const [jogadoresOferecidos, setJogadoresOferecidos] = useState<{ [key: string]: string[] }>({})
  const [mensagemSucesso, setMensagemSucesso] = useState<{ [key: string]: boolean }>({})

  const [userData, setUserData] = useState<any>(null)
  const [id_time, setIdTime] = useState<string | null>(null)
  const [nome_time, setNomeTime] = useState<string | null>(null)

  // Carrega dados do usuário
  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (userStorage) {
      const parsed = JSON.parse(userStorage)
      setUserData(parsed)
      setIdTime(parsed.id_time)
      setNomeTime(parsed.nome_time)
    }
  }, [])

  // Buscar times disponíveis para negociação
  useEffect(() => {
    const buscarTimes = async () => {
      const { data } = await supabase
        .from('times')
        .select('id, nome')
        .neq('id', id_time)
        .order('nome', { ascending: true })

      if (data) setTimes(data)
    }
    if (id_time) buscarTimes()
  }, [id_time])

  // Buscar elenco do time selecionado
  useEffect(() => {
    const buscarElenco = async () => {
      if (!timeSelecionado) return
      const { data } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', timeSelecionado)

      if (data) setElencoAdversario(data)
    }
    buscarElenco()
  }, [timeSelecionado])

  // Buscar elenco do meu time
  useEffect(() => {
    const buscarElencoMeuTime = async () => {
      if (!id_time) return
      const { data } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      if (data) setElencoMeuTime(data)
    }
    buscarElencoMeuTime()
  }, [id_time])

  const enviarProposta = async (jogador: any) => {
    const tipo = tipoProposta[jogador.id]
    const valor = valorProposta[jogador.id] || '0'
    const percentual = percentualDesejado[jogador.id] || '0'

    if (!id_time || !tipo || !nome_time) return

    const { data: timeAlvoData } = await supabase
      .from('times')
      .select('nome')
      .eq('id', jogador.id_time)
      .single()

    const nome_time_alvo = timeAlvoData?.nome || 'Indefinido'

    const proposta = {
      id_time_origem: id_time,
      nome_time_origem: nome_time,
      id_time_alvo: jogador.id_time,
      nome_time_alvo: nome_time_alvo,
      jogador_id: jogador.id,
      tipo_proposta: tipo,
      valor_oferecido: ['dinheiro', 'troca_composta'].includes(tipo) ? parseInt(valor) : 0,
      jogadores_oferecidos: jogadoresOferecidos[jogador.id] || [],
      percentual: parseInt(percentual),
      status: 'pendente',
    }

    const { error } = await supabase.from('propostas').insert(proposta)

    if (!error) {
      setMensagemSucesso((prev) => ({ ...prev, [jogador.id]: true }))
      setTimeout(() => {
        setMensagemSucesso((prev) => ({ ...prev, [jogador.id]: false }))
      }, 3000)

      // Limpa os campos
      setJogadorSelecionadoId('')
      setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
      setValorProposta((prev) => ({ ...prev, [jogador.id]: '' }))
      setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '' }))
      setJogadoresOferecidos((prev) => ({ ...prev, [jogador.id]: [] }))
    }
  }

  const timesFiltrados = times.filter((t) =>
    t.nome.toLowerCase().includes(filtro.toLowerCase())
  )

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

      <div className="flex flex-wrap gap-4">
        {elencoAdversario.map((jogador) => (
          <div key={jogador.id} className="border border-gray-700 rounded p-3 w-[220px] bg-gray-800">
            <img
              src={jogador.imagem_url || '/jogador_padrao.png'}
              alt={jogador.nome}
              className="w-16 h-16 rounded-full object-cover mb-2 mx-auto"
            />
            <div className="text-center font-semibold">{jogador.nome}</div>
            <div className="text-xs text-center text-gray-300">{jogador.posicao} • Overall {jogador.overall || '-'}</div>
            <div className="text-xs text-center text-green-400 font-bold mb-2">
              R$ {Number(jogador.valor).toLocaleString('pt-BR')}
            </div>

            <button
              className="bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1 rounded w-full"
              onClick={() => {
                setJogadorSelecionadoId(jogador.id)
                setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
                setValorProposta((prev) => ({ ...prev, [jogador.id]: jogador.valor?.toString() || '0' }))
                setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '100' }))
              }}
            >
              💬 Fazer Proposta
            </button>

            {jogadorSelecionadoId === jogador.id && (
              <div className="mt-3 w-full text-left text-xs border-t border-gray-700 pt-2">
                <label className="font-semibold block mb-1">Tipo de proposta:</label>
                <select
                  className="border p-1 w-full mb-3 bg-gray-800 border-gray-600 text-white"
                  value={tipoProposta[jogador.id] || 'dinheiro'}
                  onChange={(e) =>
                    setTipoProposta((prev) => ({
                      ...prev,
                      [jogador.id]: e.target.value,
                    }))
                  }
                >
                  <option value="dinheiro">💰 Apenas dinheiro</option>
                  <option value="troca_simples">🔁 Troca simples</option>
                  <option value="troca_composta">💶 Troca + dinheiro</option>
                </select>

                {['dinheiro', 'troca_composta'].includes(tipoProposta[jogador.id] || '') && (
                  <>
                    <div className="mb-3">
                      <label className="font-semibold">Valor oferecido (R$):</label>
                      <input
                        type="number"
                        className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white"
                        value={valorProposta[jogador.id] || ''}
                        onChange={(e) =>
                          setValorProposta((prev) => ({
                            ...prev,
                            [jogador.id]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="mb-3">
                      <label className="font-semibold">Percentual desejado (%):</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white"
                        value={percentualDesejado[jogador.id] || ''}
                        onChange={(e) =>
                          setPercentualDesejado((prev) => ({
                            ...prev,
                            [jogador.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                )}

                {['troca_simples', 'troca_composta'].includes(tipoProposta[jogador.id] || '') && (
                  <div className="mb-3">
                    <label className="font-semibold">Jogadores oferecidos:</label>
                    <select
                      multiple
                      className="border p-1 w-full mt-1 bg-gray-800 border-gray-600 text-white"
                      value={jogadoresOferecidos[jogador.id] || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value)
                        setJogadoresOferecidos((prev) => ({
                          ...prev,
                          [jogador.id]: selected,
                        }))
                      }}
                    >
                      {elencoMeuTime.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.nome} - {j.posicao} - R$ {Number(j.valor).toLocaleString('pt-BR')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={() => enviarProposta(jogador)}
                  disabled={
                    (['dinheiro', 'troca_composta'].includes(tipoProposta[jogador.id] || '') &&
                      (!valorProposta[jogador.id] || isNaN(Number(valorProposta[jogador.id])))) ||
                    !percentualDesejado[jogador.id] || isNaN(Number(percentualDesejado[jogador.id])) ||
                    Number(percentualDesejado[jogador.id]) <= 0 ||
                    (['troca_simples', 'troca_composta'].includes(tipoProposta[jogador.id] || '') &&
                      (!jogadoresOferecidos[jogador.id] || jogadoresOferecidos[jogador.id].length === 0))
                  }
                  className={`
                    w-full text-white font-bold py-1 rounded mt-2 text-xs
                    ${
                      (['dinheiro', 'troca_composta'].includes(tipoProposta[jogador.id] || '') &&
                        (!valorProposta[jogador.id] || isNaN(Number(valorProposta[jogador.id])))) ||
                      !percentualDesejado[jogador.id] || isNaN(Number(percentualDesejado[jogador.id])) ||
                      Number(percentualDesejado[jogador.id]) <= 0 ||
                      (['troca_simples', 'troca_composta'].includes(tipoProposta[jogador.id] || '') &&
                        (!jogadoresOferecidos[jogador.id] || jogadoresOferecidos[jogador.id].length === 0))
                        ? 'bg-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700'
                    }
                  `}
                >
                  ✅ Enviar Proposta
                </button>

                {mensagemSucesso[jogador.id] && (
                  <div className="text-green-400 text-xs mt-2 text-center">
                    ✅ Proposta enviada!
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
