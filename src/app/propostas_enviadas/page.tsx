'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/** ================== Supabase ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ================== Tipos ================== */
type StatusProposta = 'pendente' | 'aceita' | 'recusada' | 'cancelada'

type TipoProposta = 'dinheiro' | 'troca_simples' | 'troca_composta' | string

interface Proposta {
  id: string
  id_time_origem: string
  nome_time_alvo: string | null
  jogador_id: string
  valor_oferecido: number | null
  jogadores_oferecidos: string[] | null
  tipo_proposta: TipoProposta
  status: StatusProposta
  created_at?: string | null
}

interface Jogador {
  id: string
  nome: string
  imagem_url?: string | null
  posicao?: string | null
}

/** ================== Utils ================== */
const formatarMoeda = (v: number | null | undefined) =>
  `R$ ${(Number(v || 0)).toLocaleString('pt-BR')}`

const formatarData = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const statusInfo: Record<
  StatusProposta,
  { label: string; cls: string; dot: string }
> = {
  pendente: {
    label: 'Pendente',
    cls: 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30',
    dot: 'bg-yellow-400'
  },
  aceita: {
    label: 'Aceita',
    cls: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    dot: 'bg-emerald-400'
  },
  recusada: {
    label: 'Recusada',
    cls: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
    dot: 'bg-rose-400'
  },
  cancelada: {
    label: 'Cancelada',
    cls: 'bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-600/60',
    dot: 'bg-zinc-400'
  }
}

