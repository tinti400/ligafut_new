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
  jogos: number
  saldo_gols?: number
  divisao: number
  times: Time
}

export default function ClassificacaoPage() {
  const [classificacao, setClassificacao] = useState<ClassificacaoItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [temporadaSelecionada, setTemporadaSelecionada] = useState<number>(1)
  const [divisaoSelecionada, setDivisaoSelecionada] = useState<number | null>(1)
  const { isAdmin, loading } = useAdmin()

  const fetchDados = async (temporada: number) => {
    try {
      const res = await fetch(`/api/classificacao-liga?temporada=${temporada}`)
      if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`)
      const data = await res.json()
      setClassificacao(data)
    } catch (err: any) {
      setErro(`Erro ao buscar dados: ${err.message}`)
    }
  }

  useEffect(() => {
    fetchDados(temporadaSelecionada)
  }, [temporadaSelecionada])

  const iniciarNovaTemporada = async () => {
    if (!confirm('⚠️ Tem certeza que deseja iniciar a nova temporada?')) return
    const res = await fetch('/api/iniciar-temporada', { method: 'POST' })
    if (res.ok) {
      alert('✅ Temporada iniciada com sucesso!')
      fetchDados(temporadaSelecionada)
    } else {
      const data = await res.json()
      alert(`❌ Erro ao iniciar temporada: ${data.erro || 'Erro desconhecido'}`)
    }
  }

  const classificacaoPorDivisao: { [key: number]: ClassificacaoItem[] } = {}
  classificacao.forEach((item) => {
    const divisao = item.divisao ?? 99
    if (!classificacaoPorDivisao[divisao]) classificacaoPorDivisao[divisao] = []
    classificacaoPorDivisao[divisao].push(item)
  })

  const divisoesDisponiveis = Object.keys(classificacaoPorDivisao)
    .map(Number)
    .sort((a, b) => a - b)

  const timesDaDivisao = divisaoSelecionada
    ? (classificacaoPorDivisao[divisaoSelecionada] || []).map((item) => ({
        ...item,
        saldo_gols: item.gols_pro - item.gols_contra,
      }))
    : []

  const editarClassificacao = (item: ClassificacaoItem) => {
    if (!isAdmin) return
    alert(`📝 Editar classificação do time: ${item.times.nome}`)
  }

  if (erro) return <div className="text-red-500 p-4">{erro}</div>

  return (
    <div className="max-w-6xl mx-auto mt-10 px-4 text-white">
      <h1 className="text-3xl font-bold mb-6 text-center text-yellow-400">🏆 Classificação da Liga</h1>

      <div className="mb-4 flex gap-2 justify-center">
        {[1, 2].map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporadaSelecionada(temp)}
            className={`px-4 py-2 rounded-lg ${
              temporadaSelecionada === temp ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="mb-6 text-center">
          <button
            onClick={iniciarNovaTemporada}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            🚀 Iniciar Nova Temporada
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap justify-center gap-3">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisaoSelecionada(div)}
            className={`px-4 py-2 rounded-lg border text-sm ${
              divisaoSelecionada === div
                ? 'bg-green-600 text-white border-green-600'
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
        divisaoSelecionada &&
        timesDaDivisao.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-2xl font-semibold">
                📊 Divisão {divisaoSelecionada}
              </h2>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `📊 Classificação da Divisão ${divisaoSelecionada}:\n\n` +
                    timesDaDivisao
                      .sort((a, b) => b.pontos - a.pontos || b.saldo_gols! - a.saldo_gols!)
                      .map(
                        (item, i) =>
                          `${i + 1}º ${item.times.nome} - ${item.pontos} pts (${item.vitorias}V ${item.empates}E ${item.derrotas}D)`
                      )
                      .join('\n')
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded-lg"
              >
                📤 Compartilhar
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full bg-gray-900 rounded-lg shadow-md text-sm">
                <thead className="bg-black text-yellow-400 border-b border-gray-600">
                  <tr>
                    <th className="py-2 px-4 text-left">#</th>
                    <th className="py-2 px-4 text-left">Time</th>
                    <th className="py-2 px-4 text-center">Pts</th>
                    <th className="py-2 px-4 text-center">Aprove.</th>
                    <th className="py-2 px-4 text-center">J</th>
                    <th className="py-2 px-4 text-center">V</th>
                    <th className="py-2 px-4 text-center">E</th>
                    <th className="py-2 px-4 text-center">D</th>
                    <th className="py-2 px-4 text-center">GP</th>
                    <th className="py-2 px-4 text-center">GC</th>
                    <th className="py-2 px-4 text-center">SG</th>
                    {isAdmin && <th className="py-2 px-4 text-center">✏️</th>}
                  </tr>
                </thead>
                <tbody>
                  {timesDaDivisao
                    .sort((a, b) => b.pontos - a.pontos || b.saldo_gols! - a.saldo_gols!)
                    .map((item, index, arr) => {
                      const ultima = arr.length - 1
                      const penultima = arr.length - 2
                      const antepenultima = arr.length - 3

                      const cor =
                        index === 0
                          ? 'bg-green-700 hover:bg-green-600'
                          : index === antepenultima
                          ? 'bg-yellow-700 hover:bg-yellow-600'
                          : index === penultima || index === ultima
                          ? 'bg-red-700 hover:bg-red-600'
                          : 'hover:bg-gray-700'

                      const aproveitamento =
                        item.jogos > 0 ? Math.round((item.pontos / (item.jogos * 3)) * 100) : 0

                      const icone =
                        index === 0
                          ? '🏆'
                          : index === antepenultima
                          ? '⚠️'
                          : index === penultima || index === ultima
                          ? '❌'
                          : ''

                      return (
                        <tr key={item.id_time} className={`border-b border-gray-700 ${cor}`}>
                          <td className="py-2 px-4">{index + 1}º {icone}</td>
                          <td className="py-2 px-4 flex items-center gap-2">
                            <img
                              src={item.times.logo_url}
                              alt={item.times.nome}
                              className="w-6 h-6 rounded-full"
                            />
                            {item.times.nome}
                          </td>
                          <td className="py-2 px-4 text-center">{item.pontos}</td>
                          <td className="py-2 px-4 text-center">{aproveitamento}%</td>
                          <td className="py-2 px-4 text-center">{item.jogos}</td>
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
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
