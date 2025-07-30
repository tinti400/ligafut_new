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

export default function BIDPage() {
  const { isAdmin } = useAdmin()
  const [eventos, setEventos] = useState<EventoBID[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, string>>({})
  const [timesLista, setTimesLista] = useState<Time[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroTime, setFiltroTime] = useState('todos')
  const [buscaTexto, setBuscaTexto] = useState('')
  const [modoVisualizacao, setModoVisualizacao] = useState<'financeiro' | 'transferencias'>('financeiro')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [parent] = useAutoAnimate<HTMLDivElement>()

  const eventosPorPagina = 50

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setLoading(true)
    setErro(null)
    try {
      const { data: eventosData, error: errorEventos } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .limit(1000)

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
    } catch (err) {
      setErro('Erro ao carregar os eventos.')
      setEventos([])
    } finally {
      setLoading(false)
    }
  }

  async function excluirEvento(id: string) {
    const confirm = window.confirm('Tem certeza que deseja excluir este evento do BID?')
    if (!confirm) return

    const { error } = await supabase.from('bid').delete().eq('id', id)
    if (error) {
      toast.error('Erro ao excluir evento')
      return
    }

    setEventos((prev) => prev.filter((ev) => ev.id !== id))
    toast.success('Evento excluído com sucesso!')
  }

  function capitalizar(str: string) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
  }

  function iconeTipo(tipo: string) {
    const tipoMin = tipo.toLowerCase()
    if (tipoMin.includes('transfer')) return '💸'
    if (tipoMin.includes('empr')) return '🤝'
    if (tipoMin.includes('rescis')) return '✂️'
    if (tipoMin.includes('compra')) return '🛒'
    if (tipoMin.includes('salario')) return '📤'
    if (tipoMin.includes('bonus')) return '🎁'
    if (tipoMin.includes('leilao') || tipoMin.includes('roubo') || tipoMin.includes('multa')) return '🔁'
    if (tipoMin.includes('venda')) return '📤'
    return '📝'
  }

  function corFundo(tipo: string) {
    const tipoMin = tipo.toLowerCase()
    if (tipoMin.includes('transfer')) return 'bg-purple-700'
    if (tipoMin.includes('empr')) return 'bg-blue-700'
    if (tipoMin.includes('rescis')) return 'bg-red-700'
    if (tipoMin.includes('compra')) return 'bg-green-700'
    if (tipoMin.includes('salario')) return 'bg-orange-800'
    if (tipoMin.includes('bonus')) return 'bg-emerald-800'
    if (tipoMin.includes('leilao') || tipoMin.includes('roubo') || tipoMin.includes('multa')) return 'bg-yellow-700'
    if (tipoMin.includes('venda')) return 'bg-pink-700'
    return 'bg-gray-700'
  }

  const eventosFiltrados = useMemo(() => {
    return eventos.filter((evento) => {
      const tipo = evento.tipo_evento.toLowerCase()
      const nome1 = timesMap[evento.id_time1] || ''
      const nome2 = evento.id_time2 ? timesMap[evento.id_time2] || '' : ''
      const texto = `${evento.descricao} ${nome1} ${nome2}`.toLowerCase()
      const buscaOK = texto.includes(buscaTexto.toLowerCase())
      const timeOK = filtroTime === 'todos' || evento.id_time1 === filtroTime || evento.id_time2 === filtroTime

      const isFinanceiro = tipo.includes('salario') || tipo.includes('bonus') || tipo.includes('receita') || tipo.includes('premio')
      const isTransfer = tipo.includes('transfer') || tipo.includes('compra') || tipo.includes('venda') || tipo.includes('leilao') || tipo.includes('roubo') || tipo.includes('empr') || tipo.includes('rescis') || tipo.includes('multa')

      return (
        buscaOK &&
        timeOK &&
        ((modoVisualizacao === 'financeiro' && isFinanceiro) ||
          (modoVisualizacao === 'transferencias' && isTransfer))
      )
    })
  }, [eventos, filtroTime, buscaTexto, timesMap, modoVisualizacao])

  const totalPaginas = Math.ceil(eventosFiltrados.length / eventosPorPagina)
  const eventosPaginados = eventosFiltrados.slice((paginaAtual - 1) * eventosPorPagina, paginaAtual * eventosPorPagina)

  const eventosAgrupados = useMemo(() => {
    const grupos: Record<string, EventoBID[]> = {}
    for (const evento of eventosPaginados) {
      const data = new Date(evento.data_evento).toLocaleDateString('pt-BR')
      if (!grupos[data]) grupos[data] = []
      grupos[data].push(evento)
    }
    return grupos
  }, [eventosPaginados])

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-center text-green-400">
          📰 BID — Boletim Informativo Diário
        </h1>

        <div className="flex justify-center gap-4 mb-6">
          <button
            className={classNames(
              'px-4 py-2 rounded font-bold',
              modoVisualizacao === 'financeiro' ? 'bg-green-600' : 'bg-gray-700'
            )}
            onClick={() => setModoVisualizacao('financeiro')}
          >
            💰 Financeiro
          </button>
          <button
            className={classNames(
              'px-4 py-2 rounded font-bold',
              modoVisualizacao === 'transferencias' ? 'bg-green-600' : 'bg-gray-700'
            )}
            onClick={() => setModoVisualizacao('transferencias')}
          >
            📦 Transferências e Leilões
          </button>
        </div>

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
            placeholder="Buscar..."
            className="bg-gray-800 text-white border border-gray-600 rounded px-4 py-2 w-full md:w-80"
            value={buscaTexto}
            onChange={(e) => setBuscaTexto(e.target.value)}
          />
        </div>

        {loading && <p className="text-center text-gray-400">⏳ Carregando eventos...</p>}
        {erro && <p className="text-center text-red-500">{erro}</p>}

        <div className="space-y-8" ref={parent}>
          {Object.entries(eventosAgrupados).map(([data, eventos]) => (
            <div key={data}>
              <h2 className="text-xl font-bold text-yellow-400 border-b border-yellow-400 mb-3 pb-1">
                📅 {data}
              </h2>
              <div className="space-y-4">
                {eventos.map((evento) => (
                  <div
                    key={evento.id}
                    className={classNames(
                      'rounded-xl p-4 shadow border border-gray-700 relative',
                      'hover:scale-[1.01] transform duration-200',
                      corFundo(evento.tipo_evento)
                    )}
                  >
                    {isAdmin && (
                      <button
                        onClick={() => excluirEvento(evento.id)}
                        className="absolute top-2 right-2 text-red-400 hover:text-red-600 text-xl"
                        title="Excluir evento"
                      >
                        🗑️
                      </button>
                    )}
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-bold text-lg flex items-center gap-2">
                        {iconeTipo(evento.tipo_evento)} {capitalizar(evento.tipo_evento)}
                      </p>
                      <span className="text-xs text-gray-300">
                        {new Date(evento.data_evento).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-gray-100">{evento.descricao}</p>
                    <div className="mt-2 text-sm text-gray-200 space-y-1">
                      <p>🟢 Time principal: <strong>{timesMap[evento.id_time1] || 'Desconhecido'}</strong></p>
                      {evento.id_time2 && (
                        <p>🔴 Time adversário: <strong>{timesMap[evento.id_time2] || 'Desconhecido'}</strong></p>
                      )}
                      {evento.valor != null && (
                        <p className="text-yellow-300 font-semibold">
                          💰 {evento.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {eventosFiltrados.length > eventosPorPagina && (
          <div className="flex justify-center gap-4 mt-8">
            <button
              onClick={() => setPaginaAtual((prev) => Math.max(prev - 1, 1))}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
              disabled={paginaAtual === 1}
            >
              ⬅️ Página anterior
            </button>
            <span className="text-sm text-gray-300 pt-2">
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              onClick={() => setPaginaAtual((prev) => Math.min(prev + 1, totalPaginas))}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
              disabled={paginaAtual === totalPaginas}
            >
              Próxima página ➡️
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
