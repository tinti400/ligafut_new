'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PropostasEnviadasPage() {
  const [propostas, setPropostas] = useState<any[]>([])
  const [jogadores, setJogadores] = useState<any>({})
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novoValor, setNovoValor] = useState<string>('')
  const [idTime, setIdTime] = useState('')

  useEffect(() => {
    const id_time = localStorage.getItem('id_time') || ''
    setIdTime(id_time)

    const buscarPropostas = async () => {
      const { data } = await supabase
        .from('propostas_app')
        .select('*')
        .eq('id_time_origem', id_time)
        .order('created_at', { ascending: false })

      if (data) {
        setPropostas(data)
        const idsJogadores = data.map((p) => p.jogador_id)
        buscarJogadores(idsJogadores)
      }
    }

    const buscarJogadores = async (ids: string[]) => {
      const { data } = await supabase
        .from('elenco')
        .select('id, nome, imagem_url, posicao')
        .in('id', ids)

      if (data) {
        const dict = Object.fromEntries(data.map((j) => [j.id, j]))
        setJogadores(dict)
      }
    }

    if (id_time) buscarPropostas()
  }, [])

  const cancelarProposta = async (id: string) => {
    await supabase.from('propostas_app').delete().eq('id', id)
    setPropostas((prev) => prev.filter((p) => p.id !== id))
  }

  const salvarEdicao = async (id: string) => {
    await supabase
      .from('propostas_app')
      .update({ valor_oferecido: parseInt(novoValor) })
      .eq('id', id)

    setPropostas((prev) =>
      prev.map((p) => (p.id === id ? { ...p, valor_oferecido: parseInt(novoValor) } : p))
    )

    setEditandoId(null)
    setNovoValor('')
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">📤 Minhas Propostas Enviadas</h1>

      {propostas.length === 0 && (
        <p className="text-gray-500">Nenhuma proposta enviada ainda.</p>
      )}

      <div className="flex flex-wrap gap-4">
        {propostas.map((p) => {
          const jogador = jogadores[p.jogador_id]

          return (
            <div
              key={p.id}
              className="border rounded shadow p-2 w-[220px] flex flex-col items-center"
            >
              <img
                src={jogador?.imagem_url || '/jogador_padrao.png'}
                alt={jogador?.nome || 'Jogador'}
                className="w-16 h-16 rounded-full object-cover mb-2"
              />
              <div className="text-center text-sm font-semibold">
                {jogador?.nome || 'Jogador não encontrado'}
              </div>
              <div className="text-xs">{jogador?.posicao || '-'} • Destino: {p.nome_time_alvo}</div>

              <div className="text-xs text-gray-700 mt-1">
                Tipo: {p.tipo_proposta} <br />
                Status:{' '}
                {p.status === 'pendente'
                  ? '⏳ Pendente'
                  : p.status === 'aceita'
                  ? '✅ Aceita'
                  : '❌ Recusada'}
              </div>

              <div className="text-sm text-blue-700 font-bold mt-1">
                R$ {Number(p.valor_oferecido).toLocaleString('pt-BR')}
              </div>

              {p.jogadores_oferecidos.length > 0 && (
                <div className="text-xs mt-1 text-center">
                  🧩 Jogadores Oferecidos:
                  <br />
                  {p.jogadores_oferecidos.join(', ')}
                </div>
              )}

              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                {editandoId === p.id ? (
                  <>
                    <input
                      type="number"
                      value={novoValor}
                      onChange={(e) => setNovoValor(e.target.value)}
                      className="border p-1 text-xs w-20"
                    />
                    <button
                      onClick={() => salvarEdicao(p.id)}
                      className="bg-green-600 text-white text-xs px-2 py-1 rounded"
                    >
                      💾 Salvar
                    </button>
                    <button
                      onClick={() => {
                        setEditandoId(null)
                        setNovoValor('')
                      }}
                      className="bg-gray-400 text-white text-xs px-2 py-1 rounded"
                    >
                      ❌ Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {p.status === 'pendente' && (
                      <>
                        <button
                          onClick={() => {
                            setEditandoId(p.id)
                            setNovoValor(p.valor_oferecido.toString())
                          }}
                          className="bg-yellow-500 text-white text-xs px-2 py-1 rounded"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => cancelarProposta(p.id)}
                          className="bg-red-600 text-white text-xs px-2 py-1 rounded"
                        >
                          ❌ Cancelar
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
