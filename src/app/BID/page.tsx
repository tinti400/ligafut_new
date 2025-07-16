'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Eventobid {
  id: string
  tipo_evento: string
  descricao: string
  id_time1: string
  id_time2?: string | null
  valor?: number | null
  data_evento: string
}

interface Time {
  id: string
  nome: string
}

export default function bidPage() {
  const [eventos, setEventos] = useState<Eventobid[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setLoading(true)
    setErro(null)

    try {
      // Buscar eventos do bid
      const { data: eventosData, error: errorEventos } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .limit(50)

      if (errorEventos) throw errorEventos

      // Buscar todos os times para mapear id -> nome
      const { data: timesData, error: errorTimes } = await supabase
        .from('times')
        .select('id, nome')

      if (errorTimes) throw errorTimes

      // Criar mapa id_time => nome_time
      const map: Record<string, string> = {}
      timesData?.forEach((t) => {
        map[t.id] = t.nome
      })

      setEventos(eventosData || [])
      setTimesMap(map)
    } catch (err: any) {
      console.error('Erro ao carregar dados do bid:', err)
      setErro('Erro ao carregar os eventos.')
      setEventos([])
    } finally {
      setLoading(false)
    }
  }

  // Capitaliza a primeira letra da string
  function capitalizar(str: string) {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-green-400">📰 Boletim Informativo Diário (bid)</h1>

        {loading && (
          <p className="text-gray-400 flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              ></path>
            </svg>
            ⏳ Carregando eventos...
          </p>
        )}

        {erro && <p className="text-red-500">{erro}</p>}

        {!loading && eventos.length === 0 && (
          <p className="text-gray-400 italic">Nenhum evento encontrado no bid.</p>
        )}

        <ul className="space-y-4">
          {eventos.map((evento) => {
            const nomeTime1 = timesMap[evento.id_time1] || 'Time Desconhecido'
            const nomeTime2 = evento.id_time2 ? (timesMap[evento.id_time2] || 'Time Desconhecido') : null

            return (
              <li
                key={evento.id}
                className="bg-gray-800 rounded p-4 shadow hover:bg-gray-700 transition"
              >
                <p className="font-semibold text-lg capitalize">{capitalizar(evento.tipo_evento)}</p>
                <p className="mt-1">{evento.descricao}</p>

                {nomeTime1 && (
                  <p className="mt-1 text-sm text-gray-300">
                    🟢 Time principal: <strong>{nomeTime1}</strong>
                  </p>
                )}
                {nomeTime2 && (
                  <p className="mt-1 text-sm text-gray-300">
                    🔴 Time adversário: <strong>{nomeTime2}</strong>
                  </p>
                )}

                {evento.valor !== null && evento.valor !== undefined && (
                  <p className="mt-1 text-yellow-400 font-mono">
                    💰 {evento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                )}

                <p className="mt-2 text-xs text-gray-400">
                  📅 {new Date(evento.data_evento).toLocaleString('pt-BR')}
                </p>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}

