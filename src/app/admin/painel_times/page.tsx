'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/** ================== Supabase ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ================== Tipos ================== */
type Ordenacao = 'nome' | 'saldo' | 'salario_total'

interface TimeInfo {
  id: string
  nome: string
  logo_url: string
  saldo: number
  gasto: number
  recebido: number
  media_overall: number
  qtd_jogadores: number
  salario_total: number
  saldo_anterior: number
  nacionalidades: Record<string, number>
}

interface RegistroBID {
  valor: number
  tipo_evento: string
  data_evento: string
  id_time1?: string
  id_time2?: string
}

/** ================== Flags ================== */
const bandeiras: Record<string, string> = {
  Brasil: 'br', Argentina: 'ar', Portugal: 'pt', Espanha: 'es', França: 'fr',
  Inglaterra: 'gb', Alemanha: 'de', Itália: 'it', Holanda: 'nl', Bélgica: 'be',
  Uruguai: 'uy', Chile: 'cl', Colômbia: 'co', México: 'mx', Estados_Unidos: 'us',
  Canadá: 'ca', Paraguai: 'py', Peru: 'pe', Equador: 'ec', Bolívia: 'bo',
  Venezuela: 've', Congo: 'cg', Guiana: 'gy', Suriname: 'sr', Honduras: 'hn',
  Nicarágua: 'ni', Guatemala: 'gt', Costa_Rica: 'cr', Panamá: 'pa', Jamaica: 'jm',
  Camarões: 'cm', Senegal: 'sn', Marrocos: 'ma', Egito: 'eg', Argélia: 'dz',
  Croácia: 'hr', Sérvia: 'rs', Suíça: 'ch', Polônia: 'pl', Rússia: 'ru',
  Japão: 'jp', Coreia_do_Sul: 'kr', Austrália: 'au'
}

/** ================== Utils ================== */
const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const numberFmt = (v: number) => v.toLocaleString('pt-BR')

const normalizeNacKey = (s: string) => (s || 'Outro').replaceAll(' ', '_')

const safeCSV = (value: any) => {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes(';') || str.includes('"') || /\s/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** ================== Skeleton ================== */
function RowSkeleton() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <td key={i} className="border border-slate-700 p-2">
          <div className="h-4 bg-slate-700 rounded" />
        </td>
      ))}
    </tr>
  )
}

