'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from './registrarMovimentacao'
import Loading from '@/components/Loading'

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
  salario?: number
}

export default function RegistrarMovimentacoesPage() {
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [loading, setLoading] = useState(true)
  const [statusRegistro, setStatusRegistro] = useState<Record<string, boolean>>({})

  useEffect(() => {
    carregarRodadas()
    carregarTimes()
  }, [])

  async function carregarRodadas() {
    const { data, error } = await supabase
      .from('rodadas')
      .select('id, numero, jogos')
      .order('numero', { ascending: true })

    if (data) setRodadas(data)
  }

  async function carregarTimes() {
    const { data } = await supabase.from('times').select('id, nome, salario')
    if (data) {
      const map: Record<string, Time> = {}
      data.forEach((t) => (map[t.id] = t))
      setTimesMap(map)
      setLoading(false)
    }
  }

  async function registrarPorJogo(jogo: Jogo, rodada: number) {
    const mandante = timesMap[jogo.mandante]
    const visitante = timesMap[jogo.visitante]
    if (!mandante || !visitante) return

    const hoje = new Date().toISOString()

    // Salários
    await registrarMovimentacao({
      id_time: mandante.id,
      tipo: 'saida',
      descricao: 'Pagamento de salário',
      valor: -(mandante.salario || 0),
      data: hoje
    })

    await registrarMovimentacao({
      id_time: visitante.id,
      tipo: 'saida',
      descricao: 'Pagamento de salário',
      valor: -(visitante.salario || 0),
      data: hoje
    })

    // Bônus por gols
    if (jogo.gols_mandante > 0) {
      await registrarMovimentacao({
        id_time: mandante.id,
        tipo: 'entrada',
        descricao: `Bônus de gols (${jogo.gols_mandante})`,
        valor: 500_000 * jogo.gols_mandante,
        data: hoje
      })
    }

    if (jogo.gols_visitante > 0) {
      await registrarMovimentacao({
        id_time: visitante.id,
        tipo: 'entrada',
        descricao: `Bônus de gols (${jogo.gols_visitante})`,
        valor: 500_000 * jogo.gols_visitante,
        data: hoje
      })
    }

    // Premiação por vitória
    if (jogo.gols_mandante > jogo.gols_visitante) {
      await registrarMovimentacao({
        id_time: mandante.id,
        tipo: 'entrada',
        descricao: 'Premiação por vitória',
        valor: 2_000_000,
        data: hoje
      })
    } else if (jogo.gols_visitante > jogo.gols_mandante) {
      await registrarMovimentacao({
        id_time: visitante.id,
        tipo: 'entrada',
        descricao: 'Premiação por vitória',
        valor: 2_000_000,
        data: hoje
      })
    }

    const chave = `${rodada}-${mandante.id}-${visitante.id}`
    setStatusRegistro((prev) => ({ ...prev, [chave]: true }))
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <h1 className="text-2xl font-bold mb-6 text-center">📄 Registrar Movimentações por Jogo</h1>

      {rodadas.map((rodada) => (
        <div key={rodada.id} className="mb-8 border border-zinc-700 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Rodada {rodada.numero}</h2>
          {rodada.jogos.map((jogo, index) => {
            const nomeMandante = timesMap[jogo.mandante]?.nome || 'Desconhecido'
            const nomeVisitante = timesMap[jogo.visitante]?.nome || 'Desconhecido'
            const chave = `${rodada.numero}-${jogo.mandante}-${jogo.visitante}`
            const jaRegistrado = statusRegistro[chave]

            return (
              <div key={index} className="flex items-center justify-between mb-3 bg-zinc-800 p-3 rounded">
                <span>
                  ⚽ {nomeMandante} {jogo.gols_mandante} x {jogo.gols_visitante} {nomeVisitante}
                </span>
                <button
                  onClick={() => registrarPorJogo(jogo, rodada.numero)}
                  disabled={jaRegistrado}
                  className={`px-3 py-1 rounded ${
                    jaRegistrado ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {jaRegistrado ? '✅ Registrado' : 'Registrar Movimentações'}
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
