'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type Jogo = {
  id: string
  rodada: number
  mandante_time_id: string
  mandante_nome: string
  visitante_time_id: string
  visitante_nome: string
  mandante_player_id?: string | null
  mandante_player_nome?: string | null
  mandante_categoria?: string | null
  visitante_player_id?: string | null
  visitante_player_nome?: string | null
  visitante_categoria?: string | null
  gols_mandante?: number | null
  gols_visitante?: number | null
  status: 'pendente' | 'escalado' | 'finalizado'
}

type Player = {
  id: string
  time_id: string
  nome_player: string
  categoria: 'ouro' | 'prata' | 'bronze'
  jogos_limite: number
  jogos_usados: number
  ouro_vs_ouro_obrigatorio: number
  ouro_vs_ouro_realizados: number
}

type TimeItem = {
  time_id: string
  nome_time: string
  logo?: string | null
}

export default function JogosPage() {
  const params = useParams()
  const competicaoId = params?.competicaoId as string

  const [jogos, setJogos] = useState<Jogo[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [times, setTimes] = useState<TimeItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [mandanteSelecionado, setMandanteSelecionado] = useState<Record<string, string>>({})
  const [visitanteSelecionado, setVisitanteSelecionado] = useState<Record<string, string>>({})
  const [golsMandante, setGolsMandante] = useState<Record<string, string>>({})
  const [golsVisitante, setGolsVisitante] = useState<Record<string, string>>({})

  const [rodadaAtual, setRodadaAtual] = useState<number>(1)

  async function carregarTudo() {
    try {
      if (!competicaoId || competicaoId === 'undefined') {
        throw new Error('ID da competição não encontrado na URL.')
      }

      setCarregando(true)
      setErro(null)

      const [resJogos, resPlayers, resClassificacao] = await Promise.all([
        fetch(`/api/ligafut/jogos/${competicaoId}`, { cache: 'no-store' }),
        fetch(`/api/ligafut/players/${competicaoId}`, { cache: 'no-store' }),
        fetch(`/api/ligafut/classificacao/${competicaoId}`, { cache: 'no-store' }),
      ])

      const jsonJogos = await resJogos.json()
      const jsonPlayers = await resPlayers.json()
      const jsonClassificacao = await resClassificacao.json()

      if (!resJogos.ok) throw new Error(jsonJogos?.error || 'Erro ao buscar jogos.')
      if (!resPlayers.ok) throw new Error(jsonPlayers?.error || 'Erro ao buscar players.')
      if (!resClassificacao.ok) throw new Error(jsonClassificacao?.error || 'Erro ao buscar times.')

      const jogosRecebidos: Jogo[] = jsonJogos.jogos || []
      const playersRecebidos: Player[] = jsonPlayers.players || []
      const timesRecebidos: TimeItem[] = jsonClassificacao.classificacao || []

      setJogos(jogosRecebidos)
      setPlayers(playersRecebidos)
      setTimes(timesRecebidos)

      const mandantes: Record<string, string> = {}
      const visitantes: Record<string, string> = {}
      const golsM: Record<string, string> = {}
      const golsV: Record<string, string> = {}

      for (const jogo of jogosRecebidos) {
        if (jogo.mandante_player_id) mandantes[jogo.id] = jogo.mandante_player_id
        if (jogo.visitante_player_id) visitantes[jogo.id] = jogo.visitante_player_id
        if (jogo.gols_mandante !== null && jogo.gols_mandante !== undefined) {
          golsM[jogo.id] = String(jogo.gols_mandante)
        }
        if (jogo.gols_visitante !== null && jogo.gols_visitante !== undefined) {
          golsV[jogo.id] = String(jogo.gols_visitante)
        }
      }

      setMandanteSelecionado(mandantes)
      setVisitanteSelecionado(visitantes)
      setGolsMandante(golsM)
      setGolsVisitante(golsV)
    } catch (e: any) {
      setErro(e?.message || 'Erro inesperado')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (competicaoId) carregarTudo()
  }, [competicaoId])

  const jogosPorRodada = useMemo(() => {
    const mapa: Record<number, Jogo[]> = {}
    for (const jogo of jogos) {
      if (!mapa[jogo.rodada]) mapa[jogo.rodada] = []
      mapa[jogo.rodada].push(jogo)
    }
    return mapa
  }, [jogos])

  const rodadasDisponiveis = useMemo(() => {
    return Object.keys(jogosPorRodada).map(Number).sort((a, b) => a - b)
  }, [jogosPorRodada])

  useEffect(() => {
    if (rodadasDisponiveis.length > 0 && !rodadasDisponiveis.includes(rodadaAtual)) {
      setRodadaAtual(rodadasDisponiveis[0])
    }
  }, [rodadasDisponiveis, rodadaAtual])

  const jogosDaRodada = jogosPorRodada[rodadaAtual] || []

  function playersDoTime(timeId: string) {
    return players.filter((p) => p.time_id === timeId)
  }

  function logoDoTime(timeId: string) {
    return times.find((t) => t.time_id === timeId)?.logo || '/logo-fallback.png'
  }

  function corCategoria(categoria?: string | null) {
    if (categoria === 'ouro') return 'text-yellow-300'
    if (categoria === 'prata') return 'text-gray-300'
    if (categoria === 'bronze') return 'text-orange-300'
    return 'text-gray-400'
  }

  function textoStatus(status: Jogo['status']) {
    if (status === 'pendente') return 'Confronto pendente'
    if (status === 'escalado') return 'Confronto salvo'
    return 'Resultado salvo'
  }

  function classeStatus(status: Jogo['status']) {
    if (status === 'pendente') return 'text-sky-300'
    if (status === 'escalado') return 'text-yellow-300'
    return 'text-emerald-300'
  }

  async function escalarJogo(jogoId: string) {
    try {
      const mandantePlayerId = mandanteSelecionado[jogoId]
      const visitantePlayerId = visitanteSelecionado[jogoId]

      if (!mandantePlayerId || !visitantePlayerId) {
        alert('Selecione o player do mandante e do visitante.')
        return
      }

      const res = await fetch('/api/ligafut/escalar-jogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jogoId, mandantePlayerId, visitantePlayerId }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao salvar confronto.')
      }

      alert('✅ Confronto salvo com sucesso!')
      await carregarTudo()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erro inesperado'}`)
    }
  }

  async function finalizarJogo(jogoId: string) {
    try {
      const gm = golsMandante[jogoId]
      const gv = golsVisitante[jogoId]

      if (gm === undefined || gv === undefined || gm === '' || gv === '') {
        alert('Informe os gols do mandante e do visitante.')
        return
      }

      const res = await fetch('/api/ligafut/finalizar-jogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jogoId,
          golsMandante: Number(gm),
          golsVisitante: Number(gv),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao salvar resultado.')
      }

      alert('✅ Resultado salvo com sucesso!')
      await carregarTudo()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erro inesperado'}`)
    }
  }

  async function excluirResultado(jogoId: string) {
    try {
      const confirmar = confirm(
        'Deseja realmente excluir este resultado? O jogo voltará para o status "escalado" e o impacto dos players será desfeito.'
      )

      if (!confirmar) return

      const res = await fetch('/api/ligafut/excluir-resultado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jogoId }),
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao excluir resultado.')
      }

      alert('✅ Resultado excluído com sucesso!')
      await carregarTudo()
    } catch (e: any) {
      alert(`❌ ${e?.message || 'Erro inesperado'}`)
    }
  }

  function mudarRodada(direcao: 'anterior' | 'proxima') {
    const indexAtual = rodadasDisponiveis.indexOf(rodadaAtual)
    if (indexAtual === -1) return

    if (direcao === 'anterior' && indexAtual > 0) {
      setRodadaAtual(rodadasDisponiveis[indexAtual - 1])
    }

    if (direcao === 'proxima' && indexAtual < rodadasDisponiveis.length - 1) {
      setRodadaAtual(rodadasDisponiveis[indexAtual + 1])
    }
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-black p-4 sm:p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-gray-900/70 p-6 shadow-2xl">
          <div className="text-center text-gray-300">Carregando jogos...</div>
        </div>
      </div>
    )
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-black p-4 sm:p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-gray-900/70 p-6 shadow-2xl">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-red-200">
            <div className="mb-2 font-bold">Erro ao carregar os jogos</div>
            <div>{erro}</div>
            <button
              onClick={carregarTudo}
              className="mt-4 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-500"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-black to-black p-4 sm:p-6 text-white">
      <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-gray-900/70 p-4 sm:p-8 shadow-2xl">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            JOGOS
          </h1>
        </div>

        <div className="mb-8 flex items-center justify-between border-y border-white/10 py-4">
          <button
            onClick={() => mudarRodada('anterior')}
            disabled={rodadasDisponiveis.indexOf(rodadaAtual) === 0}
            className="rounded-full p-2 text-emerald-400 disabled:cursor-not-allowed disabled:text-gray-600"
          >
            <span className="text-4xl leading-none">‹</span>
          </button>

          <div className="text-2xl sm:text-4xl font-extrabold text-white">
            {rodadaAtual}ª RODADA
          </div>

          <button
            onClick={() => mudarRodada('proxima')}
            disabled={rodadasDisponiveis.indexOf(rodadaAtual) === rodadasDisponiveis.length - 1}
            className="rounded-full p-2 text-emerald-400 disabled:cursor-not-allowed disabled:text-gray-600"
          >
            <span className="text-4xl leading-none">›</span>
          </button>
        </div>

        <div className="mb-6 flex justify-end">
          <button
            onClick={carregarTudo}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Atualizar jogos
          </button>
        </div>

        <div className="space-y-6">
          {jogosDaRodada.map((jogo) => (
            <div key={jogo.id} className="border-b border-white/10 pb-6">
              <div className="mb-3 text-center text-sm font-medium text-gray-400">
                Partida da rodada {rodadaAtual}
              </div>

              <div className="mb-4 text-center">
                <span className={`text-sm font-bold ${classeStatus(jogo.status)}`}>
                  {textoStatus(jogo.status)}
                </span>
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-6">
                <div className="flex flex-col items-center">
                  <div className="mb-2 text-center text-2xl sm:text-4xl font-light text-gray-100">
                    {jogo.mandante_nome}
                  </div>

                  <img
                    src={logoDoTime(jogo.mandante_time_id)}
                    alt={jogo.mandante_nome}
                    className="mb-3 h-16 w-16 sm:h-20 sm:w-20 object-contain"
                  />

                  <select
                    value={mandanteSelecionado[jogo.id] || ''}
                    onChange={(e) =>
                      setMandanteSelecionado((prev) => ({
                        ...prev,
                        [jogo.id]: e.target.value,
                      }))
                    }
                    disabled={jogo.status !== 'pendente'}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white disabled:bg-gray-800"
                  >
                    <option value="">Escolher player</option>
                    {playersDoTime(jogo.mandante_time_id).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome_player} ({p.categoria}) - {p.jogos_usados}/{p.jogos_limite}
                      </option>
                    ))}
                  </select>

                  {jogo.mandante_player_nome && (
                    <div className={`mt-2 text-sm font-semibold ${corCategoria(jogo.mandante_categoria)}`}>
                      {jogo.mandante_player_nome} ({jogo.mandante_categoria})
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center justify-center pt-8">
                  {jogo.status === 'finalizado' ? (
                    <div className="text-3xl sm:text-5xl font-extrabold text-yellow-300">
                      {jogo.gols_mandante} x {jogo.gols_visitante}
                    </div>
                  ) : (
                    <div className="text-4xl sm:text-5xl font-light text-gray-500">×</div>
                  )}
                </div>

                <div className="flex flex-col items-center">
                  <div className="mb-2 text-center text-2xl sm:text-4xl font-light text-gray-100">
                    {jogo.visitante_nome}
                  </div>

                  <img
                    src={logoDoTime(jogo.visitante_time_id)}
                    alt={jogo.visitante_nome}
                    className="mb-3 h-16 w-16 sm:h-20 sm:w-20 object-contain"
                  />

                  <select
                    value={visitanteSelecionado[jogo.id] || ''}
                    onChange={(e) =>
                      setVisitanteSelecionado((prev) => ({
                        ...prev,
                        [jogo.id]: e.target.value,
                      }))
                    }
                    disabled={jogo.status !== 'pendente'}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white disabled:bg-gray-800"
                  >
                    <option value="">Escolher player</option>
                    {playersDoTime(jogo.visitante_time_id).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome_player} ({p.categoria}) - {p.jogos_usados}/{p.jogos_limite}
                      </option>
                    ))}
                  </select>

                  {jogo.visitante_player_nome && (
                    <div className={`mt-2 text-sm font-semibold ${corCategoria(jogo.visitante_categoria)}`}>
                      {jogo.visitante_player_nome} ({jogo.visitante_categoria})
                    </div>
                  )}
                </div>
              </div>

              {jogo.status === 'pendente' && (
                <div className="mt-5 flex justify-center">
                  <button
                    onClick={() => escalarJogo(jogo.id)}
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-gray-200"
                  >
                    Salvar confronto
                  </button>
                </div>
              )}

              {jogo.status === 'escalado' && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-4 text-center text-sm font-semibold text-gray-300">
                    Confronto salvo. Agora preencha o resultado.
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <div className="flex flex-col items-center">
                      <label className="mb-2 text-sm font-medium text-gray-300">
                        Gols {jogo.mandante_nome}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={golsMandante[jogo.id] || ''}
                        onChange={(e) =>
                          setGolsMandante((prev) => ({
                            ...prev,
                            [jogo.id]: e.target.value,
                          }))
                        }
                        className="w-24 rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-center text-xl font-bold text-white"
                      />
                    </div>

                    <div className="text-2xl font-light text-gray-500">×</div>

                    <div className="flex flex-col items-center">
                      <label className="mb-2 text-sm font-medium text-gray-300">
                        Gols {jogo.visitante_nome}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={golsVisitante[jogo.id] || ''}
                        onChange={(e) =>
                          setGolsVisitante((prev) => ({
                            ...prev,
                            [jogo.id]: e.target.value,
                          }))
                        }
                        className="w-24 rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-center text-xl font-bold text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex justify-center">
                    <button
                      onClick={() => finalizarJogo(jogo.id)}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      Salvar resultado
                    </button>
                  </div>
                </div>
              )}

              {jogo.status === 'finalizado' && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="mb-3 text-center text-sm text-gray-300">
                    Resultado já salvo neste confronto.
                  </div>

                  <div className="text-center text-sm">
                    <span className={corCategoria(jogo.mandante_categoria)}>
                      {jogo.mandante_player_nome} ({jogo.mandante_categoria})
                    </span>{' '}
                    vs{' '}
                    <span className={corCategoria(jogo.visitante_categoria)}>
                      {jogo.visitante_player_nome} ({jogo.visitante_categoria})
                    </span>
                  </div>

                  <div className="mt-5 flex justify-center">
                    <button
                      onClick={() => excluirResultado(jogo.id)}
                      className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-500"
                    >
                      Excluir resultado
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 text-center text-xs text-gray-500">
          Depois de salvar ou excluir um resultado, a classificação refletirá automaticamente os dados da competição.
        </div>
      </div>
    </div>
  )
}