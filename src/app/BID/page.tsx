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
      const { data: eventosData, error: errorEventos } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .limit(50)

      if (errorEventos) throw errorEventos

      const { data: timesData, error: errorTimes } = await supabase
        .from('times')
        .select('id, nome')

      if (errorTimes) throw errorTimes

      const map: Record<string, string> = {}
      timesData?.forEach((t) => (map[t.id] = t.nome))

      setEventos(eventosData || [])
      setTimesMap(map)
    } catch (err: any) {
      setErro('Erro ao carregar os eventos.')
      setEventos([])
    } finally {
      setLoading(false)
    }
  }

  function capitalizar(str: string) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
  }

  function calcularEstrelas(valor: number | null | undefined): number {
    if (!valor || valor <= 0) return 0
    const estrelas = Math.ceil(valor / 50_000_000)
    return Math.min(estrelas, 10)
  }

  function renderEstrelas(qtd: number) {
    const total = 10
    return '★'.repeat(qtd) + '☆'.repeat(total - qtd)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center text-green-400">
          📰 BID — Boletim Informativo Diário
        </h1>

        {loading && (
          <p className="text-gray-400 flex items-center gap-2 justify-center">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            ⏳ Carregando eventos...
          </p>
        )}

        {erro && <p className="text-red-500 text-center">{erro}</p>}

        {!loading && eventos.length === 0 && (
          <p className="text-gray-400 italic text-center">Nenhum evento encontrado no BID.</p>
        )}

        <div className="space-y-4">
          {eventos.map((evento) => {
            const nomeTime1 = timesMap[evento.id_time1] || 'Time Desconhecido'
            const nomeTime2 = evento.id_time2 ? timesMap[evento.id_time2] || 'Time Desconhecido' : null

            return (
              <div
                key={evento.id}
                className="bg-gray-800 rounded-xl p-4 shadow hover:bg-gray-700 transition border border-gray-700"
              >
                <div className="flex justify-between items-center">
                  <p className="font-bold text-lg capitalize text-green-400">{capitalizar(evento.tipo_evento)}</p>
                  <span className="text-xs text-gray-400">
                    📅 {new Date(evento.data_evento).toLocaleDateString('pt-BR')} —{' '}
                    {new Date(evento.data_evento).toLocaleTimeString('pt-BR')}
                  </span>
                </div>

                <p className="mt-2 text-gray-100">{evento.descricao}</p>

                <div className="mt-3 text-sm text-gray-300 space-y-1">
                  <p>🟢 Time principal: <strong>{nomeTime1}</strong></p>
                  {nomeTime2 && <p>🔴 Time adversário: <strong>{nomeTime2}</strong></p>}
                  {evento.valor !== null && evento.valor !== undefined && (
                    <div className="space-y-1">
                      <p className="text-yellow-400 font-semibold">
                        💰 {evento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-sm text-white">
                        ⭐ Classificação:{' '}
                        <span className="text-green-300 font-bold">
                          {renderEstrelas(calcularEstrelas(evento.valor))}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
