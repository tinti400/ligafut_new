'use client'

import CardJogador from '@/components/CardJogador'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'

/** ================== Supabase ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ================== Tipos ================== */
type StatusProposta = 'pendente' | 'aceita' | 'recusada' | 'cancelada'
type TipoProposta = 'dinheiro' | 'troca_simples' | 'troca_composta' | 'comprar_percentual' | string

interface Proposta {
  id: string
  id_time_origem: string
  nome_time_alvo: string | null
  jogador_id: string
  valor_oferecido: number | null
  jogadores_oferecidos: any[] | string[] | null
  tipo_proposta: TipoProposta
  status: StatusProposta
  created_at?: string | null
  percentual?: number | null
  percentual_desejado?: number | null
}

interface Jogador {
  id: string
  nome: string
  imagem_url?: string | null
  foto?: string | null
  posicao?: string | null
  overall?: number | null
  valor?: number | null
  salario?: number | null
  nacionalidade?: string | null
  pace?: number | null
  shooting?: number | null
  passing?: number | null
  dribbling?: number | null
  defending?: number | null
  physical?: number | null
  pac?: number | null
  sho?: number | null
  pas?: number | null
  dri?: number | null
  def?: number | null
  phy?: number | null
  ritmo?: number | null
  finalizacao?: number | null
  passe?: number | null
  drible?: number | null
  defesa?: number | null
  fisico?: number | null
}

/** ================== Utils ================== */
const formatarMoeda = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

const formatarData = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const normalizarStatus = (status?: string | null): StatusProposta => {
  if (status === 'aceita' || status === 'recusada' || status === 'cancelada') return status
  return 'pendente'
}

const statusInfo: Record<StatusProposta, { label: string; cls: string; dot: string; icon: string }> = {
  pendente: {
    label: 'Pendente',
    cls: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300',
    dot: 'bg-yellow-400',
    icon: '⏳',
  },
  aceita: {
    label: 'Aceita',
    cls: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
    icon: '✅',
  },
  recusada: {
    label: 'Recusada',
    cls: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
    dot: 'bg-rose-400',
    icon: '❌',
  },
  cancelada: {
    label: 'Cancelada',
    cls: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-300',
    dot: 'bg-zinc-400',
    icon: '🚫',
  },
}

