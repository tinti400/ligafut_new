'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import ImagemComFallback from '@/components/ImagemComFallback'
import CardJogadorNegociacao from '@/components/CardJogadorNegociacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Time = { id: string; nome: string }
type Jogador = {
  id: string
  id_time: string
  nome: string
  posicao: string
  overall: number | null
  valor: number | null
  imagem_url?: string | null
  jogos?: number | null
}

type TipoProposta = 'dinheiro' | 'troca_simples' | 'troca_composta' | 'comprar_percentual'

type PropostaPendente = {
  id: string
  jogador_id: string
  tipo_proposta: TipoProposta
  valor_oferecido: number | null
  percentual: number | null
  jogadores_oferecidos: any[] | null
  status: string
  created_at: string
  id_time_alvo: string
}

export default function NegociacoesPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [filtro, setFiltro] = useState('')
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  const [elencoAdversario, setElencoAdversario] = useState<Jogador[]>([])
  const [elencoMeuTime, setElencoMeuTime] = useState<Jogador[]>([])

  const [jogadorSelecionadoId, setJogadorSelecionadoId] = useState<string>('')

  const [tipoProposta, setTipoProposta] = useState<Record<string, TipoProposta>>({})
  const [valorProposta, setValorProposta] = useState<Record<string, string>>({})
  const [percentualDesejado, setPercentualDesejado] = useState<Record<string, string>>({})
  const [jogadoresOferecidos, setJogadoresOferecidos] = useState<Record<string, string[]>>({})
  const [enviando, setEnviando] = useState<Record<string, boolean>>({})

  const [id_time, setIdTime] = useState<string | null>(null)
  const [nome_time, setNomeTime] = useState<string | null>(null)

  const [pendentes, setPendentes] = useState<PropostaPendente[]>([])
  const [mapJogadorNome, setMapJogadorNome] = useState<Record<string, string>>({})
  const [carregandoPendentes, setCarregandoPendentes] = useState(false)
  const [excluindo, setExcluindo] = useState<Record<string, boolean>>({})

  const [carregandoTimes, setCarregandoTimes] = useState(false)
  const [carregandoElencos, setCarregandoElencos] = useState(false)

  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (userStorage) {
      try {
        const parsed = JSON.parse(userStorage)
        setIdTime(parsed.id_time ?? null)
        setNomeTime(parsed.nome_time ?? null)
      } catch {}
    }
  }, [])

  useEffect(() => {
    async function buscarTimes() {
      if (!id_time) return
      setCarregandoTimes(true)
      const { data, error } = await supabase
        .from('times')
        .select('id, nome')
        .neq('id', id_time)
        .order('nome', { ascending: true })

      if (error) {
        console.error(error)
        toast.error('Erro ao carregar times.')
      }
      if (data) setTimes(data as Time[])
      setCarregandoTimes(false)
    }
    buscarTimes()
  }, [id_time])

  useEffect(() => {
    async function buscarElencoAdversario() {
      setCarregandoElencos(true)
      if (!timeSelecionado) {
        setElencoAdversario([])
        setCarregandoElencos(false)
        return
      }
      const { data, error } = await supabase.from('elenco').select('*').eq('id_time', timeSelecionado)
      if (error) {
        console.error(error)
        toast.error('Erro ao carregar elenco do adversário.')
      }
      if (data) setElencoAdversario(data as Jogador[])
      setCarregandoElencos(false)
    }
    buscarElencoAdversario()
  }, [timeSelecionado])

  useEffect(() => {
    async function buscarElencoMeuTime() {
      if (!id_time) return
      const { data, error } = await supabase.from('elenco').select('*').eq('id_time', id_time)
      if (error) {
        console.error(error)
        toast.error('Erro ao carregar elenco do seu time.')
      }
      if (data) setElencoMeuTime(data as Jogador[])
    }
    buscarElencoMeuTime()
  }, [id_time])

  useEffect(() => {
    fetchPendentes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_time, timeSelecionado])

  const fetchPendentes = async () => {
    if (!id_time) return
    setCarregandoPendentes(true)

    let query = supabase
      .from('propostas_app')
      .select(
        'id, jogador_id, tipo_proposta, valor_oferecido, percentual, jogadores_oferecidos, status, created_at, id_time_alvo'
      )
      .eq('id_time_origem', id_time)
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })

    if (timeSelecionado) query = query.eq('id_time_alvo', timeSelecionado)

    const { data, error } = await query
    if (error) {
      console.error(error)
      toast.error('Erro ao carregar propostas pendentes.')
      setCarregandoPendentes(false)
      return
    }

    const pend = (data || []) as PropostaPendente[]
    setPendentes(pend)

    const ids = Array.from(new Set(pend.map((p) => p.jogador_id).filter(Boolean)))
    if (ids.length) {
      const { data: jogadores, error: errJog } = await supabase.from('elenco').select('id, nome').in('id', ids)
      if (!errJog && jogadores) {
        const map: Record<string, string> = {}
        for (const j of jogadores as { id: string; nome: string }[]) map[j.id] = j.nome
        setMapJogadorNome((prev) => ({ ...prev, ...map }))
      }
    }

    setCarregandoPendentes(false)
  }

  const timesFiltrados = useMemo(
    () => times.filter((t) => t.nome.toLowerCase().includes(filtro.toLowerCase())),
    [times, filtro]
  )

  // ===== Utils =====
  const parseNumberOrNull = (v: string): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const isUUID = (s?: string | null) =>
    !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

  const toInt32OrNull = (n: number | null | undefined) => {
    if (n == null) return null
    const v = Math.trunc(Number(n))
    const INT32_MAX = 2147483647
    const INT32_MIN = -2147483648
    if (v > INT32_MAX) return INT32_MAX
    if (v < INT32_MIN) return INT32_MIN
    return v
  }

  const formatBRL = (v: number | null | undefined) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

  const formatDataCurta = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  const elencoOfertavel = useMemo(() => {
    return (elencoMeuTime || []).map((j) => ({ ...j, podeOferecer: (j.jogos ?? 0) >= 3 }))
  }, [elencoMeuTime])

  const toggleOferecido = (alvoId: string, jogadorId: string, podeOferecer: boolean) => {
    if (!podeOferecer) return
    setJogadoresOferecidos((prev) => {
      const atual = new Set(prev[alvoId] || [])
      if (atual.has(jogadorId)) atual.delete(jogadorId)
      else atual.add(jogadorId)
      return { ...prev, [alvoId]: Array.from(atual) }
    })
  }

  const excluirProposta = async (id: string) => {
    if (!id_time) return
    if (!window.confirm('Tem certeza que deseja excluir esta proposta?')) return

    setExcluindo((prev) => ({ ...prev, [id]: true }))

    const { error } = await supabase
      .from('propostas_app')
      .delete()
      .eq('id', id)
      .eq('id_time_origem', id_time)
      .eq('status', 'pendente')

    if (error) {
      console.error(error)
      toast.error('Erro ao excluir proposta.')
    } else {
      setPendentes((prev) => prev.filter((p) => p.id !== id))
      toast.success('Proposta excluída.')
    }

    setExcluindo((prev) => ({ ...prev, [id]: false }))
  }

  const excluirTodasDoJogador = async (jogadorId: string) => {
    if (!id_time) return
    const ids = pendentes.filter((p) => p.jogador_id === jogadorId).map((p) => p.id)
    if (!ids.length) return
    if (!window.confirm(`Cancelar ${ids.length} proposta(s) para este jogador?`)) return

    const { error } = await supabase
      .from('propostas_app')
      .delete()
      .in('id', ids)
      .eq('id_time_origem', id_time)
      .eq('status', 'pendente')

    if (error) {
      console.error(error)
      toast.error('Erro ao cancelar propostas.')
    } else {
      setPendentes((prev) => prev.filter((p) => !ids.includes(p.id)))
      toast.success('Propostas canceladas.')
    }
  }

  const enviarProposta = async (jogadorAlvo: Jogador) => {
    const tipo = (tipoProposta[jogadorAlvo.id] || 'dinheiro') as TipoProposta
    const valorStr = valorProposta[jogadorAlvo.id] || ''
    const percStr = percentualDesejado[jogadorAlvo.id] || ''
    const idsOferecidos = jogadoresOferecidos[jogadorAlvo.id] || []

    if (!id_time || !nome_time) {
      alert('Usuário não identificado. Faça login novamente.')
      return
    }

    if (!window.confirm('Confirmar envio da proposta?')) return

    let oferecidosDetalhes: any[] = []
    if (idsOferecidos.length) {
      const idsValidos = elencoOfertavel
        .filter((j: any) => idsOferecidos.includes(j.id) && j.podeOferecer)
        .map((j) => j.id)

      if (idsValidos.length !== idsOferecidos.length) {
        alert('Algum jogador oferecido não possui 3 jogos e foi removido da seleção.')
      }

      if (idsValidos.length) {
        const { data } = await supabase
          .from('elenco')
          .select('id, nome, valor, posicao, overall, id_time, jogos')
          .in('id', idsValidos)

        oferecidosDetalhes = (data || []).map((d: any) => ({
          id: d.id,
          nome: d.nome,
          valor_atual: Number(d.valor || 0),
          posicao: d.posicao,
          overall: d.overall,
          id_time: d.id_time,
          jogos: d.jogos ?? 0,
        }))
      }
    }

    const valorNumerico = parseNumberOrNull(valorStr)
    const percentualNum = tipo === 'comprar_percentual' ? parseNumberOrNull(percStr) : null

    if (tipo === 'dinheiro') {
      if (valorNumerico == null || valorNumerico < 0) return alert('Informe um valor válido.')
    }
    if (tipo === 'comprar_percentual') {
      if (valorNumerico == null || valorNumerico < 0) return alert('Informe um valor válido.')
      if (percentualNum == null || percentualNum <= 0 || percentualNum > 100)
        return alert('Percentual inválido (1 a 100).')
    }
    if (tipo === 'troca_simples') {
      if (oferecidosDetalhes.length === 0) return alert('Selecione ao menos 1 jogador para a troca.')
    }
    if (tipo === 'troca_composta') {
      if (oferecidosDetalhes.length === 0) return alert('Selecione ao menos 1 jogador (o dinheiro é opcional).')
    }

    const { data: timeAlvoData } = await supabase.from('times').select('nome').eq('id', jogadorAlvo.id_time).single()

    let valor_oferecido: number | null = null
    if (tipo === 'dinheiro' || tipo === 'comprar_percentual') valor_oferecido = toInt32OrNull(valorNumerico)
    else if (tipo === 'troca_composta')
      valor_oferecido = valorNumerico != null && valorNumerico > 0 ? toInt32OrNull(valorNumerico) : null

    const payload = {
      id_time_origem: id_time,
      nome_time_origem: nome_time,
      id_time_alvo: jogadorAlvo.id_time,
      nome_time_alvo: timeAlvoData?.nome || 'Indefinido',
      jogador_id: jogadorAlvo.id,
      tipo_proposta: tipo,
      valor_oferecido,
      percentual_desejado: tipo === 'comprar_percentual' ? percentualNum || 0 : 0,
      percentual: tipo === 'comprar_percentual' ? percentualNum || 0 : 0,
      jogadores_oferecidos: oferecidosDetalhes || [],
      status: 'pendente',
      created_at: new Date().toISOString(),
    } as const

    if (!isUUID(payload.id_time_origem) || !isUUID(payload.id_time_alvo) || !isUUID(payload.jogador_id)) {
      alert('IDs inválidos (uuid). Recarregue e faça login novamente.')
      return
    }

    setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: true }))
    try {
      const { error: insertErr } = await supabase.from('propostas_app').insert([payload])
      if (insertErr) {
        console.error('❌ INSERT propostas_app', insertErr)
        toast.error(`Erro ao enviar a proposta: ${insertErr.message}`)
        return
      }

      toast.success('✅ Proposta enviada!')

      setJogadorSelecionadoId('')
      setTipoProposta((prev) => ({ ...prev, [jogadorAlvo.id]: 'dinheiro' }))
      setValorProposta((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setPercentualDesejado((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setJogadoresOferecidos((prev) => ({ ...prev, [jogadorAlvo.id]: [] }))
      fetchPendentes()
    } finally {
      setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: false }))
    }
  }

  const existePendenteDoJogador = (jogadorId: string) => pendentes.some((p) => p.jogador_id === jogadorId)
  const pendentesDoJogador = (jogadorId: string) => pendentes.filter((p) => p.jogador_id === jogadorId)

  // ===== UI Helpers =====
  const InputBase =
    'w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-emerald-600/60 focus:border-emerald-600/40'

  const ButtonBase =
    'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600/60 disabled:opacity-60 disabled:cursor-not-allowed'

  const EmptyState = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-8 text-center">
      <div className="text-lg font-semibold text-zinc-200">{title}</div>
      {subtitle && <div className="mt-1 text-sm text-zinc-400">{subtitle}</div>}
    </div>
  )

  const SkeletonCard = () => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 animate-pulse">
      <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-zinc-800" />
      <div className="mb-2 h-3 rounded bg-zinc-800" />
      <div className="mx-auto mb-3 h-3 w-3/5 rounded bg-zinc-800" />
      <div className="mx-auto h-3 w-2/5 rounded bg-zinc-800" />
    </div>
  )

  return (
    <main className="min-h-screen text-white">
      {/* Fundo premium */}
      <div className="fixed inset-0 -z-10 bg-black">
        <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_10%_0%,rgba(16,185,129,.18),transparent_60%),radial-gradient(900px_500px_at_90%_10%,rgba(59,130,246,.10),transparent_60%),radial-gradient(900px_600px_at_50%_100%,rgba(244,63,94,.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.75),rgba(0,0,0,.92),rgba(0,0,0,.98))]" />
      </div>

      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight">
              📩 Negociações <span className="ml-2 text-xs sm:text-sm font-semibold text-zinc-400">Entre clubes</span>
            </h1>
            <div className="text-[11px] sm:text-xs text-zinc-500">
              Envie propostas • Trocas • Percentual • Controle suas pendências
            </div>
          </div>

          <div className="shrink-0">
            {nome_time ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-700/15 px-3 py-1 text-xs sm:text-sm text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.6)]" />
                Seu time: <b className="text-white">{nome_time}</b>
              </span>
            ) : (
              <span className="text-xs text-zinc-400">—</span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Painéis Mobile */}
        <div className="lg:hidden space-y-3">
          <details className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-3" open>
            <summary className="list-none flex items-center justify-between cursor-pointer">
              <h2 className="text-base font-semibold">🎯 Selecionar Time</h2>
              <span className="text-sm text-zinc-500">abrir/fechar</span>
            </summary>

            <div className="mt-3 space-y-3">
              <input
                type="text"
                placeholder="🔎 Buscar time por nome"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className={InputBase}
              />

              <select value={timeSelecionado} onChange={(e) => setTimeSelecionado(e.target.value)} className={InputBase}>
                <option value="">-- Selecione um time --</option>
                {timesFiltrados.map((time) => (
                  <option key={time.id} value={time.id}>
                    {time.nome}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFiltro('')
                    setTimeSelecionado('')
                  }}
                  className={`${ButtonBase} w-full border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60`}
                >
                  Limpar seleção
                </button>
                {carregandoTimes && <span className="text-xs text-zinc-400">carregando…</span>}
              </div>
            </div>
          </details>

          <details className="rounded-2xl border border-zinc-800/70 bg-zinc-950/40 p-3">
            <summary className="list-none flex items-center justify-between cursor-pointer">
              <h2 className="text-base font-semibold">🕒 Minhas pendências</h2>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  fetchPendentes()
                }}
                className="text-xs px-2 py-1 rounded-lg border border-zinc-800 hover:bg-zinc-900/60"
                title="Atualizar"
              >
                Atualizar
              </button>
            </summary>

            <div className="mt-3">
              {carregandoPendentes ? (
                <div className="space-y-2">
                  <div className="h-10 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
                  <div className="h-10 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
                </div>
              ) : pendentes.length === 0 ? (
                <EmptyState title="Nenhuma proposta pendente" subtitle="Envie uma proposta para ver aqui." />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {pendentes.map((p) => {
                    const nome = mapJogadorNome[p.jogador_id] || 'Jogador'
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 transition"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {nome}{' '}
                            <span className="ml-1 text-zinc-400 font-medium">• {p.tipo_proposta.replaceAll('_', ' ')}</span>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {p.valor_oferecido != null ? `Valor: ${formatBRL(p.valor_oferecido)}` : 'Sem valor'}
                            {p.percentual ? ` • %: ${p.percentual}%` : ''}
                            {' • '} {formatDataCurta(p.created_at)}
                          </div>
                        </div>

                        <button
                          onClick={() => excluirProposta(p.id)}
                          disabled={!!excluindo[p.id]}
                          className={`${ButtonBase} ${excluindo[p.id] ? 'bg-zinc-800' : 'bg-red-600 hover:bg-red-700'}`}
                          title="Excluir proposta"
                        >
                          {excluindo[p.id] ? 'Excluindo…' : 'Excluir'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </details>
        </div>

        {/* Lateral Desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:col-span-4 space-y-4">
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-950/40 p-4">
            <h2 className="text-lg font-semibold mb-1">🎯 Selecionar Time Alvo</h2>
            <p className="text-xs text-zinc-500 mb-3">Escolha um clube para listar o elenco e enviar proposta.</p>

            <input
              type="text"
              placeholder="🔎 Buscar time por nome"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className={InputBase}
            />

            <select value={timeSelecionado} onChange={(e) => setTimeSelecionado(e.target.value)} className={`mt-3 ${InputBase}`}>
              <option value="">-- Selecione um time --</option>
              {timesFiltrados.map((time) => (
                <option key={time.id} value={time.id}>
                  {time.nome}
                </option>
              ))}
            </select>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setFiltro('')
                  setTimeSelecionado('')
                }}
                className={`${ButtonBase} border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60`}
              >
                Limpar seleção
              </button>

              {carregandoTimes && <span className="text-xs text-zinc-400">carregando…</span>}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-950/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold">🕒 Minhas pendências</h2>
                <p className="text-xs text-zinc-500">Propostas pendentes que você pode cancelar.</p>
              </div>

              <button
                onClick={fetchPendentes}
                className="text-xs px-2 py-1 rounded-lg border border-zinc-800 hover:bg-zinc-900/60"
                title="Atualizar"
              >
                Atualizar
              </button>
            </div>

            {carregandoPendentes ? (
              <div className="space-y-2">
                <div className="h-10 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
                <div className="h-10 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
              </div>
            ) : pendentes.length === 0 ? (
              <EmptyState title="Nenhuma proposta pendente" subtitle="Envie uma proposta para ver aqui." />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {pendentes.map((p) => {
                  const nome = mapJogadorNome[p.jogador_id] || 'Jogador'
                  return (
                    <div
                      key={p.id}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 hover:bg-zinc-900/40 transition"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {nome}{' '}
                          <span className="ml-1 text-zinc-400 font-medium">• {p.tipo_proposta.replaceAll('_', ' ')}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {p.valor_oferecido != null ? `Valor: ${formatBRL(p.valor_oferecido)}` : 'Sem valor'}
                          {p.percentual ? ` • %: ${p.percentual}%` : ''}
                          {' • '} {formatDataCurta(p.created_at)}
                        </div>
                      </div>

                      <button
                        onClick={() => excluirProposta(p.id)}
                        disabled={!!excluindo[p.id]}
                        className={`${ButtonBase} ${excluindo[p.id] ? 'bg-zinc-800' : 'bg-red-600 hover:bg-red-700'}`}
                        title="Excluir proposta"
                      >
                        {excluindo[p.id] ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Conteúdo principal */}
        <section className="lg:col-span-8">
          <div className="rounded-3xl border border-zinc-800/70 bg-zinc-950/40 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold">
                  👥 Jogadores do {timeSelecionado ? 'time selecionado' : 'adversário'}
                </h2>
                <p className="text-xs text-zinc-500">Clique em <b>Fazer proposta</b> no card para abrir o painel.</p>
              </div>
              {carregandoElencos && <span className="text-xs text-zinc-400">carregando elenco…</span>}
            </div>

            {!timeSelecionado ? (
              <EmptyState title="Selecione um time para listar os jogadores" />
            ) : carregandoElencos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 place-items-center">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : elencoAdversario.length === 0 ? (
              <EmptyState title="Este time não possui jogadores cadastrados." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 place-items-center">
                {elencoAdversario.map((jogador) => {
                  const sel = jogadorSelecionadoId === jogador.id
                  const tp = (tipoProposta[jogador.id] || 'dinheiro') as TipoProposta

                  const valorStr = valorProposta[jogador.id] ?? ''
                  const precisaValorFixo = tp === 'dinheiro' || tp === 'comprar_percentual'
                  const valorInvalido = precisaValorFixo && (valorStr === '' || isNaN(Number(valorStr)))

                  const precisaPercentual = tp === 'comprar_percentual'
                  const percStr = percentualDesejado[jogador.id] ?? ''
                  const invalidoPercentual = precisaPercentual && (percStr === '' || isNaN(Number(percStr)))

                  const precisaJogadores = tp === 'troca_simples' || tp === 'troca_composta'
                  const jogadoresSelecionados = (jogadoresOferecidos[jogador.id] || []).length > 0
                  const jogadoresVazios = precisaJogadores && !jogadoresSelecionados

                  const disableEnviar = valorInvalido || invalidoPercentual || jogadoresVazios

                  const temPendentes = existePendenteDoJogador(jogador.id)
                  const qtdPendentes = pendentesDoJogador(jogador.id).length

                  return (
                    <div key={jogador.id} className="w-full flex flex-col items-center">
                      {/* CARD EA */}
                      <CardJogadorNegociacao
                        jogador={{
                          id: jogador.id,
                          nome: jogador.nome,
                          posicao: jogador.posicao,
                          overall: jogador.overall ?? 0,
                          valor: jogador.valor ?? 0,
                          imagem_url: jogador.imagem_url ?? null,
                        }}
                        selecionado={sel}
                        pendenciasCount={qtdPendentes}
                        onClick={() => {
                          setJogadorSelecionadoId((prev) => (prev === jogador.id ? '' : jogador.id))
                          setTipoProposta((prev) => ({ ...prev, [jogador.id]: prev[jogador.id] ?? 'dinheiro' }))
                        }}
                        onFazerProposta={() => {
                          setJogadorSelecionadoId(jogador.id)
                          setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
                          setValorProposta((prev) => ({ ...prev, [jogador.id]: '' }))
                          setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '100' }))
                        }}
                        onCancelarPendencias={temPendentes ? () => excluirTodasDoJogador(jogador.id) : undefined}
                      />

                      {/* PAINEL ABAIXO DO CARD */}
                      {sel && (
                        <div className="mt-4 w-full max-w-[320px] rounded-3xl border border-zinc-800/70 bg-zinc-950/40 p-4">
                          {temPendentes && (
                            <div className="mb-3 rounded-2xl border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                              <div className="text-[12px] font-semibold">
                                {qtdPendentes} proposta(s) pendente(s)
                                <button
                                  onClick={() => excluirTodasDoJogador(jogador.id)}
                                  className="ml-2 text-[12px] underline hover:no-underline"
                                >
                                  Cancelar todas
                                </button>
                              </div>
                              <div className="text-[11px] text-amber-200/70">Evite spammar o mesmo jogador 😉</div>
                            </div>
                          )}

                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-zinc-300">Tipo de proposta</label>
                              <select
                                className={`${InputBase} mt-1`}
                                value={tp}
                                onChange={(e) =>
                                  setTipoProposta((prev) => ({ ...prev, [jogador.id]: e.target.value as TipoProposta }))
                                }
                              >
                                <option value="dinheiro">💰 Apenas dinheiro</option>
                                <option value="troca_simples">🔁 Troca simples</option>
                                <option value="troca_composta">💶 Troca + dinheiro (opcional)</option>
                                <option value="comprar_percentual">📈 Comprar percentual</option>
                              </select>

                              <div className="mt-1 text-[11px] text-zinc-500">
                                Dica: em <b>Troca</b>, selecione jogadores do seu elenco com <b>≥ 3 jogos</b>.
                              </div>
                            </div>

                            {(tp === 'dinheiro' || tp === 'troca_composta' || tp === 'comprar_percentual') && (
                              <div>
                                <label className="text-xs font-semibold text-zinc-300">
                                  Valor oferecido (R$){tp === 'troca_composta' ? ' — opcional' : ''}:
                                </label>
                                <input
                                  type="number"
                                  className={`${InputBase} mt-1`}
                                  value={valorProposta[jogador.id] || ''}
                                  onChange={(e) =>
                                    setValorProposta((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                                  }
                                  placeholder="Ex: 10000000"
                                />
                              </div>
                            )}

                            {tp === 'comprar_percentual' && (
                              <div>
                                <label className="text-xs font-semibold text-zinc-300">Percentual desejado (%)</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={100}
                                  className={`${InputBase} mt-1`}
                                  value={percentualDesejado[jogador.id] || ''}
                                  onChange={(e) =>
                                    setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                                  }
                                  placeholder="Ex: 30"
                                />
                              </div>
                            )}

                            {(tp === 'troca_simples' || tp === 'troca_composta') && (
                              <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/30 p-3">
                                <div className="flex items-end justify-between gap-2">
                                  <label className="text-xs font-semibold text-zinc-300">
                                    Jogadores oferecidos (mín. 1 / ≥ 3 jogos)
                                  </label>
                                  <div className="text-[11px] text-zinc-500">
                                    Selecionados:{' '}
                                    <b className="text-white">{(jogadoresOferecidos[jogador.id] || []).length}</b>
                                  </div>
                                </div>

                                <div className="mt-2 grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                                  {elencoOfertavel.map((j: any) => {
                                    const marcado = (jogadoresOferecidos[jogador.id] || []).includes(j.id)
                                    const disabled = !j.podeOferecer

                                    return (
                                      <label
                                        key={j.id}
                                        className={`flex items-center justify-between gap-2 rounded-2xl p-2 border transition ${
                                          marcado
                                            ? 'border-emerald-500/60 bg-emerald-900/15'
                                            : 'border-zinc-800/70 bg-zinc-950/40 hover:bg-zinc-900/40'
                                        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        onClick={() => toggleOferecido(jogador.id, j.id, j.podeOferecer)}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <input
                                            type="checkbox"
                                            checked={marcado}
                                            onChange={() => toggleOferecido(jogador.id, j.id, j.podeOferecer)}
                                            disabled={disabled}
                                            className="accent-emerald-600 shrink-0"
                                          />

                                          <ImagemComFallback
                                            src={j.imagem_url ?? '/jogador_padrao.png'}
                                            alt={j.nome}
                                            width={28}
                                            height={28}
                                            className="w-8 h-8 rounded-xl object-cover ring-1 ring-zinc-700/60 shrink-0"
                                          />

                                          <div className="min-w-0">
                                            <div className="truncate text-[13px] font-semibold">
                                              {j.nome}{' '}
                                              <span className="text-zinc-400 font-medium">• {j.posicao}</span>
                                            </div>
                                            <div className="text-[12px] text-zinc-400">{formatBRL(j.valor)}</div>
                                          </div>
                                        </div>

                                        <span
                                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                            j.podeOferecer
                                              ? 'border-emerald-600/40 bg-emerald-700/20 text-emerald-200'
                                              : 'border-zinc-700 bg-zinc-800/40 text-zinc-300'
                                          }`}
                                          title={j.podeOferecer ? 'Apto para troca' : 'Menos de 3 jogos'}
                                        >
                                          {j.jogos ?? 0} jogos {j.podeOferecer ? '' : '🔒'}
                                        </span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => enviarProposta(jogador)}
                              disabled={disableEnviar || !!enviando[jogador.id]}
                              className={`${ButtonBase} w-full py-3 text-sm font-extrabold ${
                                disableEnviar || enviando[jogador.id]
                                  ? 'bg-zinc-800'
                                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_0_1px_rgba(16,185,129,.25)]'
                              }`}
                            >
                              {enviando[jogador.id] ? 'Enviando…' : '✅ Enviar Proposta'}
                            </button>

                            {(valorInvalido || invalidoPercentual || jogadoresVazios) && (
                              <div className="text-[11px] text-zinc-500">
                                {valorInvalido && '• Informe um valor numérico. '}
                                {invalidoPercentual && '• Informe um percentual válido (1 a 100). '}
                                {jogadoresVazios && '• Selecione ao menos 1 jogador para troca. '}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
