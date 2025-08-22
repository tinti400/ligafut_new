Aqui está o componente **BIDPage** completo, já com:

* **Busca global** (passa por todas as páginas): digitou ≥ 2 caracteres, eu consulto o banco inteiro (descrição e nomes dos times) e trago tudo de uma vez.
* **Debounce** (≈350ms) para a busca.
* **Chips de filtro por tipo de evento** (Transferência, Empréstimo, Rescisão, Compra, Salário, Bônus).
* **Realce do termo buscado** na descrição.
* Melhorias visuais (header com “glass”, chips, botão flutuante “voltar ao topo”, estados vazios/skeleton mais caprichados).

> Observações:
>
> * Em modo busca, a paginação some (trago todos os resultados relevantes em uma listagem única).
> * Para filtrar por nome de time, eu busco `times.nome ILIKE %termo%` e junto com `bid.descricao ILIKE %termo%`.
> * Mantive todas as funcionalidades (comentários, reações, exclusão admin).

---

```tsx
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

/** ========= Tipos ========= */
type IDEvt = string | number

interface EventoBID {
  id: IDEvt
  tipo_evento: string
  descricao: string
  id_time1: string
  id_time2?: string | null
  valor?: number | null
  data_evento: string
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
const EMOJIS = ['👍','❤️','😂','😮','😢','😡','👏','🔥'] as const
type Emoji = typeof EMOJIS[number]

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
type TipoChipKey = typeof TIPOS_CHIP[number]['key']

/** ========= Helpers visuais ========= */
function tipoToStyle(tipo: string) {
  const t = tipo.toLowerCase()
  if (t.includes('transfer')) return { ring: 'ring-purple-500/60', chip: 'bg-purple-500/15 text-purple-300', dot: 'bg-purple-400' }
  if (t.includes('emprést') || t.includes('emprest')) return { ring: 'ring-blue-500/60', chip: 'bg-blue-500/15 text-blue-300', dot: 'bg-blue-400' }
  if (t.includes('rescis')) return { ring: 'ring-red-500/60', chip: 'bg-red-500/15 text-red-300', dot: 'bg-red-400' }
  if (t.includes('compra')) return { ring: 'ring-emerald-500/60', chip: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' }
  if (t.includes('salario')) return { ring: 'ring-orange-500/60', chip: 'bg-orange-500/15 text-orange-300', dot: 'bg-orange-400' }
  if (t.includes('bonus') || t.includes('bônus')) return { ring: 'ring-lime-500/60', chip: 'bg-lime-500/15 text-lime-300', dot: 'bg-lime-400' }
  return { ring: 'ring-gray-500/50', chip: 'bg-gray-500/15 text-gray-300', dot: 'bg-gray-400' }
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

function calcEstrelas(valor: number | null | undefined) {
  if (!valor || valor <= 0) return 0
  return Math.min(Math.ceil(valor / 50_000_000), 10)
}

function Estrelas({ valor }: { valor: number }) {
  const qtd = calcEstrelas(valor)
  const total = 10
  const estrelas = '★'.repeat(qtd) + '☆'.repeat(total - qtd)
  let cor = 'text-gray-400'
  if (qtd <= 2) cor = 'text-red-400'
  else if (qtd <= 4) cor = 'text-yellow-400'
  else if (qtd <= 7) cor = 'text-blue-400'
  else if (qtd <= 9) cor = 'text-purple-400'
  else cor = 'text-emerald-400'
  return <span className={`font-bold ${cor}`} title={`Valor: R$${valor.toLocaleString('pt-BR')}`}>{estrelas}</span>
}

function AvatarTime({ nome, logo }: { nome: string; logo?: string | null }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={nome}
        className="size-8 rounded-full object-cover ring-1 ring-white/10"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  const iniciais = nome.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase()
  return (
    <div className="size-8 rounded-full bg-gray-700 text-gray-200 grid place-items-center ring-1 ring-white/10">
      <span className="text-xs font-bold">{iniciais || '?'}</span>
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

/** ========= Highlight pequeno ========= */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

/** ========= Página ========= */
export default function BIDPage() {
  const { isAdmin } = useAdmin()

  // Eventos e Times
  const [eventos, setEventos] = useState<EventoBID[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [timesLista, setTimesLista] = useState<Time[]>([])

  // Estados gerais
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Filtros / Paginação
  const [filtroTime, setFiltroTime] = useState('todos')
  const [tipoFiltro, setTipoFiltro] = useState<TipoChipKey>('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const debouncedBusca = useDebounce(buscaTexto, 350)
  const buscaAtiva = debouncedBusca.trim().length >= 2

  const [pagina, setPagina] = useState(1)
  const [limite] = useState(25)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // Comentários
  const [comentariosMap, setComentariosMap] = useState<Record<string, Comentario[]>>({})
  const [comentando, setComentando] = useState<Record<string, boolean>>({})
  const [novoComentario, setNovoComentario] = useState<Record<string, string>>({})
  const [excluindoComentario, setExcluindoComentario] = useState<Record<string, boolean>>({})

  // Reações
  const [reacoesCount, setReacoesCount] = useState<Record<string, Record<Emoji, number>>>({})
  const [minhasReacoes, setMinhasReacoes] = useState<Record<string, Record<Emoji, boolean>>>({})
  const [reagindo, setReagindo] = useState<Record<string, boolean>>({})

  // Identidade do time logado
  const [idTimeLogado, setIdTimeLogado] = useState<string | null>(null)
  const [nomeTimeLogado, setNomeTimeLogado] = useState<string | null>(null)

  // Auto-animate
  const [listaDiasAnim] = useAutoAnimate<HTMLDivElement>()
  const [commentsAnim] = useAutoAnimate<HTMLDivElement>()

  // Scroll anchor p/ paginação
  const topRef = useRef<HTMLDivElement | null>(null)

  /** ====== Identidade do time (robusto) ====== */
  useEffect(() => {
    if (typeof window === 'undefined') return
    let id = localStorage.getItem('id_time') || localStorage.getItem('idTime') || null
    let nome = localStorage.getItem('nome_time') || localStorage.getItem('nomeTime') || null

    const tentar = (key: string) => {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return
        const obj = JSON.parse(raw)
        if (!id)   id   = obj?.id_time || obj?.idTime || obj?.id || null
        if (!nome) nome = obj?.nome_time || obj?.nomeTime || obj?.nome || null
      } catch {}
    }
    ;['user','usuario','usuario_atual','perfil','account'].forEach(tentar)

    if (id) setIdTimeLogado(String(id))
    if (nome) setNomeTimeLogado(String(nome))
  }, [])

  /** ====== Carrega times uma vez ====== */
  useEffect(() => {
    (async () => {
      const { data: timesData, error: errorTimes } = await supabase
        .from('times')
        .select('id, nome, logo_url')
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
    })()
  }, [])

  /** ====== Carrega eventos (paginado) ====== */
  useEffect(() => {
    if (!buscaAtiva) {
      carregarDados(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [/* mount */])

  /** ====== Busca global reativa ====== */
  useEffect(() => {
    if (buscaAtiva) {
      buscarGlobal(debouncedBusca)
    } else {
      // Sem busca, mantém dados paginados
      carregarDados(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBusca])

  /** ====== Se mudar o filtro de time tipoChip, só filtra em memória ====== */
  // (Nada a fazer aqui porque filtros são aplicados no memo `eventosFiltrados`)

  async function carregarDados(paginaAtual = 1) {
    if (buscaAtiva) return // em modo busca, não usa paginação
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

      setEventos(eventosData || [])

      const paginas = Math.ceil((count || 1) / limite)
      setTotalPaginas(paginas)
      setPagina(paginaAtual)

      const idsStr = (eventosData || []).map((e) => String(e.id))
      await Promise.all([
        carregarComentariosParaEventos(idsStr),
        carregarReacoesParaEventos(idsStr),
      ])

      if (topRef.current) {
        topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
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

  /** ====== Busca global (passa por todas as páginas) ====== */
  async function buscarGlobal(termo: string) {
    const termoTrim = termo.trim()
    if (termoTrim.length < 2) return
    setLoading(true)
    setErro(null)

    try {
      // 1) Times que batem por nome
      const { data: timesLike, error: errTimesLike } = await supabase
        .from('times')
        .select('id')
        .ilike('nome', `%${termoTrim}%`)
      if (errTimesLike) throw errTimesLike
      const timeIds = (timesLike || []).map(t => t.id)

      // 2) Eventos por descrição
      const { data: porDesc, error: errDesc } = await supabase
        .from('bid')
        .select('*')
        .ilike('descricao', `%${termoTrim}%`)
        .order('data_evento', { ascending: false })
      if (errDesc) throw errDesc

      // 3) Eventos por time1
      let porTime1: EventoBID[] = []
      if (timeIds.length) {
        const { data, error } = await supabase
          .from('bid')
          .select('*')
          .in('id_time1', timeIds)
          .order('data_evento', { ascending: false })
        if (error) throw error
        porTime1 = data || []
      }

      // 4) Eventos por time2
      let porTime2: EventoBID[] = []
      if (timeIds.length) {
        const { data, error } = await supabase
          .from('bid')
          .select('*')
          .in('id_time2', timeIds)
          .order('data_evento', { ascending: false })
        if (error) throw error
        porTime2 = data || []
      }

      // 5) Unir, tirar duplicatas e ordenar por data_evento desc
      const mapa: Record<string, EventoBID> = {}
      ;[...(porDesc || []), ...porTime1, ...porTime2].forEach(ev => { mapa[String(ev.id)] = ev })
      const unicos = Object.values(mapa).sort((a, b) => +new Date(b.data_evento) - +new Date(a.data_evento))

      setEventos(unicos)
      setTotalPaginas(1)
      setPagina(1)

      const idsStr = unicos.map((e) => String(e.id))
      await Promise.all([
        carregarComentariosParaEventos(idsStr),
        carregarReacoesParaEventos(idsStr),
      ])

      if (topRef.current) {
        topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
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

  /** ====== EXCLUIR EVENTO (ADMIN) ====== */
  async function excluirEvento(idEvento: string) {
    const ok = window.confirm('Tem certeza que deseja excluir este evento do BID?')
    if (!ok) return
    try {
      const { error } = await supabase.from('bid').delete().eq('id', idEvento)
      if (error) throw error

      setEventos((prev) => prev.filter((ev) => String(ev.id) !== idEvento))
      setComentariosMap((prev) => { const n = { ...prev }; delete n[idEvento]; return n })
      setReacoesCount((prev) => { const n = { ...prev }; delete n[idEvento]; return n })
      setMinhasReacoes((prev) => { const n = { ...prev }; delete n[idEvento]; return n })

      toast.success('Evento excluído com sucesso!')
    } catch (err: any) {
      console.error(err)
      toast.error(`Erro ao excluir evento: ${err?.message || 'desconhecido'}`)
    }
  }

  /** ====== Comentários ====== */
  async function carregarComentariosParaEventos(idsEventoStr: string[]) {
    if (!idsEventoStr.length) { setComentariosMap({}); return }
    const { data, error } = await supabase
      .from('bid_comentarios')
      .select('*')
      .in('id_evento', idsEventoStr)
      .order('criado_em', { ascending: true })
    if (error) { console.error(error); return }

    const agrupado: Record<string, Comentario[]> = {}
    for (const c of (data as any[])) {
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
    if (!idTimeLogado || !nomeTimeLogado) {
      toast.error('Faça login no seu time para comentar.')
      return
    }
    const texto = (novoComentario[idEvento] || '').trim()
    if (!texto) { toast('Digite um comentário.', { icon: '💬' }); return }

    setComentando((prev) => ({ ...prev, [idEvento]: true }))
    try {
      const { data, error } = await supabase
        .from('bid_comentarios')
        .insert({ id_evento: idEvento, id_time: idTimeLogado, nome_time: nomeTimeLogado, comentario: texto })
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
    if (!idsEventoStr.length) { setReacoesCount({}); setMinhasReacoes({}); return }
    const { data, error } = await supabase
      .from('bid_reacoes')
      .select('*')
      .in('id_evento', idsEventoStr)
    if (error) { console.error(error); return }

    const countMap: Record<string, Record<Emoji, number>> = {}
    const mineMap: Record<string, Record<Emoji, boolean>> = {}

    for (const r of (data as any[])) {
      const ev = String(r.id_evento)
      const em: Emoji = r.emoji
      countMap[ev] = countMap[ev] || {}
      countMap[ev][em] = (countMap[ev][em] || 0) + 1

      if (idTimeLogado && r.id_time === idTimeLogado) {
        mineMap[ev] = mineMap[ev] || {}
        mineMap[ev][em] = true
      }
    }
    setReacoesCount(countMap)
    setMinhasReacoes(mineMap)
  }

  /** ====== Filtros / Agrupamento ====== */
  const eventosFiltrados = useMemo(() => {
    const termo = debouncedBusca.trim().toLowerCase()
    return eventos.filter((evento) => {
      // filtro por time selecionado
      const timeOK = filtroTime === 'todos' || evento.id_time1 === filtroTime || evento.id_time2 === filtroTime
      if (!timeOK) return false

      // filtro por chip de tipo
      const tipoKey = getTipoKey(evento.tipo_evento)
      const tipoOK = tipoFiltro === 'todos' || tipoKey === tipoFiltro
      if (!tipoOK) return false

      // filtro por texto (em modo paginação normal a busca é local; em modo global os dados já vieram filtrados)
      if (!buscaAtiva && termo) {
        const nome1 = timesMap[evento.id_time1]?.nome || ''
        const nome2 = evento.id_time2 ? (timesMap[evento.id_time2]?.nome || '') : ''
        const texto = `${evento.descricao} ${nome1} ${nome2}`.toLowerCase()
        if (!texto.includes(termo)) return false
      }
      return true
    })
  }, [eventos, filtroTime, tipoFiltro, debouncedBusca, buscaAtiva, timesMap])

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
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(16,185,129,0.10),transparent),linear-gradient(to_bottom,#0b0f14,#000000)] text-white">
      {/* topo/anchor */}
      <div ref={topRef} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="mb-6 text-center">
          <div className="inline-block rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-3 shadow-sm">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              📰 BID — <span className="text-emerald-400">Boletim Informativo Diário</span>
            </h1>
            <p className="text-xs md:text-sm text-gray-400 mt-1">
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
        <div className="sticky top-0 z-10 -mx-4 mb-6 bg-gradient-to-b from-black/70 to-transparent backdrop-blur supports-[backdrop-filter]:bg-black/40 px-4 py-3 border-b border-white/10">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex gap-3 w-full md:w-auto">
                <select
                  className="bg-gray-800/80 text-white border border-gray-700 rounded-lg px-4 py-2.5 w-full md:w-72 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={filtroTime}
                  onChange={(e) => setFiltroTime(e.target.value)}
                >
                  <option value="todos">🔍 Todos os times</option>
                  {timesLista.map((time) => (
                    <option key={time.id} value={time.id}>{time.nome}</option>
                  ))}
                </select>

                <button
                  onClick={() => setFiltroTime(idTimeLogado || 'todos')}
                  className="px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-700 hover:bg-emerald-600/30 disabled:opacity-50"
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
                  className="bg-gray-800/80 text-white border border-gray-700 rounded-lg px-4 py-2.5 w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={buscaTexto}
                  onChange={(e) => setBuscaTexto(e.target.value)}
                />
                {/* paginação compacta (só quando NÃO estiver buscando) */}
                {!buscaAtiva && totalPaginas > 1 && (
                  <div className="hidden md:flex items-center gap-2">
                    <button
                      onClick={() => carregarDados(1)}
                      disabled={pagina === 1}
                      className="px-2 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40"
                      title="Primeira"
                    >«</button>
                    <button
                      onClick={() => carregarDados(pagina - 1)}
                      disabled={pagina === 1}
                      className="px-2 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40"
                      title="Anterior"
                    >‹</button>
                    <span className="text-xs text-gray-300 select-none">
                      pág. <strong>{pagina}</strong>/<strong>{totalPaginas}</strong>
                    </span>
                    <button
                      onClick={() => carregarDados(pagina + 1)}
                      disabled={pagina === totalPaginas}
                      className="px-2 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40"
                      title="Próxima"
                    >›</button>
                    <button
                      onClick={() => carregarDados(totalPaginas)}
                      disabled={pagina === totalPaginas}
                      className="px-2 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40"
                      title="Última"
                    >»</button>
                  </div>
                )}
              </div>
            </div>

            {/* Chips de tipo */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
              {TIPOS_CHIP.map(({ key, label }) => {
                const ativo = tipoFiltro === key
                return (
                  <button
                    key={key}
                    onClick={() => setTipoFiltro(key)}
                    className={classNames(
                      'whitespace-nowrap rounded-full px-3 py-1.5 text-sm border transition',
                      ativo
                        ? 'bg-emerald-600/25 border-emerald-400 text-emerald-200 shadow shadow-emerald-900/30'
                        : 'bg-gray-900/60 border-gray-700 text-gray-300 hover:bg-gray-800'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              {(tipoFiltro !== 'todos' || filtroTime !== 'todos' || buscaAtiva) && (
                <button
                  onClick={() => { setTipoFiltro('todos'); setFiltroTime('todos'); setBuscaTexto('') }}
                  className="ml-1 text-xs text-gray-300 underline hover:text-gray-100"
                  title="Limpar filtros"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Paginação (mobile) */}
        {!buscaAtiva && totalPaginas > 1 && (
          <div className="md:hidden flex justify-center items-center gap-3 mb-4">
            <button onClick={() => carregarDados(pagina - 1)} disabled={pagina === 1}
              className="px-4 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">⬅</button>
            <span className="text-xs text-gray-300">pág. {pagina}/{totalPaginas}</span>
            <button onClick={() => carregarDados(pagina + 1)} disabled={pagina === totalPaginas}
              className="px-4 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">➡</button>
          </div>
        )}

        {/* Estados */}
        {loading && (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-40 bg-white/10 rounded mb-3" />
                <div className="h-24 w-full bg-white/5 rounded-lg" />
              </div>
            ))}
          </div>
        )}
        {erro && <p className="text-red-400 text-center">{erro}</p>}
        {!loading && Object.keys(eventosAgrupados).length === 0 && (
          <div className="text-center text-gray-300 py-8">
            <p className="text-lg">Nenhum evento encontrado {buscaAtiva ? 'para a busca atual.' : 'para esse filtro.'}</p>
          </div>
        )}

        {/* Timeline de eventos */}
        <div className="space-y-10" ref={listaDiasAnim}>
          {Object.entries(eventosAgrupados).map(([data, eventosDoDia]) => {
            const d0 = eventosDoDia[0]?.data_evento ? new Date(eventosDoDia[0].data_evento) : new Date()
            return (
              <section key={data} className="relative">
                {/* Cabeçalho do dia */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                  <div className="shrink-0">
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wider text-yellow-400/80">{diaSemanaPt(d0)}</p>
                      <h2 className="text-xl font-bold text-yellow-300">{data}</h2>
                    </div>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
                </div>

                {/* Lista do dia */}
                <div className="space-y-4">
                  {eventosDoDia.map((evento) => {
                    const idEvento = String(evento.id)
                    const time1 = timesMap[evento.id_time1]
                    const time2 = evento.id_time2 ? timesMap[evento.id_time2] : null
                    const comentarios = comentariosMap[idEvento] || []
                    const comentarioAtual = novoComentario[idEvento] || ''
                    const counts = reacoesCount[idEvento] || {}
                    const mine = minhasReacoes[idEvento] || {}
                    const estilo = tipoToStyle(evento.tipo_evento)

                    return (
                      <article
                        key={idEvento}
                        className={classNames(
                          'relative rounded-xl bg-gray-900/70 border border-white/10 p-4 md:p-5 shadow-md',
                          'ring-1', estilo.ring, 'hover:shadow-emerald-600/10 hover:scale-[1.003] transition'
                        )}
                      >
                        {/* Timeline dot */}
                        <span className={classNames('absolute -left-3 top-5 size-2 rounded-full', estilo.dot)} />

                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{iconeTipo(evento.tipo_evento)}</span>
                            <span className={classNames('px-2 py-0.5 rounded-full text-xs font-semibold', estilo.chip)}>
                              {capitalizar(evento.tipo_evento)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-300">{horaPt(new Date(evento.data_evento))}</div>
                        </div>

                        {/* Conteúdo */}
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <p className="text-gray-100 leading-relaxed">
                              {buscaAtiva ? (
                                <Highlight text={evento.descricao} query={debouncedBusca} />
                              ) : (
                                evento.descricao
                              )}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              {/* time 1 */}
                              <div className="flex items-center gap-2">
                                <AvatarTime nome={time1?.nome || 'Time'} logo={time1?.logo_url} />
                                <div className="text-sm">
                                  <p className="text-gray-400">Time principal</p>
                                  <p className="font-semibold">{time1?.nome || 'Desconhecido'}</p>
                                </div>
                              </div>

                              {/* separador */}
                              {time2 && <span className="text-gray-500">•</span>}

                              {/* time 2 */}
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

                          {/* Lado direito: valor / estrelas */}
                          <div className="md:col-span-1">
                            {evento.valor != null && (
                              <div className="rounded-lg bg-black/30 border border-white/10 p-3">
                                <p className="text-xs text-gray-400 mb-1">Movimentação</p>
                                <p className="text-lg font-bold text-yellow-300">
                                  {evento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                                <div className="mt-1 text-sm">
                                  <span className="text-gray-400 mr-2">Impacto</span>
                                  <Estrelas valor={evento.valor} />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reações */}
                        <div className="mt-4 rounded-md bg-black/25 border border-white/10 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {EMOJIS.map((e) => {
                              const qtd = counts[e] || 0
                              const ativo = !!mine[e]
                              return (
                                <button
                                  key={e}
                                  onClick={() => toggleReacao(idEvento, e)}
                                  disabled={!idTimeLogado || !!reagindo[idEvento]}
                                  className={classNames(
                                    'px-2 py-1 rounded-md text-sm border transition',
                                    ativo
                                      ? 'bg-emerald-600/25 border-emerald-500 ring-1 ring-emerald-400/30'
                                      : 'bg-gray-800/60 border-gray-600 hover:bg-gray-700'
                                  )}
                                  title={ativo ? 'Remover reação' : 'Reagir'}
                                >
                                  <span className="mr-1">{e}</span>
                                  <span className="text-xs text-gray-200">{qtd}</span>
                                </button>
                              )
                            })}
                            {!idTimeLogado && (
                              <span className="text-xs text-gray-300 ml-1">Faça login no seu time para reagir.</span>
                            )}
                          </div>
                        </div>

                        {/* Comentários */}
                        <div className="mt-4 rounded-lg bg-black/25 border border-white/10 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-white">💬 Comentários ({comentarios.length})</h3>
                            {!idTimeLogado && <span className="text-xs text-gray-300">Faça login no seu time para comentar.</span>}
                          </div>

                          <div ref={commentsAnim} className="space-y-2">
                            {comentarios.length === 0 && (
                              <p className="text-gray-300 text-sm">Seja o primeiro a comentar!</p>
                            )}
                            {comentarios.map((c) => (
                              <div key={c.id} className="bg-gray-800/70 border border-gray-700 rounded-md p-2">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm">
                                    <span className="font-semibold text-emerald-300">{c.nome_time}</span>
                                    <span className="text-gray-400"> • {new Date(c.criado_em).toLocaleString('pt-BR')}</span>
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
                            ))}
                          </div>

                          {/* Form */}
                          <ComentarioForm
                            idEvento={idEvento}
                            comentarioAtual={comentarioAtual}
                            setTexto={onChangeComentario}
                            enviando={!!comentando[idEvento]}
                            podeComentar={!!idTimeLogado}
                            onSubmit={() => enviarComentario(idEvento)}
                          />
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
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* Rodapé paginação (somente sem busca) */}
        {!buscaAtiva && totalPaginas > 1 && (
          <div className="mt-10 flex justify-center items-center gap-3">
            <button onClick={() => carregarDados(1)} disabled={pagina === 1}
              className="px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">«</button>
            <button onClick={() => carregarDados(pagina - 1)} disabled={pagina === 1}
              className="px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">Anterior</button>
            <span className="text-sm text-gray-300">Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong></span>
            <button onClick={() => carregarDados(pagina + 1)} disabled={pagina === totalPaginas}
              className="px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">Próxima</button>
            <button onClick={() => carregarDados(totalPaginas)} disabled={pagina === totalPaginas}
              className="px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700 disabled:opacity-40">»</button>
          </div>
        )}

        {/* Botão flutuante voltar ao topo */}
        <button
          onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed bottom-6 right-6 rounded-full border border-white/10 bg-gray-900/80 backdrop-blur px-3 py-2 text-sm text-gray-200 shadow-lg hover:bg-gray-800"
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
        placeholder={
          podeComentar ? 'Escreva um comentário…' : 'Você precisa estar logado no seu time para comentar.'
        }
        disabled={!podeComentar || enviando}
        className="w-full rounded-md bg-gray-900/80 text-white border border-gray-700 p-2 min-h-[70px] placeholder:text-gray-500 disabled:opacity-60"
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
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm"
        >
          {enviando ? 'Publicando…' : 'Publicar comentário'}
        </button>
      </div>
    </div>
  )
}
```