const tipoInfo = (tipo: TipoProposta) => {
  switch (tipo) {
    case 'dinheiro':
      return { label: 'Só dinheiro', cls: 'border-sky-500/25 bg-sky-500/10 text-sky-300', icon: '💰' }
    case 'troca_simples':
      return { label: 'Troca simples', cls: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300', icon: '🔁' }
    case 'troca_composta':
      return { label: 'Troca composta', cls: 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300', icon: '🔁💰' }
    case 'comprar_percentual':
      return { label: 'Comprar percentual', cls: 'border-lime-500/25 bg-lime-500/10 text-lime-300', icon: '📈' }
    default:
      return { label: String(tipo || '—'), cls: 'border-zinc-600/50 bg-zinc-700/20 text-zinc-300', icon: '📌' }
  }
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${className}`}>
      {children}
    </span>
  )
}

function StatCard({ titulo, valor, subtitulo }: { titulo: string; valor: string; subtitulo: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">{titulo}</div>
      <div className="mt-2 text-2xl font-black text-white">{valor}</div>
      <div className="mt-1 text-xs text-white/55">{subtitulo}</div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-xl animate-pulse">
      <div className="mx-auto h-56 w-full max-w-[230px] rounded-[1.8rem] bg-white/10" />
      <div className="mt-4 h-24 rounded-2xl bg-white/10" />
    </div>
  )
}

function extrairNomeJogadorOferecido(item: any) {
  if (!item) return 'Jogador'
  if (typeof item === 'string') return item
  return item.nome || item.name || item.id || 'Jogador'
}

/** ================== Página ================== */
export default function PropostasEnviadasPage() {
  const [idTime, setIdTime] = useState('')
  const [nomeTime, setNomeTime] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [jogadores, setJogadores] = useState<Record<string, Jogador>>({})

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novoValor, setNovoValor] = useState<string>('')
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const [filtroStatus, setFiltroStatus] = useState<'todos' | StatusProposta>('todos')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    const userStorage = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    let id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''
    let nome_time = typeof window !== 'undefined' ? localStorage.getItem('nome_time') || '' : ''

    if (userStorage) {
      try {
        const parsed = JSON.parse(userStorage)
        id_time = id_time || parsed?.id_time || parsed?.time_id || parsed?.time?.id || ''
        nome_time = nome_time || parsed?.nome_time || parsed?.time_nome || parsed?.nome || ''
      } catch {}
    }

    setIdTime(id_time)
    setNomeTime(nome_time)

    const carregar = async () => {
      if (!id_time) {
        setErro('Time não identificado. Faça login novamente.')
        setCarregando(false)
        return
      }

      try {
        setCarregando(true)
        setErro(null)

        const { data, error } = await supabase
          .from('propostas_app')
          .select('*')
          .eq('id_time_origem', id_time)
          .order('created_at', { ascending: false })
          .returns<Proposta[]>()

        if (error) throw error

        const lista = (data ?? []).map((p) => ({ ...p, status: normalizarStatus(p.status) }))
        setPropostas(lista)

        const idsJog = Array.from(new Set(lista.map((p) => p.jogador_id).filter(Boolean)))
        if (idsJog.length) {
          const { data: dataJog, error: errJog } = await supabase
            .from('elenco')
            .select(`
              id,
              nome,
              imagem_url,
              foto,
              posicao,
              overall,
              valor,
              salario,
              nacionalidade,
              pace,
              shooting,
              passing,
              dribbling,
              defending,
              physical
            `)
            .in('id', idsJog)
            .returns<Jogador[]>()

          if (errJog) throw errJog
          const dict = Object.fromEntries((dataJog ?? []).map((j) => [j.id, j]))
          setJogadores(dict)
        } else {
          setJogadores({})
        }
      } catch (e: any) {
        console.error(e)
        setErro(e?.message || 'Erro ao carregar propostas.')
      } finally {
        setCarregando(false)
      }
    }

    carregar()
  }, [])

  const salvarEdicao = async (id: string) => {
    const valor = Number(novoValor || 0)
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Informe um valor válido.')
      return
    }

    setSalvandoId(id)

    try {
      const { error } = await supabase.from('propostas_app').update({ valor_oferecido: Math.round(valor) }).eq('id', id)

      if (error) throw error

      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, valor_oferecido: Math.round(valor) } : p)))
      setEditandoId(null)
      setNovoValor('')
      toast.success('Proposta atualizada!')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao salvar edição.')
    } finally {
      setSalvandoId(null)
    }
  }

  const cancelarProposta = async (id: string) => {
    if (!confirm('Confirmar cancelamento desta proposta?')) return
    setCancelandoId(id)

    try {
      const { error } = await supabase.from('propostas_app').update({ status: 'cancelada' }).eq('id', id)
      if (error) throw error

      setPropostas((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'cancelada' } : p)))
      toast.success('Proposta cancelada.')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao cancelar proposta.')
    } finally {
      setCancelandoId(null)
    }
  }

  const excluirProposta = async (id: string) => {
    if (!confirm('Excluir permanentemente esta proposta? Esta ação não pode ser desfeita.')) return
    setExcluindoId(id)

    try {
      const { error } = await supabase.from('propostas_app').delete().eq('id', id)
      if (error) throw error

      setPropostas((prev) => prev.filter((p) => p.id !== id))
      toast.success('Proposta excluída.')
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao excluir proposta.')
    } finally {
      setExcluindoId(null)
    }
  }

  const contadores = useMemo(() => {
    return propostas.reduce(
      (acc, p) => {
        acc.total += 1
        acc[p.status] += 1
        return acc
      },
      { total: 0, pendente: 0, aceita: 0, recusada: 0, cancelada: 0 } as Record<StatusProposta | 'total', number>
    )
  }, [propostas])

  const propostasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return propostas.filter((p) => {
      const jogador = jogadores[p.jogador_id]
      const passaStatus = filtroStatus === 'todos' || p.status === filtroStatus
      const passaBusca =
        !termo ||
        jogador?.nome?.toLowerCase().includes(termo) ||
        jogador?.posicao?.toLowerCase().includes(termo) ||
        p.nome_time_alvo?.toLowerCase().includes(termo) ||
        p.tipo_proposta?.toLowerCase().includes(termo)

      return passaStatus && passaBusca
    })
  }, [propostas, jogadores, filtroStatus, busca])

  const renderJogadoresOferecidos = (arr: Proposta['jogadores_oferecidos']) => {
    const items = Array.isArray(arr) ? arr : []
    if (!items.length) return null

    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Jogadores oferecidos</div>
        <div className="flex flex-wrap gap-2">
          {items.map((it, idx) => (
            <span
              key={`${JSON.stringify(it)}-${idx}`}
              className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80"
              title={typeof it === 'string' ? it : JSON.stringify(it)}
            >
              {extrairNomeJogadorOferecido(it)}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <Toaster position="top-right" />

      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_10%_0%,rgba(16,185,129,.22),transparent_60%),radial-gradient(900px_500px_at_90%_10%,rgba(250,204,21,.12),transparent_60%),radial-gradient(900px_600px_at_50%_100%,rgba(34,197,94,.08),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.62),rgba(0,0,0,.92),rgba(0,0,0,.98))]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>

      <header className="border-b border-white/10 bg-black/35 backdrop-blur-2xl">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,.9)]" />
                Central de propostas
              </div>

              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                <span className="bg-gradient-to-r from-emerald-300 via-lime-200 to-yellow-300 bg-clip-text text-transparent">
                  PROPOSTAS ENVIADAS
                </span>
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/60">
                Acompanhe suas ofertas, edite valores pendentes, cancele negociações e veja os jogadores no padrão visual LigaFut.
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.055] px-4 py-3 shadow-xl backdrop-blur-xl">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Clube logado</div>
              <div className="mt-1 text-lg font-black text-white">{nomeTime || 'Não identificado'}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard titulo="Total" valor={String(contadores.total)} subtitulo="Propostas enviadas" />
          <StatCard titulo="Pendentes" valor={String(contadores.pendente)} subtitulo="Aguardando resposta" />
          <StatCard titulo="Aceitas" valor={String(contadores.aceita)} subtitulo="Negócios fechados" />
          <StatCard titulo="Recusadas" valor={String(contadores.recusada)} subtitulo="Não aprovadas" />
          <StatCard titulo="Canceladas" valor={String(contadores.cancelada)} subtitulo="Encerradas por você" />
        </section>

        <section className="mb-7 rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Filtros</h2>
              <p className="text-sm text-white/50">Busque por jogador, posição, time destino ou tipo de proposta.</p>
            </div>

            <div className="w-full lg:max-w-md">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="🔎 Buscar proposta..."
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['todos', 'pendente', 'aceita', 'recusada', 'cancelada'] as const).map((tag) => {
              const ativo = filtroStatus === tag
              const label = tag === 'todos' ? 'Todos' : statusInfo[tag].label
              const total = tag === 'todos' ? contadores.total : contadores[tag]

              return (
                <button
                  key={tag}
                  onClick={() => setFiltroStatus(tag)}
                  className={[
                    'rounded-full border px-4 py-2 text-sm font-black transition',
                    ativo
                      ? 'border-emerald-300/50 bg-emerald-400 text-black shadow-lg shadow-emerald-400/20'
                      : 'border-white/10 bg-black/25 text-white/70 hover:bg-white/10 hover:text-white',
                  ].join(' ')}
                >
                  {label} <span className="ml-1 opacity-70">({total})</span>
                </button>
              )
            })}
          </div>
        </section>

        {erro && (
          <div className="mb-6 rounded-3xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-rose-200">
            {erro}
          </div>
        )}

        {carregando && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!carregando && propostasFiltradas.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.04] p-10 text-center shadow-2xl backdrop-blur-xl">
            <div className="text-4xl">🗂️</div>
            <div className="mt-3 text-xl font-black">Nenhuma proposta encontrada</div>
            <div className="mt-1 text-sm text-white/50">
              {filtroStatus === 'todos' ? 'Você ainda não enviou propostas.' : 'Não há propostas com este status.'}
            </div>
          </div>
        )}

        {!carregando && propostasFiltradas.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {propostasFiltradas.map((p) => {
              const jogador = jogadores[p.jogador_id]
              const sInfo = statusInfo[p.status]
              const tInfo = tipoInfo(p.tipo_proposta)
              const podeEditar = p.status === 'pendente'
              const emEdicao = editandoId === p.id
              const percentual = p.percentual_desejado ?? p.percentual ?? null

              const jogadorCard = {
                id: jogador?.id || p.jogador_id,
                nome: jogador?.nome || 'Jogador não encontrado',
                overall: jogador?.overall ?? 0,
                posicao: jogador?.posicao || '—',
                nacionalidade: jogador?.nacionalidade ?? undefined,
                imagem_url: jogador?.imagem_url ?? jogador?.foto ?? undefined,
                foto: jogador?.foto ?? undefined,
                valor: jogador?.valor ?? p.valor_oferecido ?? 0,
                salario: jogador?.salario ?? 0,
                pace: jogador?.pace ?? jogador?.pac ?? jogador?.ritmo ?? null,
                shooting: jogador?.shooting ?? jogador?.sho ?? jogador?.finalizacao ?? null,
                passing: jogador?.passing ?? jogador?.pas ?? jogador?.passe ?? null,
                dribbling: jogador?.dribbling ?? jogador?.dri ?? jogador?.drible ?? null,
                defending: jogador?.defending ?? jogador?.def ?? jogador?.defesa ?? null,
                physical: jogador?.physical ?? jogador?.phy ?? jogador?.fisico ?? null,
                pac: jogador?.pac ?? jogador?.pace ?? jogador?.ritmo ?? null,
                sho: jogador?.sho ?? jogador?.shooting ?? jogador?.finalizacao ?? null,
                pas: jogador?.pas ?? jogador?.passing ?? jogador?.passe ?? null,
                dri: jogador?.dri ?? jogador?.dribbling ?? jogador?.drible ?? null,
                def: jogador?.def ?? jogador?.defending ?? jogador?.defesa ?? null,
                phy: jogador?.phy ?? jogador?.physical ?? jogador?.fisico ?? null,
              }

              return (
                <article
                  key={p.id}
                  className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl transition hover:border-emerald-300/30 hover:bg-white/[0.075]"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <Badge className={sInfo.cls}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sInfo.dot}`} />
                      {sInfo.icon} {sInfo.label}
                    </Badge>
                    <Badge className={tInfo.cls}>
                      {tInfo.icon} {tInfo.label}
                    </Badge>
                  </div>

                  <div className="flex justify-center">
                    <CardJogador modo="elenco" jogador={jogadorCard as any} />
                  </div>

                  <div className="mt-4 rounded-3xl border border-white/10 bg-black/25 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">Destino</div>
                        <div className="mt-1 truncate text-sm font-bold text-white">{p.nome_time_alvo || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-white/35">Data</div>
                        <div className="mt-1 text-sm font-bold text-white">{formatarData(p.created_at)}</div>
                      </div>
                    </div>

                    {!emEdicao ? (
                      <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-200/60">Valor oferecido</div>
                        <div className="mt-1 text-xl font-black text-emerald-200">{formatarMoeda(p.valor_oferecido)}</div>
                        {percentual ? <div className="mt-1 text-xs text-lime-200/75">Percentual desejado: {percentual}%</div> : null}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                        <label className="text-[11px] font-black uppercase tracking-[0.14em] text-yellow-200/70">Novo valor</label>
                        <input
                          type="number"
                          value={novoValor}
                          onChange={(e) => setNovoValor(e.target.value)}
                          min={0}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-yellow-300/50"
                          placeholder="Ex: 10000000"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => salvarEdicao(p.id)}
                            disabled={salvandoId === p.id}
                            className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-black transition hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {salvandoId === p.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            onClick={() => {
                              setEditandoId(null)
                              setNovoValor('')
                            }}
                            className="flex-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/15"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {renderJogadoresOferecidos(p.jogadores_oferecidos)}

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                      {podeEditar && !emEdicao && (
                        <button
                          onClick={() => {
                            setEditandoId(p.id)
                            setNovoValor(String(p.valor_oferecido ?? ''))
                          }}
                          className="rounded-xl bg-yellow-500 px-3 py-2 text-xs font-black text-black transition hover:bg-yellow-400"
                        >
                          ✏️ Editar
                        </button>
                      )}

                      {p.status === 'pendente' && (
                        <button
                          onClick={() => cancelarProposta(p.id)}
                          disabled={cancelandoId === p.id}
                          className="rounded-xl border border-amber-400/20 bg-amber-500/15 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-60"
                        >
                          {cancelandoId === p.id ? 'Cancelando...' : '🚫 Cancelar'}
                        </button>
                      )}

                      <button
                        onClick={() => excluirProposta(p.id)}
                        disabled={excluindoId === p.id}
                        className="ml-auto rounded-xl border border-rose-400/20 bg-rose-500/15 px-3 py-2 text-xs font-black text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-60"
                      >
                        {excluindoId === p.id ? 'Excluindo...' : '🗑️ Excluir'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
