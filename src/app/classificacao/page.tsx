'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

  // campos calculados aqui
  pontos_deduzidos?: number
  pontos_ajustados?: number
}

export default function ClassificacaoPage() {
  const [classificacao, setClassificacao] = useState<ClassificacaoItem[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [temporadaSelecionada, setTemporadaSelecionada] = useState<number>(1)
  const [divisaoSelecionada, setDivisaoSelecionada] = useState<number | null>(1)
  const { isAdmin, loading } = useAdmin()

  // ---- punições -> mapa id_time -> soma
  async function carregarDeducoesPorTime() {
    const { data, error } = await supabase
      .from('punicoes')
      .select('id_time, pontos_retirados, valor')
      .eq('ativo', true)
      .eq('tipo_punicao', 'desconto_pontos')

    if (error) throw error

    const mapa = new Map<string, number>()
    for (const p of data || []) {
      const v = Number((p as any).pontos_retirados ?? (p as any).valor ?? 0)
      if (Number.isFinite(v) && v > 0) {
        mapa.set((p as any).id_time, (mapa.get((p as any).id_time) || 0) + Math.floor(v))
      }
    }
    return mapa
  }

  // ===== Fetch
  const fetchDados = async (temporada: number) => {
    try {
      setCarregando(true)
      setErro(null)

      // 1) busca a classificação "pura" da sua API
      const res = await fetch(`/api/classificacao-liga?temporada=${temporada}`)
      if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`)
      const base = (await res.json()) as ClassificacaoItem[]

      // 2) carrega deduções no Supabase e ajusta pontos
      const deducoes = await carregarDeducoesPorTime()

      const ajustada: ClassificacaoItem[] = (base || []).map((it) => {
        const ded = deducoes.get(it.id_time) || 0
        const ptsAjust = Math.max(0, (it.pontos || 0) - ded)
        return {
          ...it,
          saldo_gols: it.gols_pro - it.gols_contra,
          pontos_deduzidos: ded,
          pontos_ajustados: ptsAjust
        }
      })

      setClassificacao(ajustada)
    } catch (err: any) {
      setErro(`Erro ao buscar dados: ${err.message}`)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    fetchDados(temporadaSelecionada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporadaSelecionada])

  // ===== Agrupar/derivar
  const classificacaoPorDivisao = useMemo(() => {
    const map: Record<number, ClassificacaoItem[]> = {}
    for (const item of classificacao) {
      const d = (item.divisao ?? 99) as number
      map[d] ??= []
      map[d].push(item)
    }
    return map
  }, [classificacao])

  const divisoesDisponiveis = useMemo(
    () => Object.keys(classificacaoPorDivisao).map(Number).sort((a, b) => a - b),
    [classificacaoPorDivisao]
  )

  const timesDaDivisao = useMemo(() => {
    if (!divisaoSelecionada) return []
    const arr = classificacaoPorDivisao[divisaoSelecionada] || []
    return [...arr].sort(
      (a, b) =>
        (b.pontos_ajustados ?? b.pontos) - (a.pontos_ajustados ?? a.pontos) ||
        (b.saldo_gols ?? 0) - (a.saldo_gols ?? 0)
    )
  }, [classificacaoPorDivisao, divisaoSelecionada])

  // ===== Ações
  const iniciarNovaTemporada = async () => {
    if (!confirm('⚠️ Tem certeza que deseja iniciar a nova temporada?')) return
    const res = await fetch('/api/iniciar-temporada', { method: 'POST' })
    if (res.ok) {
      alert('✅ Temporada iniciada com sucesso!')
      fetchDados(temporadaSelecionada)
    } else {
      const data = await res.json().catch(() => ({} as any))
      alert(`❌ Erro ao iniciar temporada: ${data?.erro || 'Erro desconhecido'}`)
    }
  }

  const editarClassificacao = (item: ClassificacaoItem) => {
    if (!isAdmin) return
    alert(`📝 Editar classificação do time: ${item.times.nome}`)
  }

  // ===== Helpers UI (regras por divisão)
  const isPrimeiraDivisao = divisaoSelecionada === 1

  const aproveitamento = (it: ClassificacaoItem) => {
    const pts = it.pontos_ajustados ?? it.pontos
    return it.jogos > 0 ? Math.round((pts / (it.jogos * 3)) * 100) : 0
  }

  const posBadge = (pos: number) => {
    const base =
      'inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ring-1 ring-white/10'
    if (isPrimeiraDivisao) {
      if (pos === 1) return `${base} bg-green-600 text-white`
    } else {
      if (pos <= 2) return `${base} bg-green-600 text-white`
      if (pos === 3) return `${base} bg-sky-600 text-white`
    }
    return `${base} bg-gray-700 text-gray-200`
  }

  const iconePos = (idx: number, total: number) => {
    const last = total - 1
    const pen = total - 2
    const ante = total - 3
    if (isPrimeiraDivisao) {
      if (idx === 0) return '🏆'
    } else {
      if (idx === 0 || idx === 1) return '⬆️'
      if (idx === 2) return '🎟️'
    }
    if (idx === ante) return '⚠️'
    if (idx === pen || idx === last) return '🔻'
    return ''
  }

  const linhaCor = (idx: number, total: number) => {
    const last = total - 1
    const pen = total - 2
    const ante = total - 3
    if (idx === pen || idx === last) return 'bg-red-950/40 hover:bg-red-900/40'
    if (idx === ante) return 'bg-yellow-950/40 hover:bg-yellow-900/40'
    if (isPrimeiraDivisao) {
      if (idx === 0) return 'bg-green-950/40 hover:bg-green-900/40'
    } else {
      if (idx === 0 || idx === 1) return 'bg-green-950/40 hover:bg-green-900/40'
      if (idx === 2) return 'bg-sky-950/40 hover:bg-sky-900/40'
    }
    return 'hover:bg-gray-800/60'
  }

  if (erro) {
    return (
      <div className="max-w-6xl mx-auto mt-10 px-4">
        <div className="rounded-lg border border-red-500/30 bg-red-950/40 text-red-200 p-4">
          {erro}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      {/* Título */}
      <div className="max-w-6xl mx-auto px-4 pt-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-center mb-6">
          <span className="bg-gradient-to-r from-yellow-400 via-emerald-400 to-lime-300 bg-clip-text text-transparent">
            🏆 Classificação da Liga
          </span>
        </h1>
      </div>

      {/* Controles */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          {[1, 2].map((temp) => (
            <button
              key={temp}
              onClick={() => setTemporadaSelecionada(temp)}
              className={`px-4 py-2 rounded-full text-sm border transition ${
                temporadaSelecionada === temp
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                  : 'bg-gray-800 text-gray-200 border-white/10 hover:bg-gray-700'
              }`}
            >
              Temporada {temp}
            </button>
          ))}

          {!loading && isAdmin && (
            <button
              onClick={iniciarNovaTemporada}
              className="px-4 py-2 rounded-full text-sm bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/50 text-white"
            >
              🚀 Nova Temporada
            </button>
          )}
        </div>

        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {divisoesDisponiveis.map((div) => (
            <button
              key={div}
              onClick={() => setDivisaoSelecionada(div)}
              className={`px-4 py-1.5 rounded-lg text-sm border transition ${
                divisaoSelecionada === div
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                  : 'bg-gray-800 text-gray-200 border-white/10 hover:bg-gray-700'
              }`}
            >
              Divisão {div}
            </button>
          ))}
        </div>
      </div>

      {/* Legenda dinâmica */}
      <div className="max-w-6xl mx-auto px-4 -mt-1 mb-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
          {divisaoSelecionada === 1 ? (
            <span className="inline-flex items-center gap-2 bg-green-900/40 ring-1 ring-green-800/50 px-2.5 py-1 rounded-full">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Campeão
            </span>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 bg-green-900/40 ring-1 ring-green-800/50 px-2.5 py-1 rounded-full">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Acesso direto (1º e 2º)
              </span>
              <span className="inline-flex items-center gap-2 bg-sky-900/40 ring-1 ring-sky-800/50 px-2.5 py-1 rounded-full">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" /> Playoff (3º)
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-2 bg-yellow-900/40 ring-1 ring-yellow-800/50 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Zona de atenção
          </span>
          <span className="inline-flex items-center gap-2 bg-red-900/40 ring-1 ring-red-800/50 px-2.5 py-1 rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Z-2 (rebaixamento)
          </span>
        </div>
      </div>

      {/* Tabela */}
      {divisaoSelecionada && timesDaDivisao.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 pb-12">
          <div className="mb-3 flex justify-end">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `📊 Classificação da Divisão ${divisaoSelecionada}:\n\n` +
                  timesDaDivisao
                    .map(
                      (item, i) =>
                        `${i + 1}º ${item.times.nome} - ${(item.pontos_ajustados ?? item.pontos)} pts (${item.vitorias}V ${item.empates}E ${item.derrotas}D)`
                    )
                    .join('\n')
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm px-3 py-1.5 rounded-lg font-semibold"
            >
              📤 Compartilhar
            </a>
          </div>

          {carregando ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 w-full rounded bg-gray-800/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-900/60 shadow-2xl shadow-black/30">
              <table className="min-w-full text-sm">
                <thead className="bg-black/70 text-yellow-300 border-b border-white/10">
                  <tr>
                    <th className="py-3 px-4 text-left">Pos</th>
                    <th className="py-3 px-4 text-left">Time</th>
                    <th className="py-3 px-2 text-center">Pts</th>
                    <th className="py-3 px-2 text-center">Aprove.</th>
                    <th className="py-3 px-2 text-center">J</th>
                    <th className="py-3 px-2 text-center">V</th>
                    <th className="py-3 px-2 text-center">E</th>
                    <th className="py-3 px-2 text-center">D</th>
                    <th className="py-3 px-2 text-center">GP</th>
                    <th className="py-3 px-2 text-center">GC</th>
                    <th className="py-3 px-2 text-center">SG</th>
                    {isAdmin && <th className="py-3 px-2 text-center">✏️</th>}
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/5">
                  {timesDaDivisao.map((item, index, arr) => {
                    const total = arr.length
                    const ap = aproveitamento(item)
                    const pos = index + 1
                    const pts = item.pontos_ajustados ?? item.pontos

                    return (
                      <tr key={item.id_time} className={`${linhaCor(index, total)} transition-colors`}>
                        {/* POS */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={posBadge(pos)}>{pos}</span>
                            <span className="text-lg">{iconePos(index, total)}</span>
                          </div>
                        </td>

                        {/* TIME */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={item.times.logo_url || '/logo-fallback.png'}
                              alt={item.times.nome}
                              className="w-7 h-7 rounded-full ring-1 ring-white/10 object-cover"
                            />
                            <span className="font-medium">{item.times.nome}</span>
                            {item.pontos_deduzidos && item.pontos_deduzidos > 0 && (
                              <span className="ml-2 text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                                −{item.pontos_deduzidos} pts
                              </span>
                            )}
                          </div>
                        </td>

                        {/* PONTOS */}
                        <td className="py-2.5 px-2 text-center font-bold text-yellow-300">
                          {pts}
                        </td>

                        {/* APROVEITAMENTO */}
                        <td className="py-2.5 px-2">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-24 md:w-32 h-2 rounded-full bg-gray-700 overflow-hidden">
                              <div className="h-2 bg-emerald-500" style={{ width: `${ap}%` }} />
                            </div>
                            <span className="text-xs text-gray-300">{ap}%</span>
                          </div>
                        </td>

                        {/* DEMAIS CAMPOS */}
                        <td className="py-2.5 px-2 text-center">{item.jogos}</td>
                        <td className="py-2.5 px-2 text-center">{item.vitorias}</td>
                        <td className="py-2.5 px-2 text-center">{item.empates}</td>
                        <td className="py-2.5 px-2 text-center">{item.derrotas}</td>
                        <td className="py-2.5 px-2 text-center">{item.gols_pro}</td>
                        <td className="py-2.5 px-2 text-center">{item.gols_contra}</td>
                        <td className="py-2.5 px-2 text-center">{item.saldo_gols}</td>

                        {/* AÇÃO ADMIN */}
                        {isAdmin && (
                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => editarClassificacao(item)}
                              className="text-yellow-300 hover:text-yellow-200 text-xs underline underline-offset-4"
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
