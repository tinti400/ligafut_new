'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type Row = {
  posicao: number
  time_id: string
  nome_time: string
  pontos: number
  jogos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo_gols: number
  logo?: string | null
}

const TODOS_OS_TIMES_FIXOS = [
  { nome_time: 'Cruzeiro' },
  { nome_time: 'Atletico-MG' },
  { nome_time: 'Palmeiras' },
  { nome_time: 'Corinthians' },
  { nome_time: 'Vasco' },
  { nome_time: 'Botafogo' },
]

export default function ClassificacaoPage() {
  const params = useParams()
  const competicaoId = params?.competicaoId as string

  const [dados, setDados] = useState<Row[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregarClassificacao() {
    try {
      if (!competicaoId || competicaoId === 'undefined') {
        throw new Error('ID da competição não encontrado na URL.')
      }

      setCarregando(true)
      setErro(null)

      const res = await fetch(`/api/ligafut/classificacao/${competicaoId}`, {
        cache: 'no-store',
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao carregar classificação')
      }

      setDados(json.classificacao || [])
    } catch (e: any) {
      setErro(e?.message || 'Erro inesperado')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (competicaoId) {
      carregarClassificacao()
    }
  }, [competicaoId])

  const dadosCompletos = useMemo(() => {
    const mapa = new Map(
      dados.map((item) => [item.nome_time.toLowerCase(), item])
    )

    const completos = TODOS_OS_TIMES_FIXOS.map((timeBase) => {
      const existente = mapa.get(timeBase.nome_time.toLowerCase())

      return (
        existente || {
          posicao: 999,
          time_id: `placeholder-${timeBase.nome_time}`,
          nome_time: timeBase.nome_time,
          pontos: 0,
          jogos: 0,
          vitorias: 0,
          empates: 0,
          derrotas: 0,
          gols_pro: 0,
          gols_contra: 0,
          saldo_gols: 0,
          logo: null,
        }
      )
    })

    completos.sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.saldo_gols !== a.saldo_gols) return b.saldo_gols - a.saldo_gols
      if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
      return a.nome_time.localeCompare(b.nome_time)
    })

    return completos.map((item, index) => ({
      ...item,
      posicao: index + 1,
    }))
  }, [dados])

  const lider = dadosCompletos[0]
  const melhorAtaque = [...dadosCompletos].sort((a, b) => b.gols_pro - a.gols_pro)[0]
  const melhorDefesa = [...dadosCompletos].sort((a, b) => a.gols_contra - b.gols_contra)[0]
  const totalJogosFinalizados = dadosCompletos.reduce((acc, item) => acc + item.jogos, 0) / 2

  function aproveitamento(item: Row) {
    if (item.jogos === 0) return 0
    return Math.round((item.pontos / (item.jogos * 3)) * 100)
  }

  function linhaClasse(index: number) {
    if (index === 0) {
      return 'bg-gradient-to-r from-emerald-950/70 to-emerald-900/30 hover:from-emerald-900/70 hover:to-emerald-800/30'
    }
    if (index >= 1 && index <= 3) {
      return 'bg-emerald-950/20 hover:bg-emerald-900/20'
    }
    if (index >= 4) {
      return 'bg-red-950/20 hover:bg-red-900/20'
    }
    return 'hover:bg-gray-800/60'
  }

  function badgePosicao(index: number) {
    if (index === 0) return '🏆'
    if (index >= 1 && index <= 3) return '✅'
    return '⚠️'
  }

  function corPosicao(index: number) {
    if (index === 0) return 'text-emerald-300'
    if (index >= 1 && index <= 3) return 'text-lime-300'
    return 'text-red-300'
  }

  function cardResumoTitulo(titulo: string, valor: string, subtitulo?: string) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-400">{titulo}</div>
        <div className="mt-2 text-2xl font-extrabold text-white">{valor}</div>
        {subtitulo && <div className="mt-1 text-sm text-gray-400">{subtitulo}</div>}
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#050505_45%,#000_100%)] text-white p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-8 shadow-2xl">
            <div className="mb-8 text-center">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-yellow-300 via-emerald-300 to-lime-300 bg-clip-text text-transparent">
                  CLASSIFICAÇÃO
                </span>
              </h1>
              <p className="mt-3 text-sm text-gray-400">Carregando tabela da competição...</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300">
              Carregando classificação...
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#050505_45%,#000_100%)] text-white p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-8 shadow-2xl">
            <div className="mb-8 text-center">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-yellow-300 via-emerald-300 to-lime-300 bg-clip-text text-transparent">
                  CLASSIFICAÇÃO
                </span>
              </h1>
            </div>

            <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-5 text-red-200">
              <div className="font-bold mb-2">Erro ao carregar a classificação</div>
              <div>{erro}</div>

              <button
                onClick={carregarClassificacao}
                className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#050505_45%,#000_100%)] text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-black/30 backdrop-blur-xl p-4 sm:p-8 shadow-2xl">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                LigaFut
              </div>

              <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-yellow-300 via-emerald-300 to-lime-300 bg-clip-text text-transparent">
                  CLASSIFICAÇÃO
                </span>
              </h1>

              <p className="mt-3 max-w-2xl text-sm sm:text-base text-gray-400">
                Vitória = 3 pontos • Empate = 1 ponto • Derrota = 0 ponto
              </p>
            </div>

            <button
              onClick={carregarClassificacao}
              className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500"
            >
              Atualizar classificação
            </button>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cardResumoTitulo('Líder', lider?.nome_time || '-', lider ? `${lider.pontos} pts` : undefined)}
            {cardResumoTitulo('Jogos finalizados', String(totalJogosFinalizados), 'Partidas concluídas')}
            {cardResumoTitulo('Melhor ataque', melhorAtaque?.nome_time || '-', melhorAtaque ? `${melhorAtaque.gols_pro} gols` : undefined)}
            {cardResumoTitulo('Melhor defesa', melhorDefesa?.nome_time || '-', melhorDefesa ? `${melhorDefesa.gols_contra} sofridos` : undefined)}
          </div>

          <div className="mb-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">
            <div className="font-bold mb-2 text-yellow-300">Regulamento rápido</div>
            <div>• 6 times • divisão única</div>
            <div>• 10 rodadas • 3 jogos por rodada</div>
            <div>• Cada equipe faz 10 partidas</div>
            <div>• Player Ouro: 4 jogos</div>
            <div>• Player Prata: 3 jogos</div>
            <div>• Player Bronze: 3 jogos</div>
            <div>• O Player Ouro deve fazer obrigatoriamente 2 jogos contra outro Ouro</div>
            <div>• Prata e Bronze são definidos estrategicamente por cada equipe</div>
            <div>• Todos os jogos valem os mesmos 3 pontos na tabela</div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2 text-xs text-gray-300">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-900/30 px-3 py-1 ring-1 ring-emerald-700/40">
              🏆 Líder
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-lime-900/30 px-3 py-1 ring-1 ring-lime-700/40">
              ✅ G4
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-red-900/30 px-3 py-1 ring-1 ring-red-700/40">
              ⚠️ Parte de baixo
            </span>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            <table className="min-w-full text-sm">
              <thead className="border-b border-white/10 bg-black/40 text-gray-300">
                <tr>
                  <th className="py-4 px-4 text-left font-semibold">Pos</th>
                  <th className="py-4 px-4 text-left font-semibold">Time</th>
                  <th className="py-4 px-3 text-center font-semibold">Pts</th>
                  <th className="py-4 px-3 text-center font-semibold">Aprov.</th>
                  <th className="py-4 px-3 text-center font-semibold">J</th>
                  <th className="py-4 px-3 text-center font-semibold">V</th>
                  <th className="py-4 px-3 text-center font-semibold">E</th>
                  <th className="py-4 px-3 text-center font-semibold">D</th>
                  <th className="py-4 px-3 text-center font-semibold">GP</th>
                  <th className="py-4 px-3 text-center font-semibold">GC</th>
                  <th className="py-4 px-3 text-center font-semibold">SG</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {dadosCompletos.map((item, index) => (
                  <tr
                    key={item.time_id}
                    className={`${linhaClasse(index)} transition-colors`}
                  >
                    <td className="py-4 px-4">
                      <div className={`flex items-center gap-2 font-extrabold ${corPosicao(index)}`}>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/30 text-sm">
                          {item.posicao}
                        </span>
                        <span>{badgePosicao(index)}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.logo || '/logo-fallback.png'}
                          alt={item.nome_time}
                          className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10 bg-white"
                        />
                        <div>
                          <div className="font-bold text-white">{item.nome_time}</div>
                          <div className="text-xs text-gray-400">
                            {index === 0
                              ? 'Líder da competição'
                              : index <= 3
                              ? 'Zona de destaque'
                              : 'Buscando recuperação'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <span className="text-lg font-black text-yellow-300">{item.pontos}</span>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="h-2.5 w-24 overflow-hidden rounded-full bg-gray-800">
                          <div
                            className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-lime-400"
                            style={{ width: `${aproveitamento(item)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-300">{aproveitamento(item)}%</span>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center text-white">{item.jogos}</td>
                    <td className="py-4 px-3 text-center text-white">{item.vitorias}</td>
                    <td className="py-4 px-3 text-center text-white">{item.empates}</td>
                    <td className="py-4 px-3 text-center text-white">{item.derrotas}</td>
                    <td className="py-4 px-3 text-center text-white">{item.gols_pro}</td>
                    <td className="py-4 px-3 text-center text-white">{item.gols_contra}</td>
                    <td className="py-4 px-3 text-center font-bold text-white">{item.saldo_gols}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 text-center text-xs text-gray-400">
            A classificação é atualizada automaticamente conforme os resultados forem preenchidos no sistema.
          </div>
        </div>
      </div>
    </div>
  )
}