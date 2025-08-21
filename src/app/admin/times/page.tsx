'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { FaCoins, FaFloppyDisk } from 'react-icons/fa6'
import { FiSearch, FiRefreshCw, FiDownload, FiSave, FiX } from 'react-icons/fi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
  saldo: number
  divisao?: number | null
  logo_url?: string | null
}

type SortKey = 'nome' | 'saldo' | 'divisao'
type SortDir = 'asc' | 'desc'

export default function AdminTimesPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // edição
  const [saldosEditados, setSaldosEditados] = useState<Record<string, number>>({})
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [savingAll, setSavingAll] = useState(false)

  // UI extras
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('nome')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // paginação
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)

  useEffect(() => {
    buscarTimes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buscarTimes() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('times')
        .select('id, nome, saldo, divisao, logo_url')
        .order('nome', { ascending: true })

      if (error) {
        toast.error('Erro ao buscar times')
        setTimes([])
      } else {
        setTimes(data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    await buscarTimes()
    setRefreshing(false)
    toast.success('Lista atualizada')
  }

  function formatar(valor: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number.isFinite(valor) ? valor : 0)
  }

  function handleSaldoChange(id: string, valorStr: string) {
    const clean = valorStr.replace(/\s+/g, '')
    const parsed = Number(clean)
    if (!Number.isFinite(parsed)) return
    setSaldosEditados((prev) => ({ ...prev, [id]: parsed }))
  }

  function deltaTotal() {
    let total = 0
    for (const t of times) {
      const novo = saldosEditados[t.id]
      if (novo !== undefined && novo !== t.saldo) {
        total += novo - t.saldo
      }
    }
    return total
  }

  const alteradosCount = useMemo(
    () =>
      times.reduce((acc, t) => {
        const novo = saldosEditados[t.id]
        return acc + (novo !== undefined && novo !== t.saldo ? 1 : 0)
      }, 0),
    [times, saldosEditados]
  )

  function aplicarAjusteRapido(id: string, delta: number) {
    const base = saldosEditados[id] ?? times.find((t) => t.id === id)?.saldo ?? 0
    setSaldosEditados((prev) => ({ ...prev, [id]: Math.max(0, base + delta) }))
  }

  function limparEdicao(id: string) {
    setSaldosEditados((prev) => {
      const clone = { ...prev }
      delete clone[id]
      return clone
    })
  }

  async function atualizarSaldo(id_time: string, saldoAtual: number, novoSaldo: number) {
    if (!Number.isFinite(novoSaldo)) {
      toast.error('Saldo inválido')
      return
    }
    if (saldoAtual === novoSaldo) return

    const confirmar = confirm(`Deseja atualizar o saldo para ${formatar(novoSaldo)}?`)
    if (!confirmar) return

    setSavingMap((m) => ({ ...m, [id_time]: true }))
    try {
      const { error } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', id_time)

      if (error) {
        toast.error('Erro ao atualizar saldo')
        return
      }

      // Registra no BID (evento simples e auditável)
      await supabase.from('bid').insert({
        tipo_evento: 'Atualização de Saldo',
        descricao: `Saldo alterado para ${formatar(novoSaldo)}`,
        id_time1: id_time,
        valor: novoSaldo,
        data_evento: new Date().toISOString()
      })

      toast.success('Saldo atualizado com sucesso!')
      // Atualiza a lista localmente (otimista)
      setTimes((prev) => prev.map((t) => (t.id === id_time ? { ...t, saldo: novoSaldo } : t)))
      limparEdicao(id_time)
    } finally {
      setSavingMap((m) => ({ ...m, [id_time]: false }))
    }
  }

  async function salvarTodos() {
    if (!alteradosCount) {
      toast('Nenhuma alteração para salvar', { icon: 'ℹ️' })
      return
    }
    const confirmar = confirm(
      `Salvar ${alteradosCount} ${alteradosCount === 1 ? 'alteração' : 'alterações'}?`
    )
    if (!confirmar) return

    setSavingAll(true)
    let ok = 0
    let fail = 0

    // salva sequencialmente para reduzir risco de rate limit
    for (const t of times) {
      const novo = saldosEditados[t.id]
      if (novo === undefined || novo === t.saldo) continue
      try {
        const { error } = await supabase.from('times').update({ saldo: novo }).eq('id', t.id)
        if (error) {
          fail++
          continue
        }
        await supabase.from('bid').insert({
          tipo_evento: 'Atualização de Saldo (lote)',
          descricao: `Saldo alterado para ${formatar(novo)}`,
          id_time1: t.id,
          valor: novo,
          data_evento: new Date().toISOString()
        })
        ok++
        setTimes((prev) => prev.map((x) => (x.id === t.id ? { ...x, saldo: novo } : x)))
        setSaldosEditados((prev) => {
          const c = { ...prev }
          delete c[t.id]
          return c
        })
      } catch {
        fail++
      }
    }

    setSavingAll(false)
    if (ok && !fail) toast.success(`Tudo certo! ${ok} saldos atualizados.`)
    else if (ok && fail) toast(`Parcial: ${ok} ok • ${fail} falhas.`, { icon: '⚠️' })
    else toast.error('Não foi possível salvar as alterações.')
  }

  function exportarCSV() {
    const linhas = [
      ['id', 'nome', 'divisao', 'saldo'],
      ...times.map((t) => [t.id, t.nome, String(t.divisao ?? ''), String(t.saldo)])
    ]
    const csv = linhas.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'times_saldos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // filtros/ordenação
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    return times.filter((t) => {
      if (!q) return true
      const alvo = `${t.nome} ${t.divisao ?? ''}`.toLowerCase()
      return alvo.includes(q)
    })
  }, [times, query])

  const ordenados = useMemo(() => {
    const arr = [...filtrados]
    arr.sort((a, b) => {
      let va: any
      let vb: any
      if (sortKey === 'nome') {
        va = a.nome.toLowerCase()
        vb = b.nome.toLowerCase()
      } else if (sortKey === 'saldo') {
        va = a.saldo
        vb = b.saldo
      } else {
        va = a.divisao ?? 999
        vb = b.divisao ?? 999
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtrados, sortKey, sortDir])

  // paginação
  const totalPages = Math.max(1, Math.ceil(ordenados.length / pageSize))
  const pageClamped = Math.min(page, totalPages)
  const start = (pageClamped - 1) * pageSize
  const pageItems = ordenados.slice(start, start + pageSize)

  useEffect(() => {
    // ao mudar filtros/ordenação, volte à página 1
    setPage(1)
  }, [query, sortKey, sortDir, pageSize])

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            💼 Administração de Saldos
          </h1>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <div className="flex items-center gap-2 text-sm bg-neutral-800 border border-neutral-700 rounded px-3 py-2">
              <span className="opacity-70">Clubes:</span>
              <strong>{times.length}</strong>
              <span className="opacity-70 ml-3">Alterados:</span>
              <strong className={alteradosCount ? 'text-emerald-400' : ''}>
                {alteradosCount}
              </strong>
              <span className="opacity-70 ml-3">Δ Total:</span>
              <strong className={deltaTotal() >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {formatar(deltaTotal())}
              </strong>
            </div>

            <div className="flex gap-2">
              <button
                onClick={salvarTodos}
                disabled={!alteradosCount || savingAll}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded font-semibold transition ${
                  !alteradosCount || savingAll
                    ? 'bg-neutral-700 text-neutral-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                title="Salvar todas as alterações"
              >
                <FiSave />
                {savingAll ? 'Salvando…' : 'Salvar todos'}
              </button>

              <button
                onClick={refresh}
                className="inline-flex items-center gap-2 px-4 py-2 rounded font-semibold bg-neutral-700 hover:bg-neutral-600"
                title="Atualizar lista"
              >
                <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
                Atualizar
              </button>

              <button
                onClick={exportarCSV}
                className="inline-flex items-center gap-2 px-4 py-2 rounded font-semibold bg-neutral-700 hover:bg-neutral-600"
                title="Exportar CSV"
              >
                <FiDownload />
                Exportar
              </button>
            </div>
          </div>
        </div>

        {/* Barra de ferramentas */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* busca */}
          <div className="relative">
            <FiSearch className="absolute left-3 top-3.5 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou divisão…"
              className="w-full pl-10 pr-3 py-2 rounded bg-neutral-900 border border-neutral-700 focus:border-neutral-500 outline-none"
            />
          </div>

          {/* ordenação */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 focus:border-neutral-500 outline-none"
            >
              <option value="nome">Ordenar por Nome</option>
              <option value="saldo">Ordenar por Saldo</option>
              <option value="divisao">Ordenar por Divisão</option>
            </select>

            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as SortDir)}
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 focus:border-neutral-500 outline-none"
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </div>

          {/* paginação */}
          <div className="grid grid-cols-3 gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-700 focus:border-neutral-500 outline-none"
            >
              {[6, 12, 24, 48].map((n) => (
                <option key={n} value={n}>
                  {n} por página
                </option>
              ))}
            </select>

            <div className="col-span-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className={`px-3 py-2 rounded font-semibold ${
                  pageClamped <= 1
                    ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                    : 'bg-neutral-800 hover:bg-neutral-700'
                }`}
              >
                ←
              </button>
              <span className="text-sm opacity-80">
                Página <b>{pageClamped}</b> de <b>{totalPages}</b>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className={`px-3 py-2 rounded font-semibold ${
                  pageClamped >= totalPages
                    ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                    : 'bg-neutral-800 hover:bg-neutral-700'
                }`}
              >
                →
              </button>
            </div>
          </div>
        </div>

        {/* Lista / Grid */}
        <div className="mt-6 grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: pageSize }).map((_, i) => (
                <div key={i} className="bg-neutral-900 border border-neutral-800 p-4 rounded animate-pulse h-40" />
              ))
            : pageItems.map((time) => {
                const novoSaldo = saldosEditados[time.id] ?? time.saldo
                const alterado = novoSaldo !== time.saldo
                const saving = !!savingMap[time.id]
                const delta = novoSaldo - time.saldo
                const badge =
                  (time.divisao ?? 0) === 1
                    ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60'
                    : (time.divisao ?? 0) === 2
                    ? 'bg-indigo-900/60 text-indigo-300 border-indigo-700/60'
                    : 'bg-amber-900/60 text-amber-300 border-amber-700/60'

                return (
                  <div
                    key={time.id}
                    className="bg-neutral-900 border border-neutral-800 p-4 rounded shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {time.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={time.logo_url}
                            alt={time.nome}
                            className="w-10 h-10 rounded object-cover border border-neutral-700"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-neutral-800 border border-neutral-700 grid place-items-center">
                            <span className="text-neutral-400 text-xs">LF</span>
                          </div>
                        )}
                        <div>
                          <h2 className="text-lg font-semibold leading-tight">{time.nome}</h2>
                          <div
                            className={`inline-flex items-center gap-2 text-xs px-2 py-0.5 rounded border ${badge}`}
                            title="Divisão"
                          >
                            Divisão {time.divisao ?? '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-yellow-300">
                        <FaCoins />
                        <span className="text-sm">
                          Saldo atual:{' '}
                          <strong className="text-yellow-300">{formatar(time.saldo)}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Editor de saldo */}
                    <div className="grid grid-cols-1 gap-2">
                      <label className="text-sm opacity-80">Novo saldo</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          className="w-full p-2 rounded bg-neutral-800 border border-neutral-700 focus:border-neutral-500 outline-none"
                          value={String(novoSaldo)}
                          onChange={(e) => handleSaldoChange(time.id, e.target.value)}
                          step={1_000_000}
                          min={0}
                        />
                        <button
                          type="button"
                          onClick={() => aplicarAjusteRapido(time.id, 10_000_000)}
                          className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
                          title="+ R$10 mi"
                        >
                          +10M
                        </button>
                        <button
                          type="button"
                          onClick={() => aplicarAjusteRapido(time.id, -10_000_000)}
                          className="px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
                          title="- R$10 mi"
                        >
                          -10M
                        </button>
                        <button
                          type="button"
                          onClick={() => limparEdicao(time.id)}
                          disabled={saldosEditados[time.id] === undefined}
                          className={`px-3 py-2 rounded border text-sm ${
                            saldosEditados[time.id] === undefined
                              ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed border-neutral-700'
                              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
                          }`}
                          title="Reverter edição deste clube"
                        >
                          <FiX />
                        </button>
                      </div>

                      <div className="text-xs opacity-80">
                        {alterado ? (
                          <span>
                            Δ: <b className={delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {formatar(delta)}
                            </b>{' '}
                            → ficará {formatar(novoSaldo)}
                          </span>
                        ) : (
                          <span>Nenhuma alteração</span>
                        )}
                      </div>
                    </div>

                    <button
                      disabled={!alterado || saving}
                      className={`w-full flex items-center justify-center gap-2 p-2 rounded text-white font-semibold transition ${
                        !alterado || saving
                          ? 'bg-neutral-700 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                      onClick={() => atualizarSaldo(time.id, time.saldo, novoSaldo)}
                      title="Salvar apenas este clube"
                    >
                      <FaFloppyDisk />
                      {saving ? 'Salvando…' : `Atualizar para ${formatar(novoSaldo)}`}
                    </button>
                  </div>
                )
              })}
        </div>

        {/* Rodapé da páginação */}
        {!loading && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageClamped <= 1}
              className={`px-3 py-2 rounded font-semibold ${
                pageClamped <= 1
                  ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                  : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              ← Anterior
            </button>
            <span className="text-sm opacity-80">
              Página <b>{pageClamped}</b> de <b>{totalPages}</b>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageClamped >= totalPages}
              className={`px-3 py-2 rounded font-semibold ${
                pageClamped >= totalPages
                  ? 'bg-neutral-800 text-neutral-400 cursor-not-allowed'
                  : 'bg-neutral-800 hover:bg-neutral-700'
              }`}
            >
              Próxima →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
