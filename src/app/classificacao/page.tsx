'use client'

import { useEffect, useState } from 'react'
import { useAdmin } from '@/hooks/useAdmin'

interface Time {
  nome: string
  logo_url: string
}

interface ClassificacaoItem {
  id_time: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo_gols?: number
  divisao: number
  temporada: number
  times: Time
}

export default function ClassificacaoPage() {
  const [classificacao, setClassificacao] = useState<ClassificacaoItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [divisaoSelecionada, setDivisaoSelecionada] = useState<number | null>(1)
  const [temporadaSelecionada, setTemporadaSelecionada] = useState<number | null>(null)
  const { isAdmin, loading } = useAdmin()

  useEffect(() => {
    const fetchDados = async () => {
      try {
        const res = await fetch('/api/classificacao')
        if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`)
        const data = await res.json()
        setClassificacao(data)
      } catch (err: any) {
        setErro(`Erro ao buscar dados: ${err.message}`)
      }
    }
    fetchDados()
  }, [])

  const classificacaoFiltrada = classificacao.map((item) => ({
    ...item,
    saldo_gols: item.gols_pro - item.gols_contra,
  }))

  const divisoesDisponiveis = Array.from(new Set(classificacaoFiltrada.map((item) => item.divisao))).sort((a, b) => a - b)
  const temporadasDisponiveis = Array.from(new Set(classificacaoFiltrada.map((item) => item.temporada))).sort((a, b) => a - b)

  useEffect(() => {
    if (temporadasDisponiveis.length > 0 && temporadaSelecionada === null) {
      setTemporadaSelecionada(temporadasDisponiveis[temporadasDisponiveis.length - 1])
    }
  }, [temporadasDisponiveis])

  const timesFiltrados = classificacaoFiltrada.filter(
    (item) => item.divisao === divisaoSelecionada && item.temporada === temporadaSelecionada
  )

  const editarClassificacao = (item: ClassificacaoItem) => {
    if (!isAdmin) return
    alert(`📝 Editar classificação do time: ${item.times.nome}`)
  }

  if (erro) return <div className="text-red-500 p-4">{erro}</div>

  return (
    <div className="max-w-6xl mx-auto mt-10 px-4 text-white">
      <h1 className="text-3xl font-bold mb-6">🏆 Classificação</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporadaSelecionada(temp)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              temporadaSelecionada === temp
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisaoSelecionada(div)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              divisaoSelecionada === div
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-800 text-gray-300 border-gray-600 hover:bg-gray-700'
            }`}
          >
            Divisão {div}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400">Verificando permissões...</p>
      ) : (
        temporadaSelecionada &&
        divisaoSelecionada &&
        timesFiltrados.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">
              Divisão {divisaoSelecionada} - Temporada {temporadaSelecionada}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-800 rounded-lg shadow-md text-sm">
                <thead className="bg-gray-700 text-gray-300">
                  <tr>
                    <th className="py-2 px-4 text-left">Posição</th>
                    <th className="py-2 px-4 text-left">Time</th>
                    <th className="py-2 px-4 text-center">Pts</th>
                    <th className="py-2 px-4 text-center">VIT</th>
                    <th className="py-2 px-4 text-center">E</th>
                    <th className="py-2 px-4 text-center">DER</th>
                    <th className="py-2 px-4 text-center">GP</th>
                    <th className="py-2 px-4 text-center">GC</th>
                    <th className="py-2 px-4 text-center">SG</th>
                    {isAdmin && <th className="py-2 px-4 text-center">Editar</th>}
                  </tr>
                </thead>
                <tbody>
                  {timesFiltrados
                    .sort((a, b) => b.pontos - a.pontos || b.saldo_gols! - a.saldo_gols!)
                    .map((item, index) => (
                      <tr key={item.id_time} className="border-b border-gray-700 hover:bg-gray-700">
                        <td className="py-2 px-4">{index + 1}º</td>
                        <td className="py-2 px-4 flex items-center gap-2">
                          <img src={item.times.logo_url} alt={item.times.nome} className="w-6 h-6" />
                          {item.times.nome}
                        </td>
                        <td className="py-2 px-4 text-center">{item.pontos}</td>
                        <td className="py-2 px-4 text-center">{item.vitorias}</td>
                        <td className="py-2 px-4 text-center">{item.empates}</td>
                        <td className="py-2 px-4 text-center">{item.derrotas}</td>
                        <td className="py-2 px-4 text-center">{item.gols_pro}</td>
                        <td className="py-2 px-4 text-center">{item.gols_contra}</td>
                        <td className="py-2 px-4 text-center">{item.saldo_gols}</td>
                        {isAdmin && (
                          <td className="py-2 px-4 text-center">
                            <button
                              onClick={() => editarClassificacao(item)}
                              className="text-yellow-400 hover:text-yellow-500 text-xs"
                            >
                              ✏️
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
