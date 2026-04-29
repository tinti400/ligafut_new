'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

const PAGE_SIZE = 20

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
    <div className="min-h-screen overflow-hidden bg-[#030305] text-white">
      <Toaster position="top-right" />

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-120px] top-[-120px] h-[360px] w-[360px] rounded-full bg-red-600/20 blur-[120px]" />
        <div className="absolute right-[-120px] top-[180px] h-[420px] w-[420px] rounded-full bg-red-700/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,.12),transparent_35%),linear-gradient(to_bottom,rgba(255,255,255,.03),transparent)]" />
      </div>

      <main className="relative mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-6 rounded-[28px] border border-red-500/20 bg-zinc-950/80 p-5 shadow-[0_0_40px_rgba(220,38,38,.12)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.25em] text-red-300">
                LIGAFUT • FINANCEIRO
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Painel Financeiro
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-zinc-400 md:text-base">
                Controle de caixa, créditos, débitos, folha salarial e extrato dos últimos 30 dias.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">
              <span className="text-zinc-500">Período:</span>{' '}
              <strong className="text-white">Últimos 30 dias</strong>
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-2xl backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="text-xs font-black uppercase tracking-[0.22em] text-red-300">
              Selecionar clube
            </label>

            <select
              className="w-full flex-1 rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20"
              value={timeSelecionado}
              onChange={(e) => setTimeSelecionado(e.target.value)}
            >
              <option value="">Escolha um time</option>
              {times.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
        </section>

        {timeSelecionado ? (
          <PainelFinanceiro id_time={timeSelecionado} />
        ) : (
          <div className="rounded-[28px] border border-dashed border-red-500/20 bg-zinc-950/60 px-6 py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-3xl">
              💼
            </div>
            <h2 className="text-xl font-black">Escolha um clube para abrir o painel</h2>
            <p className="mt-2 text-sm text-zinc-500">
              O extrato financeiro será carregado automaticamente.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function PainelFinanceiro({ id_time }: { id_time: string }) {
  const { startISO, endISO, startLabel, endLabel } = useMemo(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - 30)

    return {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      startLabel: start.toLocaleDateString('pt-BR'),
      endLabel: end.toLocaleDateString('pt-BR'),
    }
  }, [])

  const [nomeTime, setNomeTime] = useState('')
  const [saldoAtual, setSaldoAtual] = useState(0)
  const [folhaSalarial, setFolhaSalarial] = useState(0)
  const [movs, setMovs] = useState<Movimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [totalMovs, setTotalMovs] = useState(0)

  const [saldoAbertura, setSaldoAbertura] = useState<number | null>(null)
  const [saldoFechamento, setSaldoFechamento] = useState<number | null>(null)
  const [inconsistencia, setInconsistencia] = useState(0)

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
    setPagina(0)
  }, [id_time, busca])

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      try {
        setCarregando(true)

        const { data: t, error: errT } = await supabase
          .from('times')
          .select('nome, saldo')
          .eq('id', id_time)
          .single()

        if (errT) throw errT
        if (cancelado) return

        setNomeTime(t?.nome || 'Time')
        setSaldoAtual(Number(t?.saldo || 0))

        const { data: elenco } = await supabase
          .from('elenco')
          .select('salario')
          .eq('time_id', id_time)

        if (!cancelado) {
          const folha = (elenco || []).reduce(
            (acc: number, j: any) => acc + Number(j.salario || 0),
            0
          )
          setFolhaSalarial(folha)
        }

        let query = supabase
          .from('v_movimentacoes_com_saldos')
          .select('*', { count: 'estimated' })
          .eq('id_time', id_time)
          .gte('created_at', startISO)
          .lte('created_at', endISO)

        if (busca.trim()) {
          query = query.or(`descricao.ilike.%${busca}%,tipo.ilike.%${busca}%`)
        }

        const { data: rows, error: errRows, count } = await query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1)

        if (errRows) {
          toast.error('Erro ao carregar movimentações')
          return
        }

        if (cancelado) return

        const movsPeriodo = (rows as Movimento[]) || []
        setMovs(movsPeriodo)
        setTotalMovs(count || 0)

        let abertura = 0

        if (movsPeriodo.length > 0) {
          const maisAntiga = [...movsPeriodo].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )[0]

          abertura = Number(maisAntiga.saldo_antes || 0)
        } else {
          const { data: rowAntes } = await supabase
            .from('v_movimentacoes_com_saldos')
            .select('saldo_apos, created_at')
            .eq('id_time', id_time)
            .lte('created_at', startISO)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()

          abertura = Number(rowAntes?.saldo_apos ?? Number(t?.saldo || 0))
        }

        const fechamento = Number(t?.saldo || 0)

        setSaldoAbertura(abertura)
        setSaldoFechamento(fechamento)

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
          const tipo = (m.tipo || '').toLowerCase()

          if (v >= 0) k.creditos += v
          else k.debitos += Math.abs(v)

          if (tipo === 'venda') k.vendas += Math.max(0, v)
          if (tipo === 'compra') k.compras += Math.abs(Math.min(0, v))

          if (tipo === 'leilao') {
            const out = Math.abs(Math.min(0, v))
            k.leiloes += out
            k.compras += out
          }

          if (tipo === 'bonus') k.bonus_resultado += Math.max(0, v)
          if (tipo === 'bonus_gol') k.bonus_gols += Math.max(0, v)
          if (tipo === 'salario') k.salariosPagos += Math.abs(Math.min(0, v))
        }

        setKpis(k)

        const somaPeriodo = movsPeriodo.reduce((acc, m) => acc + Number(m.valor || 0), 0)
        const diff = Math.abs(abertura + somaPeriodo - fechamento)

        setInconsistencia(diff)

        if (diff > 0.01) {
          toast.error('Inconsistência de saldo detectada')
        }
      } catch (e) {
        console.error(e)
        toast.error('Erro ao carregar painel financeiro')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    carregar()

    return () => {
      cancelado = true
    }
  }, [id_time, startISO, endISO, busca, pagina])

  const totalPaginas = Math.max(1, Math.ceil(totalMovs / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-red-500/20 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/30 p-5 shadow-[0_0_45px_rgba(220,38,38,.15)] md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.25em] text-red-300">
              Clube selecionado
            </div>

            <h2 className="mt-2 text-3xl font-black md:text-4xl">
              {nomeTime}
            </h2>

            <p className="mt-2 text-sm text-zinc-400">
              Período analisado: {startLabel} até {endLabel}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-5 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Caixa atual
            </div>
            <div className="mt-1 text-2xl font-black text-emerald-300">
              {fmtBRL(saldoAtual)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Saldo de Abertura" value={fmtBRL(saldoAbertura)} tone="neutral" />
        <KpiCard title="Créditos" value={fmtBRL(kpis.creditos)} tone="positive" />
        <KpiCard title="Débitos" value={fmtBRL(kpis.debitos)} tone="negative" />
        <KpiCard title="Saldo Final" value={fmtBRL(saldoFechamento)} tone="gold" />
      </section>

      <section
        className={`rounded-[24px] border p-4 ${
          inconsistencia > 0.01
            ? 'border-red-500/40 bg-red-500/10'
            : 'border-emerald-500/30 bg-emerald-500/10'
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-black">
              {inconsistencia > 0.01 ? '⚠️ Inconsistência detectada' : '✅ Saldo consistente'}
            </div>
            <p className="mt-1 text-sm text-zinc-300/80">
              Abertura + movimentações do período comparado com o saldo atual do time.
            </p>
          </div>

          <div className="text-sm font-black">
            Diferença: {fmtBRL(inconsistencia)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiMini title="Vendas" value={fmtBRL(kpis.vendas)} icon="💰" />
        <KpiMini title="Compras" value={fmtBRL(kpis.compras)} icon="🛒" />
        <KpiMini title="Leilões" value={fmtBRL(kpis.leiloes)} icon="🔨" />
        <KpiMini title="Bônus Resultado" value={fmtBRL(kpis.bonus_resultado)} icon="🏆" />
        <KpiMini title="Bônus Gols" value={fmtBRL(kpis.bonus_gols)} icon="⚽" />
        <KpiMini title="Salários" value={fmtBRL(kpis.salariosPagos)} icon="💼" />
      </section>

      <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
          Folha salarial atual
        </div>
        <div className="mt-1 text-2xl font-black text-red-300">
          {fmtBRL(folhaSalarial)}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-zinc-950/70 p-4 md:flex-row md:items-center md:justify-between">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descrição ou tipo..."
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20 md:max-w-md"
        />

        <button
          onClick={() => exportarCSV(movs, nomeTime)}
          disabled={!movs.length}
          className="rounded-2xl border border-red-500/30 bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-red-950/40 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Exportar CSV
        </button>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-white/10 bg-zinc-950/70 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/40 text-left text-xs uppercase tracking-[0.16em] text-zinc-500">
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
                [...Array(7)].map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <Td><Skeleton /></Td>
                    <Td><Skeleton /></Td>
                    <Td><Skeleton /></Td>
                    <Td align="right"><Skeleton /></Td>
                    <Td align="right"><Skeleton /></Td>
                    <Td align="right"><Skeleton /></Td>
                  </tr>
                ))
              ) : movs.length ? (
                movs.map((m) => {
                  const isDeb = Number(m.valor) < 0

                  return (
                    <tr key={m.id} className="border-b border-white/5 transition hover:bg-red-500/[0.06]">
                      <Td>{new Date(m.created_at).toLocaleString('pt-BR')}</Td>
                      <Td>
                        <span className="font-medium text-zinc-200">
                          {m.descricao || '-'}
                        </span>
                      </Td>
                      <Td>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold capitalize text-zinc-300">
                          {m.tipo || '-'}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className={isDeb ? 'font-black text-red-300' : 'font-black text-emerald-300'}>
                          {isDeb ? '-' : '+'} {fmtBRL(Math.abs(Number(m.valor || 0)))}
                        </span>
                      </Td>
                      <Td align="right">{fmtBRL(m.saldo_antes)}</Td>
                      <Td align="right">
                        <strong>{fmtBRL(m.saldo_apos)}</strong>
                      </Td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    Nenhuma movimentação encontrada nos últimos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex items-center justify-end gap-3">
        <button
          onClick={() => setPagina((p) => Math.max(0, p - 1))}
          disabled={pagina === 0 || carregando}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          Anterior
        </button>

        <span className="text-sm text-zinc-500">
          Página {pagina + 1} de {totalPaginas}
        </span>

        <button
          onClick={() => setPagina((p) => (p + 1 < totalPaginas ? p + 1 : p))}
          disabled={pagina + 1 >= totalPaginas || carregando}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          Próxima
        </button>
      </section>
    </div>
  )
}

function KpiCard({
  title,
  value,
  tone,
}: {
  title: string
  value: string
  tone: 'positive' | 'negative' | 'neutral' | 'gold'
}) {
  const styles = {
    positive: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    negative: 'border-red-400/30 bg-red-400/10 text-red-300',
    neutral: 'border-white/10 bg-white/[0.04] text-white',
    gold: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200',
  }

  return (
    <div className={`rounded-[24px] border p-5 shadow-xl ${styles[tone]}`}>
      <div className="text-xs font-black uppercase tracking-[0.18em] opacity-70">
        {title}
      </div>
      <div className="mt-2 text-xl font-black">
        {value}
      </div>
    </div>
  )
}

function KpiMini({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 transition hover:border-red-500/30 hover:bg-red-500/[0.05]">
      <div className="text-xl">{icon}</div>
      <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
        {title}
      </div>
      <div className="mt-1 text-sm font-black text-white">
        {value}
      </div>
    </div>
  )
}

function Th({
  children,
  align,
}: {
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th className={`px-4 py-4 ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function Td({
  children,
  align,
}: {
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td className={`px-4 py-4 text-zinc-300 ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  )
}

function Skeleton() {
  return <div className="h-4 w-full animate-pulse rounded bg-zinc-800" />
}

function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v || 0))
}

function exportarCSV(movs: Movimento[], nomeTime: string) {
  if (!movs.length) return

  const header = ['Data', 'Descrição', 'Tipo', 'Valor', 'Saldo Anterior', 'Saldo Atual']

  const rows = movs.map((m) => [
    new Date(m.created_at).toLocaleString('pt-BR'),
    m.descricao ?? '',
    m.tipo ?? '',
    String(m.valor).replace('.', ','),
    String(m.saldo_antes).replace('.', ','),
    String(m.saldo_apos).replace('.', ','),
  ])

  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = `movimentacoes_${nomeTime}_ultimos-30-dias.csv`
  a.click()

  URL.revokeObjectURL(url)
}