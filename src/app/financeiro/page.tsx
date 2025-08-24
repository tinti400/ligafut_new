'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
}

type Movimento = {
  id: string
  id_time: string
  time_nome: string
  descricao: string | null
  tipo: string | null
  valor: number
  created_at: string
  saldo_antes: number
  saldo_apos: number
}

export default function Page() {
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState('')
  const [dataSelecionada, setDataSelecionada] = useState('')

  useEffect(() => {
    async function carregarTimes() {
      const { data, error } = await supabase
        .from('times')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) {
        toast.error('Erro ao carregar times')
        return
      }
      if (data) setTimes(data)
    }

    carregarTimes()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <Toaster position="top-right" />
      <h1 className="text-3xl font-bold text-center mb-6">📊 Painel Financeiro por Time</h1>

      <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-8">
        <select
          className="bg-zinc-800 border border-zinc-600 rounded px-4 py-2 text-white"
          value={timeSelecionado}
          onChange={(e) => setTimeSelecionado(e.target.value)}
        >
          <option value="">Selecione um time</option>
          {times.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </select>

        <input
          type="date"
          className="bg-zinc-800 border border-zinc-600 rounded px-4 py-2 text-white"
          value={dataSelecionada}
          onChange={(e) => setDataSelecionada(e.target.value)}
        />
      </div>

      {timeSelecionado && (
        <PainelFinanceiro id_time={timeSelecionado} data={dataSelecionada} />
      )}
    </div>
  )
}

function PainelFinanceiro({ id_time, data }: { id_time: string, data: string }) {
  const [nomeTime, setNomeTime] = useState('')
  const [dados, setDados] = useState({
    vendas: 0,
    compras: 0,
    bonus_resultado: 0,
    bonus_gols: 0,
    salariosPagos: 0,
    folhaSalarial: 0,
    saldoAtual: 0,
    caixaNoDia: 0,
    caixaAnterior: 0,
    leiloes: 0
  })

  // ======== Lista de Movimentações (com saldo antes/depois) ========
  const [movs, setMovs] = useState<Movimento[]>([])
  const [carregandoMovs, setCarregandoMovs] = useState(false)
  const [totalMovs, setTotalMovs] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [busca, setBusca] = useState('')
  const PAGE_SIZE = 20

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const periodoISO = useMemo(() => {
    if (!data) {
      // sem data específica -> últimos 30 dias
      const end = new Date()
      const start = new Date()
      start.setDate(end.getDate() - 30)
      return { start: start.toISOString(), end: end.toISOString() }
    }
    // com data específica -> todo o dia selecionado
    const inicio = new Date(`${data}T00:00:00`)
    const fim = new Date(`${data}T23:59:59.999`)
    return { start: inicio.toISOString(), end: fim.toISOString() }
  }, [data])

  useEffect(() => {
    async function carregarDados() {
      // Guardas
      if (!id_time) return

      let vendas = 0, compras = 0, bonus_resultado = 0, bonus_gols = 0, salariosPagos = 0, leiloes = 0
      let caixaNoDia = 0, caixaAnterior = 0

      // 🔎 Buscar saldo atual e nome do time
      const { data: timeData, error: errTime } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      if (errTime) {
        toast.error('Erro ao carregar o time')
        return
      }

      setNomeTime(timeData?.nome || 'Time')

      // 🧮 Folha salarial do elenco atual
      const { data: elenco } = await supabase
        .from('elenco')
        .select('salario')
        .eq('time_id', id_time)

      const folhaSalarial = elenco?.reduce((acc, jogador) => acc + (jogador.salario || 0), 0) || 0

      // 🔁 Eventos onde o time é origem (vendas, salários, bônus)
      const { data: eventosOrigem } = await supabase
        .from('bid')
        .select('tipo_evento, valor, data_evento')
        .eq('id_time1', id_time)

      // 🔁 Eventos onde o time é destino (compras, leilões ganhos)
      const { data: eventosDestino } = await supabase
        .from('bid')
        .select('tipo_evento, valor, data_evento')
        .eq('id_time2', id_time)

      // Processar eventos onde o time é origem
      eventosOrigem?.forEach((e) => {
        const valor = e.valor || 0
        if (e.tipo_evento === 'venda') vendas += valor
        else if (e.tipo_evento === 'bonus') bonus_resultado += valor
        else if (e.tipo_evento === 'bonus_gol') bonus_gols += valor
        else if (e.tipo_evento === 'salario') salariosPagos += valor

        if (data && e.data_evento?.startsWith(data)) caixaNoDia += valor
        else if (data && e.data_evento < data) caixaAnterior += valor
      })

      // Processar eventos onde o time é destino
      eventosDestino?.forEach((e) => {
        const valor = e.valor || 0
        if (e.tipo_evento === 'compra') compras += valor
        else if (e.tipo_evento === 'leilao') {
          compras += valor
          leiloes += valor
        }

        if (data && e.data_evento?.startsWith(data)) caixaNoDia += valor
        else if (data && e.data_evento < data) caixaAnterior += valor
      })

      const saldoAtual = timeData?.saldo || 0
      const somaEventos = caixaAnterior + caixaNoDia
      const diferenca = saldoAtual - somaEventos

      setDados({
        vendas,
        compras,
        bonus_resultado,
        bonus_gols,
        salariosPagos,
        folhaSalarial,
        saldoAtual,
        caixaNoDia,
        caixaAnterior,
        leiloes
      })

      if (Math.abs(diferenca) > 1000) {
        toast.error('⚠️ Inconsistência detectada no saldo financeiro!')
      } else {
        toast.success('✅ Saldo consistente com as movimentações.')
      }
    }

    carregarDados()
  }, [id_time, data])

  // ===== Carregar Movimentações com saldo antes/depois (view) =====
  useEffect(() => {
    carregarMovs(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_time, data, busca])

  async function carregarMovs(resetPagina = false) {
    if (!id_time) return
    try {
      setCarregandoMovs(true)
      if (resetPagina) setPagina(0)

      let query = supabase
        .from('v_movimentacoes_com_saldos')
        .select('*', { count: 'estimated' })
        .eq('id_time', id_time)
        .gte('created_at', periodoISO.start)
        .lte('created_at', periodoISO.end)

      if (busca) {
        query = query.or(`descricao.ilike.%${busca}%,tipo.ilike.%${busca}%`)
      }

      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1)

      const { data: rows, error, count } = await query
      if (error) {
        // se a view não existir, avisa
        if ((error as any)?.message?.toLowerCase?.().includes('relation') && (error as any)?.message?.includes('does not exist')) {
          toast.error('Crie a view v_movimentacoes_com_saldos (veja a canvas).')
        } else {
          toast.error('Erro ao carregar movimentações.')
        }
        return
      }

      setMovs((rows as Movimento[]) || [])
      setTotalMovs(count || 0)
    } finally {
      setCarregandoMovs(false)
    }
  }

  function exportarCSV() {
    if (!movs.length) return
    const header = ['Data', 'Descrição', 'Tipo', 'Valor', 'Saldo Anterior', 'Saldo Atual']
    const rows = movs.map(m => [
      new Date(m.created_at).toLocaleString('pt-BR'),
      m.descricao ?? '',
      m.tipo ?? '',
      String(m.valor).replace('.', ','),
      String(m.saldo_antes).replace('.', ','),
      String(m.saldo_apos).replace('.', ',')
    ])
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimentacoes_${nomeTime}_${data || 'ultimos-30-dias'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPaginas = Math.max(1, Math.ceil(totalMovs / PAGE_SIZE))
  const creditosPagina = useMemo(() => movs.filter(m => m.valor >= 0).reduce((s, m) => s + m.valor, 0), [movs])
  const debitosPagina = useMemo(() => movs.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0), [movs])

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Resumo do Time */}
      <div className="bg-zinc-900 rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-center mb-4">{nomeTime}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p>💰 <strong>Vendas:</strong> {fmtBRL(dados.vendas)}</p>
          <p>🛒 <strong>Compras:</strong> {fmtBRL(dados.compras)}</p>
          <p>🔨 <strong>Leilões:</strong> {fmtBRL(dados.leiloes)}</p>
          <p>🏆 <strong>Bônus (resultado):</strong> {fmtBRL(dados.bonus_resultado)}</p>
          <p>⚽ <strong>Bônus (gols):</strong> {fmtBRL(dados.bonus_gols)}</p>
          <p>💼 <strong>Salários Pagos:</strong> {fmtBRL(dados.salariosPagos)}</p>
          <p>📄 <strong>Folha Salarial Atual:</strong> {fmtBRL(dados.folhaSalarial)}</p>
        </div>
        <hr className="my-3 border-zinc-700" />
        <p className="text-base font-semibold">📈 Caixa Atual: {fmtBRL(dados.saldoAtual)}</p>
        {data && (
          <div className="text-sm text-zinc-300">
            <p>📅 Caixa no dia {data}: {fmtBRL(dados.caixaNoDia)}</p>
            <p>📉 Caixa antes do dia: {fmtBRL(dados.caixaAnterior)}</p>
          </div>
        )}
        <p className="text-sm mt-2">
          🔍 <strong>Verificação:</strong>{' '}
          {Math.abs(dados.saldoAtual - (dados.caixaAnterior + dados.caixaNoDia)) > 1000
            ? <span className="text-red-400 font-bold">⚠️ Inconsistência</span>
            : <span className="text-green-400 font-semibold">OK</span>}
        </p>
      </div>

      {/* Movimentações detalhadas com Saldo Anterior/Atual */}
      <div className="bg-zinc-900 rounded-xl shadow-lg p-6">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between mb-4">
          <h3 className="text-xl font-semibold">📜 Movimentações do Time</h3>
          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição/tipo..."
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={() => carregarMovs(true)}
              className="px-4 py-2 rounded bg-white text-zinc-900 text-sm font-medium hover:opacity-90"
            >
              Aplicar
            </button>
            <button
              onClick={exportarCSV}
              className="px-4 py-2 rounded bg-transparent border border-zinc-600 text-sm hover:bg-zinc-800"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
          <div className="rounded-lg border border-zinc-700 p-3">
            <div className="text-zinc-400 text-xs">Créditos (página)</div>
            <div className="text-green-400 font-semibold">{fmtBRL(creditosPagina)}</div>
          </div>
          <div className="rounded-lg border border-zinc-700 p-3">
            <div className="text-zinc-400 text-xs">Débitos (página)</div>
            <div className="text-red-400 font-semibold">{fmtBRL(Math.abs(debitosPagina))}</div>
          </div>
          <div className="rounded-lg border border-zinc-700 p-3">
            <div className="text-zinc-400 text-xs">Período</div>
            <div className="font-semibold">
              {data ? new Date(periodoISO.start).toLocaleDateString('pt-BR') : 'Últimos 30 dias'}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-700 p-3">
            <div className="text-zinc-400 text-xs">Registros</div>
            <div className="font-semibold">{totalMovs} (estimado)</div>
          </div>
        </div>

        <div className="overflow-x-auto border border-zinc-800 rounded-xl">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-zinc-800/70">
              <tr className="text-left">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-right">Saldo Anterior</th>
                <th className="py-3 px-4 text-right">Saldo Atual</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m, idx) => {
                const isDeb = m.valor < 0
                return (
                  <tr key={m.id} className={idx % 2 ? 'bg-zinc-900' : 'bg-zinc-900/60'}>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-2.5 px-4">{m.descricao ?? '-'}</td>
                    <td className="py-2.5 px-4">{m.tipo ?? '-'}</td>
                    <td className={`py-2.5 px-4 text-right font-medium ${isDeb ? 'text-red-400' : 'text-green-400'}`}>
                      {isDeb ? '-' : '+'} {fmtBRL(Math.abs(m.valor))}
                    </td>
                    <td className="py-2.5 px-4 text-right">{fmtBRL(m.saldo_antes)}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">{fmtBRL(m.saldo_apos)}</td>
                  </tr>
                )
              })}
              {!carregandoMovs && movs.length === 0 && (
                <tr>
                  <td className="py-6 px-4 text-zinc-400" colSpan={6}>
                    Nenhuma movimentação encontrada para o período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center gap-2 justify-end mt-4">
          <button
            onClick={() => setPagina(p => Math.max(0, p - 1))}
            disabled={pagina === 0 || carregandoMovs}
            className="px-3 py-2 rounded-lg border border-zinc-700 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-zinc-400">
            Página {pagina + 1} de {totalPaginas}
          </span>
          <button
            onClick={() => setPagina(p => (p + 1 < totalPaginas ? p + 1 : p))}
            disabled={pagina + 1 >= totalPaginas || carregandoMovs}
            className="px-3 py-2 rounded-lg border border-zinc-700 disabled:opacity-50"
          >
            Próxima
          </button>
        </div>

        {!data && (
          <p className="mt-3 text-xs text-zinc-400">
            Dica: sem data, mostramos os últimos 30 dias. Selecione um dia para ver um extrato diário.
          </p>
        )}
      </div>
    </div>
  )
}
