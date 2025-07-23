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
  const [bloqueadosAnteriores, setBloqueadosAnteriores] = useState<Jogador[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [limiteBloqueios, setLimiteBloqueios] = useState(3)
  const [loading, setLoading] = useState(true)

  const idTime = typeof window !== 'undefined' ? localStorage.getItem('id_time') : ''

  useEffect(() => {
    if (idTime) {
      carregarConfig()
      carregarElenco()
    }
  }, [idTime])

  async function carregarConfig() {
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data) {
      setLimiteBloqueios(data.limite_bloqueios || 3)

      // Bloqueios da rodada atual
      if (idTime && data.bloqueios?.[idTime]) {
        setBloqueados(data.bloqueios[idTime])
      }

      // Bloqueios de rodadas anteriores
      if (idTime && data.bloqueios_anteriores?.[idTime]) {
        setBloqueadosAnteriores(data.bloqueios_anteriores[idTime])
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
    atual[idTime!] = [...(atual[idTime!] || []), ...novosBloqueios]

    await supabase
      .from('configuracoes')
      .update({ bloqueios: atual })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

    alert('✅ Jogadores bloqueados com sucesso!')
    window.location.reload()
  }

  const jogadoresJaBloqueadosAntes = new Set(bloqueadosAnteriores.map(j => j.nome))
  const jogadoresJaBloqueadosAgora = new Set(bloqueados.map(j => j.nome))

  const jogadoresDisponiveis = jogadores.filter(
    j => !jogadoresJaBloqueadosAntes.has(j.nome) && !jogadoresJaBloqueadosAgora.has(j.nome)
  )

  const toggleSelecionado = (nome: string) => {
    if (selecionados.includes(nome)) {
      setSelecionados(selecionados.filter(n => n !== nome))
    } else if (selecionados.length + bloqueados.length < limiteBloqueios) {
      setSelecionados([...selecionados, nome])
    }
  }

  return (
    <div className="p-6 text-white max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">🛡️ Bloqueio de Jogadores</h1>

      {!idTime ? (
        <p className="text-center text-red-400">⚠️ ID do time não encontrado. Faça login novamente.</p>
      ) : loading ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <>
          <div className="mb-4 text-center">
            <p className="mb-2">
              Você pode bloquear até <strong>{limiteBloqueios}</strong> jogadores.
            </p>

            {bloqueados.length > 0 && (
              <div className="bg-gray-800 p-3 rounded mb-2">
                <p className="font-semibold mb-2 text-green-400">🔒 Já bloqueados nesta rodada:</p>
                <ul className="flex flex-wrap gap-2 justify-center">
                  {bloqueados.map((j, idx) => (
                    <li key={idx} className="bg-green-700 px-2 py-1 rounded text-xs">
                      {j.nome} ({j.posicao})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {bloqueadosAnteriores.length > 0 && (
              <div className="bg-gray-900 p-3 rounded mb-2 border border-yellow-600">
                <p className="font-semibold mb-2 text-yellow-400">⚠️ Jogadores protegidos no evento anterior:</p>
                <ul className="flex flex-wrap gap-2 justify-center">
                  {bloqueadosAnteriores.map((j, idx) => (
                    <li key={idx} className="bg-yellow-700 px-2 py-1 rounded text-xs">
                      {j.nome} ({j.posicao})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {bloqueados.length >= limiteBloqueios ? (
            <div className="text-center text-green-400 font-bold">
              ✅ Você já atingiu o limite de bloqueios!
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {jogadoresDisponiveis.map(j => (
                  <div
                    key={j.id}
                    onClick={() => toggleSelecionado(j.nome)}
                    className={`p-2 rounded border cursor-pointer text-center ${
                      selecionados.includes(j.nome)
                        ? 'bg-green-600 border-green-400'
                        : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                    }`}
                  >
                    <p className="font-semibold">{j.nome}</p>
                    <p className="text-xs text-gray-300">{j.posicao}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={confirmarBloqueio}
                disabled={selecionados.length === 0}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-bold"
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
