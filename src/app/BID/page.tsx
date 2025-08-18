'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import classNames from 'classnames'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Tipos ========= */
interface EventoBID {
  id: string
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
}

type Comentario = {
  id: string
  id_evento: string
  id_time: string
  nome_time: string
  comentario: string
  criado_em: string
}

/** ========= Página ========= */
export default function BIDPage() {
  const { isAdmin } = useAdmin()

  // Eventos e Times
  const [eventos, setEventos] = useState<EventoBID[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, string>>({})
  const [timesLista, setTimesLista] = useState<Time[]>([])

  // Estado global
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Filtros / Paginação
  const [filtroTime, setFiltroTime] = useState('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const [pagina, setPagina] = useState(1)
  const [limite] = useState(25)
  const [totalPaginas, setTotalPaginas] = useState(1)

  // Comentários
  const [comentariosMap, setComentariosMap] = useState<Record<string, Comentario[]>>({})
  const [comentando, setComentando] = useState<Record<string, boolean>>({})
  const [novoComentario, setNovoComentario] = useState<Record<string, string>>({})
  const [excluindoComentario, setExcluindoComentario] = useState<Record<string, boolean>>({})

  // Identidade do time logado (localStorage)
  const [idTimeLogado, setIdTimeLogado] = useState<string | null>(null)
  const [nomeTimeLogado, setNomeTimeLogado] = useState<string | null>(null)

  // Auto-animate
  const [parent] = useAutoAnimate<HTMLDivElement>()
  const [commentsAnimParent] = useAutoAnimate<HTMLDivElement>()

  useEffect(() => {
    // carrega identidade do time
    if (typeof window !== 'undefined') {
      const id = localStorage.getItem('id_time') || localStorage.getItem('idTime') || localStorage.getItem('idTimeLogado')
      const nome = localStorage.getItem('nome_time') || localStorage.getItem('nomeTime') || localStorage.getItem('nomeTimeLogado')
      if (id) setIdTimeLogado(id)
      if (nome) setNomeTimeLogado(nome)
    }
  }, [])

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ====== Carrega eventos + times (paginado) ====== */
  async function carregarDados(paginaAtual = 1) {
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

      const { data: timesData, error: errorTimes } = await supabase
        .from('times')
        .select('id, nome')

      if (errorTimes) throw errorTimes

      const map: Record<string, string> = {}
      timesData?.forEach((t) => (map[t.id] = t.nome))

      setEventos(eventosData || [])
      setTimesMap(map)
      setTimesLista(timesData || [])

      const paginas = Math.ceil((count || 1) / limite)
      setTotalPaginas(paginas)
      setPagina(paginaAtual)

      // já carrega os comentários dos eventos desta página
      const ids = (eventosData || []).map((e) => e.id)
      await carregarComentariosParaEventos(ids)
    } catch (err) {
      console.error(err)
      setErro('Erro ao carregar os eventos.')
      setEventos([])
      setComentariosMap({})
    } finally {
      setLoading(false)
    }
  }

  /** ====== Busca comentários de vários eventos de uma vez ====== */
  async function carregarComentariosParaEventos(idsEvento: string[]) {
    if (!idsEvento.length) {
      setComentariosMap({})
      return
    }

    const { data, error } = await supabase
      .from('bid_comentarios')
      .select('*')
      .in('id_evento', idsEvento)
      .order('criado_em', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    const agrupado: Record<string, Comentario[]> = {}
    for (const c of data as Comentario[]) {
      if (!agrupado[c.id_evento]) agrupado[c.id_evento] = []
      agrupado[c.id_evento].push(c)
    }
    setComentariosMap(agrupado)
  }

  /** ====== Excluir Evento (admin) ====== */
  async function excluirEvento(id: string) {
    const confirm = window.confirm('Tem certeza que deseja excluir este evento do BID?')
    if (!confirm) return

    const { error } = await supabase.from('bid').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao excluir evento')
      return
    }

    setEventos((prev) => prev.filter((ev) => ev.id !== id))
    // remove comentários vinculados desse card na UI (opcional: manter no BD)
    const novo = { ...comentariosMap }
    delete novo[id]
    setComentariosMap(novo)

    toast.success('Evento excluído com sucesso!')
  }

  /** ====== Utilitários UI ====== */
  function capitalizar(str: string) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
  }

  function calcularEstrelas(valor: number | null | undefined): number {
    if (!valor || valor <= 0) return 0
    const estrelas = Math.ceil(valor / 50_000_000)
    return Math.min(estrelas, 10)
  }

  function renderEstrelas(qtd: number, valor: number) {
    const total = 10
    const estrelas = '★'.repeat(qtd) + '☆'.repeat(total - qtd)

    let cor = 'text-gray-400'
    if (qtd <= 2) cor = 'text-red-400'
    else if (qtd <= 4) cor = 'text-yellow-400'
    else if (qtd <= 7) cor = 'text-blue-400'
    else if (qtd <= 9) cor = 'text-purple-400'
    else if (qtd === 10) cor = 'text-emerald-400'

    return (
      <span className={`font-bold ${cor}`} title={`Valor: R$${valor.toLocaleString('pt-BR')}`}>
        {estrelas}
      </span>
    )
  }

  function iconeTipo(tipo: string) {
    const tipoMin = tipo.toLowerCase()
    if (tipoMin.includes('transfer')) return '💸'
    if (tipoMin.includes('emprést')) return '🤝'
    if (tipoMin.includes('rescis')) return '✂️'
    if (tipoMin.includes('compra')) return '🛒'
    if (tipoMin.includes('salario')) return '📤'
    if (tipoMin.includes('bonus')) return '🎁'
    return '📝'
  }

  function corFundo(tipo: string) {
    const tipoMin = tipo.toLowerCase()
    if (tipoMin.includes('transfer')) return 'bg-purple-700'
    if (tipoMin.includes('emprést')) return 'bg-blue-700'
    if (tipoMin.includes('rescis')) return 'bg-red-700'
    if (tipoMin.includes('compra')) return 'bg-green-700'
    if (tipoMin.includes('salario')) return 'bg-orange-800'
    if (tipoMin.includes('bonus')) return 'bg-emerald-800'
    return 'bg-gray-700'
  }

  /** ====== Filtros / Agrupamento ====== */
  const eventosFiltrados = useMemo(() => {
    return eventos.filter((evento) => {
      const nome1 = timesMap[evento.id_time1] || ''
      const nome2 = evento.id_time2 ? timesMap[evento.id_time2] || '' : ''
      const texto = `${evento.descricao} ${nome1} ${nome2}`.toLowerCase()
      const buscaOK = texto.includes(buscaTexto.toLowerCase())
      const timeOK =
        filtroTime === 'todos' || evento.id_time1 === filtroTime || evento.id_time2 === filtroTime
      return buscaOK && timeOK
    })
  }, [eventos, filtroTime, buscaTexto, timesMap])

  const eventosAgrupados = useMemo(() => {
    const grupos: Record<string, EventoBID[]> = {}
    for (const evento of eventosFiltrados) {
      const data = new Date(evento.data_evento).toLocaleDateString('pt-BR')
      if (!grupos[data]) grupos[data] = []
      grupos[data].push(evento)
    }
    return grupos
  }, [eventosFiltrados])

  /** ====== Comentários: criar / excluir ====== */
  const MAX_CHARS = 400

  function onChangeComentario(idEvento: string, texto: string) {
    if (texto.length > MAX_CHARS) return
    setNovoComentario((prev) => ({ ...prev, [idEvento]: texto }))
  }

  async function enviarComentario(idEvento: string) {
    if (!idTimeLogado || !nomeTimeLogado) {
      toast.error('Faça login no seu time para comentar.')
      return
    }

    const texto = (novoComentario[idEvento] || '').trim()
    if (!texto) {
      toast('Digite um comentário.', { icon: '💬' })
      return
    }

    setComentando((prev) => ({ ...prev, [idEvento]: true }))

    try {
      const novo: Omit<Comentario, 'id' | 'criado_em'> = {
        id_evento: idEvento,
        id_time: idTimeLogado,
        nome_time: nomeTimeLogado,
        comentario: texto
      }

      const { data, error } = await supabase
        .from('bid_comentarios')
        .insert(novo)
        .select('*')
        .single()

      if (error) throw error

      const comentCriado = data as Comentario

      setComentariosMap((prev) => {
        const arr = prev[idEvento] ? [...prev[idEvento]] : []
        arr.push(comentCriado)
        return { ...prev, [idEvento]: arr }
      })
      setNovoComentario((prev) => ({ ...prev, [idEvento]: '' }))
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível publicar o comentário.')
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
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir comentário.')
    } finally {
      setExcluindoComentario((p) => ({ ...p, [idComentario]: false }))
    }
  }

  function podeExcluirComentario(c: Comentario) {
    return isAdmin || (idTimeLogado && c.id_time === idTimeLogado)
  }

  /** ====== Render ====== */
  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center text-green-400">
          📰 BID — Boletim Informativo Diário
        </h1>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4 justify-center items-center mb-6">
          <select
            className="bg-gray-800 text-white border border-gray-600 rounded px-4 py-2 w-full md:w-auto"
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
          <input
            type="text"
            placeholder="Buscar por jogador ou descrição..."
            className="bg-gray-800 text-white border border-gray-600 rounded px-4 py-2 w-full md:w-80"
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
          />
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex justify-center items-center gap-4 mb-6">
            <button
              onClick={() => carregarDados(pagina - 1)}
              disabled={pagina === 1}
              className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-50"
            >
              ⬅ Página Anterior
            </button>
            <span className="text-white text-sm">
              Página {pagina} de {totalPaginas}
            </span>
            <button
              onClick={() => carregarDados(pagina + 1)}
              disabled={pagina === totalPaginas}
              className="px-4 py-2 rounded bg-gray-700 text-white disabled:opacity-50"
            >
              Próxima Página ➡
            </button>
          </div>
        )}

        {/* Estados gerais */}
        {loading && <p className="text-gray-400 text-center">⏳ Carregando eventos...</p>}
        {erro && <p className="text-red-500 text-center">{erro}</p>}
        {!loading && eventosFiltrados.length === 0 && (
          <p className="text-gray-400 italic text-center">Nenhum evento encontrado para esse filtro.</p>
        )}

        {/* Lista de eventos */}
        <div className="space-y-8" ref={parent}>
          {Object.entries(eventosAgrupados).map(([data, eventosDoDia]) => (
            <div key={data}>
              <h2 className="text-xl font-bold text-yellow-400 border-b border-yellow-400 mb-3 pb-1">
                📅 {data}
              </h2>

              <div className="space-y-4">
                {eventosDoDia.map((evento) => {
                  const nome1 = timesMap[evento.id_time1] || 'Time Desconhecido'
                  const nome2 = evento.id_time2 ? (timesMap[evento.id_time2] || 'Time Desconhecido') : null
                  const estrelas = calcularEstrelas(evento.valor)
                  const comentarios = comentariosMap[evento.id] || []
                  const comentarioAtual = novoComentario[evento.id] || ''
                  const chars = comentarioAtual.length

                  return (
                    <div
                      key={evento.id}
                      className={classNames(
                        'rounded-xl p-4 shadow transition border border-gray-700 relative',
                        'hover:scale-[1.01] transform duration-200',
                        corFundo(evento.tipo_evento)
                      )}
                    >
                      {/* Excluir evento (admin) */}
                      {isAdmin && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => excluirEvento(evento.id)}
                            className="text-red-300 hover:text-red-500 text-sm underline"
                            title="Excluir evento"
                          >
                            🗑️ Excluir evento
                          </button>
                        </div>
                      )}

                      {/* Cabeçalho do card */}
                      <div className="flex justify-between items-center mb-1">
                        <p className="font-bold text-lg text-white flex items-center gap-2">
                          {iconeTipo(evento.tipo_evento)} {capitalizar(evento.tipo_evento)}
                        </p>
                        <span className="text-xs text-gray-200">
                          {new Date(evento.data_evento).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>

                      {/* Descrição */}
                      <p className="text-gray-100">{evento.descricao}</p>

                      {/* Detalhes */}
                      <div className="mt-2 text-sm text-gray-200 space-y-1">
                        <p>🟢 Time principal: <strong>{nome1}</strong></p>
                        {nome2 && <p>🔴 Time adversário: <strong>{nome2}</strong></p>}
                        {evento.valor != null && (
                          <div className="pt-1">
                            <p className="text-yellow-300 font-semibold">
                              💰 {evento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p>⭐ Classificação: {renderEstrelas(estrelas, evento.valor)}</p>
                          </div>
                        )}
                      </div>

                      {/* Comentários */}
                      <div className="mt-4 rounded-lg bg-black/20 border border-white/10 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-white">
                            💬 Comentários ({comentarios.length})
                          </h3>
                          {!idTimeLogado && (
                            <span className="text-xs text-gray-300">
                              Faça login no seu time para comentar.
                            </span>
                          )}
                        </div>

                        {/* Lista de comentários */}
                        <div ref={commentsAnimParent} className="space-y-2">
                          {comentarios.length === 0 && (
                            <p className="text-gray-300 text-sm">Seja o primeiro a comentar!</p>
                          )}
                          {comentarios.map((c) => (
                            <div
                              key={c.id}
                              className="bg-gray-800/70 border border-gray-700 rounded-md p-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-sm">
                                  <span className="font-semibold text-emerald-300">{c.nome_time}</span>
                                  <span className="text-gray-400"> • {new Date(c.criado_em).toLocaleString('pt-BR')}</span>
                                </div>
                                {podeExcluirComentario(c) && (
                                  <button
                                    onClick={() => excluirComentario(evento.id, c.id)}
                                    disabled={!!excluindoComentario[c.id]}
                                    className="text-red-300 hover:text-red-500 text-xs"
                                  >
                                    {excluindoComentario[c.id] ? 'Excluindo...' : 'Excluir'}
                                  </button>
                                )}
                              </div>
                              <p className="text-gray-100 text-sm mt-1 whitespace-pre-wrap break-words">
                                {c.comentario}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Form de novo comentário */}
                        <div className="mt-3">
                          <textarea
                            placeholder={
                              idTimeLogado
                                ? `Comentar como ${nomeTimeLogado}...`
                                : 'Você precisa estar logado no seu time para comentar.'
                            }
                            disabled={!idTimeLogado || !!comentando[evento.id]}
                            className="w-full rounded-md bg-gray-900 text-white border border-gray-700 p-2 min-h-[70px] placeholder:text-gray-500 disabled:opacity-60"
                            value={comentarioAtual}
                            onChange={(e) => onChangeComentario(evento.id, e.target.value)}
                          />
                          <div className="flex items-center justify-between mt-2">
                            <span className={classNames('text-xs', chars >= MAX_CHARS * 0.9 ? 'text-yellow-300' : 'text-gray-300')}>
                              {chars}/{MAX_CHARS}
                            </span>
                            <button
                              onClick={() => enviarComentario(evento.id)}
                              disabled={!idTimeLogado || !!comentando[evento.id] || comentarioAtual.trim().length === 0}
                              className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-sm"
                            >
                              {comentando[evento.id] ? 'Publicando...' : 'Publicar comentário'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
