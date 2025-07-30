'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface LinhaClassificacao {
  id_time: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo: number
  jogos: number
}

interface TimeInfo {
  id: string
  nome: string
  logo_url?: string
  logo?: string
}

export default function ClassificacaoCopaPage() {
  const [classificacao, setClassificacao] = useState<LinhaClassificacao[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeInfo>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    calcularClassificacao()
  }, [])

  async function calcularClassificacao() {
    setLoading(true)

    const { data: times } = await supabase.from('times').select('id, nome, logo_url, logo')
    if (!times) return

    const mapaTimes: Record<string, TimeInfo> = {}
    const tabela: Record<string, LinhaClassificacao> = {}

    for (const time of times) {
      mapaTimes[time.id] = {
        id: time.id,
        nome: time.nome,
        logo_url: time.logo_url,
        logo: time.logo
      }

      tabela[time.id] = {
        id_time: time.id,
        pontos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        gols_pro: 0,
        gols_contra: 0,
        saldo: 0,
        jogos: 0
      }
    }

    setTimesMap(mapaTimes)

    const { data: jogos } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .not('gols_time1', 'is', null)
      .not('gols_time2', 'is', null)

    if (!jogos) return

    for (const jogo of jogos) {
      const { time1, time2, gols_time1, gols_time2 } = jogo

      if (!tabela[time1] || !tabela[time2]) continue

      tabela[time1].gols_pro += gols_time1
      tabela[time1].gols_contra += gols_time2
      tabela[time1].jogos += 1

      tabela[time2].gols_pro += gols_time2
      tabela[time2].gols_contra += gols_time1
      tabela[time2].jogos += 1

      if (gols_time1 > gols_time2) {
        tabela[time1].vitorias += 1
        tabela[time1].pontos += 3
        tabela[time2].derrotas += 1
      } else if (gols_time1 < gols_time2) {
        tabela[time2].vitorias += 1
        tabela[time2].pontos += 3
        tabela[time1].derrotas += 1
      } else {
        tabela[time1].empates += 1
        tabela[time2].empates += 1
        tabela[time1].pontos += 1
        tabela[time2].pontos += 1
      }

      tabela[time1].saldo = tabela[time1].gols_pro - tabela[time1].gols_contra
      tabela[time2].saldo = tabela[time2].gols_pro - tabela[time2].gols_contra

      // Premiação e BID
      const premiacao = calcularPremiacao(gols_time1, gols_time2)

      await supabase.rpc('atualizar_saldo', { id_time: time1, valor: premiacao.time1 })
      await supabase.rpc('atualizar_saldo', { id_time: time2, valor: premiacao.time2 })

      await supabase.from('bid').insert([
        {
          tipo_evento: 'premiacao',
          descricao: `Partida ${gols_time1}x${gols_time2}`,
          id_time1: time1,
          id_time2: time2,
          valor: premiacao.time1
        },
        {
          tipo_evento: 'premiacao',
          descricao: `Partida ${gols_time2}x${gols_time1}`,
          id_time1: time2,
          id_time2: time1,
          valor: premiacao.time2
        }
      ])
    }

    const classificacaoFinal = Object.values(tabela)
    setClassificacao(classificacaoFinal)
    setLoading(false)
    toast.success('Classificação e premiação atualizadas!')
  }

  function calcularPremiacao(gols1: number, gols2: number) {
    let valor1 = gols1 * 550000 - gols2 * 100000
    let valor2 = gols2 * 550000 - gols1 * 100000

    if (gols1 > gols2) {
      valor1 += 8000000
      valor2 += 2000000
    } else if (gols1 < gols2) {
      valor2 += 8000000
      valor1 += 2000000
    } else {
      valor1 += 5000000
      valor2 += 5000000
    }

    return { time1: valor1, time2: valor2 }
  }

  const classificacaoOrdenada = [...classificacao].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.saldo !== a.saldo) return b.saldo - a.saldo
    if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
    return b.vitorias - a.vitorias
  })

  return (
    <div className="bg-zinc-900 text-white min-h-screen p-4 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-center text-yellow-400 mb-6">🏆 Classificação – Fase Liga</h1>

      {loading ? (
        <p className="text-center text-gray-300">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="w-full text-sm text-left border border-zinc-700">
            <thead className="bg-zinc-800 text-gray-300">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2 text-center">J</th>
                <th className="px-3 py-2 text-center">Pts</th>
                <th className="px-3 py-2 text-center">V</th>
                <th className="px-3 py-2 text-center">E</th>
                <th className="px-3 py-2 text-center">D</th>
                <th className="px-3 py-2 text-center">GP</th>
                <th className="px-3 py-2 text-center">GC</th>
                <th className="px-3 py-2 text-center">SG</th>
              </tr>
            </thead>
            <tbody>
              {classificacaoOrdenada.map((linha, index) => {
                const posicao = index + 1
                const timeData = timesMap[linha.id_time]
                const escudo = timeData?.logo_url || timeData?.logo
                const nome = timeData?.nome || 'Desconhecido'

                const bgClass = classNames({
                  'bg-green-900': posicao >= 1 && posicao <= 16,
                  'bg-yellow-900': posicao >= 17 && posicao <= 24,
                  'bg-red-900': posicao >= 25
                })

                return (
                  <tr key={linha.id_time} className={`${bgClass} border-b border-zinc-700`}>
                    <td className="px-3 py-2 text-gray-300 font-bold">{posicao}</td>
                    <td className="px-3 py-2 flex items-center gap-2">
                      {escudo && (
                        <img src={escudo} alt={nome} width={28} height={28} className="rounded-full border" />
                      )}
                      {nome}
                    </td>
                    <td className="px-3 py-2 text-center">{linha.jogos}</td>
                    <td className="px-3 py-2 text-center font-bold text-white">{linha.pontos}</td>
                    <td className="px-3 py-2 text-center">{linha.vitorias}</td>
                    <td className="px-3 py-2 text-center">{linha.empates}</td>
                    <td className="px-3 py-2 text-center">{linha.derrotas}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_pro}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_contra}</td>
                    <td className="px-3 py-2 text-center">{linha.saldo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

