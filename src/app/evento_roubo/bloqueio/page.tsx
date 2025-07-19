'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface Jogador {
  id: string
  nome: string
  posicao: string
}

export default function BloqueioPage() {
  const [jogadores, setJogadores] = useState<Jogador[]>([])
  const [bloqueados, setBloqueados] = useState<Jogador[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [limiteBloqueios, setLimiteBloqueios] = useState(3)
  const [loading, setLoading] = useState(true)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') : ''

  useEffect(() => {
    carregarConfig()
    carregarElenco()
  }, [])

  async function carregarConfig() {
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data) {
      setLimiteBloqueios(data.limite_bloqueios || 3)
      if (data.bloqueios?.[idTime]) {
        setBloqueados(data.bloqueios[idTime])
      }
    }
    setLoading(false)
  }

  async function carregarElenco() {
    const { data } = await supabase
      .from('elenco')
      .select('id, nome, posicao')
      .eq('id_time', idTime)

    if (data) {
      setJogadores(data)
    }
  }

  async function confirmarBloqueio() {
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um jogador!')
      return
    }

    const novosBloqueios = selecionados.map(nome => {
      const jogador = jogadores.find(j => j.nome === nome)
      return { nome: jogador?.nome || '', posicao: jogador?.posicao || '' }
    })

    const { data: configAtual } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    const atual = configAtual?.bloqueios || {}
    atual[idTime] = [...(atual[idTime] || []), ...novosBloqueios]

    await supabase
      .from('configuracoes')
      .update({ bloqueios: atual })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

    alert('✅ Jogadores bloqueados com sucesso!')
    window.location.reload()
  }

  const jogadoresDisponiveis = jogadores.filter(
    j => !bloqueados.some(b => b.nome === j.nome)
  )

  return (
    <div className="p-6 text-white max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">🛡️ Bloqueio de Jogadores</h1>

      {loading ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-2 text-center">
              Você pode bloquear até <strong>{limiteBloqueios}</strong> jogadores.
            </p>

            {bloqueados.length > 0 ? (
              <div className="bg-gray-800 p-2 rounded mb-2">
                <p className="font-semibold mb-1 text-center">🔒 Jogadores já bloqueados:</p>
                <ul className="list-disc ml-6 text-white">
                  {bloqueados.map((j, idx) => (
                    <li key={idx}>{j.nome} ({j.posicao})</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-center mb-2">Você ainda não bloqueou nenhum jogador.</p>
            )}
          </div>

          {bloqueados.length >= limiteBloqueios ? (
            <div className="text-center text-green-400 font-bold">
              ✅ Você já atingiu o limite de bloqueios!
            </div>
          ) : (
            <>
              <select
                multiple
                value={selecionados}
                onChange={(e) =>
                  setSelecionados(Array.from(e.target.selectedOptions, option => option.value))
                }
                className="border p-2 rounded w-full h-40 bg-gray-800 text-white mb-4"
              >
                {jogadoresDisponiveis.map(j => (
                  <option key={j.id} value={j.nome} className="text-white bg-gray-800">
                    {j.nome} ({j.posicao})
                  </option>
                ))}
              </select>

              <button
                onClick={confirmarBloqueio}
                disabled={selecionados.length === 0 || selecionados.length + bloqueados.length > limiteBloqueios}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded w-full"
              >
                ✅ Confirmar Bloqueio
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
