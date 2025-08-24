'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Time = { id: string; nome: string }
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
      setTimes(data || [])
    }
    carregarTimes()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      <Toaster position="top-right" />
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-center">
          💼 Painel Financeiro — Últimos 30 dias
        </h1>
        <p className="text-zinc-400 text-center mt-2">
          Selecione um time para ver extrato detalhado com <em>Saldo Anterior</em> e <em>Saldo Atual</em>
        </p>
      </header>

      <section className="px-6">
        <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-4 md:p-5 shadow-xl">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <label className="text-sm text-zinc-400 w-full md:w-auto">Time</label>
            <select
              className="w-full md:flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-zinc-500"
              value={timeSelecionado}
              onChange={(e) => setTimeSelecionado(e.target.value)}
            >
              <option value="">Selecione um time</option>
              {times.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>

            <span className="text-xs rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1 text-zinc-300">
              Período: últimos 30 dias (fixo)
            </span>
          </div>
        </div>
      </section>

      <main className="px-6 py-6">
        {timeSelecionado ? (
          <PainelFinanceiro id_time={timeSelecionado} />
        ) : (
          <div className="max-w-4xl mx-auto text-center text-zinc-500">
            <div className="mt-16 opacity-80">📄 Escolha um time acima para carregar o painel.</div>
          </div>
        )}
      </main>
    </div>
  )
}

