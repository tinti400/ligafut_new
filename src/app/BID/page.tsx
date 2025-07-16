'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface EventoBID {
  id: string
  tipo_evento: string
  descricao: string
  id_time1: string
  id_time2?: string | null
  valor?: number | null
  data_evento: string
}

export default function BIDPage() {
  const [eventos, setEventos] = useState<EventoBID[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    buscarEventos()
  }, [])

  async function buscarEventos() {
    setLoading(true)
    setErro(null)

    const { data, error } = await supabase
      .from('bid')
      .select('*')
      .order('data_evento', { ascending: false })
      .limit(50) // busca os 50 eventos mais recentes

    if (error) {
      console.error('Erro ao buscar BID:', error)
      setErro('Erro ao carregar os eventos.')
      setEventos([])
    } else {
      setEventos(data || [])
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-green-400">📰 Boletim Informativo Diário (BID)</h1>

        {loading && <p className="text-gray-400">⏳ Carregando eventos...</p>}
        {erro && <p className="text-red-500">{erro}</p>}

        {!loading && eventos.length === 0 && (
          <p className="text-gray-400 italic">Nenhum evento encontrado no BID.</p>
        )}

        <ul className="space-y-4">
          {eventos.map((evento) => (
            <li
              key={evento.id}
              className="bg-gray-800 rounded p-4 shadow hover:bg-gray-700 transition"
            >
              <p className="font-semibold text-lg capitalize">{evento.tipo_evento}</p>
              <p className="mt-1">{evento.descricao}</p>
              {evento.valor !== null && evento.valor !== undefined && (
                <p className="mt-1 text-yellow-400 font-mono">💰 R$ {Number(evento.valor).toLocaleString()}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                📅 {new Date(evento.data_evento).toLocaleString('pt-BR')}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