/** ================== Chip ================== */
function Pill({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode
  tone?: 'green' | 'red' | 'slate'
}) {
  const tones = {
    green: 'bg-green-900/30 text-green-300 ring-1 ring-green-700',
    red: 'bg-red-900/30 text-red-300 ring-1 ring-red-700',
    slate: 'bg-slate-900/30 text-slate-300 ring-1 ring-slate-700',
  } as const
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** ================== Componente Principal ================== */
export default function PainelTimesAdmin() {
  const [times, setTimes] = useState<TimeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroNome, setFiltroNome] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('nome')
  const [autoRefresh, setAutoRefresh] = useState(false)

  // paginação
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(12)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    carregarDados()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => carregarDados(false), 15000) // 15s
    return () => clearInterval(id)
  }, [autoRefresh])

  async function carregarDados(showSpinner = true) {
    try {
      if (showSpinner) setLoading(true)
      setErro(null)

      const { data: timesData, error: eTimes } = await supabase
        .from('times')
        .select('id, nome, saldo, logo_url')
        .order('nome', { ascending: true })

      if (eTimes) throw eTimes
      if (!timesData) {
        setTimes([])
        setLoading(false)
        return
      }

      const hoje = new Date().toISOString().split('T')[0]

      const resultados = await Promise.all(
        timesData.map(async (time) => {
          const [
            { data: elenco, error: eElenco },
            { data: movsCompra },
            { data: movsVenda },
            { data: movsAnteriores },
          ] = await Promise.all([
            supabase.from('elenco').select('overall, salario, nacionalidade').eq('id_time', time.id),
            supabase.from('movimentacoes').select('valor').eq('id_time', time.id).eq('tipo', 'compra'),
            supabase.from('movimentacoes').select('valor').eq('id_time', time.id).eq('tipo', 'venda'),
            supabase
              .from('bid')
              .select('valor, tipo_evento, data_evento, id_time1, id_time2')
              .or(`id_time1.eq.${time.id},id_time2.eq.${time.id}`),
          ])

          if (eElenco) throw eElenco

          const qtdJogadores = elenco?.length || 0
          const mediaOverall =
            elenco && elenco.length > 0
              ? Math.round(elenco.reduce((acc, j) => acc + (j.overall || 0), 0) / elenco.length)
              : 0

          const salarioTotal = elenco?.reduce((acc, j) => acc + (j.salario || 0), 0) || 0

          const nacionalidades: Record<string, number> = {}
          elenco?.forEach((j) => {
            const nac = normalizeNacKey(j.nacionalidade || 'Outro')
            nacionalidades[nac] = (nacionalidades[nac] || 0) + 1
          })

          const gasto = movsCompra?.reduce((acc, m) => acc + (m.valor || 0), 0) || 0
          const recebido = movsVenda?.reduce((acc, m) => acc + (m.valor || 0), 0) || 0

          const saldoAnterior =
            movsAnteriores?.reduce((acc: number, m: RegistroBID) => {
              if (!m.data_evento || m.data_evento >= hoje) return acc
              const valor = m.valor || 0
              const tipo = m.tipo_evento

              if (m.id_time1 === time.id) {
                if (['venda', 'bonus', 'bonus_gol', 'receita_partida'].includes(tipo)) return acc + valor
                if (['salario', 'despesas'].includes(tipo)) return acc - valor
              } else if (m.id_time2 === time.id) {
                if (['compra', 'leilao'].includes(tipo)) return acc - valor
              }
              return acc
            }, 0) || 0

          const t: TimeInfo = {
            id: time.id,
            nome: time.nome,
            logo_url: time.logo_url,
            saldo: time.saldo,
            gasto,
            recebido,
            media_overall: mediaOverall, // ✅
            qtd_jogadores: qtdJogadores, // ✅
            salario_total: salarioTotal, // ✅
            saldo_anterior: saldoAnterior,
            nacionalidades,
          }

          return t
        })
      )

      setTimes(resultados)
    } catch (err: any) {
      console.error(err)
      setErro('Não foi possível carregar os dados.')
    } finally {
      setLoading(false)
    }
  }

  function onChangeFiltro(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setFiltroNome(value)
      setPage(1)
    }, 250)
  }

  function exportarCSV() {
    if (times.length === 0) return

    const header = [
      'ID','Nome','Saldo Antes','Saldo Atual','Variação',
      'Gasto','Recebido','Média Overall','# Jogadores','Salário Total','Top Nacionalidades'
    ]

    const linhas = timesFiltradosOrdenados.map(t => {
      const delta = t.saldo - t.saldo_anterior
      const top = topNacionalidades(t.nacionalidades, 3).map(([n,q]) => `${n}(${q})`).join(' | ')
      const row = [
        t.id,
        t.nome,
        brl(t.saldo_anterior),
        brl(t.saldo),
        brl(delta),
        t.gasto ? brl(t.gasto) : brl(0),
        t.recebido ? brl(t.recebido) : brl(0),
        t.media_overall,
        t.qtd_jogadores,
        brl(t.salario_total),
        top
      ]
      return row.map(safeCSV).join(',')
    })

    const csvContent = [header.join(','), ...linhas].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'painel_times.csv'
    link.click()
  }

  const timesFiltradosOrdenados = useMemo(() => {
    const base = times.filter(t => t.nome.toLowerCase().includes(filtroNome.toLowerCase()))
    base.sort((a, b) => {
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome)
      if (ordenacao === 'saldo') return b.saldo - a.saldo
      if (ordenacao === 'salario_total') return b.salario_total - a.salario_total
      return 0
    })
    return base
  }, [times, filtroNome, ordenacao])

  const totalPages = Math.max(1, Math.ceil(timesFiltradosOrdenados.length / perPage))
  const pageData = useMemo(() => {
    const start = (page - 1) * perPage
    return timesFiltradosOrdenados.slice(start, start + perPage)
  }, [timesFiltradosOrdenados, page, perPage])

  const totais = useMemo(() => {
    const src = timesFiltradosOrdenados
    const soma = (k: keyof TimeInfo) => src.reduce((acc, t) => acc + (t[k] as number), 0)
    return {
      saldo: soma('saldo'),
      saldo_anterior: soma('saldo_anterior'),
      gasto: soma('gasto'),
      recebido: soma('recebido'),
      salario_total: soma('salario_total'),
      qtd_jogadores: src.reduce((a,t)=>a+t.qtd_jogadores,0)
    }
  }, [timesFiltradosOrdenados])

  function topNacionalidades(nacs: Record<string, number>, n = 3): [string, number][] {
    return Object.entries(nacs).sort((a,b) => b[1]-a[1]).slice(0, n)
  }

  function Flag({ nac }: { nac: string }) {
    const code = bandeiras[nac] || bandeiras[normalizeNacKey(nac)] || ''
    if (!code) return <span className="text-[10px] text-slate-500">•</span>
    return <img src={`https://flagcdn.com/w20/${code}.png`} alt={nac} className="w-5 h-3 rounded-sm" />
  }

  return (
    <div className="p-4 md:p-6 bg-slate-900 min-h-screen text-slate-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 mb-4 rounded-2xl bg-slate-800/80 backdrop-blur border border-slate-700 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-600 text-white grid place-items-center font-bold">LF</div>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold text-white">Painel de Times – Admin</h1>
              <p className="text-xs text-slate-300 -mt-0.5">Visão geral financeira e esportiva</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                onChange={(e) => onChangeFiltro(e.target.value)}
                placeholder="Filtrar por nome..."
                className="border border-slate-600 bg-slate-800 text-slate-100 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
            </div>

            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              className="border border-slate-600 bg-slate-800 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="nome">Ordenar por Nome</option>
              <option value="saldo">Ordenar por Saldo</option>
              <option value="salario_total">Ordenar por Salário</option>
            </select>

            <button
              onClick={() => carregarDados()}
              className="rounded-xl px-3 py-2 text-sm bg-slate-700 text-slate-100 hover:bg-slate-600 border border-slate-600"
              title="Recarregar agora"
            >
              ↻ Atualizar
            </button>

            <button
              onClick={exportarCSV}
              className="rounded-xl px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-500"
              title="Exportar CSV"
            >
              📥 Exportar
            </button>

            <label className="flex items-center gap-2 text-xs text-slate-300 ml-1">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-blue-600"
              />
              Auto-refresh (15s)
            </label>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 pt-0">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="text-xs text-slate-300">Saldo Atual (soma)</div>
            <div className="text-lg font-semibold text-white">{brl(totais.saldo)}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="text-xs text-slate-300">Saldo Antes (soma)</div>
            <div className="text-lg font-semibold text-white">{brl(totais.saldo_anterior)}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="text-xs text-slate-300">Variação Total</div>
            <div className={`text-lg font-semibold ${totais.saldo - totais.saldo_anterior >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {brl(totais.saldo - totais.saldo_anterior)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="text-xs text-slate-300">Gasto (soma)</div>
            <div className="text-lg font-semibold text-white">{brl(totais.gasto)}</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-3">
            <div className="text-xs text-slate-300">Recebido (soma)</div>
            <div className="text-lg font-semibold text-white">{brl(totais.recebido)}</div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-auto rounded-2xl border border-slate-700 shadow bg-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-700 text-slate-200 text-center">
              <th className="border border-slate-700 p-3 sticky left-0 bg-slate-700">Time</th>
              <th className="border border-slate-700 p-3">Saldo Antes</th>
              <th className="border border-slate-700 p-3">Saldo Agora</th>
              <th className="border border-slate-700 p-3">Variação</th>
              <th className="border border-slate-700 p-3">Gasto</th>
              <th className="border border-slate-700 p-3">Recebido</th>
              <th className="border border-slate-700 p-3">Média OVR</th>
              <th className="border border-slate-700 p-3"># Jogadores</th>
              <th className="border border-slate-700 p-3">Salário Total</th>
              <th className="border border-slate-700 p-3">Top Nacionalidades</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}

            {!loading && pageData.map((time) => {
              const delta = time.saldo - time.saldo_anterior
              const deltaPct = time.saldo_anterior ? (delta / time.saldo_anterior) * 100 : 0
              const top = topNacionalidades(time.nacionalidades, 3)

              return (
                <tr key={time.id} className="text-center hover:bg-slate-700/70 transition-colors">
                  {/* Time */}
                  <td className="border border-slate-700 p-3 text-left sticky left-0 bg-slate-800">
                    <div className="flex items-center gap-3">
                      <img src={time.logo_url} alt="Logo" className="h-8 w-8 object-contain rounded-md border border-slate-700 bg-slate-900" />
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{time.nome}</span>
                        <span className="text-[10px] text-slate-400">ID: {time.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                  </td>

                  <td className="border border-slate-700 p-3 text-slate-200">{brl(time.saldo_anterior)}</td>
                  <td className="border border-slate-700 p-3 font-medium text-slate-100">{brl(time.saldo)}</td>

                  {/* Variação */}
                  <td className="border border-slate-700 p-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`font-medium ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {delta >= 0 ? '▲' : '▼'} {brl(delta)}
                      </span>
                      <Pill tone={delta >= 0 ? 'green' : 'red'}>
                        {deltaPct.toFixed(1)}%
                      </Pill>
                    </div>
                  </td>

                  <td className="border border-slate-700 p-3 text-slate-200">{brl(time.gasto)}</td>
                  <td className="border border-slate-700 p-3 text-slate-200">{brl(time.recebido)}</td>
                  <td className="border border-slate-700 p-3 text-slate-200">{numberFmt(time.media_overall)}</td>
                  <td className="border border-slate-700 p-3 text-slate-200">{numberFmt(time.qtd_jogadores)}</td>
                  <td className="border border-slate-700 p-3 text-slate-200">{brl(time.salario_total)}</td>

                  {/* Nacionalidades condensadas */}
                  <td className="border border-slate-700 p-3">
                    <div className="flex flex-wrap justify-center gap-2">
                      {top.map(([nac, qtd]) => (
                        <div key={nac} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700 ring-1 ring-slate-600">
                          <Flag nac={nac} />
                          <span className="text-xs text-slate-100">
                            {nac.replaceAll('_', ' ')}: {qtd}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}

            {!loading && pageData.length === 0 && (
              <tr>
                <td className="p-6 text-center text-slate-400" colSpan={10}>
                  {erro ?? 'Nenhum time encontrado.'}
                </td>
              </tr>
            )}
          </tbody>

          {/* Rodapé com totais do conjunto filtrado */}
          {!loading && timesFiltradosOrdenados.length > 0 && (
            <tfoot>
              <tr className="bg-slate-700/70 font-medium text-slate-100">
                <td className="border border-slate-700 p-3 text-right">Totais (filtro):</td>
                <td className="border border-slate-700 p-3 text-center">{brl(totais.saldo_anterior)}</td>
                <td className="border border-slate-700 p-3 text-center">{brl(totais.saldo)}</td>
                <td className="border border-slate-700 p-3 text-center">
                  <span className={`${(totais.saldo - totais.saldo_anterior) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {brl(totais.saldo - totais.saldo_anterior)}
                  </span>
                </td>
                <td className="border border-slate-700 p-3 text-center">{brl(totais.gasto)}</td>
                <td className="border border-slate-700 p-3 text-center">{brl(totais.recebido)}</td>
                <td className="border border-slate-700 p-3 text-center">—</td>
                <td className="border border-slate-700 p-3 text-center">{numberFmt(totais.qtd_jogadores)}</td>
                <td className="border border-slate-700 p-3 text-center">{brl(totais.salario_total)}</td>
                <td className="border border-slate-700 p-3 text-center">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Paginação */}
      <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-300">
          Mostrando <b className="text-slate-100">{pageData.length}</b> de <b className="text-slate-100">{timesFiltradosOrdenados.length}</b> times
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-100 disabled:opacity-40 hover:bg-slate-700"
          >
            ◀ Anterior
          </button>
          <span className="text-sm text-slate-200">Página {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-2 rounded-xl border border-slate-600 bg-slate-800 text-slate-100 disabled:opacity-40 hover:bg-slate-700"
          >
            Próxima ▶
          </button>

          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
            className="ml-2 border border-slate-600 bg-slate-800 text-slate-100 rounded-xl px-2 py-2 text-sm"
          >
            {[10,12,20,30,50].map(n => <option key={n} value={n}>{n}/página</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => carregarDados()}
            className="rounded-xl px-3 py-2 text-sm bg-slate-700 text-slate-100 hover:bg-slate-600 border border-slate-600"
          >
            Recarregar
          </button>
          <button
            onClick={exportarCSV}
            className="rounded-xl px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-500"
          >
            Exportar CSV
          </button>
        </div>
      </div>
    </div>
  )
}
