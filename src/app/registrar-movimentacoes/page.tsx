'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Jogo = {
  mandante: string
  visitante: string
  gols_mandante: number
  gols_visitante: number
}

type Rodada = {
  id: string
  numero: number
  temporada: number
  divisao: number
  jogos: Jogo[]
}

type Time = {
  id: string
  nome: string
}

export default function RegistrarMovimentacoesPage() {
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [jogosRegistrados, setJogosRegistrados] = useState<Record<string, boolean>>({})

  useEffect(() => {
    buscarRodadas()
    buscarTimes()
  }, [])

  async function buscarTimes() {
    const { data, error } = await supabase.from('times').select('id, nome')
    if (error) {
      toast.error('Erro ao buscar times')
      return
    }

    const map: Record<string, string> = {}
    data?.forEach((time: Time) => {
      map[time.id] = time.nome
    })

    setTimesMap(map)
  }

  async function buscarRodadas() {
    const { data, error } = await supabase
      .from('rodadas')
      .select('*')
      .order('numero', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar rodadas')
      return
    }

    const rodadasFiltradas = (data || [])
      .map((rodada: Rodada) => {
        const jogosConcluidos = rodada.jogos.filter(
          (jogo) =>
            jogo.gols_mandante !== null &&
            jogo.gols_mandante !== undefined &&
            jogo.gols_visitante !== null &&
            jogo.gols_visitante !== undefined
        )
        return { ...rodada, jogos: jogosConcluidos }
      })
      .filter((rodada) => rodada.jogos.length > 0)

    setRodadas(rodadasFiltradas)
    setLoading(false)
  }

  async function registrar(jogo: Jogo, rodada: Rodada, index: number) {
    const key = `${rodada.id}-${index}`
    if (jogosRegistrados[key]) {
      toast('Movimentação já registrada', { icon: '✅' })
      return
    }

    try {
      const promises = []

      const saldoMandante =
        jogo.gols_mandante > jogo.gols_visitante
          ? 1000000
          : jogo.gols_mandante === jogo.gols_visitante
          ? 500000
          : 0

      const saldoVisitante =
        jogo.gols_visitante > jogo.gols_mandante
          ? 1000000
          : jogo.gols_mandante === jogo.gols_visitante
          ? 500000
          : 0

      promises.push(
        registrarMovimentacao({
          id_time: jogo.mandante,
          tipo: 'entrada',
          descricao: `Vitória/Empate rodada ${rodada.numero}`,
          valor: saldoMandante
        }),
        registrarMovimentacao({
          id_time: jogo.visitante,
          tipo: 'entrada',
          descricao: `Vitória/Empate rodada ${rodada.numero}`,
          valor: saldoVisitante
        }),
        registrarMovimentacao({
          id_time: jogo.mandante,
          tipo: 'entrada',
          descricao: `Bônus por gols rodada ${rodada.numero}`,
          valor: jogo.gols_mandante * 200000
        }),
        registrarMovimentacao({
          id_time: jogo.visitante,
          tipo: 'entrada',
          descricao: `Bônus por gols rodada ${rodada.numero}`,
          valor: jogo.gols_visitante * 200000
        }),
        registrarMovimentacao({
          id_time: jogo.mandante,
          tipo: 'saida',
          descricao: `Pagamento de salários rodada ${rodada.numero}`,
          valor: -1000000
        }),
        registrarMovimentacao({
          id_time: jogo.visitante,
          tipo: 'saida',
          descricao: `Pagamento de salários rodada ${rodada.numero}`,
          valor: -1000000
        })
      )

      await Promise.all(promises)

      setJogosRegistrados((prev) => ({ ...prev, [key]: true }))
      toast.success(`Movimentações da rodada ${rodada.numero} registradas`)
    } catch (err) {
      toast.error('Erro ao registrar movimentações')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center text-green-400">
        💸 Registrar Movimentações
      </h1>

      {loading ? (
        <p className="text-center text-gray-400">Carregando rodadas concluídas...</p>
      ) : rodadas.length === 0 ? (
        <p className="text-center text-gray-400">Nenhuma partida concluída disponível.</p>
      ) : (
        rodadas.map((rodada) => (
          <div key={rodada.id} className="mb-8 border border-gray-600 p-4 rounded-xl bg-gray-900 shadow-lg">
            <h2 className="text-xl font-semibold mb-3 text-yellow-300">
              Rodada {rodada.numero}
            </h2>
            {rodada.jogos.map((jogo, index) => {
              const key = `${rodada.id}-${index}`
              const registrado = jogosRegistrados[key]

              return (
                <div
                  key={key}
                  className="flex justify-between items-center border-b border-gray-700 py-2 px-2 hover:bg-gray-800 transition"
                >
                  <span className="text-sm">
                    <strong>{timesMap[jogo.mandante] || 'Desconhecido'}</strong>{' '}
                    {jogo.gols_mandante} x {jogo.gols_visitante}{' '}
                    <strong>{timesMap[jogo.visitante] || 'Desconhecido'}</strong>
                  </span>
                  <button
                    className={`px-3 py-1 rounded text-sm ${
                      registrado
                        ? 'bg-gray-600 text-white cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                    disabled={registrado}
                    onClick={() => registrar(jogo, rodada, index)}
                  >
                    {registrado ? '✅ Registrado' : 'Registrar'}
                  </button>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
