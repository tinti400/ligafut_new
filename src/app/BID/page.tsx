'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import classNames from 'classnames'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

/** ========= Supabase ========= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Watermark ========= */
const WATERMARK_LOGO_SRC = '/watermarks/ligafut26.png'

function WatermarkBG() {
  const itens = useMemo(() => Array.from({ length: 42 }), [])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* logo grande */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={WATERMARK_LOGO_SRC}
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 top-24 -translate-x-1/2 w-[520px] max-w-[90vw] opacity-[0.06] rotate-[-8deg] blur-[0.2px]"
        draggable={false}
      />

      {/* texto repetido */}
      <div className="absolute left-[-30%] top-[25%] rotate-[-18deg] w-[160%]">
        <div className="flex flex-wrap gap-x-6 gap-y-4 opacity-[0.06]">
          {itens.map((_, i) => (
            <span
              key={i}
              className="text-[12px] font-extrabold tracking-[0.28em] text-white/80 select-none"
            >
              LIGAFUT26
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** ========= Tipos ========= */
type IDEvt = string | number

interface Jogador {
  id: string
  nome: string
  foto_url?: string | null
  posicao?: string | null
  idade?: number | null
  nacionalidade?: string | null
}

interface EventoBID {
  id: IDEvt
  tipo_evento: string
  descricao: string
  id_time1: string
  id_time2?: string | null
  valor?: number | null
  data_evento: string
  id_jogador?: string | null
  nome_jogador?: string | null
  foto_jogador_url?: string | null
}

interface Time {
  id: string
  nome: string
  logo_url?: string | null
}

type Comentario = {
  id: string
  id_evento: string
  id_time: string
  nome_time: string
  comentario: string
  criado_em: string
}

type Reacao = {
  id: string
  id_evento: string
  id_time: string
  emoji: string
  criado_em: string
}

/** ========= Emojis ========= */
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'] as const
type Emoji = (typeof EMOJIS)[number]

/** ========= Consts de UI/Filtro ========= */
const TIPOS_CHIP = [
  { key: 'todos', label: 'Todos' },
  { key: 'transfer', label: 'Transferência' },
  { key: 'emprest', label: 'Empréstimo' },
  { key: 'rescis', label: 'Rescisão' },
  { key: 'compra', label: 'Compra' },
  { key: 'salario', label: 'Salário' },
  { key: 'bonus', label: 'Bônus' },
] as const
type TipoChipKey = (typeof TIPOS_CHIP)[number]['key']

type SortOrder = 'recente' | 'antigo' | 'valor'

/** ========= Helpers visuais ========= */
function tipoToStyle(tipo: string) {
  const t = tipo.toLowerCase()
  if (t.includes('transfer'))
    return {
      ring: 'ring-purple-500/35',
      chip: 'bg-purple-500/15 text-purple-200 border-purple-500/25',
      dot: 'bg-purple-400',
      glow: 'shadow-[0_0_0_1px_rgba(168,85,247,.15)]',
    }
  if (t.includes('emprést') || t.includes('emprest'))
    return {
      ring: 'ring-blue-500/35',
      chip: 'bg-blue-500/15 text-blue-200 border-blue-500/25',
      dot: 'bg-blue-400',
      glow: 'shadow-[0_0_0_1px_rgba(59,130,246,.15)]',
    }
  if (t.includes('rescis'))
    return {
      ring: 'ring-red-500/35',
      chip: 'bg-red-500/15 text-red-200 border-red-500/25',
      dot: 'bg-red-400',
      glow: 'shadow-[0_0_0_1px_rgba(239,68,68,.15)]',
    }
  if (t.includes('compra'))
    return {
      ring: 'ring-emerald-500/35',
      chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
      dot: 'bg-emerald-400',
      glow: 'shadow-[0_0_0_1px_rgba(16,185,129,.15)]',
    }
  if (t.includes('salario'))
    return {
      ring: 'ring-orange-500/35',
      chip: 'bg-orange-500/15 text-orange-200 border-orange-500/25',
      dot: 'bg-orange-400',
      glow: 'shadow-[0_0_0_1px_rgba(249,115,22,.15)]',
    }
  if (t.includes('bonus') || t.includes('bônus'))
    return {
      ring: 'ring-lime-500/35',
      chip: 'bg-lime-500/15 text-lime-200 border-lime-500/25',
      dot: 'bg-lime-400',
      glow: 'shadow-[0_0_0_1px_rgba(163,230,53,.15)]',
    }
  return {
    ring: 'ring-gray-500/25',
    chip: 'bg-gray-500/15 text-gray-200 border-gray-500/25',
    dot: 'bg-gray-400',
    glow: 'shadow-[0_0_0_1px_rgba(156,163,175,.12)]',
  }
}

function iconeTipo(tipo: string) {
  const t = tipo.toLowerCase()
  if (t.includes('transfer')) return '💸'
  if (t.includes('emprést') || t.includes('emprest')) return '🤝'
  if (t.includes('rescis')) return '✂️'
  if (t.includes('compra')) return '🛒'
  if (t.includes('salario')) return '📤'
  if (t.includes('bonus') || t.includes('bônus')) return '🎁'
  return '📝'
}

function capitalizar(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
}

function diaSemanaPt(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date)
}

function horaPt(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatBRL(valor?: number | null) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function AvatarTime({ nome, logo }: { nome: string; logo?: string | null }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={nome}
        className="size-9 rounded-full object-cover ring-1 ring-white/10 bg-black/30"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  const iniciais = nome
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
  return (
    <div className="size-9 rounded-full bg-gray-800 text-gray-200 grid place-items-center ring-1 ring-white/10">
      <span className="text-xs font-extrabold">{iniciais || '?'}</span>
    </div>
  )
}

/** ========= Utils de busca ========= */
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function getTipoKey(tipo: string): TipoChipKey {
  const t = tipo.toLowerCase()
  if (t.includes('transfer')) return 'transfer'
  if (t.includes('emprést') || t.includes('emprest')) return 'emprest'
  if (t.includes('rescis')) return 'rescis'
  if (t.includes('compra')) return 'compra'
  if (t.includes('salario')) return 'salario'
  if (t.includes('bonus') || t.includes('bônus')) return 'bonus'
  return 'todos'
}
function useDebounce<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** ========= Highlight ========= */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-yellow-400/25 text-yellow-100 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

/** ========= Player Card ========= */
function CardJogador({ j, highlight }: { j: Partial<Jogador>; highlight?: string }) {
  if (!j?.nome && !j?.foto_url) return null

  const nomeNode = highlight ? <Highlight text={j.nome || ''} query={highlight} /> : <>{j.nome}</>

  return (
    <div className="rounded-2xl bg-black/30 border border-white/10 p-3 flex gap-3 items-center shadow-sm">
      {j.foto_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={j.foto_url}
          alt={j.nome || 'Jogador'}
          loading="lazy"
          className="size-14 rounded-xl object-cover ring-1 ring-white/10 bg-black/30"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="size-14 rounded-xl bg-gray-800 text-gray-300 grid place-items-center ring-1 ring-white/10">
          <span className="text-lg">👤</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-white truncate">{nomeNode}</p>
        <p className="text-xs text-gray-300">
          {[j.posicao, j.nacionalidade].filter(Boolean).join(' • ') || 'Jogador'}
        </p>
        {typeof j.idade === 'number' && <p className="text-xs text-gray-400 mt-0.5">{j.idade} anos</p>}
      </div>
    </div>
  )
}

/** ========= Página ========= */
export default function BIDPage() {
  const { isAdmin } = useAdmin()

  const [eventos, setEventos] = useState<EventoBID[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [timesLista, setTimesLista] = useState<Time[]>([])
  const [jogadoresMap, setJogadoresMap] = useState<Record<string, Jogador>>({})

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroTime, setFiltroTime] = useState('todos')
  const [tipoFiltro, setTipoFiltro] = useState<TipoChipKey>('todos')
  const [sortOrder, setSortOrder] = useState<SortOrder>('recente')

  const [buscaTexto, setBuscaTexto] = useState('')
  const debouncedBusca = useDebounce(buscaTexto, 350)
  const buscaAtiva = debouncedBusca.trim().length >= 2

  const [pagina, setPagina] = useState(1)
  const [limite] = useState(25)
  const [totalPaginas, setTotalPaginas] = useState(1)

  const [comentariosMap, setComentariosMap] = useState<Record<string, Comentario[]>>({})
  const [comentando, setComentando] = useState<Record<string, boolean>>({})
  const [novoComentario, setNovoComentario] = useState<Record<string, string>>({})
  const [excluindoComentario, setExcluindoComentario] = useState<Record<string, boolean>>({})
  const [comentarioAberto, setComentarioAberto] = useState<Record<string, boolean>>({})

  const [reacoesCount, setReacoesCount] = useState<Record<string, Record<Emoji, number>>>({})
  const [minhasReacoes, setMinhasReacoes] = useState<Record<string, Record<Emoji, boolean>>>({})
  const [reagindo, setReagindo] = useState<Record<string, boolean>>({})

  const [idTimeLogado, setIdTimeLogado] = useState<string | null>(null)
  const [nomeTimeLogado, setNomeTimeLogado] = useState<string | null>(null)

  const [listaDiasAnim] = useAutoAnimate<HTMLDivElement>()
  const [commentsAnim] = useAutoAnimate<HTMLDivElement>()

  const topRef = useRef<HTMLDivElement | null>(null)

  const filtroGlobalAtivo = !buscaAtiva && (filtroTime !== 'todos' || tipoFiltro !== 'todos')

  /** ====== Identidade do time (robusto + atualiza nome pelo BD) ====== */
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('id_time') || localStorage.getItem('idTime') || null
    let nome = localStorage.getItem('nome_time') || localStorage.getItem('nomeTime') || null

    const tentar = (key: string) => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const obj = JSON.parse(raw)
        if (!id) id = obj?.id_time || obj?.idTime || obj?.id || null
        if (!nome) nome = obj?.nome_time || obj?.nomeTime || obj?.nome || null
      } catch {}
    }
    ;['user', 'usuario', 'usuario_atual', 'perfil', 'account'].forEach(tentar)

    if (id) setIdTimeLogado(String(id))
    if (nome) setNomeTimeLogado(String(nome))

    ;(async () => {
      try {
        if (!id) return
        const { data, error } = await supabase.from('times').select('nome').eq('id', String(id)).maybeSingle()
        if (!error && data?.nome) setNomeTimeLogado(data.nome)
      } catch {}
    })()
  }, [])

  /** ====== Carrega times uma vez (e mantém mapa atualizado) ====== */
  useEffect(() => {
    ;(async () => {
      const { data: timesData, error: errorTimes } = await supabase.from('times').select('id, nome, logo_url')
      if (errorTimes) {
        console.error(errorTimes)
        setTimesLista([])
        setTimesMap({})
        return
      }
      const map: Record<string, Time> = {}
      ;(timesData || []).forEach((t) => (map[t.id] = t))
      setTimesLista(timesData || [])
      setTimesMap(map)

      if (idTimeLogado && map[idTimeLogado]?.nome) {
        setNomeTimeLogado(map[idTimeLogado].nome)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ====== Inicial ====== */
  useEffect(() => {
    if (!buscaAtiva && !filtroGlobalAtivo) carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ====== Busca global reativa ====== */
  useEffect(() => {
    if (buscaAtiva) buscarGlobal(debouncedBusca)
    else if (filtroGlobalAtivo) carregarFiltrado()
    else carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBusca])

  /** ====== Filtro global reativo ====== */
  useEffect(() => {
    if (buscaAtiva) return
    if (filtroGlobalAtivo) carregarFiltrado()
    else carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTime, tipoFiltro])

  /** ====== Ordenação reativa (client) ====== */
  useEffect(() => {
    setEventos((prev) => {
      const arr = [...prev]
      if (sortOrder === 'valor') arr.sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
      else if (sortOrder === 'antigo') arr.sort((a, b) => +new Date(a.data_evento) - +new Date(b.data_evento))
      else arr.sort((a, b) => +new Date(b.data_evento) - +new Date(a.data_evento))
      return arr
    })
  }, [sortOrder])

  /** ====== Dados: eventos paginados ====== */
  async function carregarDados(paginaAtual = 1) {
    if (buscaAtiva || filtroGlobalAtivo) return
    setLoading(true)
    setErro(null)
    const offset = (paginaAtual - 1) * limite

    try {
      const { count, error: errorCount } = await supabase.from('bid').select('*', { count: 'exact', head: true })
      if (errorCount) throw errorCount

      const { data: eventosData, error: errorEventos } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .range(offset, offset + limite - 1)
      if (errorEventos) throw errorEventos

      const lista = ((eventosData as EventoBID[]) || []).slice()
      lista.sort((a, b) =>
        sortOrder === 'valor'
          ? (b.valor ?? 0) - (a.valor ?? 0)
          : sortOrder === 'antigo'
            ? +new Date(a.data_evento) - +new Date(b.data_evento)
            : +new Date(b.data_evento) - +new Date(a.data_evento)
      )

      setEventos(lista)
      await carregarJogadoresParaEventos(lista)

      const paginas = Math.ceil(((count || 1) as number) / limite)
      setTotalPaginas(paginas)
      setPagina(paginaAtual)

      const idsStr = lista.map((e: any) => String(e.id))
      await Promise.all([carregarComentariosParaEventos(idsStr), carregarReacoesParaEventos(idsStr)])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao carregar os eventos.')
      setEventos([])
      setComentariosMap({})
      setReacoesCount({})
      setMinhasReacoes({})
    } finally {
      setLoading(false)
    }
  }

  /** ====== Modo filtro global ====== */
  async function carregarFiltrado() {
    setLoading(true)
    setErro(null)
    try {
      let q = supabase.from('bid').select('*')

      if (filtroTime !== 'todos') q = q.or(`id_time1.eq.${filtroTime},id_time2.eq.${filtroTime}`)

      if (tipoFiltro !== 'todos') {
        const mapOr: Record<Exclude<TipoChipKey, 'todos'>, string> = {
          transfer: 'tipo_evento.ilike.*transfer*',
          emprest: 'tipo_evento.ilike.*emprest*,tipo_evento.ilike.*emprést*',
          rescis: 'tipo_evento.ilike.*rescis*',
          compra: 'tipo_evento.ilike.*compra*',
          salario: 'tipo_evento.ilike.*salario*',
          bonus: 'tipo_evento.ilike.*bonus*,tipo_evento.ilike.*bônus*',
        }
        q = q.or(mapOr[tipoFiltro])
      }

      if (sortOrder === 'valor') q = q.order('valor', { ascending: false, nullsFirst: false })
      else if (sortOrder === 'antigo') q = q.order('data_evento', { ascending: true })
      else q = q.order('data_evento', { ascending: false })

      const { data, error } = await q
      if (error) throw error

      const lista = ((data as EventoBID[]) || []).slice()
      setEventos(lista)
      await carregarJogadoresParaEventos(lista)

      setTotalPaginas(1)
      setPagina(1)

      const idsStr = lista.map((e) => String(e.id))
      await Promise.all([carregarComentariosParaEventos(idsStr), carregarReacoesParaEventos(idsStr)])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao carregar com filtros.')
      setEventos([])
      setComentariosMap({})
      setReacoesCount({})
      setMinhasReacoes({})
    } finally {
      setLoading(false)
    }
  }

  /** ====== Busca global ====== */
  async function buscarGlobal(termo: string) {
    const termoTrim = termo.trim()
    if (termoTrim.length < 2) return
    setLoading(true)
    setErro(null)

    try {
      const { data: timesLike, error: errTimesLike } = await supabase
        .from('times')
        .select('id')
        .ilike('nome', `%${termoTrim}%`)
      if (errTimesLike) throw errTimesLike
      const timeIds = (timesLike || []).map((t: any) => t.id)

      const { data: porDesc, error: errDesc } = await supabase
        .from('bid')
        .select('*')
        .ilike('descricao', `%${termoTrim}%`)
        .order('data_evento', { ascending: false })
      if (errDesc) throw errDesc

      const { data: porJogador, error: errJog } = await supabase
        .from('bid')
        .select('*')
        .ilike('nome_jogador', `%${termoTrim}%`)
        .order('data_evento', { ascending: false })
      if (errJog) throw errJog

      let porTime1: EventoBID[] = []
      if (timeIds.length) {
        const { data, error } = await supabase.from('bid').select('*').in('id_time1', timeIds).order('data_evento', {
          ascending: false,
        })
        if (error) throw error
        porTime1 = (data as EventoBID[]) || []
      }

      let porTime2: EventoBID[] = []
      if (timeIds.length) {
        const { data, error } = await supabase.from('bid').select('*').in('id_time2', timeIds).order('data_evento', {
          ascending: false,
        })
        if (error) throw error
        porTime2 = (data as EventoBID[]) || []
      }

      const mapa: Record<string, EventoBID> = {}
      ;[...(porDesc as EventoBID[]), ...(porJogador as EventoBID[]), ...porTime1, ...porTime2].forEach((ev) => {
        mapa[String(ev.id)] = ev
      })

      const unicos = Object.values(mapa).sort((a, b) =>
        sortOrder === 'valor'
          ? (b.valor ?? 0) - (a.valor ?? 0)
          : sortOrder === 'antigo'
            ? +new Date(a.data_evento) - +new Date(b.data_evento)
            : +new Date(b.data_evento) - +new Date(a.data_evento)
      )

      setEventos(unicos)
      await carregarJogadoresParaEventos(unicos)

      setTotalPaginas(1)
      setPagina(1)

      const idsStr = unicos.map((e) => String(e.id))
      await Promise.all([carregarComentariosParaEventos(idsStr), carregarReacoesParaEventos(idsStr)])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err: any) {
      console.error(err)
      setErro('Erro na busca.')
      setEventos([])
      setComentariosMap({})
      setReacoesCount({})
      setMinhasReacoes({})
    } finally {
      setLoading(false)
    }
  }

  /** ====== Jogadores ====== */
  async function carregarJogadoresParaEventos(lista: EventoBID[]) {
    try {
      const ids = Array.from(new Set(lista.map((ev) => ev.id_jogador || '').filter(Boolean))).filter(
        (id) => !jogadoresMap[id as string]
      )

      if (!ids.length) return

      const { data, error } = await supabase
        .from('jogadores')
        .select('id, nome, foto_url, posicao, idade, nacionalidade')
        .in('id', ids as string[])

      if (error) {
        console.error(error)
        return
      }

      const novoMap = { ...jogadoresMap }
      ;(data || []).forEach((j: any) => {
        novoMap[j.id] = j
      })
      setJogadoresMap(novoMap)
    } catch (e) {
      console.error(e)
    }
  }

  /** ====== EXCLUIR EVENTO (ADMIN) ====== */
  async function excluirEvento(idEvento: string) {
    const ok = window.confirm('Tem certeza que deseja excluir este evento do BID?')
    if (!ok) return
    try {
      const { error } = await supabase.from('bid').delete().eq('id', idEvento)
      if (error) throw error

      setEventos((prev) => prev.filter((ev) => String(ev.id) !== idEvento))
      setComentariosMap((prev) => {
        const n = { ...prev }
        delete n[idEvento]
        return n
      })
      setReacoesCount((prev) => {
        const n = { ...prev }
        delete n[idEvento]
        return n
      })
      setMinhasReacoes((prev) => {
        const n = { ...prev }
        delete n[idEvento]
        return n
      })

      toast.success('Evento excluído com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao excluir evento: ${err?.message || 'desconhecido'}`)
    }
  }

  /** ====== Comentários ====== */
  async function carregarComentariosParaEventos(idsEventoStr: string[]) {
    if (!idsEventoStr.length) {
      setComentariosMap({})
      return
    }
    const { data, error } = await supabase
      .from('bid_comentarios')
      .select('*')
      .in('id_evento', idsEventoStr)
      .order('criado_em', { ascending: true })
    if (error) {
      console.error(error)
      return
    }

    const agrupado: Record<string, Comentario[]> = {}
    for (const c of data as any[]) {
      const cfix: Comentario = { ...c, id_evento: String(c.id_evento) }
      if (!agrupado[cfix.id_evento]) agrupado[cfix.id_evento] = []
      agrupado[cfix.id_evento].push(cfix)
    }
    setComentariosMap(agrupado)
  }

  const MAX_CHARS = 400
  function onChangeComentario(idEvento: string, texto: string) {
    if (texto.length > MAX_CHARS) return
    setNovoComentario((prev) => ({ ...prev, [idEvento]: texto }))
  }

  async function enviarComentario(idEventoRaw: IDEvt) {
    const idEvento = String(idEventoRaw)
    if (!idTimeLogado) {
      toast.error('Faça login no seu time para comentar.')
      return
    }

    const texto = (novoComentario[idEvento] || '').trim()
    if (!texto) {
      toast('Digite um comentário.', { icon: '💬' })
      return
    }

    const nomeAtual = timesMap[idTimeLogado]?.nome || nomeTimeLogado || 'Time'

    setComentando((prev) => ({ ...prev, [idEvento]: true }))
    try {
      const { data, error } = await supabase
        .from('bid_comentarios')
        .insert({
          id_evento: idEvento,
          id_time: idTimeLogado,
          nome_time: nomeAtual,
          comentario: texto,
        })
        .select('*')
        .single()
      if (error) throw error

      const coment: Comentario = { ...(data as any), id_evento: String((data as any).id_evento) }
      setComentariosMap((prev) => {
        const arr = prev[idEvento] ? [...prev[idEvento]] : []
        arr.push(coment)
        return { ...prev, [idEvento]: arr }
      })
      setNovoComentario((prev) => ({ ...prev, [idEvento]: '' }))
      setComentarioAberto((p) => ({ ...p, [idEvento]: true }))
    } catch (err: any) {
      console.error(err)
      toast.error(`Não foi possível publicar: ${err?.message || 'erro desconhecido'}`)
    } finally {
      setComentando((prev) => ({ ...prev, [idEvento]: false }))
    }
  }

  async function excluirComentario(idEvento: string, idComentario: string) {
    setExcluindoComentario((p) => ({ ...p, [idComentario]: true }))
    try {
      const { error } = await supabase.from('bid_comentarios').delete().eq('id', idComentario)
      if (error) throw error
      setComentariosMap((prev) => {
        const arr = prev[idEvento]?.filter((c) => c.id !== idComentario) || []
        return { ...prev, [idEvento]: arr }
      })
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao excluir: ${err?.message || 'desconhecido'}`)
    } finally {
      setExcluindoComentario((p) => ({ ...p, [idComentario]: false }))
    }
  }

  function podeExcluirComentario(c: Comentario) {
    return isAdmin || (idTimeLogado && c.id_time === idTimeLogado)
  }

  /** ====== Reações ====== */
  async function carregarReacoesParaEventos(idsEventoStr: string[]) {
    if (!idsEventoStr.length) {
      setReacoesCount({})
      setMinhasReacoes({})
      return
    }
    const { data, error } = await supabase.from('bid_reacoes').select('*').in('id_evento', idsEventoStr)
    if (error) {
      console.error(error)
      return
    }

    const countMap: Record<string, Record<Emoji, number>> = {}
    const mineMap: Record<string, Record<Emoji, boolean>> = {}

    for (const r of data as any[]) {
      const ev = String(r.id_evento)
      const em: Emoji = r.emoji
      countMap[ev] = countMap[ev] || ({} as any)
      countMap[ev][em] = (countMap[ev][em] || 0) + 1

      if (idTimeLogado && r.id_time === idTimeLogado) {
        mineMap[ev] = mineMap[ev] || ({} as any)
        mineMap[ev][em] = true
      }
    }
    setReacoesCount(countMap)
    setMinhasReacoes(mineMap)
  }

  async function toggleReacao(idEventoRaw: IDEvt, emoji: Emoji) {
    const idEvento = String(idEventoRaw)
    if (!idTimeLogado) {
      toast.error('Faça login no seu time para reagir.')
      return
    }
    if (reagindo[idEvento]) return

    setReagindo((p) => ({ ...p, [idEvento]: true }))
    try {
      const { data: existente, error: selErr } = await supabase
        .from('bid_reacoes')
        .select('id')
        .eq('id_evento', idEvento)
        .eq('id_time', idTimeLogado)
        .eq('emoji', emoji)
        .maybeSingle()
      if (selErr) throw selErr

      if (existente) {
        const { error: delErr } = await supabase.from('bid_reacoes').delete().eq('id', existente.id)
        if (delErr) throw delErr
      } else {
        const { error: insErr } = await supabase
          .from('bid_reacoes')
          .insert({ id_evento: idEvento, id_time: idTimeLogado, emoji })
        if (insErr) throw insErr
      }

      await carregarReacoesParaEventos([idEvento])
    } catch (err: any) {
      console.error(err)
      toast.error(`Não foi possível reagir: ${err?.message || 'erro'}`)
    } finally {
      setReagindo((p) => ({ ...p, [idEvento]: false }))
    }
  }

  /** ====== Filtros / Agrupamento ====== */
  const eventosFiltrados = useMemo(() => {
    const termo = debouncedBusca.trim().toLowerCase()

    const base = eventos.filter((evento) => {
      const timeOK = filtroTime === 'todos' || evento.id_time1 === filtroTime || evento.id_time2 === filtroTime
      if (!timeOK) return false

      const tipoKey = getTipoKey(evento.tipo_evento)
      const tipoOK = tipoFiltro === 'todos' || tipoKey === tipoFiltro
      if (!tipoOK) return false

      if (!buscaAtiva && termo) {
        const nome1 = timesMap[evento.id_time1]?.nome || ''
        const nome2 = evento.id_time2 ? timesMap[evento.id_time2]?.nome || '' : ''
        const texto = `${evento.descricao} ${nome1} ${nome2}`.toLowerCase()
        if (!texto.includes(termo)) return false
      }
      return true
    })

    base.sort((a, b) =>
      sortOrder === 'valor'
        ? (b.valor ?? 0) - (a.valor ?? 0)
        : sortOrder === 'antigo'
          ? +new Date(a.data_evento) - +new Date(b.data_evento)
          : +new Date(b.data_evento) - +new Date(a.data_evento)
    )

    return base
  }, [eventos, filtroTime, tipoFiltro, debouncedBusca, buscaAtiva, timesMap, sortOrder])

  const eventosAgrupados = useMemo(() => {
    const grupos: Record<string, EventoBID[]> = {}
    for (const ev of eventosFiltrados) {
      const d = new Date(ev.data_evento)
      const data = d.toLocaleDateString('pt-BR')
      if (!grupos[data]) grupos[data] = []
      grupos[data].push(ev)
    }
    return grupos
  }, [eventosFiltrados])

  /** ====== Render ====== */
  return (
    <main className="relative min-h-screen text-white bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(16,185,129,0.14),transparent),radial-gradient(900px_500px_at_85%_20%,rgba(168,85,247,0.10),transparent),linear-gradient(to_bottom,#070b10,#000000)]">
      <WatermarkBG />

      {/* brilho topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent"
      />

      <div ref={topRef} />
      <div className="max-w-6xl mx-auto px-4 py-6 relative">
        {/* Cabeçalho */}
        <header className="mb-6 text-center">
          <div className="inline-block rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-3 shadow-sm">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              📰 BID — <span className="text-emerald-400">Boletim Informativo Diário</span>
            </h1>
            <p className="text-xs md:text-sm text-gray-300/80 mt-1">
              Acompanhe transferências, empréstimos, rescisões e mais.
            </p>
          </div>

          {buscaAtiva && (
            <div className="mt-3 text-sm text-gray-300">
              🔎 Resultados para <span className="text-yellow-300 font-semibold">“{debouncedBusca}”</span>
              <button
                className="ml-3 text-emerald-300 underline hover:text-emerald-200"
                onClick={() => setBuscaTexto('')}
                title="Limpar busca"
              >
                Limpar
              </button>
            </div>
          )}
        </header>

        {/* Filtros sticky */}
        <div className="sticky top-0 z-10 -mx-4 mb-6 bg-gradient-to-b from-black/85 to-transparent backdrop-blur supports-[backdrop-filter]:bg-black/55 px-4 py-3 border-b border-white/10">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex gap-3 w-full md:w-auto">
                <select
                  className="bg-gray-950/80 text-white border border-gray-700/80 rounded-xl px-4 py-2.5 w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={filtroTime}
                  onChange={(e) => setFiltroTime(e.target.value)}
                >
                  <option value="todos">🔍 Todos os times</option>
                  {timesLista.map((time) => (
                    <option key={time.id} value={time.id}>
                      {time.nome}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setFiltroTime(idTimeLogado || 'todos')}
                  className="px-3 py-2 rounded-xl bg-emerald-600/15 text-emerald-200 border border-emerald-600/30 hover:bg-emerald-600/25 disabled:opacity-50"
                  disabled={!idTimeLogado}
                  title="Filtrar pelo meu time"
                >
                  Meu time
                </button>
              </div>

              <div className="flex gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Buscar por jogador, time ou termo… (2+ letras)"
                  className="bg-gray-950/80 text-white border border-gray-700/80 rounded-xl px-4 py-2.5 w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                />

                {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
                  <div className="hidden md:flex items-center gap-2">
                    <button
                      onClick={() => carregarDados(1)}
                      disabled={pagina === 1}
                      className="px-2 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
                      title="Primeira"
                    >
                      «
                    </button>
                    <button
                      onClick={() => carregarDados(pagina - 1)}
                      disabled={pagina === 1}
                      className="px-2 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
                      title="Anterior"
                    >
                      ‹
                    </button>
                    <span className="text-xs text-gray-300 select-none">
                      pág. <strong>{pagina}</strong>/<strong>{totalPaginas}</strong>
                    </span>
                    <button
                      onClick={() => carregarDados(pagina + 1)}
                      disabled={pagina === totalPaginas}
                      className="px-2 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
                      title="Próxima"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => carregarDados(totalPaginas)}
                      disabled={pagina === totalPaginas}
                      className="px-2 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
                      title="Última"
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-gray-700/80 bg-gray-950/70 p-1">
                {TIPOS_CHIP.map(({ key, label }) => {
                  const ativo = tipoFiltro === key
                  return (
                    <button
                      key={key}
                      onClick={() => setTipoFiltro(key)}
                      className={classNames(
                        'whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition',
                        ativo
                          ? 'bg-emerald-600/25 text-emerald-100 ring-1 ring-emerald-400/25'
                          : 'text-gray-300 hover:bg-gray-800/60'
                      )}
                      aria-pressed={ativo}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <label htmlFor="ordem" className="text-xs text-gray-400">
                  Ordenar
                </label>
                <select
                  id="ordem"
                  className="bg-gray-950/80 text-white border border-gray-700/80 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recente">Mais recentes</option>
                  <option value="antigo">Mais antigos</option>
                  <option value="valor">Maior valor</option>
                </select>

                {(tipoFiltro !== 'todos' || filtroTime !== 'todos' || buscaAtiva) && (
                  <button
                    onClick={() => {
                      setTipoFiltro('todos')
                      setFiltroTime('todos')
                      setBuscaTexto('')
                      setSortOrder('recente')
                    }}
                    className="text-xs text-gray-300 underline hover:text-gray-100"
                    title="Limpar filtros"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Paginação (mobile) */}
        {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
          <div className="md:hidden flex justify-center items-center gap-3 mb-4">
            <button
              onClick={() => carregarDados(pagina - 1)}
              disabled={pagina === 1}
              className="px-4 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              ⬅
            </button>
            <span className="text-xs text-gray-300">
              pág. {pagina}/{totalPaginas}
            </span>
            <button
              onClick={() => carregarDados(pagina + 1)}
              disabled={pagina === totalPaginas}
              className="px-4 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              ➡
            </button>
          </div>
        )}

        {/* Estados */}
        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-64 bg-white/10 rounded mb-3 mx-auto md:mx-0" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-24 w-full bg-white/5 rounded-xl" />
                  <div className="h-24 w-full bg-white/5 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}
        {erro && <p className="text-red-400 text-center">{erro}</p>}
        {!loading && Object.keys(eventosAgrupados).length === 0 && (
          <div className="text-center text-gray-300 py-8">
            <p className="text-lg">Nenhum evento encontrado para os filtros atuais.</p>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-10" ref={listaDiasAnim}>
          {Object.entries(eventosAgrupados).map(([data, eventosDoDia]) => {
            const d0 = eventosDoDia[0]?.data_evento ? new Date(eventosDoDia[0].data_evento) : new Date()
            return (
              <section key={data} className="relative">
                {/* Cabeçalho do dia */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
                  <div className="shrink-0">
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wider text-yellow-400/80">{diaSemanaPt(d0)}</p>
                      <h2 className="text-2xl font-bold text-yellow-300">{data}</h2>
                    </div>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
                </div>

                {/* Espinha */}
                <div className="relative pl-4 md:pl-6">
                  <div className="absolute left-1 md:left-2 top-0 bottom-0 w-px bg-gradient-to-b from-white/10 via-white/15 to-transparent" />

                  {/* Grid do dia */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                    {eventosDoDia.map((evento) => {
                      const idEvento = String(evento.id)
                      const time1 = timesMap[evento.id_time1]
                      const time2 = evento.id_time2 ? timesMap[evento.id_time2] : null

                      const comentarios = comentariosMap[idEvento] || []
                      const counts = reacoesCount[idEvento] || ({} as Record<Emoji, number>)
                      const mine = minhasReacoes[idEvento] || ({} as Record<Emoji, boolean>)
                      const estilo = tipoToStyle(evento.tipo_evento)
                      const aberto = !!comentarioAberto[idEvento]

                      return (
                        <article
                          key={idEvento}
                          className={classNames(
                            'relative rounded-2xl p-[1px] bg-gradient-to-br from-white/10 via-white/0 to-white/10',
                            'shadow-[0_10px_30px_-18px_rgba(0,0,0,.9)]'
                          )}
                        >
                          <div
                            className={classNames(
                              'relative rounded-2xl bg-gray-950/70 border border-white/10 p-4 md:p-5',
                              'ring-1',
                              estilo.ring,
                              estilo.glow,
                              'hover:bg-gray-950/80 transition'
                            )}
                          >
                            {/* Ponto da espinha */}
                            <span className={classNames('absolute -left-3 md:-left-4 top-6 size-2 rounded-full', estilo.dot)} />

                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{iconeTipo(evento.tipo_evento)}</span>
                                <span className={classNames('px-2 py-0.5 rounded-full text-xs font-semibold border', estilo.chip)}>
                                  {capitalizar(evento.tipo_evento)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-300">{horaPt(new Date(evento.data_evento))}</div>
                            </div>

                            {/* Conteúdo */}
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                              <div className="md:col-span-2">
                                <p className="text-gray-100 leading-relaxed">
                                  {buscaAtiva ? <Highlight text={evento.descricao} query={debouncedBusca} /> : evento.descricao}
                                </p>

                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <AvatarTime nome={time1?.nome || 'Time'} logo={time1?.logo_url} />
                                    <div className="text-sm">
                                      <p className="text-gray-400">Time principal</p>
                                      <p className="font-semibold">{time1?.nome || 'Desconhecido'}</p>
                                    </div>
                                  </div>

                                  {time2 && <span className="text-gray-500">•</span>}

                                  {time2 && (
                                    <div className="flex items-center gap-2">
                                      <AvatarTime nome={time2?.nome || 'Time'} logo={time2?.logo_url} />
                                      <div className="text-sm">
                                        <p className="text-gray-400">Time adversário</p>
                                        <p className="font-semibold">{time2?.nome || 'Desconhecido'}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Lateral: Jogador + Valor */}
                              <div className="md:col-span-1 space-y-3">
                                {(() => {
                                  const jEv: Partial<Jogador> = {
                                    id: evento.id_jogador || undefined,
                                    nome: evento.nome_jogador || undefined,
                                    foto_url: evento.foto_jogador_url || undefined,
                                  }
                                  const jFromMap = evento.id_jogador ? jogadoresMap[evento.id_jogador] : undefined
                                  const jogador = jEv.nome || jEv.foto_url ? { ...jFromMap, ...jEv } : jFromMap
                                  return jogador ? <CardJogador j={jogador} highlight={buscaAtiva ? debouncedBusca : ''} /> : null
                                })()}

                                {/* ✅ VALOR — PROFISSIONAL / DISCRETO */}
                                {evento.valor != null && (
                                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-sm">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
                                        Movimentação
                                      </p>
                                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-black/20 text-gray-200/90">
                                        Entrada/Saída
                                      </span>
                                    </div>

                                    <p
                                      className={classNames(
                                        'mt-1 font-semibold text-white tabular-nums',
                                        'whitespace-nowrap overflow-hidden text-ellipsis'
                                      )}
                                      style={{ fontSize: 'clamp(1rem, 2.1vw, 1.22rem)' }}
                                      title={formatBRL(evento.valor)}
                                    >
                                      {formatBRL(evento.valor)}
                                    </p>

                                    <div className="mt-2 h-px bg-white/10" />

                                    <p className="mt-2 text-[11px] text-gray-400">
                                      Registro financeiro do evento
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Reações */}
                            <div className="mt-4 rounded-xl bg-black/25 border border-white/10 p-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                {EMOJIS.map((e) => {
                                  const qtd = counts[e] || 0
                                  const ativo = !!mine[e]
                                  return (
                                    <button
                                      key={e}
                                      onClick={() => toggleReacao(idEvento, e)}
                                      disabled={!idTimeLogado || !!reagindo[idEvento]}
                                      aria-pressed={ativo}
                                      className={classNames(
                                        'px-2.5 py-1 rounded-full text-sm border transition',
                                        ativo
                                          ? 'bg-emerald-600/25 border-emerald-500 ring-2 ring-emerald-400/40'
                                          : 'bg-gray-950/60 border-gray-700 hover:bg-gray-900'
                                      )}
                                      title={ativo ? 'Remover reação' : 'Reagir'}
                                    >
                                      <span className="mr-1">{e}</span>
                                      <span className="text-xs text-gray-200">{qtd}</span>
                                    </button>
                                  )
                                })}
                                {!idTimeLogado && <span className="text-xs text-gray-300 ml-1">Faça login no seu time para reagir.</span>}
                              </div>
                            </div>

                            {/* Comentários */}
                            <div className="mt-4 rounded-2xl bg-black/25 border border-white/10 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="font-semibold text-white" aria-live="polite">
                                  💬 Comentários ({comentarios.length})
                                </h3>
                                <div className="flex items-center gap-3">
                                  {!idTimeLogado && <span className="text-xs text-gray-300">Faça login para comentar.</span>}
                                  <button
                                    onClick={() => setComentarioAberto((p) => ({ ...p, [idEvento]: !p[idEvento] }))}
                                    className="text-sm text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
                                  >
                                    {aberto ? 'Fechar' : 'Comentar…'}
                                  </button>
                                </div>
                              </div>

                              {aberto && (
                                <>
                                  <div ref={commentsAnim} className="space-y-2">
                                    {comentarios.length === 0 && <p className="text-gray-300 text-sm">Seja o primeiro a comentar!</p>}

                                    {comentarios.map((c) => {
                                      const nomeAtualTime = timesMap[c.id_time]?.nome || c.nome_time || 'Time'
                                      const logoAtual = timesMap[c.id_time]?.logo_url

                                      return (
                                        <div key={c.id} className="bg-gray-950/70 border border-gray-700/80 rounded-xl p-2.5">
                                          <div className="flex items-center justify-between">
                                            <div className="text-sm flex items-center gap-2 min-w-0">
                                              <AvatarTime nome={nomeAtualTime} logo={logoAtual} />
                                              <span className="font-semibold text-emerald-300 truncate">{nomeAtualTime}</span>
                                              <span className="text-gray-400 text-xs">• {new Date(c.criado_em).toLocaleString('pt-BR')}</span>
                                            </div>
                                            {podeExcluirComentario(c) && (
                                              <button
                                                onClick={() => excluirComentario(idEvento, c.id)}
                                                disabled={!!excluindoComentario[c.id]}
                                                className="text-red-300 hover:text-red-500 text-xs"
                                              >
                                                {excluindoComentario[c.id] ? 'Excluindo…' : 'Excluir'}
                                              </button>
                                            )}
                                          </div>
                                          <p className="text-gray-100 text-sm mt-1 whitespace-pre-wrap break-words">{c.comentario}</p>
                                        </div>
                                      )
                                    })}
                                  </div>

                                  <ComentarioForm
                                    idEvento={idEvento}
                                    comentarioAtual={novoComentario[idEvento] || ''}
                                    setTexto={onChangeComentario}
                                    enviando={!!comentando[idEvento]}
                                    podeComentar={!!idTimeLogado}
                                    onSubmit={() => enviarComentario(idEvento)}
                                  />
                                </>
                              )}
                            </div>

                            {/* Ações admin */}
                            {isAdmin && (
                              <div className="mt-3 flex justify-end">
                                <button
                                  onClick={() => excluirEvento(idEvento)}
                                  className="text-red-300 hover:text-red-400 text-sm underline underline-offset-4"
                                  title="Excluir evento"
                                >
                                  🗑️ Excluir evento
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        {/* Rodapé paginação */}
        {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
          <div className="mt-10 flex justify-center items-center gap-3">
            <button
              onClick={() => carregarDados(1)}
              disabled={pagina === 1}
              className="px-3 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              «
            </button>
            <button
              onClick={() => carregarDados(pagina - 1)}
              disabled={pagina === 1}
              className="px-3 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-300">
              Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
            </span>
            <button
              onClick={() => carregarDados(pagina + 1)}
              disabled={pagina === totalPaginas}
              className="px-3 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              Próxima
            </button>
            <button
              onClick={() => carregarDados(totalPaginas)}
              disabled={pagina === totalPaginas}
              className="px-3 py-2 rounded-lg bg-gray-950/70 border border-gray-700/80 disabled:opacity-40"
            >
              »
            </button>
          </div>
        )}

        {/* Topo */}
        <button
          onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed bottom-6 right-6 rounded-full border border-white/10 bg-gray-950/80 backdrop-blur px-3 py-2 text-sm text-gray-200 shadow-lg hover:bg-gray-900"
          title="Voltar ao topo"
        >
          ↑ Topo
        </button>
      </div>
    </main>
  )
}

/** ====== Subcomponente: Comentário form ====== */
function ComentarioForm({
  idEvento,
  comentarioAtual,
  setTexto,
  enviando,
  podeComentar,
  onSubmit,
}: {
  idEvento: string
  comentarioAtual: string
  setTexto: (id: string, txt: string) => void
  enviando: boolean
  podeComentar: boolean
  onSubmit: () => void
}) {
  const MAX_CHARS = 400
  const chars = comentarioAtual.length
  const quase = chars >= MAX_CHARS * 0.9

  return (
    <div className="mt-3">
      <textarea
        placeholder={podeComentar ? 'Escreva um comentário…' : 'Você precisa estar logado no seu time para comentar.'}
        disabled={!podeComentar || enviando}
        className="w-full rounded-xl bg-gray-950/80 text-white border border-gray-700/80 p-2 min-h-[70px] placeholder:text-gray-500 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        value={comentarioAtual}
        onChange={(e) => setTexto(idEvento, e.target.value)}
      />
      <div className="flex items-center justify-between mt-2">
        <span className={classNames('text-xs', quase ? 'text-yellow-300' : 'text-gray-300')}>
          {chars}/{MAX_CHARS}
        </span>
        <button
          onClick={onSubmit}
          disabled={!podeComentar || enviando || comentarioAtual.trim().length === 0}
          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
        >
          {enviando ? 'Publicando…' : 'Publicar comentário'}
        </button>
      </div>
    </div>
  )
}

