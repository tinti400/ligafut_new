'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, { nome: string, logo_url: string }>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  useEffect(() => {
    buscarJogos()
    buscarTimes()
  }, [])

  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .order('rodada', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
    } else {
      setJogos(data || [])
    }

    setLoading(false)
  }

  async function buscarTimes() {
    const { data } = await supabase.from('times').select('id, nome, logo_url')
    if (data) {
      const map: Record<string, { nome: string, logo_url: string }> = {}
      data.forEach((t) => {
        map[t.id] = { nome: t.nome, logo_url: t.logo_url }
      })
      setTimesMap(map)
    }
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) {
      toast.error('Erro ao atualizar classificação!')
    }
  }

  async function pagarPremiacao(id_time: string, valor: number, descricao: string) {
    const { error: erroSaldo } = await supabase.rpc('atualizar_saldo', {
      p_id_time: id_time,
      p_valor: valor
    })
    if (erroSaldo) {
      console.error('Erro ao atualizar saldo via RPC:', erroSaldo)
      toast.error('Erro ao atualizar saldo do time')
    }

    await registrarMovimentacao({
      id_time,
      tipo: 'entrada',
      valor,
      descricao
    })
  }

  async function salvarPlacar(jogo: any) {
    setSalvandoId(jogo.id)

    const { error } = await supabase
      .from('copa_fase_liga')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar placar!')
    } else {
      await atualizarClassificacao()

      const time1Id = jogo.time1
      const time2Id = jogo.time2
      const g1 = jogo.gols_time1
      const g2 = jogo.gols_time2

      const premioGol = 550000
      const penalidadeGolSofrido = 100000

      const premioGols1 = g1 * premioGol
      const premioGols2 = g2 * premioGol
      const descontoSofrido1 = g2 * penalidadeGolSofrido
      const descontoSofrido2 = g1 * penalidadeGolSofrido

      let bonus1 = 0
      let bonus2 = 0

      if (g1 > g2) {
        bonus1 = 8000000
        bonus2 = 2000000
      } else if (g2 > g1) {
        bonus1 = 2000000
        bonus2 = 8000000
      } else {
        bonus1 = 5000000
        bonus2 = 5000000
      }

      const total1 = bonus1 + premioGols1 - descontoSofrido1
      const total2 = bonus2 + premioGols2 - descontoSofrido2

      await pagarPremiacao(time1Id, total1, `Premiação por jogo: ${g1}x${g2}`)
      await pagarPremiacao(time2Id, total2, `Premiação por jogo: ${g2}x${g1}`)

      await supabase.from('bid').insert([
        {
          tipo_evento: 'Jogo',
          descricao: `${timesMap[time1Id]?.nome ?? 'Time 1'} ${g1}x${g2} ${timesMap[time2Id]?.nome ?? 'Time 2'} — ${total1.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} x ${total2.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          id_time1: time1Id,
          id_time2: time2Id,
          valor: null
        }
      ])

      toast.success('✅ Placar, premiação e BID salvos com sucesso!')
    }

    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: any) {
    setSalvandoId(jogo.id)

    const { error } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: null, gols_time2: null })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao excluir resultado!')
    } else {
      await atualizarClassificacao()
      toast.success('🗑️ Resultado excluído com sucesso!')
    }

    setSalvandoId(null)
    buscarJogos()
  }

  const jogosFiltrados = jogos.filter((jogo) =>
    filtroTime === 'Todos' || timesMap[jogo.time1]?.nome === filtroTime || timesMap[jogo.time2]?.nome === filtroTime
  )

  const jogosPorRodada: Record<number, any[]> = {}
  jogosFiltrados.forEach((jogo) => {
    if (!jogosPorRodada[jogo.rodada]) {
      jogosPorRodada[jogo.rodada] = []
    }
    jogosPorRodada[jogo.rodada].push(jogo)
  })

  const nomesDosTimes = Object.values(timesMap).map((t) => t.nome).sort()

  return (
    <div className="p-4 max-w-5xl mx-auto bg-zinc-900 min-h-screen text-white">
      <h1 className="text-3xl font-extrabold mb-6 text-center text-yellow-400">
        🏆 Administração – Fase Liga
      </h1>

      <div className="mb-6 text-center">
        <label className="mr-2">Filtrar por time:</label>
        <select
          value={filtroTime}
          onChange={(e) => setFiltroTime(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 text-white rounded px-2 py-1"
        >
          <option value="Todos">Todos</option>
          {nomesDosTimes.map((nome) => (
            <option key={nome} value={nome}>{nome}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-300">🔄 Carregando jogos...</div>
      ) : (
        Object.entries(jogosPorRodada).map(([rodada, jogos]) => (
          <div key={rodada} className="mb-8">
            <h2 className="text-xl font-bold mb-3 text-green-400">📅 Rodada {rodada}</h2>
            <div className="space-y-3">
              {jogos.map((jogo) => (
                <div
                  key={jogo.id}
                  className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-zinc-800 p-4 rounded-lg shadow border border-zinc-700"
                >
                  <div className="flex items-center gap-2 w-40">
                    <img
                      src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                      alt={timesMap[jogo.time1]?.nome || ''}
                      className="w-8 h-8 rounded-full border object-cover bg-white"
                    />
                    <span className="font-semibold text-white">{timesMap[jogo.time1]?.nome || jogo.time1}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      className="w-14 border rounded text-center bg-zinc-900 text-white border-zinc-600"
                      placeholder="0"
                      value={jogo.gols_time1 ?? ''}
                      onChange={(e) => {
                        const valor = parseInt(e.target.value || '0')
                        setJogos((prev) =>
                          prev.map((j) =>
                            j.id === jogo.id ? { ...j, gols_time1: valor } : j
                          )
                        )
                      }}
                      disabled={!isAdmin}
                    />
                    <span className="font-bold text-white">x</span>
                    <input
                      type="number"
                      className="w-14 border rounded text-center bg-zinc-900 text-white border-zinc-600"
                      placeholder="0"
                      value={jogo.gols_time2 ?? ''}
                      onChange={(e) => {
                        const valor = parseInt(e.target.value || '0')
                        setJogos((prev) =>
                          prev.map((j) =>
                            j.id === jogo.id ? { ...j, gols_time2: valor } : j
                          )
                        )
                      }}
                      disabled={!isAdmin}
                    />
                  </div>

                  <div className="flex items-center gap-2 w-40 justify-end">
                    <span className="font-semibold text-white">{timesMap[jogo.time2]?.nome || jogo.time2}</span>
                    <img
                      src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                      alt={timesMap[jogo.time2]?.nome || ''}
                      className="w-8 h-8 rounded-full border object-cover bg-white"
                    />
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                        onClick={() => salvarPlacar(jogo)}
                        disabled={salvandoId === jogo.id}
                      >
                        {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded disabled:opacity-50"
                        onClick={() => excluirPlacar(jogo)}
                        disabled={salvandoId === jogo.id}
                      >
                        {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
