'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Jogo = {
  mandante: string
  visitante: string
  gols_mandante?: number
  gols_visitante?: number
  renda?: number
  publico?: number
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
  logo_url: string
}

export default function Jogos() {
  const { isAdmin, loading } = useAdmin()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [temporada, setTemporada] = useState(1)
  const [divisao, setDivisao] = useState(1)
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  const [editandoRodada, setEditandoRodada] = useState<string | null>(null)
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null)
  const [golsMandante, setGolsMandante] = useState<number>(0)
  const [golsVisitante, setGolsVisitante] = useState<number>(0)
  const [isSalvando, setIsSalvando] = useState(false)

  const temporadasDisponiveis = [1, 2]
  const divisoesDisponiveis = [1, 2, 3]

  const carregarDados = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url')
    const map: Record<string, Time> = {}
    times?.forEach((t) => {
      map[t.id] = { ...t, logo_url: t.logo_url || '' }
    })
    setTimesMap(map)

    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true })

    setRodadas((rodadasData || []) as Rodada[])
  }

  useEffect(() => {
    carregarDados()
  }, [temporada, divisao])

  const salvarResultado = async () => {
    if (isSalvando || editandoRodada === null || editandoIndex === null) return

    const confirmar = confirm('Deseja salvar o resultado e calcular a renda?')
    if (!confirmar) return

    setIsSalvando(true)

    const rodada = rodadas.find((r) => r.id === editandoRodada)
    if (!rodada) return

    const novaLista = [...rodada.jogos]

    // Calcular renda e público
    const publico = Math.floor(Math.random() * 30000) + 10000
    const precoMedio = 80
    const renda = publico * precoMedio
    const mandanteId = novaLista[editandoIndex].mandante
    const visitanteId = novaLista[editandoIndex].visitante

    // Atualizar saldo (função RPC no Supabase)
    await supabase.rpc('atualizar_saldo', {
      id_time: mandanteId,
      valor: renda * 0.95
    })
    await supabase.rpc('atualizar_saldo', {
      id_time: visitanteId,
      valor: renda * 0.05
    })

    novaLista[editandoIndex] = {
      ...novaLista[editandoIndex],
      gols_mandante: golsMandante,
      gols_visitante: golsVisitante,
      renda,
      publico
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodada.id)
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await carregarDados()

    const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
    const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

    toast.success(
      `🎟️ Público: ${publico.toLocaleString()} | 💰 Renda: R$ ${renda.toLocaleString()} 
💵 ${mandanteNome}: R$ ${(renda * 0.95).toLocaleString()}
💵 ${visitanteNome}: R$ ${(renda * 0.05).toLocaleString()}`,
      { duration: 8000 }
    )

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)
  }

  const excluirResultado = async (rodadaId: string, index: number) => {
    if (!confirm('Deseja excluir o resultado deste jogo?')) return

    const rodada = rodadas.find((r) => r.id === rodadaId)
    if (!rodada) return

    const novaLista = [...rodada.jogos]
    novaLista[index] = {
      ...novaLista[index],
      gols_mandante: undefined,
      gols_visitante: undefined,
      renda: undefined,
      publico: undefined
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await carregarDados()
  }

  const rodadasFiltradas = !timeSelecionado
    ? rodadas
    : rodadas
        .map((rodada) => ({
          ...rodada,
          jogos: rodada.jogos.filter(
            (jogo) => jogo.mandante === timeSelecionado || jogo.visitante === timeSelecionado
          )
        }))
        .filter((rodada) => rodada.jogos.length > 0)

  if (loading) return <p className="text-center text-white">🔄 Verificando permissões...</p>

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-white">📅 Jogos da LigaFut</h1>

      <div className="flex gap-2 mb-4">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporada(temp)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              temporada === temp ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisao(div)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              divisao === div ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Divisão {div}
          </button>
        ))}
      </div>

      <select
        className="mb-6 p-2 bg-zinc-800 text-white rounded-lg"
        onChange={(e) => setTimeSelecionado(e.target.value)}
        value={timeSelecionado}
      >
        <option value="">Todos os times</option>
        {Object.values(timesMap).map((time) => (
          <option key={time.id} value={time.id}>
            {time.nome}
          </option>
        ))}
      </select>

      {rodadasFiltradas.map((rodada) => (
        <div key={rodada.id} className="bg-zinc-800 rounded-xl p-4 mb-6 shadow-md">
          <h2 className="text-xl font-semibold text-white mb-3">🏁 Rodada {rodada.numero}</h2>

          <div className="space-y-2">
            {rodada.jogos.map((jogo, index) => {
              const mandante = timesMap[jogo.mandante]
              const visitante = timesMap[jogo.visitante]
              const estaEditando = editandoRodada === rodada.id && editandoIndex === index

              return (
                <div
                  key={index}
                  className="bg-zinc-700 text-white px-4 py-2 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center w-1/3 justify-end gap-2">
                      {mandante?.logo_url && (
                        <img src={mandante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                      )}
                      <span className="font-medium text-right">{mandante?.nome || '???'}</span>
                    </div>

                    <div className="w-1/3 text-center text-zinc-300 font-bold">
                      {estaEditando ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={golsMandante}
                            onChange={(e) => setGolsMandante(Number(e.target.value))}
                            className="w-10 text-black text-center rounded"
                          />
                          <span>x</span>
                          <input
                            type="number"
                            value={golsVisitante}
                            onChange={(e) => setGolsVisitante(Number(e.target.value))}
                            className="w-10 text-black text-center rounded"
                          />
                        </div>
                      ) : jogo.gols_mandante !== undefined && jogo.gols_visitante !== undefined ? (
                        `${jogo.gols_mandante} x ${jogo.gols_visitante}`
                      ) : (
                        '🆚'
                      )}
                    </div>

                    <div className="flex items-center w-1/3 justify-start gap-2">
                      <span className="font-medium text-left">{visitante?.nome || '???'}</span>
                      {visitante?.logo_url && (
                        <img src={visitante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                      )}

                      {isAdmin && !estaEditando && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditandoRodada(rodada.id)
                              setEditandoIndex(index)
                              setGolsMandante(jogo.gols_mandante ?? 0)
                              setGolsVisitante(jogo.gols_visitante ?? 0)
                            }}
                            className="text-sm text-yellow-300"
                          >
                            📝
                          </button>
                          {jogo.gols_mandante !== undefined && jogo.gols_visitante !== undefined && (
                            <button
                              onClick={() => excluirResultado(rodada.id, index)}
                              className="text-sm text-red-400"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}

                      {isAdmin && estaEditando && (
                        <div className="flex gap-2">
                          <button
                            onClick={salvarResultado}
                            disabled={isSalvando}
                            className="text-sm text-green-400 font-semibold"
                          >
                            💾
                          </button>
                          <button
                            onClick={() => {
                              setEditandoRodada(null)
                              setEditandoIndex(null)
                            }}
                            className="text-sm text-red-400 font-semibold"
                          >
                            ❌
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Renda e público exibidos abaixo do mandante */}
                  {jogo.renda && jogo.publico && (
                    <div className="text-sm text-zinc-400 text-right mt-1 mr-10">
                      🎟️ Público: {jogo.publico.toLocaleString()} | 💰 Renda: R$ {jogo.renda.toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
