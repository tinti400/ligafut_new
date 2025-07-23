'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function RelatorioBloqueiosPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()
  const [bloqueios, setBloqueios] = useState<any>({})
  const [times, setTimes] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAdmin) carregarDados()
  }, [isAdmin])

  async function carregarDados() {
    const { data: config } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (config?.bloqueios) setBloqueios(config.bloqueios)
    else setBloqueios({})

    const { data: timesData } = await supabase
      .from('times')
      .select('id, nome, logo_url')

    if (timesData) {
      const mapa = Object.fromEntries(timesData.map(t => [t.id, t]))
      setTimes(mapa)
    }

    setLoading(false)
  }

  async function removerBloqueioDoTime(idTime: string) {
    const confirmacao = confirm(`Tem certeza que deseja remover os bloqueios do time ${times[idTime]?.nome || idTime}?`)
    if (!confirmacao) return

    const novoBloqueios = { ...bloqueios }
    delete novoBloqueios[idTime]

    const { error } = await supabase
      .from('configuracoes')
      .update({ bloqueios: novoBloqueios })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

    if (error) {
      toast.error('Erro ao remover bloqueios.')
      return
    }

    setBloqueios(novoBloqueios)
    toast.success('Bloqueios removidos com sucesso!')
  }

  return (
    <div className="p-6 text-white max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">📋 Relatório de Jogadores Bloqueados</h1>

      {loading || loadingAdmin ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(bloqueios).map(([idTime, jogadores]: any, idx) => (
            <div key={idx} className="bg-gray-800 p-4 rounded shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img src={times[idTime]?.logo_url} alt="Logo" className="h-6 w-6" />
                  <h2 className="text-lg font-bold">{times[idTime]?.nome || idTime}</h2>
                </div>
                <button
                  onClick={() => removerBloqueioDoTime(idTime)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded"
                >
                  ❌ Remover Bloqueios
                </button>
              </div>
              <ul className="list-disc ml-6">
                {jogadores.map((j: any, idx2: number) => (
                  <li key={idx2} className="text-sm">
                    {j.nome} ({j.posicao})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