const tipoInfo = (tipo: TipoProposta) => {
  switch (tipo) {
    case 'dinheiro':
      return { label: 'Só dinheiro', cls: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30' }
    case 'troca_simples':
      return { label: 'Troca simples', cls: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30' }
    case 'troca_composta':
      return { label: 'Troca composta', cls: 'bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-500/30' }
    default:
      return { label: String(tipo || '—'), cls: 'bg-zinc-700/40 text-zinc-300 ring-1 ring-zinc-600/60' }
  }
}

/** ================== Página ================== */
export default function PropostasEnviadasPage() {
  const [idTime, setIdTime] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [jogadores, setJogadores] = useState<Record<string, Jogador>>({})

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novoValor, setNovoValor] = useState<string>('')

  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusProposta>('todos')

  // ===== Busca inicial
  useEffect(() => {
    const id_time = localStorage.getItem('id_time') || ''
    setIdTime(id_time)

    const carregar = async () => {
      try {
        setCarregando(true)
        setErro(null)

        const { data, error } = await supabase
          .from<Proposta>('propostas_app')
          .select('*')
          .eq('id_time_origem', id_time)
          .order('created_at', { ascending: false })

        if (error) throw error

        const lista = data ?? []
        setPropostas(lista)

        // Buscar jogadores vinculados (evita chamada com array vazio)
        const idsJog = Array.from(new Set(lista.map(p => p.jogador_id).filter(Boolean)))
        if (idsJog.length) {
          const { data: dataJog, error: errJog } = await supabase
            .from<Jogador>('elenco')
            .select('id, nome, imagem_url, posicao')
            .in('id', idsJog)

          if (errJog) throw errJog
          const dict = Object.fromEntries((dataJog ?? []).map(j => [j.id, j]))
          setJogadores(dict)
        } else {
          setJogadores({})
        }
      } catch (e: any) {
        setErro(e?.message || 'Erro ao carregar propostas.')
      } finally {
        setCarregando(false)
      }
    }

    if (id_time) carregar()
  }, [])

  /** ===== Ações ===== */
  const salvarEdicao = async (id: string) => {
    const valor = parseInt(novoValor || '0', 10)
    if (Number.isNaN(valor) || valor < 0) {
      alert('Informe um valor válido.')
      return
    }

    const { error } = await supabase
      .from('propostas_app')
      .update({ valor_oferecido: valor })
      .eq('id', id)

    if (error) {
      alert('Erro ao salvar edição.')
      return
    }

    setPropostas(prev =>
      prev.map(p => (p.id === id ? { ...p, valor_oferecido: valor } as Proposta : p))
    )
    setEditandoId(null)
    setNovoValor('')
  }

  const cancelarProposta = async (id: string) => {
    if (!confirm('Confirmar cancelamento desta proposta?')) return

    const { error } = await supabase
      .from('propostas_app')
      .update({ status: 'cancelada' })
      .eq('id', id)

    if (error) {
      alert('Erro ao cancelar proposta.')
      return
    }

    setPropostas(prev =>
      prev.map(p => (p.id === id ? { ...p, status: 'cancelada' } as Proposta : p))
    )
  }

  const excluirProposta = async (id: string) => {
    if (!confirm('Excluir permanentemente esta proposta? Esta ação não pode ser desfeita.')) return

    const { error } = await supabase
      .from('propostas_app')
      .delete()
      .eq('id', id)

    if (error) {
      alert('Erro ao excluir proposta.')
      return
    }

    setPropostas(prev => prev.filter(p => p.id !== id))
  }

  /** ===== Dados derivados ===== */
  const propostasFiltradas = useMemo(() => {
    if (filtroStatus === 'todos') return propostas
    return propostas.filter(p => p.status === filtroStatus)
  }, [propostas, filtroStatus])

  /** ===== UI helpers ===== */
  const renderJogadoresOferecidos = (arr: Proposta['jogadores_oferecidos']) => {
    const items = Array.isArray(arr) ? arr : []
    if (!items.length) return null
    return (
      <div className="mt-2 text-xs">
        <div className="text-zinc-300/90 mb-1">🧩 Jogadores oferecidos</div>
        <div className="flex flex-wrap gap-1">
          {items.map((it, idx) => (
            <span
              key={`${it}-${idx}`}
              className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700"
              title={String(it)}
            >
              {String(it)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  /** ===== Render ===== */
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <header className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            📤 Minhas Propostas Enviadas
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Acompanhe suas propostas, edite valores quando pendentes, cancele ou exclua.
          </p>
        </header>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(['todos', 'pendente', 'aceita', 'recusada', 'cancelada'] as const).map(tag => {
            const ativo = filtroStatus === tag
            return (
              <button
                key={tag}
                onClick={() => setFiltroStatus(tag)}
                className={[
                  'px-3 py-1.5 rounded-full text-sm transition ring-1',
                  ativo
                    ? 'bg-white text-black ring-white'
                    : 'bg-neutral-900 text-neutral-300 ring-neutral-700 hover:bg-neutral-800'
                ].join(' ')}
              >
                {tag === 'todos' ? 'Todos' : statusInfo[tag].label}
              </button>
            )
          })}
        </div>

        {/* Estados */}
        {erro && (
          <div className="mb-6 rounded-lg bg-rose-900/30 text-rose-200 ring-1 ring-rose-700 px-4 py-3">
            {erro}
          </div>
        )}

        {carregando && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 animate-pulse"
              >
                <div className="h-16 w-16 rounded-full bg-neutral-800 mb-4" />
                <div className="h-4 w-2/3 bg-neutral-800 mb-2 rounded" />
                <div className="h-3 w-1/2 bg-neutral-800 mb-4 rounded" />
                <div className="h-8 w-full bg-neutral-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {!carregando && propostasFiltradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center">
            <div className="text-3xl mb-2">🗂️</div>
            <div className="font-semibold">Nenhuma proposta encontrada</div>
            <div className="text-neutral-400 text-sm">
              {filtroStatus === 'todos'
                ? 'Você ainda não enviou propostas.'
                : 'Não há propostas com este status.'}
            </div>
          </div>
        )}

        {/* Grid de cards */}
        {!carregando && propostasFiltradas.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {propostasFiltradas.map(p => {
              const jogador = jogadores[p.jogador_id]
              const sInfo = statusInfo[p.status]
              const tInfo = tipoInfo(p.tipo_proposta)

              const podeEditar = p.status === 'pendente'
              const emEdicao = editandoId === p.id

              return (
                <div
                  key={p.id}
                  className="group rounded-2xl border border-neutral-800 bg-neutral-900/70 hover:bg-neutral-900 transition shadow-sm overflow-hidden"
                >
                  {/* Topo */}
                  <div className="p-4 flex items-start gap-3">
                    <img
                      src={jogador?.imagem_url || '/jogador_padrao.png'}
                      alt={jogador?.nome || 'Jogador'}
                      className="w-16 h-16 rounded-full object-cover ring-1 ring-neutral-800"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold leading-tight truncate max-w-[12rem]">
                          {jogador?.nome || 'Jogador não encontrado'}
                        </h3>
                        {/* Status */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] ${sInfo.cls}`}
                          title={`Status: ${sInfo.label}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${sInfo.dot}`} />
                          {sInfo.label}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-neutral-300/90 flex flex-wrap items-center gap-2">
                        <span className="uppercase tracking-wide text-neutral-400">
                          {jogador?.posicao || '—'}
                        </span>
                        <span className="text-neutral-500">•</span>
                        <span className="truncate">
                          Destino: <span className="text-neutral-200">{p.nome_time_alvo || '—'}</span>
                        </span>
                      </div>

                      {/* Tipo */}
                      <div
                        className={`mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] ${tInfo.cls}`}
                        title={`Tipo: ${tInfo.label}`}
                      >
                        {tInfo.label}
                      </div>
                    </div>
                  </div>

                  {/* Valor / Data */}
                  <div className="px-4">
                    {!emEdicao ? (
                      <div className="text-sm">
                        <div className="text-neutral-400">Valor oferecido</div>
                        <div className="font-semibold">{formatarMoeda(p.valor_oferecido)}</div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div className="text-neutral-400 mb-1">Novo valor</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={novoValor}
                            onChange={(e) => setNovoValor(e.target.value)}
                            className="w-32 rounded-lg bg-neutral-950 border border-neutral-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-white/10"
                            min={0}
                          />
                          <button
                            onClick={() => salvarEdicao(p.id)}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                          >
                            💾 Salvar
                          </button>
                          <button
                            onClick={() => { setEditandoId(null); setNovoValor('') }}
                            className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs"
                          >
                            ❌ Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-neutral-400">
                      Enviada em {formatarData(p.created_at)}
                    </div>
                  </div>

                  {/* Jogadores oferecidos */}
                  <div className="px-4">
                    {renderJogadoresOferecidos(p.jogadores_oferecidos)}
                  </div>

                  {/* Ações */}
                  <div className="px-4 pb-4 pt-3 mt-3 border-t border-neutral-800 flex flex-wrap gap-2">
                    {podeEditar && !emEdicao && (
                      <button
                        onClick={() => {
                          setEditandoId(p.id)
                          setNovoValor(String(p.valor_oferecido ?? ''))
                        }}
                        className="px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-xs"
                      >
                        ✏️ Editar
                      </button>
                    )}

                    {p.status === 'pendente' && (
                      <button
                        onClick={() => cancelarProposta(p.id)}
                        className="px-3 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 text-amber-100 text-xs"
                      >
                        🚫 Cancelar
                      </button>
                    )}

                    {/* Excluir sempre disponível */}
                    <button
                      onClick={() => excluirProposta(p.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs ml-auto"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

