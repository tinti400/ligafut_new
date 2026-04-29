'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import classNames from 'classnames'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const WATERMARK_LOGO_SRC = '/watermarks/ligafut26.png'

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

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🔥'] as const
type Emoji = (typeof EMOJIS)[number]

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

function safe(v: any) {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function formatBRL(valor?: number | null) {
  return safe(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function WatermarkBG() {
  const itens = useMemo(() => Array.from({ length: 50 }), [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        src={WATERMARK_LOGO_SRC}
        alt=""
        aria-hidden="true"
        className="absolute left-1/2 top-20 -translate-x-1/2 w-[620px] max-w-[92vw] opacity-[0.055] rotate-[-8deg]"
        draggable={false}
      />

      <div className="absolute left-[-30%] top-[24%] rotate-[-18deg] w-[160%]">
        <div className="flex flex-wrap gap-x-7 gap-y-5 opacity-[0.055]">
          {itens.map((_, i) => (
            <span
              key={i}
              className="text-[12px] font-black tracking-[0.35em] text-white/80 select-none"
            >
              LIGAFUT26
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function tipoToStyle(tipo: string) {
  const t = String(tipo || '').toLowerCase()

  if (t.includes('transfer')) {
    return {
      ring: 'ring-purple-500/35',
      chip: 'bg-purple-500/15 text-purple-200 border-purple-500/25',
      dot: 'bg-purple-400',
      bar: 'from-purple-400 to-fuchsia-600',
      icon: '💸',
    }
  }

  if (t.includes('emprést') || t.includes('emprest')) {
    return {
      ring: 'ring-blue-500/35',
      chip: 'bg-blue-500/15 text-blue-200 border-blue-500/25',
      dot: 'bg-blue-400',
      bar: 'from-blue-400 to-sky-600',
      icon: '🤝',
    }
  }

  if (t.includes('rescis')) {
    return {
      ring: 'ring-red-500/35',
      chip: 'bg-red-500/15 text-red-200 border-red-500/25',
      dot: 'bg-red-400',
      bar: 'from-red-400 to-rose-600',
      icon: '✂️',
    }
  }

  if (t.includes('compra')) {
    return {
      ring: 'ring-emerald-500/35',
      chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25',
      dot: 'bg-emerald-400',
      bar: 'from-emerald-400 to-green-600',
      icon: '🛒',
    }
  }

  if (t.includes('salario')) {
    return {
      ring: 'ring-orange-500/35',
      chip: 'bg-orange-500/15 text-orange-200 border-orange-500/25',
      dot: 'bg-orange-400',
      bar: 'from-orange-400 to-amber-600',
      icon: '📤',
    }
  }

  if (t.includes('bonus') || t.includes('bônus')) {
    return {
      ring: 'ring-lime-500/35',
      chip: 'bg-lime-500/15 text-lime-200 border-lime-500/25',
      dot: 'bg-lime-400',
      bar: 'from-lime-400 to-emerald-600',
      icon: '🎁',
    }
  }

  return {
    ring: 'ring-gray-500/25',
    chip: 'bg-gray-500/15 text-gray-200 border-gray-500/25',
    dot: 'bg-gray-400',
    bar: 'from-gray-400 to-gray-700',
    icon: '📝',
  }
}

function capitalizar(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
}

function diaSemanaPt(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date)
}

function horaPt(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getTipoKey(tipo: string): TipoChipKey {
  const t = String(tipo || '').toLowerCase()
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

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const parts = String(text || '').split(
    new RegExp(`(${escapeRegExp(query)})`, 'gi')
  )

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            className="rounded bg-yellow-400/25 px-1 text-yellow-100"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function AvatarTime({ nome, logo }: { nome: string; logo?: string | null }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={nome}
        className="size-11 rounded-2xl object-cover ring-1 ring-white/15 bg-black/40"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }

  const iniciais = String(nome || 'Time')
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase()

  return (
    <div className="size-11 rounded-2xl bg-white/10 text-white grid place-items-center ring-1 ring-white/15">
      <span className="text-xs font-black">{iniciais || '?'}</span>
    </div>
  )
}

function CardJogador({
  j,
  highlight,
}: {
  j: Partial<Jogador>
  highlight?: string
}) {
  if (!j?.nome && !j?.foto_url) return null

  return (
    <div className="rounded-3xl bg-black/35 border border-white/10 p-3 flex gap-3 items-center shadow-inner">
      {j.foto_url ? (
        <img
          src={j.foto_url}
          alt={j.nome || 'Jogador'}
          loading="lazy"
          className="size-16 rounded-2xl object-cover ring-1 ring-white/15 bg-black/30"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="size-16 rounded-2xl bg-white/10 text-gray-300 grid place-items-center ring-1 ring-white/10">
          <span className="text-2xl">👤</span>
        </div>
      )}

      <div className="min-w-0">
        <p className="font-black text-white truncate">
          {highlight ? (
            <Highlight text={j.nome || ''} query={highlight} />
          ) : (
            j.nome
          )}
        </p>

        <p className="text-xs text-gray-300">
          {[j.posicao, j.nacionalidade].filter(Boolean).join(' • ') ||
            'Jogador'}
        </p>

        {typeof j.idade === 'number' && (
          <p className="text-xs text-gray-500 mt-0.5">{j.idade} anos</p>
        )}
      </div>
    </div>
  )
}

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

  const filtroGlobalAtivo =
    !buscaAtiva && (filtroTime !== 'todos' || tipoFiltro !== 'todos')

  const estatisticasBID = useMemo(() => {
    const total = eventos.length
    const totalValor = eventos.reduce((acc, ev) => acc + safe(ev.valor), 0)

    const transferencias = eventos.filter((ev) =>
      String(ev.tipo_evento || '').toLowerCase().includes('transfer')
    ).length

    const compras = eventos.filter((ev) =>
      String(ev.tipo_evento || '').toLowerCase().includes('compra')
    ).length

    const bonus = eventos.filter((ev) => {
      const t = String(ev.tipo_evento || '').toLowerCase()
      return t.includes('bonus') || t.includes('bônus')
    }).length

    const maiorEvento = [...eventos].sort(
      (a, b) => safe(b.valor) - safe(a.valor)
    )[0]

    return {
      total,
      totalValor,
      transferencias,
      compras,
      bonus,
      maiorEvento,
    }
  }, [eventos])

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
        const { data, error } = await supabase
          .from('times')
          .select('nome')
          .eq('id', String(id))
          .maybeSingle()

        if (!error && data?.nome) setNomeTimeLogado(data.nome)
      } catch {}
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      const { data: timesData, error: errorTimes } = await supabase
        .from('times')
        .select('id, nome, logo_url')
        .order('nome', { ascending: true })

      if (errorTimes) {
        console.error(errorTimes)
        setTimesLista([])
        setTimesMap({})
        return
      }

      const map: Record<string, Time> = {}

      ;(timesData || []).forEach((t) => {
        map[t.id] = t
      })

      setTimesLista(timesData || [])
      setTimesMap(map)

      if (idTimeLogado && map[idTimeLogado]?.nome) {
        setNomeTimeLogado(map[idTimeLogado].nome)
      }
    })()
  }, [idTimeLogado])

  useEffect(() => {
    if (!buscaAtiva && !filtroGlobalAtivo) carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (buscaAtiva) buscarGlobal(debouncedBusca)
    else if (filtroGlobalAtivo) carregarFiltrado()
    else carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBusca])

  useEffect(() => {
    if (buscaAtiva) return
    if (filtroGlobalAtivo) carregarFiltrado()
    else carregarDados(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTime, tipoFiltro])

  useEffect(() => {
    setEventos((prev) => {
      const arr = [...prev]

      if (sortOrder === 'valor') {
        arr.sort((a, b) => safe(b.valor) - safe(a.valor))
      } else if (sortOrder === 'antigo') {
        arr.sort(
          (a, b) =>
            +new Date(a.data_evento) - +new Date(b.data_evento)
        )
      } else {
        arr.sort(
          (a, b) =>
            +new Date(b.data_evento) - +new Date(a.data_evento)
        )
      }

      return arr
    })
  }, [sortOrder])

  useEffect(() => {
    const channel = supabase
      .channel('bid-realtime-premium')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bid',
        },
        async (payload: any) => {
          const novoEvento = payload.new as EventoBID

          setEventos((prev) => {
            const jaExiste = prev.some(
              (ev) => String(ev.id) === String(novoEvento.id)
            )
            if (jaExiste) return prev
            return [novoEvento, ...prev]
          })

          await carregarJogadoresParaEventos([novoEvento])
          await carregarComentariosParaEventos([String(novoEvento.id)])
          await carregarReacoesParaEventos([String(novoEvento.id)])

          toast.success('Novo evento no BID!', { icon: '📰' })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTimeLogado])

  async function carregarDados(paginaAtual = 1) {
    if (buscaAtiva || filtroGlobalAtivo) return

    setLoading(true)
    setErro(null)

    const offset = (paginaAtual - 1) * limite

    try {
      const { count, error: errorCount } = await supabase
        .from('bid')
        .select('*', { count: 'exact', head: true })

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
          ? safe(b.valor) - safe(a.valor)
          : sortOrder === 'antigo'
            ? +new Date(a.data_evento) - +new Date(b.data_evento)
            : +new Date(b.data_evento) - +new Date(a.data_evento)
      )

      setEventos(lista)
      await carregarJogadoresParaEventos(lista)

      const paginas = Math.ceil(safe(count || 1) / limite)
      setTotalPaginas(paginas)
      setPagina(paginaAtual)

      const idsStr = lista.map((e) => String(e.id))

      await Promise.all([
        carregarComentariosParaEventos(idsStr),
        carregarReacoesParaEventos(idsStr),
      ])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
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

  async function carregarFiltrado() {
    setLoading(true)
    setErro(null)

    try {
      let q = supabase.from('bid').select('*')

      if (filtroTime !== 'todos') {
        q = q.or(`id_time1.eq.${filtroTime},id_time2.eq.${filtroTime}`)
      }

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

      if (sortOrder === 'valor') {
        q = q.order('valor', { ascending: false, nullsFirst: false })
      } else if (sortOrder === 'antigo') {
        q = q.order('data_evento', { ascending: true })
      } else {
        q = q.order('data_evento', { ascending: false })
      }

      const { data, error } = await q
      if (error) throw error

      const lista = ((data as EventoBID[]) || []).slice()

      setEventos(lista)
      await carregarJogadoresParaEventos(lista)

      setTotalPaginas(1)
      setPagina(1)

      const idsStr = lista.map((e) => String(e.id))

      await Promise.all([
        carregarComentariosParaEventos(idsStr),
        carregarReacoesParaEventos(idsStr),
      ])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
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
        const { data, error } = await supabase
          .from('bid')
          .select('*')
          .in('id_time1', timeIds)
          .order('data_evento', { ascending: false })

        if (error) throw error
        porTime1 = (data as EventoBID[]) || []
      }

      let porTime2: EventoBID[] = []

      if (timeIds.length) {
        const { data, error } = await supabase
          .from('bid')
          .select('*')
          .in('id_time2', timeIds)
          .order('data_evento', { ascending: false })

        if (error) throw error
        porTime2 = (data as EventoBID[]) || []
      }

      const mapa: Record<string, EventoBID> = {}

      ;[
        ...((porDesc as EventoBID[]) || []),
        ...((porJogador as EventoBID[]) || []),
        ...porTime1,
        ...porTime2,
      ].forEach((ev) => {
        mapa[String(ev.id)] = ev
      })

      const unicos = Object.values(mapa).sort((a, b) =>
        sortOrder === 'valor'
          ? safe(b.valor) - safe(a.valor)
          : sortOrder === 'antigo'
            ? +new Date(a.data_evento) - +new Date(b.data_evento)
            : +new Date(b.data_evento) - +new Date(a.data_evento)
      )

      setEventos(unicos)
      await carregarJogadoresParaEventos(unicos)

      setTotalPaginas(1)
      setPagina(1)

      const idsStr = unicos.map((e) => String(e.id))

      await Promise.all([
        carregarComentariosParaEventos(idsStr),
        carregarReacoesParaEventos(idsStr),
      ])

      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
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

  async function carregarJogadoresParaEventos(lista: EventoBID[]) {
    try {
      const ids = Array.from(
        new Set(lista.map((ev) => ev.id_jogador || '').filter(Boolean))
      ).filter((id) => !jogadoresMap[id as string])

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

      const coment: Comentario = {
        ...(data as any),
        id_evento: String((data as any).id_evento),
      }

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
      const { error } = await supabase
        .from('bid_comentarios')
        .delete()
        .eq('id', idComentario)

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

  async function carregarReacoesParaEventos(idsEventoStr: string[]) {
    if (!idsEventoStr.length) {
      setReacoesCount({})
      setMinhasReacoes({})
      return
    }

    const { data, error } = await supabase
      .from('bid_reacoes')
      .select('*')
      .in('id_evento', idsEventoStr)

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
        const { error: delErr } = await supabase
          .from('bid_reacoes')
          .delete()
          .eq('id', existente.id)

        if (delErr) throw delErr
      } else {
        const { error: insErr } = await supabase
          .from('bid_reacoes')
          .insert({
            id_evento: idEvento,
            id_time: idTimeLogado,
            emoji,
          })

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

  const eventosFiltrados = useMemo(() => {
    const termo = debouncedBusca.trim().toLowerCase()

    const base = eventos.filter((evento) => {
      const timeOK =
        filtroTime === 'todos' ||
        evento.id_time1 === filtroTime ||
        evento.id_time2 === filtroTime

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
        ? safe(b.valor) - safe(a.valor)
        : sortOrder === 'antigo'
          ? +new Date(a.data_evento) - +new Date(b.data_evento)
          : +new Date(b.data_evento) - +new Date(a.data_evento)
    )

    return base
  }, [
    eventos,
    filtroTime,
    tipoFiltro,
    debouncedBusca,
    buscaAtiva,
    timesMap,
    sortOrder,
  ])

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

  return (
    <main className="relative min-h-screen overflow-hidden text-white bg-[radial-gradient(1200px_600px_at_50%_-12%,rgba(16,185,129,0.20),transparent),radial-gradient(900px_500px_at_88%_18%,rgba(168,85,247,0.13),transparent),linear-gradient(to_bottom,#050912,#000000)]">
      <WatermarkBG />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent"
      />

      <div ref={topRef} />

      <div className="relative mx-auto max-w-6xl px-4 py-7">
        <header className="mb-7 text-center">
          <div className="inline-block rounded-[2rem] border border-white/10 bg-white/[0.055] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-[0.34em] text-emerald-300/80 font-black">
              Central oficial da LigaFut
            </p>

            <h1 className="mt-2 text-5xl md:text-7xl font-black tracking-tight text-white drop-shadow-[0_0_28px_rgba(16,185,129,0.24)]">
              📰 BID
            </h1>

            <p className="mt-2 text-base md:text-lg text-emerald-300 font-black">
              Central de Transferências da LigaFut
            </p>

            <p className="mx-auto mt-2 max-w-2xl text-xs md:text-sm text-gray-300/75">
              Feed oficial com compras, vendas, bônus, salários, empréstimos e movimentações financeiras em tempo real.
            </p>
          </div>

          {buscaAtiva && (
            <div className="mt-3 text-sm text-gray-300">
              🔎 Resultados para{' '}
              <span className="font-semibold text-yellow-300">
                “{debouncedBusca}”
              </span>

              <button
                className="ml-3 text-emerald-300 underline hover:text-emerald-200"
                onClick={() => setBuscaTexto('')}
              >
                Limpar
              </button>
            </div>
          )}
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ResumoCard
            label="Eventos"
            value={estatisticasBID.total}
            desc="Registros carregados"
            tone="white"
          />

          <ResumoCard
            label="Movimentado"
            value={formatBRL(estatisticasBID.totalValor)}
            desc="Total financeiro exibido"
            tone="emerald"
          />

          <ResumoCard
            label="Transferências"
            value={estatisticasBID.transferencias}
            desc="Negociações registradas"
            tone="purple"
          />

          <ResumoCard
            label="Bônus"
            value={estatisticasBID.bonus}
            desc="Premiações e extras"
            tone="yellow"
          />
        </section>

        {estatisticasBID.maiorEvento && safe(estatisticasBID.maiorEvento.valor) > 0 && (
          <section className="mb-6 rounded-[2rem] border border-yellow-400/20 bg-gradient-to-r from-yellow-500/[0.12] via-white/[0.045] to-emerald-500/[0.09] p-5 shadow-[0_24px_65px_rgba(0,0,0,0.42)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-yellow-200/70 font-black">
                  Maior movimentação do feed
                </p>

                <h2 className="mt-2 text-2xl md:text-3xl font-black text-white">
                  🏦 {formatBRL(estatisticasBID.maiorEvento.valor)}
                </h2>

                <p className="mt-2 line-clamp-2 text-sm text-white/70">
                  {estatisticasBID.maiorEvento.descricao}
                </p>
              </div>

              <button
                onClick={() => {
                  setTipoFiltro('todos')
                  setFiltroTime('todos')
                  setBuscaTexto('')
                  setSortOrder('valor')
                }}
                className="shrink-0 rounded-2xl border border-yellow-300/25 bg-yellow-400/15 px-4 py-2 text-sm font-black text-yellow-100 transition hover:bg-yellow-400/25"
              >
                Ver maiores valores
              </button>
            </div>
          </section>
        )}

        <div className="sticky top-0 z-10 -mx-4 mb-8 border-y border-white/10 bg-black/60 px-4 py-4 shadow-[0_20px_45px_rgba(0,0,0,0.38)] backdrop-blur-2xl">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full gap-3 md:w-auto">
                <select
                  className="w-full rounded-2xl border border-white/10 bg-gray-950/85 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 md:w-72"
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
                  disabled={!idTimeLogado}
                  className="rounded-2xl border border-emerald-600/30 bg-emerald-600/15 px-4 py-2 font-black text-emerald-200 transition hover:bg-emerald-600/25 disabled:opacity-50"
                >
                  Meu time
                </button>
              </div>

              <div className="flex w-full gap-3 md:w-auto">
                <input
                  type="text"
                  placeholder="Buscar por jogador, time ou termo..."
                  className="w-full rounded-2xl border border-white/10 bg-gray-950/85 px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-emerald-500 md:w-80"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                />

                {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
                  <div className="hidden items-center gap-2 md:flex">
                    <button
                      onClick={() => carregarDados(1)}
                      disabled={pagina === 1}
                      className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
                    >
                      «
                    </button>
                    <button
                      onClick={() => carregarDados(pagina - 1)}
                      disabled={pagina === 1}
                      className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
                    >
                      ‹
                    </button>

                    <span className="select-none text-xs text-gray-300">
                      pág. <strong>{pagina}</strong>/<strong>{totalPaginas}</strong>
                    </span>

                    <button
                      onClick={() => carregarDados(pagina + 1)}
                      disabled={pagina === totalPaginas}
                      className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => carregarDados(totalPaginas)}
                      disabled={pagina === totalPaginas}
                      className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
                    >
                      »
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="max-w-full overflow-x-auto rounded-full border border-white/10 bg-gray-950/70 p-1">
                <div className="flex gap-1">
                  {TIPOS_CHIP.map(({ key, label }) => {
                    const ativo = tipoFiltro === key

                    return (
                      <button
                        key={key}
                        onClick={() => setTipoFiltro(key)}
                        className={classNames(
                          'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition',
                          ativo
                            ? 'bg-emerald-600/25 text-emerald-100 ring-1 ring-emerald-400/25'
                            : 'text-gray-300 hover:bg-white/10'
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <label htmlFor="ordem" className="text-xs text-gray-400">
                  Ordenar
                </label>

                <select
                  id="ordem"
                  className="rounded-2xl border border-white/10 bg-gray-950/85 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recente">Mais recentes</option>
                  <option value="antigo">Mais antigos</option>
                  <option value="valor">Maior valor</option>
                </select>

                <button
                  onClick={() => {
                    setBuscaTexto('')
                    setFiltroTime('todos')
                    setTipoFiltro('todos')
                    setSortOrder('recente')
                    carregarDados(1)
                  }}
                  className="rounded-2xl border border-emerald-500/25 bg-emerald-600/15 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-600/25"
                >
                  🔄 Atualizar BID
                </button>

                {(tipoFiltro !== 'todos' || filtroTime !== 'todos' || buscaAtiva) && (
                  <button
                    onClick={() => {
                      setTipoFiltro('todos')
                      setFiltroTime('todos')
                      setBuscaTexto('')
                      setSortOrder('recente')
                    }}
                    className="text-xs text-gray-300 underline hover:text-gray-100"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
          <div className="mb-4 flex items-center justify-center gap-3 md:hidden">
            <button
              onClick={() => carregarDados(pagina - 1)}
              disabled={pagina === 1}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-4 py-2 disabled:opacity-40"
            >
              ⬅
            </button>

            <span className="text-xs text-gray-300">
              pág. {pagina}/{totalPaginas}
            </span>

            <button
              onClick={() => carregarDados(pagina + 1)}
              disabled={pagina === totalPaginas}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-4 py-2 disabled:opacity-40"
            >
              ➡
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="mx-auto mb-3 h-4 w-64 rounded bg-white/10 md:mx-0" />
                <div className="h-40 w-full rounded-[2rem] bg-white/5" />
              </div>
            ))}
          </div>
        )}

        {erro && <p className="text-center text-red-400">{erro}</p>}

        {!loading && Object.keys(eventosAgrupados).length === 0 && (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] py-12 text-center text-gray-300">
            <p className="text-3xl">🗞️</p>
            <p className="mt-2 text-lg font-black">Nenhum evento encontrado</p>
            <p className="mt-1 text-sm text-white/45">
              Tente limpar os filtros ou atualizar o BID.
            </p>
          </div>
        )}

        <div className="space-y-12" ref={listaDiasAnim}>
          {Object.entries(eventosAgrupados).map(([data, eventosDoDia]) => {
            const d0 = eventosDoDia[0]?.data_evento
              ? new Date(eventosDoDia[0].data_evento)
              : new Date()

            return (
              <section key={data} className="relative">
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />

                  <div className="shrink-0 text-center">
                    <p className="text-xs uppercase tracking-wider text-yellow-400/80 font-black">
                      {diaSemanaPt(d0)}
                    </p>

                    <h2 className="text-2xl font-black text-yellow-300">
                      {data}
                    </h2>
                  </div>

                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/30 to-transparent" />
                </div>

                <div className="relative pl-5 md:pl-7">
                  <div className="absolute left-2 top-0 bottom-0 w-[2px] bg-gradient-to-b from-emerald-500 via-emerald-400 to-transparent opacity-40" />

                  <div className="grid grid-cols-1 gap-6">
                    {eventosDoDia.map((evento) => {
                      const idEvento = String(evento.id)
                      const time1 = timesMap[evento.id_time1]
                      const time2 = evento.id_time2 ? timesMap[evento.id_time2] : null

                      const comentarios = comentariosMap[idEvento] || []
                      const counts = reacoesCount[idEvento] || ({} as Record<Emoji, number>)
                      const mine = minhasReacoes[idEvento] || ({} as Record<Emoji, boolean>)
                      const estilo = tipoToStyle(evento.tipo_evento)
                      const aberto = !!comentarioAberto[idEvento]
                      const destaque = safe(evento.valor) >= 10000000

                      return (
                        <article
                          key={idEvento}
                          className="relative rounded-[2rem] p-[1px] bg-gradient-to-br from-white/12 via-white/0 to-white/12 shadow-[0_14px_40px_-20px_rgba(0,0,0,.95)]"
                        >
                          <div
                            className={classNames(
                              'relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0b1220]/95 via-[#07111f]/95 to-[#020617]/95 p-5 md:p-6',
                              'ring-1 transition-transform duration-200 hover:scale-[1.008]',
                              estilo.ring,
                              destaque
                                ? 'ring-2 ring-yellow-400/45 shadow-[0_0_42px_rgba(250,204,21,0.22)]'
                                : 'shadow-[0_24px_55px_rgba(0,0,0,0.40)]'
                            )}
                          >
                            <div
                              className={classNames(
                                'absolute left-0 top-0 bottom-0 w-[5px] bg-gradient-to-b opacity-80',
                                estilo.bar
                              )}
                            />

                            {destaque && (
                              <div className="absolute right-4 top-4 rounded-full border border-yellow-300/25 bg-yellow-400/15 px-3 py-1 text-[11px] font-black text-yellow-100">
                                ⭐ Negócio destaque
                              </div>
                            )}

                            <span
                              className={classNames(
                                'absolute -left-3 md:-left-5 top-8 size-3 rounded-full shadow-[0_0_20px_currentColor]',
                                estilo.dot
                              )}
                            />

                            <div className="flex items-start justify-between gap-3 pr-24 md:pr-36">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{estilo.icon}</span>

                                <span
                                  className={classNames(
                                    'rounded-full border px-3 py-1 text-xs font-black',
                                    estilo.chip
                                  )}
                                >
                                  {capitalizar(evento.tipo_evento)}
                                </span>
                              </div>

                              <div className="text-xs font-bold text-gray-300">
                                {horaPt(new Date(evento.data_evento))}
                              </div>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[1fr_280px]">
                              <div>
                                <p className="text-base md:text-xl font-black leading-relaxed text-white">
                                  {buscaAtiva ? (
                                    <Highlight
                                      text={evento.descricao}
                                      query={debouncedBusca}
                                    />
                                  ) : (
                                    evento.descricao
                                  )}
                                </p>

                                <div className="mt-4 flex flex-wrap items-center gap-4">
                                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-2">
                                    <AvatarTime
                                      nome={time1?.nome || 'Time'}
                                      logo={time1?.logo_url}
                                    />

                                    <div className="text-sm">
                                      <p className="text-xs text-gray-400">
                                        Time principal
                                      </p>
                                      <p className="font-black text-white">
                                        {time1?.nome || 'Desconhecido'}
                                      </p>
                                    </div>
                                  </div>

                                  {time2 && (
                                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-2">
                                      <AvatarTime
                                        nome={time2?.nome || 'Time'}
                                        logo={time2?.logo_url}
                                      />

                                      <div className="text-sm">
                                        <p className="text-xs text-gray-400">
                                          Time adversário
                                        </p>
                                        <p className="font-black text-white">
                                          {time2?.nome || 'Desconhecido'}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-3">
                                {(() => {
                                  const jEv: Partial<Jogador> = {
                                    id: evento.id_jogador || undefined,
                                    nome: evento.nome_jogador || undefined,
                                    foto_url: evento.foto_jogador_url || undefined,
                                  }

                                  const jFromMap = evento.id_jogador
                                    ? jogadoresMap[evento.id_jogador]
                                    : undefined

                                  const jogador =
                                    jEv.nome || jEv.foto_url
                                      ? { ...jFromMap, ...jEv }
                                      : jFromMap

                                  return jogador ? (
                                    <CardJogador
                                      j={jogador}
                                      highlight={buscaAtiva ? debouncedBusca : ''}
                                    />
                                  ) : null
                                })()}

                                {evento.valor != null && (
                                  <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 shadow-inner">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[11px] uppercase tracking-[0.22em] text-gray-400 font-black">
                                        Movimentação
                                      </p>

                                      <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[11px] text-gray-200/90">
                                        Financeiro
                                      </span>
                                    </div>

                                    <p
                                      className={classNames(
                                        'mt-2 overflow-hidden text-ellipsis whitespace-nowrap font-black tabular-nums',
                                        safe(evento.valor) < 0
                                          ? 'text-rose-300'
                                          : 'text-emerald-300'
                                      )}
                                      style={{
                                        fontSize: 'clamp(1.8rem, 3vw, 2.35rem)',
                                      }}
                                      title={formatBRL(evento.valor)}
                                    >
                                      {formatBRL(evento.valor)}
                                    </p>

                                    <div className="mt-3 h-px bg-white/10" />

                                    <p className="mt-2 text-[11px] text-gray-400">
                                      Registro financeiro oficial do evento
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-3">
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
                                        'rounded-full border px-3 py-1 text-sm transition bg-black/40 hover:bg-white/10',
                                        ativo
                                          ? 'border-emerald-500 bg-emerald-600/25 ring-2 ring-emerald-400/40'
                                          : 'border-white/10'
                                      )}
                                      title={ativo ? 'Remover reação' : 'Reagir'}
                                    >
                                      <span className="mr-1">{e}</span>
                                      <span className="text-xs text-gray-200">
                                        {qtd}
                                      </span>
                                    </button>
                                  )
                                })}

                                {!idTimeLogado && (
                                  <span className="ml-1 text-xs text-gray-300">
                                    Faça login no seu time para reagir.
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-4">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <h3 className="font-black text-white">
                                  💬 Comentários ({comentarios.length})
                                </h3>

                                <button
                                  onClick={() =>
                                    setComentarioAberto((p) => ({
                                      ...p,
                                      [idEvento]: !p[idEvento],
                                    }))
                                  }
                                  className="text-sm font-bold text-emerald-300 underline underline-offset-4 hover:text-emerald-200"
                                >
                                  {aberto ? 'Fechar' : 'Comentar…'}
                                </button>
                              </div>

                              {aberto && (
                                <>
                                  <div ref={commentsAnim} className="space-y-2">
                                    {comentarios.length === 0 && (
                                      <p className="text-sm text-gray-300">
                                        Seja o primeiro a comentar!
                                      </p>
                                    )}

                                    {comentarios.map((c) => {
                                      const nomeAtualTime =
                                        timesMap[c.id_time]?.nome ||
                                        c.nome_time ||
                                        'Time'

                                      const logoAtual = timesMap[c.id_time]?.logo_url

                                      return (
                                        <div
                                          key={c.id}
                                          className="rounded-2xl border border-white/10 bg-gray-950/70 p-3"
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2 text-sm">
                                              <AvatarTime
                                                nome={nomeAtualTime}
                                                logo={logoAtual}
                                              />

                                              <span className="truncate font-black text-emerald-300">
                                                {nomeAtualTime}
                                              </span>

                                              <span className="hidden text-xs text-gray-400 sm:inline">
                                                •{' '}
                                                {new Date(
                                                  c.criado_em
                                                ).toLocaleString('pt-BR')}
                                              </span>
                                            </div>

                                            {podeExcluirComentario(c) && (
                                              <button
                                                onClick={() =>
                                                  excluirComentario(idEvento, c.id)
                                                }
                                                disabled={!!excluindoComentario[c.id]}
                                                className="text-xs text-red-300 hover:text-red-500"
                                              >
                                                {excluindoComentario[c.id]
                                                  ? 'Excluindo…'
                                                  : 'Excluir'}
                                              </button>
                                            )}
                                          </div>

                                          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-100">
                                            {c.comentario}
                                          </p>
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

                            {isAdmin && (
                              <div className="mt-4 flex justify-end">
                                <button
                                  onClick={() => excluirEvento(idEvento)}
                                  className="text-sm text-red-300 underline underline-offset-4 hover:text-red-400"
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

        {!buscaAtiva && !filtroGlobalAtivo && totalPaginas > 1 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => carregarDados(1)}
              disabled={pagina === 1}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
            >
              «
            </button>

            <button
              onClick={() => carregarDados(pagina - 1)}
              disabled={pagina === 1}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
            >
              Anterior
            </button>

            <span className="text-sm text-gray-300">
              Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
            </span>

            <button
              onClick={() => carregarDados(pagina + 1)}
              disabled={pagina === totalPaginas}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
            >
              Próxima
            </button>

            <button
              onClick={() => carregarDados(totalPaginas)}
              disabled={pagina === totalPaginas}
              className="rounded-xl border border-white/10 bg-gray-950/70 px-3 py-2 disabled:opacity-40"
            >
              »
            </button>
          </div>
        )}

        <button
          onClick={() =>
            topRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            })
          }
          className="fixed bottom-6 right-6 rounded-full border border-white/10 bg-gray-950/80 px-4 py-2 text-sm font-black text-gray-200 shadow-lg backdrop-blur hover:bg-gray-900"
          title="Voltar ao topo"
        >
          ↑ Topo
        </button>
      </div>
    </main>
  )
}

function ResumoCard({
  label,
  value,
  desc,
  tone,
}: {
  label: string
  value: string | number
  desc: string
  tone: 'white' | 'emerald' | 'purple' | 'yellow'
}) {
  const styles = {
    white: 'bg-white/[0.045] border-white/10 text-white',
    emerald: 'bg-emerald-500/[0.07] border-emerald-400/20 text-emerald-300',
    purple: 'bg-purple-500/[0.07] border-purple-400/20 text-purple-300',
    yellow: 'bg-yellow-500/[0.07] border-yellow-400/20 text-yellow-300',
  }

  return (
    <div
      className={classNames(
        'rounded-3xl border p-4 shadow-[0_14px_35px_rgba(0,0,0,0.28)] backdrop-blur',
        styles[tone]
      )}
    >
      <p className="text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </p>

      <h3 className="mt-1 truncate text-2xl font-black">{value}</h3>

      <p className="mt-1 text-xs text-white/45">{desc}</p>
    </div>
  )
}

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
        placeholder={
          podeComentar
            ? 'Escreva um comentário…'
            : 'Você precisa estar logado no seu time para comentar.'
        }
        disabled={!podeComentar || enviando}
        className="min-h-[80px] w-full rounded-2xl border border-white/10 bg-gray-950/80 p-3 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-emerald-500/60 disabled:opacity-60"
        value={comentarioAtual}
        onChange={(e) => setTexto(idEvento, e.target.value)}
      />

      <div className="mt-2 flex items-center justify-between">
        <span
          className={classNames(
            'text-xs',
            quase ? 'text-yellow-300' : 'text-gray-300'
          )}
        >
          {chars}/{MAX_CHARS}
        </span>

        <button
          onClick={onSubmit}
          disabled={!podeComentar || enviando || comentarioAtual.trim().length === 0}
          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {enviando ? 'Publicando…' : 'Publicar comentário'}
        </button>
      </div>
    </div>
  )
}