function PainelFinanceiro({ id_time }: { id_time: string }) {
  // Datas (últimos 30 dias, agora → local do navegador)
  const { startISO, endISO, startLabel, endLabel } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 30)
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR')
    return {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      startLabel: fmt(start),
      endLabel: fmt(end),
    }
  }, [])

  // Estados
  const [nomeTime, setNomeTime] = useState<string>('')
  const [saldoAtual, setSaldoAtual] = useState<number>(0)
  const [folhaSalarial, setFolhaSalarial] = useState<number>(0)

  const [movs, setMovs] = useState<Movimento[]>([])
  const [carregando, setCarregando] = useState<boolean>(true)
  const [busca, setBusca] = useState<string>('')
  const [pagina, setPagina] = useState<number>(0)
  const [totalMovs, setTotalMovs] = useState<number>(0)
  const PAGE_SIZE = 20

  // Abertura/fechamento do período + consistência
  const [saldoAbertura, setSaldoAbertura] = useState<number | null>(null)
  const [saldoFechamento, setSaldoFechamento] = useState<number | null>(null)
  const [inconsistencia, setInconsistencia] = useState<number>(0)

  // KPIs por tipo
  const [kpis, setKpis] = useState({
    vendas: 0,
    compras: 0,
    leiloes: 0,
    bonus_resultado: 0,
    bonus_gols: 0,
    salariosPagos: 0,
    creditos: 0,
    debitos: 0,
  })

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      try {
        setCarregando(true)
        // 1) Time (nome + saldo atual)
        const { data: t, error: errT } = await supabase
          .from('times')
          .select('nome, saldo')
          .eq('id', id_time)
          .single()
        if (errT) throw errT
        if (cancelado) return
        setNomeTime(t?.nome || 'Time')
        setSaldoAtual(Number(t?.saldo || 0))

        // 2) Folha salarial atual (elenco)
        const { data: elenco } = await supabase
          .from('elenco')
          .select('salario')
          .eq('time_id', id_time)
        if (!cancelado) {
          const folha = (elenco || []).reduce((acc, j: any) => acc + Number(j.salario || 0), 0)
          setFolhaSalarial(folha)
        }

        // 3) Movimentações do período (últimos 30 dias)
        let query = supabase
          .from('v_movimentacoes_com_saldos')
          .select('*', { count: 'estimated' })
          .eq('id_time', id_time)
          .gte('created_at', startISO)
          .lte('created_at', endISO)

        if (busca) {
          query = query.or(`descricao.ilike.%${busca}%,tipo.ilike.%${busca}%`)
        }

        query = query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1)

        const { data: rows, error: errRows, count } = await query
        if (errRows) {
          if (String(errRows.message || '').toLowerCase().includes('does not exist')) {
            toast.error('Crie a view v_movimentacoes_com_saldos antes de usar o painel.')
          } else {
            toast.error('Erro ao carregar movimentações.')
          }
          return
        }
        if (cancelado) return
        const movsPeriodo = (rows as Movimento[]) || []
        setMovs(movsPeriodo)
        setTotalMovs(count || 0)

        // 4) Calcular abertura/fechamento do período
        let abertura = 0
        let fechamento = saldoAtual // por padrão
        if (movsPeriodo.length > 0) {
          // para abertura: pegar a MAIS ANTIGA do período e usar saldo_antes dela
          const maisAntiga = [...movsPeriodo].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )[0]
          abertura = Number(maisAntiga.saldo_antes)
          // para fechamento: pegar a MAIS RECENTE do período (ou saldoAtual, devem ser iguais)
          const maisRecente = movsPeriodo[0]
          fechamento = Number(maisRecente.saldo_apos)
        } else {
          // Sem movimentos nos 30 dias: buscamos a última antes do início para abrir corretamente
          const { data: rowAntes } = await supabase
            .from('v_movimentacoes_com_saldos')
            .select('saldo_apos, created_at')
            .eq('id_time', id_time)
            .lte('created_at', startISO)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()

          abertura = Number(rowAntes?.saldo_apos ?? saldoAtual)
          fechamento = saldoAtual
        }
        if (!cancelado) {
          setSaldoAbertura(abertura)
          setSaldoFechamento(fechamento)
        }

        // 5) KPIs a partir das linhas do período
        const k = {
          vendas: 0,
          compras: 0,
          leiloes: 0,
          bonus_resultado: 0,
          bonus_gols: 0,
          salariosPagos: 0,
          creditos: 0,
          debitos: 0,
        }
        for (const m of movsPeriodo) {
          const v = Number(m.valor || 0)
          if (v >= 0) k.creditos += v
          else k.debitos += Math.abs(v)

          const tipo = (m.tipo || '').toLowerCase()
          if (tipo === 'venda') k.vendas += Math.max(0, v)
          if (tipo === 'compra') k.compras += Math.abs(Math.min(0, v))
          if (tipo === 'leilao') {
            k.leiloes += Math.abs(Math.min(0, v))
            k.compras += Math.abs(Math.min(0, v)) // leilão conta como compra
          }
          if (tipo === 'bonus') k.bonus_resultado += Math.max(0, v)
          if (tipo === 'bonus_gol') k.bonus_gols += Math.max(0, v)
          if (tipo === 'salario') k.salariosPagos += Math.abs(Math.min(0, v))
        }
        if (!cancelado) setKpis(k)

        // 6) Checagem de consistência: abertura + (∑valores do período) deve = fechamento
        const somaPeriodo =
          movsPeriodo.reduce((acc, m) => acc + Number(m.valor || 0), 0) || 0
        const fechamentoEsperado = (abertura ?? 0) + somaPeriodo
        const diff = Math.abs(fechamentoEsperado - (fechamento ?? 0))
        if (!cancelado) {
          setInconsistencia(diff)
          if (diff > 0.01) {
            toast.error('⚠️ Inconsistência de saldo detectada no período (ver detalhes nos cards).')
          }
        }
      } catch (e: any) {
        console.error(e)
        toast.error('Erro ao carregar painel.')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }
    carregar()
    return () => { cancelado = true }
  }, [id_time, startISO, endISO, busca, pagina])

  const fmtBRL = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))

  const totalPaginas = Math.max(1, Math.ceil(totalMovs / PAGE_SIZE))

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* HERO / HEAD */}
      <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">{nomeTime}</h2>
            <p className="text-zinc-400 text-sm mt-1">
              Período: <span className="font-medium text-zinc-300">{startLabel}</span> —{' '}
              <span className="font-medium text-zinc-300">{endLabel}</span>
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-400">Caixa atual</div>
            <div className="text-xl font-semibold">{fmtBRL(saldoAtual)}</div>
          </div>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Saldo de Abertura" value={fmtBRL(saldoAbertura)} />
        <KpiCard title="Créditos (30d)" value={fmtBRL(kpis.creditos)} positive />
        <KpiCard title="Débitos (30d)" value={fmtBRL(kpis.debitos)} negative />
        <KpiCard
          title="Saldo de Fechamento"
          value={fmtBRL(saldoFechamento)}
        />
      </div>

      {/* Consistência */}
      <div className={`rounded-2xl p-4 border ${inconsistencia > 0.01 ? 'border-red-500/40 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">
              {inconsistencia > 0.01 ? '⚠️ Inconsistência no período' : '✅ Consistência OK'}
            </div>
            <div className="text-zinc-200/80 mt-1">
              {(saldoAbertura ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              {'  +  '}
              {(kpis.creditos - kpis.debitos).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              {'  =  '}
              {(Number(saldoAbertura ?? 0) + (kpis.creditos - kpis.debitos)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              {'  •  Fechamento: '}
              {(saldoFechamento ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
          <div className={`text-sm font-semibold ${inconsistencia > 0.01 ? 'text-red-400' : 'text-emerald-300'}`}>
            Diferença: {fmtBRL(inconsistencia)}
          </div>
        </div>
      </div>

      {/* KPIs por tipo */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KpiMini title="Vendas" value={fmtBRL(kpis.vendas)} emoji="💰" />
        <KpiMini title="Compras" value={fmtBRL(kpis.compras)} emoji="🛒" />
        <KpiMini title="Leilões" value={fmtBRL(kpis.leiloes)} emoji="🔨" />
        <KpiMini title="Bônus (resultado)" value={fmtBRL(kpis.bonus_resultado)} emoji="🏆" />
        <KpiMini title="Bônus (gols)" value={fmtBRL(kpis.bonus_gols)} emoji="⚽" />
        <KpiMini title="Salários pagos" value={fmtBRL(kpis.salariosPagos)} emoji="💼" />
      </div>

      {/* Folha salarial atual */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-sm text-zinc-400">Folha Salarial Atual (elenco)</div>
        <div className="text-lg font-semibold">{fmtBRL(folhaSalarial)}</div>
      </div>

      {/* Busca + ações */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(0) }}
            placeholder="Buscar por descrição/tipo…"
            className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-500"
          />
          <button
            onClick={() => { /* já atualiza via useEffect */ }}
            className="px-4 py-2 rounded-xl bg-white text-zinc-900 text-sm font-medium hover:opacity-90"
          >
            Aplicar
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarCSV(movs, nomeTime)}
            className="px-4 py-2 rounded-xl bg-transparent border border-zinc-700 hover:bg-zinc-900 text-sm"
          >
            Exportar CSV
          </button>
          <span className="text-xs text-zinc-500">Registros: {totalMovs} (estimado)</span>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto border border-white/10 rounded-2xl">
        <table className="min-w-[960px] w-full text-sm">
          <thead className="bg-zinc-900/70 sticky top-0 z-10">
            <tr className="text-left">
              <Th>Data</Th>
              <Th>Descrição</Th>
              <Th>Tipo</Th>
              <Th align="right">Valor</Th>
              <Th align="right">Saldo Anterior</Th>
              <Th align="right">Saldo Atual</Th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className={i % 2 ? 'bg-zinc-950/40' : 'bg-zinc-950/20'}>
                  <Td><Skeleton /></Td>
                  <Td colSpan={2}><Skeleton /></Td>
                  <Td align="right"><Skeleton /></Td>
                  <Td align="right"><Skeleton /></Td>
                  <Td align="right"><Skeleton /></Td>
                </tr>
              ))
            ) : movs.length ? (
              movs.map((m, idx) => {
                const isDeb = m.valor < 0
                return (
                  <tr key={m.id} className={idx % 2 ? 'bg-zinc-950/40' : 'bg-zinc-950/20'}>
                    <Td>{new Date(m.created_at).toLocaleString('pt-BR')}</Td>
                    <Td>{m.descricao ?? '-'}</Td>
                    <Td className="capitalize">{m.tipo ?? '-'}</Td>
                    <Td align="right" className={isDeb ? 'text-red-400 font-medium' : 'text-emerald-300 font-medium'}>
                      {isDeb ? '-' : '+'} {fmtBRL(Math.abs(m.valor))}
                    </Td>
                    <Td align="right">{fmtBRL(m.saldo_antes)}</Td>
                    <Td align="right" className="font-semibold">{fmtBRL(m.saldo_apos)}</Td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="text-zinc-400 py-6 px-4">Nenhuma movimentação nos últimos 30 dias.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setPagina(p => Math.max(0, p - 1))}
          disabled={pagina === 0 || carregando}
          className="px-3 py-2 rounded-lg border border-zinc-700 disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="text-sm text-zinc-400">Página {pagina + 1} de {totalPaginas}</span>
        <button
          onClick={() => setPagina(p => (p + 1 < totalPaginas ? p + 1 : p))}
          disabled={pagina + 1 >= totalPaginas || carregando}
          className="px-3 py-2 rounded-lg border border-zinc-700 disabled:opacity-50"
        >
          Próxima
        </button>
      </div>
    </div>
  )
}

/* ---------- UI helpers ---------- */
function KpiCard({ title, value, positive, negative }: { title: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border ${positive ? 'border-emerald-400/30 bg-emerald-400/10' : negative ? 'border-red-400/30 bg-red-400/10' : 'border-white/10 bg-white/5'}`}>
      <div className="text-xs text-zinc-300/80">{title}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  )
}
function KpiMini({ title, value, emoji }: { title: string; value: string; emoji: string }) {
  return (
    <div className="rounded-2xl p-3 border border-white/10 bg-white/5">
      <div className="text-xs text-zinc-300/80">{emoji} {title}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  )
}
function Th({ children, align }: { children: any; align?: 'left' | 'right' }) {
  return <th className={`py-3 px-4 ${align === 'right' ? 'text-right' : ''}`}>{children}</th>
}
function Td({ children, align, colSpan }: { children: any; align?: 'left' | 'right'; colSpan?: number }) {
  return <td colSpan={colSpan} className={`py-2.5 px-4 ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
}
function Skeleton() {
  return <div className="h-4 w-full rounded bg-zinc-800 animate-pulse" />
}

/* ---------- CSV ---------- */
function exportarCSV(movs: Movimento[], nomeTime: string) {
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
  a.download = `movimentacoes_${nomeTime}_ultimos-30-dias.csv`
  a.click()
  URL.revokeObjectURL(url)
}
