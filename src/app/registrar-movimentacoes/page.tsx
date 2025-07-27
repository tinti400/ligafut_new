'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Jogo {
  mandante: string
  visitante: string
  gols_mandante: number
  gols_visitante: number
}

interface Rodada {
  id: string
  numero: number
  jogos: Jogo[]
}

interface Time {
  id: string
  nome: string
}

export default function RegistrarMovimentacoesPage() {
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [status, setStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    buscarRodadas()
    buscarTimes()
  }, [])

  async function buscarRodadas() {
    const { data, error } = await supabase
      .from('rodadas')
      .select('*')
      .order('numero', { ascending: true })

    if (error) {
      console.error('Erro ao buscar rodadas:', error)
      return
    }

    setRodadas(data || [])
  }

  async function buscarTimes() {
    const { data, error } = await supabase.from('times').select('id, nome')
    if (error) {
      console.error('Erro ao buscar times:', error)
      return
    }

    const mapa: Record<string, Time> = {}
    data?.forEach((time) => {
      mapa[time.id] = time
    })

    setTimesMap(mapa)
  }

  async function registrar(jogo: Jogo, rodada: Rodada) {
    const promises = []

    const mandante = timesMap[jogo.mandante]
    const visitante = timesMap[jogo.visitante]

    if (!mandante || !visitante) return

    const vitoriaMandante = jogo.gols_mandante > jogo.gols_visitante
    const vitoriaVisitante = jogo.gols_visitante > jogo.gols_mandante
    const empate = jogo.gols_mandante === jogo.gols_visitante

    const salario = -5_000_000
    const bonusVitoria = 3_000_000
    const bonusGol = 1_000_000
    const penalidadeGolSofrido = -500_000

    // Mandante
    promises.push(
      registrarMovimentacao({
        id_time: jogo.mandante,
        tipo: 'saida',
        descricao: `Pagamento de salários - Rodada ${rodada.numero}`,
        valor: salario
      })
    )

    promises.push(
      registrarMovimentacao({
        id_time: jogo.mandante,
        tipo: 'entrada',
        descricao: `Bônus por gols marcados - Rodada ${rodada.numero}`,
        valor: jogo.gols_mandante * bonusGol
      })
    )

    promises.push(
      registrarMovimentacao({
        id_time: jogo.mandante,
        tipo: 'saida',
        descricao: `Penalidade por gols sofridos - Rodada ${rodada.numero}`,
        valor: jogo.gols_visitante * penalidadeGolSofrido
      })
    )

    if (vitoriaMandante) {
      promises.push(
        registrarMovimentacao({
          id_time: jogo.mandante,
          tipo: 'entrada',
          descricao: `Bônus por vitória - Rodada ${rodada.numero}`,
          valor: bonusVitoria
        })
      )
    }

    // Visitante
    promises.push(
      registrarMovimentacao({
        id_time: jogo.visitante,
        tipo: 'saida',
        descricao: `Pagamento de salários - Rodada ${rodada.numero}`,
        valor: salario
      })
    )

    promises.push(
      registrarMovimentacao({
        id_time: jogo.visitante,
        tipo: 'entrada',
        descricao: `Bônus por gols marcados - Rodada ${rodada.numero}`,
        valor: jogo.gols_visitante * bonusGol
      })
    )

    promises.push(
      registrarMovimentacao({
        id_time: jogo.visitante,
        tipo: 'saida',
        descricao: `Penalidade por gols sofridos - Rodada ${rodada.numero}`,
        valor: jogo.gols_mandante * penalidadeGolSofrido
      })
    )

    if (vitoriaVisitante) {
      promises.push(
        registrarMovimentacao({
          id_time: jogo.visitante,
          tipo: 'entrada',
          descricao: `Bônus por vitória - Rodada ${rodada.numero}`,
          valor: bonusVitoria
        })
      )
    }

    await Promise.all(promises)

    const jogoId = `${rodada.numero}-${jogo.mandante}-${jogo.visitante}`
    setStatus((prev) => ({ ...prev, [jogoId]: true }))
  }

  return (
    <div className="p-4 max-w-4xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4 text-center">
        Registrar Movimentações por Jogo
      </h1>

      {rodadas.map((rodada) => (
        <div key={rodada.id} className="mb-6 bg-zinc-800 rounded-xl p-4 shadow">
          <h2 className="text-xl font-semibold mb-2">
            Rodada {rodada.numero}
          </h2>

          {rodada.jogos.map((jogo, index) => {
            const jogoId = `${rodada.numero}-${jogo.mandante}-${jogo.visitante}`
            const jaRegistrado = status[jogoId]

            return (
              <div
                key={index}
                className="flex items-center justify-between bg-zinc-700 p-3 rounded-lg mb-2"
              >
                <span>
                  <strong>{timesMap[jogo.mandante]?.nome || 'Mandante'}</strong>{' '}
                  {jogo.gols_mandante} x {jogo.gols_visitante}{' '}
                  <strong>{timesMap[jogo.visitante]?.nome || 'Visitante'}</strong>
                </span>

                {jaRegistrado ? (
                  <span className="text-green-400 font-semibold">✅ Registrado</span>
                ) : (
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                    onClick={() => registrar(jogo, rodada)}
                  >
                    Registrar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
