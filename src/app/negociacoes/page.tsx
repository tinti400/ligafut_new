'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import ImagemComFallback from '@/components/ImagemComFallback'

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

  // Pendentes + nomes dos jogadores
  const [pendentes, setPendentes] = useState<PropostaPendente[]>([])
  const [mapJogadorNome, setMapJogadorNome] = useState<Record<string, string>>({})
  const [carregandoPendentes, setCarregandoPendentes] = useState(false)
  const [excluindo, setExcluindo] = useState<Record<string, boolean>>({})

  // UI loading
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

  // Carrega lista de times (exceto o meu)
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

  // Carrega elenco do time alvo
  useEffect(() => {
    async function buscarElencoAdversario() {
      setCarregandoElencos(true)
      if (!timeSelecionado) {
        setElencoAdversario([])
        setCarregandoElencos(false)
        return
      }
      const { data, error } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', timeSelecionado)
      if (error) {
        console.error(error)
        toast.error('Erro ao carregar elenco do adversário.')
      }
      if (data) setElencoAdversario(data as Jogador[])
      setCarregandoElencos(false)
    }
    buscarElencoAdversario()
  }, [timeSelecionado])

  // Carrega elenco do meu time (para ofertas)
  useEffect(() => {
    async function buscarElencoMeuTime() {
      if (!id_time) return
      const { data, error } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)
      if (error) {
        console.error(error)
        toast.error('Erro ao carregar elenco do seu time.')
      }
      if (data) setElencoMeuTime(data as Jogador[])
    }
    buscarElencoMeuTime()
  }, [id_time])

  // Carrega pendentes (do meu time); se tiver timeSelecionado, filtra por alvo
  useEffect(() => {
    fetchPendentes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_time, timeSelecionado])

  const fetchPendentes = async () => {
    if (!id_time) return
    setCarregandoPendentes(true)
    let query = supabase
      .from('propostas_app')
      .select('id, jogador_id, tipo_proposta, valor_oferecido, percentual, jogadores_oferecidos, status, created_at, id_time_alvo')
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

    // Monta nomes dos jogadores
    const ids = Array.from(new Set(pend.map(p => p.jogador_id).filter(Boolean)))
    if (ids.length) {
      const { data: jogadores, error: errJog } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', ids)
      if (!errJog && jogadores) {
        const map: Record<string, string> = {}
        for (const j of jogadores as {id: string; nome: string}[]) {
          map[j.id] = j.nome
        }
        setMapJogadorNome(prev => ({ ...prev, ...map }))
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
  const formatBRL = (v: number | null | undefined) =>
    `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

  const formatDataCurta = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  // bloqueia ofertar jogador com < 3 jogos
  const elencoOfertavel = useMemo(() => {
    return (elencoMeuTime || []).map((j) => ({
      ...j,
      podeOferecer: (j.jogos ?? 0) >= 3
    }))
  }, [elencoMeuTime])

  // Toggle seleção no checklist estilizado
  const toggleOferecido = (alvoId: string, jogadorId: string, podeOferecer: boolean) => {
    if (!podeOferecer) return
    setJogadoresOferecidos((prev) => {
      const atual = new Set(prev[alvoId] || [])
      if (atual.has(jogadorId)) atual.delete(jogadorId)
      else atual.add(jogadorId)
      return { ...prev, [alvoId]: Array.from(atual) }
    })
  }

  // ===== EXCLUIR PROPOSTA(S) =====
  const excluirProposta = async (id: string) => {
    if (!id_time) return
    if (!window.confirm('Tem certeza que deseja excluir esta proposta?')) return
    setExcluindo(prev => ({ ...prev, [id]: true }))
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
      setPendentes(prev => prev.filter(p => p.id !== id))
      toast.success('Proposta excluída.')
    }
    setExcluindo(prev => ({ ...prev, [id]: false }))
  }

  const excluirTodasDoJogador = async (jogadorId: string) => {
    if (!id_time) return
    const ids = pendentes.filter(p => p.jogador_id === jogadorId).map(p => p.id)
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
      setPendentes(prev => prev.filter(p => !ids.includes(p.id)))
      toast.success('Propostas canceladas.')
    }
  }

  // ===== ENVIAR PROPOSTA =====
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

    // Snapshot dos oferecidos (somente meus e com >=3 jogos)
    let oferecidosDetalhes: any[] = []
    if (idsOferecidos.length) {
      const idsValidos = elencoOfertavel
        .filter((j) => idsOferecidos.includes(j.id) && j.podeOferecer)
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
          jogos: d.jogos ?? 0
        }))
      }
    }

    // Converte valores numéricos
    const valorNumerico = parseNumberOrNull(valorStr)
    const percentualNum = tipo === 'comprar_percentual' ? parseNumberOrNull(percStr) : null

    // Validações por tipo
    if (tipo === 'dinheiro') {
      if (valorNumerico == null || valorNumerico < 0) {
        alert('Informe um valor válido.')
        return
      }
    }
    if (tipo === 'comprar_percentual') {
      if (valorNumerico == null || valorNumerico < 0) {
        alert('Informe um valor válido.')
        return
      }
      if (percentualNum == null || percentualNum <= 0 || percentualNum > 100) {
        alert('Percentual inválido (1 a 100).')
        return
      }
    }
    if (tipo === 'troca_simples') {
      if (oferecidosDetalhes.length === 0) {
        alert('Selecione ao menos 1 jogador para a troca.')
        return
      }
    }
    if (tipo === 'troca_composta') {
      if (oferecidosDetalhes.length === 0) {
        alert('Selecione ao menos 1 jogador (o dinheiro é opcional).')
        return
      }
    }

    // Nome do time alvo
    const { data: timeAlvoData } = await supabase
      .from('times')
      .select('nome')
      .eq('id', jogadorAlvo.id_time)
      .single()

    // Regras para valor_oferecido
    let valor_oferecido: number | null = null
    if (tipo === 'dinheiro' || tipo === 'comprar_percentual') {
      valor_oferecido = toInt32OrNull(valorNumerico)
    } else if (tipo === 'troca_composta') {
      valor_oferecido = valorNumerico != null && valorNumerico > 0 ? toInt32OrNull(valorNumerico) : null
    } else {
      valor_oferecido = null
    }

    const payload = {
      id_time_origem: id_time,
      nome_time_origem: nome_time,
      id_time_alvo: jogadorAlvo.id_time,
      nome_time_alvo: timeAlvoData?.nome || 'Indefinido',

      jogador_id: jogadorAlvo.id,
      tipo_proposta: tipo,

      valor_oferecido, // int4 | null

      percentual_desejado: tipo === 'comprar_percentual' ? (percentualNum || 0) : 0,
      percentual:          tipo === 'comprar_percentual' ? (percentualNum || 0) : 0,

      jogadores_oferecidos: oferecidosDetalhes || [],

      status: 'pendente',
      created_at: new Date().toISOString()
    } as const

    // Valida UUIDs
    if (!isUUID(payload.id_time_origem) || !isUUID(payload.id_time_alvo) || !isUUID(payload.jogador_id)) {
      alert('IDs inválidos (uuid). Recarregue e faça login novamente.')
      return
    }

    setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: true }))
    try {
      const { error: insertErr } = await supabase
        .from('propostas_app')
        .insert([payload])

      if (insertErr) {
        console.error('❌ INSERT propostas_app', insertErr)
        toast.error(`Erro ao enviar a proposta: ${insertErr.message}`)
        return
      }

      toast.success('✅ Proposta enviada!')

      // Reset dos campos do jogador
      setJogadorSelecionadoId('')
      setTipoProposta((prev) => ({ ...prev, [jogadorAlvo.id]: 'dinheiro' }))
      setValorProposta((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setPercentualDesejado((prev) => ({ ...prev, [jogadorAlvo.id]: '' }))
      setJogadoresOferecidos((prev) => ({ ...prev, [jogadorAlvo.id]: [] }))

      // Atualiza pendentes (para já aparecer o cancelar)
      fetchPendentes()
    } finally {
      setEnviando((prev) => ({ ...prev, [jogadorAlvo.id]: false }))
    }
  }

  const existePendenteDoJogador = (jogadorId: string) =>
    pendentes.some(p => p.jogador_id === jogadorId)

  const pendentesDoJogador = (jogadorId: string) =>
    pendentes.filter(p => p.jogador_id === jogadorId)

  // ====== UI ======
  const EmptyState = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="border border-zinc-800 bg-zinc-900/40 rounded-xl p-8 text-center w-full">
      <div className="text-xl font-semibold text-zinc-200">{title}</div>
      {subtitle && <div className="text-sm text-zinc-400 mt-1">{subtitle}</div>}
    </div>
  )

  const SkeletonCard = () => (
    <div className="border border-zinc-800 rounded-lg p-4 w-full sm:w-[280px] bg-zinc-900 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-zinc-800 mx-auto mb-3" />
      <div className="h-3 bg-zinc-800 rounded mb-2" />
      <div className="h-3 bg-zinc-800 rounded w-3/5 mx-auto mb-3" />
      <div className="h-3 bg-zinc-800 rounded w-2/5 mx-auto" />
    </div>
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white pb-[env(safe-area-inset-bottom)]">
      {/* Topbar */}
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-black/50 bg-black/30 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">📩 Negociações</h1>
          <div className="text-xs sm:text-sm text-zinc-300">
            {nome_time ? <span className="px-2 sm:px-3 py-1 rounded-full bg-emerald-700/20 border border-emerald-700/40">Seu time: <b>{nome_time}</b></span> : '—'}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Painéis Mobile */}
        <div className="lg:hidden space-y-3">
          <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3" open>
            <summary className="list-none flex items-center justify-between cursor-pointer">
              <h2 className="text-base font-semibold">🎯 Selecionar Time</h2>
              <span className="text-sm text-zinc-400">abrir/fechar</span>
            </summary>
            <div className="mt-3 space-y-3">
              <input
                type="text"
                placeholder="🔎 Buscar time por nome"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="border p-3 rounded w-full bg-zinc-900 border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <select
                value={timeSelecionado}
                onChange={(e) => setTimeSelecionado(e.target.value)}
                className="border p-3 rounded w-full bg-zinc-900 border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="">-- Selecione um time --</option>
                {timesFiltrados.map((time) => (
                  <option key={time.id} value={time.id}>
                    {time.nome}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setFiltro(''); setTimeSelecionado('') }}
                  className="px-3 py-2 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800 w-full"
                >
                  Limpar seleção
                </button>
                {carregandoTimes && <span className="text-xs text-zinc-400">carregando…</span>}
              </div>
            </div>
          </details>

          <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <summary className="list-none flex items-center justify-between cursor-pointer">
              <h2 className="text-base font-semibold">🕒 Minhas propostas pendentes</h2>
              <button
                onClick={(e) => { e.preventDefault(); fetchPendentes() }}
                className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
                title="Atualizar"
              >
                Atualizar
              </button>
            </summary>

            <div className="mt-3">
              {carregandoPendentes ? (
                <div className="space-y-2">
                  <div className="h-10 bg-zinc-900 rounded border border-zinc-800 animate-pulse" />
                  <div className="h-10 bg-zinc-900 rounded border border-zinc-800 animate-pulse" />
                </div>
              ) : pendentes.length === 0 ? (
                <EmptyState title="Nenhuma proposta pendente" subtitle="Envie uma proposta para ver aqui." />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {pendentes.map((p) => {
                    const nome = mapJogadorNome[p.jogador_id] || 'Jogador'
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {nome} <span className="text-zinc-400">• {p.tipo_proposta.replace('_', ' ')}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {p.valor_oferecido != null ? `Valor: ${formatBRL(p.valor_oferecido)}` : 'Sem valor'}
                            {p.percentual ? ` • %: ${p.percentual}%` : ''}
                            {' • '} {formatDataCurta(p.created_at)}
                          </div>
                        </div>
                        <button
                          onClick={() => excluirProposta(p.id)}
                          disabled={!!excluindo[p.id]}
                          className={`text-xs px-3 py-1.5 rounded-lg ${
                            excluindo[p.id] ? 'bg-zinc-700 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                          }`}
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
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-semibold mb-3">🎯 Selecionar Time Alvo</h2>

            <input
              type="text"
              placeholder="🔎 Buscar time por nome"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="border p-2 rounded w-full bg-zinc-900 border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />

            <select
              value={timeSelecionado}
              onChange={(e) => setTimeSelecionado(e.target.value)}
              className="mt-3 border p-2 rounded w-full bg-zinc-900 border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">-- Selecione um time --</option>
              {timesFiltrados.map((time) => (
                <option key={time.id} value={time.id}>
                  {time.nome}
                </option>
              ))}
            </select>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => { setFiltro(''); setTimeSelecionado('') }}
                className="px-3 py-1.5 text-sm rounded-lg border border-zinc-700 hover:bg-zinc-800"
              >
                Limpar seleção
              </button>
              {carregandoTimes && <span className="text-xs text-zinc-400">carregando…</span>}
            </div>
          </div>

          {/* Pendentes */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">🕒 Minhas propostas pendentes</h2>
              <button
                onClick={fetchPendentes}
                className="text-xs px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800"
                title="Atualizar"
              >
                Atualizar
              </button>
            </div>

            {carregandoPendentes ? (
              <div className="space-y-2">
                <div className="h-9 bg-zinc-900 rounded border border-zinc-800 animate-pulse" />
                <div className="h-9 bg-zinc-900 rounded border border-zinc-800 animate-pulse" />
              </div>
            ) : pendentes.length === 0 ? (
              <EmptyState title="Nenhuma proposta pendente" subtitle="Envie uma proposta para ver aqui." />
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {pendentes.map((p) => {
                  const nome = mapJogadorNome[p.jogador_id] || 'Jogador'
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {nome} <span className="text-zinc-400">• {p.tipo_proposta.replace('_', ' ')}</span>
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {p.valor_oferecido != null ? `Valor: ${formatBRL(p.valor_oferecido)}` : 'Sem valor'}
                          {p.percentual ? ` • %: ${p.percentual}%` : ''}
                          {' • '} {formatDataCurta(p.created_at)}
                        </div>
                      </div>
                      <button
                        onClick={() => excluirProposta(p.id)}
                        disabled={!!excluindo[p.id]}
                        className={`text-xs px-3 py-1.5 rounded-lg ${
                          excluindo[p.id] ? 'bg-zinc-700 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                        }`}
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
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base sm:text-lg font-semibold">👥 Jogadores do {timeSelecionado ? 'time selecionado' : 'adversário'}</h2>
              {carregandoElencos && <span className="text-xs text-zinc-400">carregando elenco…</span>}
            </div>

            {!timeSelecionado ? (
              <EmptyState title="Selecione um time para listar os jogadores" />
            ) : carregandoElencos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : elencoAdversario.length === 0 ? (
              <EmptyState title="Este time não possui jogadores cadastrados." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
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
                  const jogadoresSelecionados =
                    jogadoresOferecidos[jogador.id] && jogadoresOferecidos[jogador.id].length > 0
                  const jogadoresVazios = precisaJogadores && !jogadoresSelecionados

                  const disableEnviar = valorInvalido || invalidoPercentual || jogadoresVazios
                  const temPendentes = existePendenteDoJogador(jogador.id)
                  const qtdPendentes = pendentesDoJogador(jogador.id).length

                  return (
                    <div key={jogador.id} className="border border-zinc-800 rounded-xl p-4 w-full bg-[linear-gradient(to_bottom_right,rgba(39,39,42,.6),rgba(24,24,27,.7))] shadow-sm hover:shadow-lg hover:border-zinc-700 transition">
                      <ImagemComFallback
                        src={jogador.imagem_url ?? '/jogador_padrao.png'}
                        alt={jogador.nome}
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-full object-cover mb-3 mx-auto ring-2 ring-zinc-700"
                      />
                      <div className="text-center font-semibold">{jogador.nome}</div>
                      <div className="text-xs text-center text-zinc-300">
                        {jogador.posicao} • Overall {jogador.overall ?? '-'}
                      </div>
                      <div className="text-xs text-center text-emerald-400 font-bold mb-3">
                        {formatBRL(jogador.valor)}
                      </div>

                      {/* Banner de pendentes para este jogador */}
                      {temPendentes && (
                        <div className="text-[11px] mb-3 bg-amber-500/10 border border-amber-600/40 text-amber-300 rounded-lg p-2">
                          {qtdPendentes} proposta(s) pendente(s) para este jogador.
                          <button
                            onClick={() => excluirTodasDoJogador(jogador.id)}
                            className="ml-2 text-[11px] underline hover:no-underline"
                            title="Cancelar todas as propostas deste jogador"
                          >
                            Cancelar todas
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-2 rounded"
                          onClick={() => {
                            setJogadorSelecionadoId(jogador.id)
                            setTipoProposta((prev) => ({ ...prev, [jogador.id]: 'dinheiro' }))
                            setValorProposta((prev) => ({ ...prev, [jogador.id]: '' }))
                            setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: '100' }))
                          }}
                        >
                          💬 Fazer Proposta
                        </button>
                        {temPendentes && (
                          <button
                            onClick={() => excluirTodasDoJogador(jogador.id)}
                            className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm"
                            title="Cancelar todas as propostas deste jogador"
                          >
                            Excluir
                          </button>
                        )}
                      </div>

                      {sel && (
                        <div className="mt-4 text-xs border-t border-zinc-800 pt-3 space-y-3">
                          <div>
                            <label className="font-semibold block mb-1">Tipo de proposta</label>
                            <select
                              className="border p-3 w-full bg-zinc-900 border-zinc-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
                          </div>

                          {(tp === 'dinheiro' || tp === 'troca_composta' || tp === 'comprar_percentual') && (
                            <div>
                              <label className="font-semibold">
                                Valor oferecido (R$){tp === 'troca_composta' ? ' — opcional' : ''}:
                              </label>
                              <input
                                type="number"
                                className="border p-3 w-full mt-1 bg-zinc-900 border-zinc-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-emerald-600"
                                value={valorProposta[jogador.id] || ''}
                                onChange={(e) =>
                                  setValorProposta((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                                }
                              />
                            </div>
                          )}

                          {tp === 'comprar_percentual' && (
                            <div>
                              <label className="font-semibold">Percentual desejado (%)</label>
                              <input
                                type="number"
                                min={1}
                                max={100}
                                className="border p-3 w-full mt-1 bg-zinc-900 border-zinc-700 text-white rounded focus:outline-none focus:ring-2 focus:ring-emerald-600"
                                value={percentualDesejado[jogador.id] || ''}
                                onChange={(e) =>
                                  setPercentualDesejado((prev) => ({ ...prev, [jogador.id]: e.target.value }))
                                }
                              />
                            </div>
                          )}

                          {(tp === 'troca_simples' || tp === 'troca_composta') && (
                            <div>
                              <label className="font-semibold block mb-2">
                                Jogadores oferecidos (mín. 1 / ≥ 3 jogos)
                              </label>

                              {/* Checklist em grid com miniatura */}
                              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                                {elencoOfertavel.map((j) => {
                                  const marcado =
                                    (jogadoresOferecidos[jogador.id] || []).includes(j.id)
                                  const disabled = !j.podeOferecer

                                  return (
                                    <label
                                      key={j.id}
                                      className={`flex items-center justify-between gap-2 rounded-lg p-2 border ${
                                        marcado ? 'border-emerald-500 bg-emerald-900/15' : 'border-zinc-800 bg-zinc-900'
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
                                          className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-700 shrink-0"
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className="font-semibold text-white text-[13px] leading-4 truncate">
                                            {j.nome} <span className="text-zinc-300">• {j.posicao}</span>
                                          </span>
                                          <span className="text-[12px] text-zinc-300">{formatBRL(j.valor)}</span>
                                        </div>
                                      </div>

                                      <span
                                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                                          j.podeOferecer
                                            ? 'bg-emerald-700 text-white'
                                            : 'bg-zinc-700 text-zinc-300'
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
                            className={`
                              w-full text-white font-bold py-3 rounded mt-1 text-sm
                              ${disableEnviar || enviando[jogador.id] ? 'bg-zinc-700 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}
                            `}
                          >
                            {enviando[jogador.id] ? 'Enviando...' : '✅ Enviar Proposta'}
                          </button>
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
