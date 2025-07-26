'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, { logo_url: string }>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  useEffect(() => {
    buscarJogos()
    buscarLogos()
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

  async function buscarLogos() {
    const { data } = await supabase.from('times').select('nome, logo_url')
    if (data) {
      const map: Record<string, { logo_url: string }> = {}
      data.forEach((t) => {
        map[t.nome] = { logo_url: t.logo_url }
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
      toast.success('✅ Placar salvo com sucesso!')
    }

    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: any) {
    setSalvandoId(jogo.id)

    const { error } = await supabase
      .from('copa_fase_liga')
      .update({
        gols_time1: null,
        gols_time2: null,
      })
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
    filtroTime === 'Todos' || jogo.time1 === filtroTime || jogo.time2 === filtroTime
  )

  const jogosPorRodada: Record<number, any[]> = {}
  jogosFiltrados.forEach((jogo) => {
    if (!jogosPorRodada[jogo.rodada]) {
      jogosPorRodada[jogo.rodada] = []
    }
    jogosPorRodada[jogo.rodada].push(jogo)
  })

  const nomesDosTimes = Array.from(
    new Set(jogos.map((j) => j.time1).concat(jogos.map((j) => j.time2)))
  ).sort()

  return (
    <div className="p-4 max-w-5xl mx-auto bg-zinc-900 min-h-screen text-white">
      <h1 className="text-3xl font-extrabold mb-6 text-center text-yellow-400">
        🏆 Administração – Fase Liga
      </h1>

      {/* Filtro por time */}
      <div className="mb-6 text-center">
        <label className="mr-2">Filtrar por time:</label>
        <select
          value={filtroTime}
          onChange={(e) => setFiltroTime(e.target.value)}
          className="bg-zinc-800 border border-zinc-600 text-white rounded px-2 py-1"
        >
          <option value="Todos">Todos</option>
          {nomesDosTimes.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
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
                  {/* Time 1 */}
                  <div className="flex items-center gap-2 w-40">
                    <img
                      src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                      alt={jogo.time1}
                      className="w-8 h-8 rounded-full border object-cover bg-white"
                    />
                    <span className="font-semibold text-white">{jogo.time1}</span>
                  </div>

                  {/* Placar */}
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

                  {/* Time 2 */}
                  <div className="flex items-center gap-2 w-40 justify-end">
                    <span className="font-semibold text-white">{jogo.time2}</span>
                    <img
                      src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                      alt={jogo.time2}
                      className="w-8 h-8 rounded-full border object-cover bg-white"
                    />
                  </div>

                  {/* Botões (visíveis apenas para admin) */}
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
