'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TipoPunicao = 'desconto_pontos' | 'multa_dinheiro' | 'bloqueio_leilao' | 'bloqueio_mercado'

type TimeRow = { id: string; nome: string }
type PunicaoRow = {
  id: string
  id_time: string
  nome_time: string
  tipo_punicao: TipoPunicao
  valor: number | null
  motivo: string
  ativo: boolean
  created_at: string
}

export default function PunicoesAdminPage() {
  const [times, setTimes] = useState<TimeRow[]>([])
  const [punicoesAtuais, setPunicoesAtuais] = useState<PunicaoRow[]>([])
  const [idTime, setIdTime] = useState('')
  const [tipo, setTipo] = useState<TipoPunicao>('desconto_pontos')
  const [valor, setValor] = useState('') // pontos (int) ou valor R$ (number)
  const [motivo, setMotivo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [loadingTela, setLoadingTela] = useState(true)
  const [filtro, setFiltro] = useState('')

  const precisaValor = useMemo(
    () => tipo === 'desconto_pontos' || tipo === 'multa_dinheiro',
    [tipo]
  )

  useEffect(() => {
    (async () => {
      try {
        setLoadingTela(true)
        await Promise.all([carregarTimes(), carregarPunicoes()])
      } finally {
        setLoadingTela(false)
      }
    })()
  }, [])

  async function carregarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome')
      .order('nome', { ascending: true })

    if (error) {
      console.error('ERRO SELECT TIMES:', error)
      toast.error('Erro ao carregar times')
      return
    }
    setTimes((data || []) as TimeRow[])
  }

  async function carregarPunicoes() {
    const { data, error } = await supabase
      .from('punicoes')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('ERRO SELECT PUNICOES:', error)
      toast.error('Erro ao carregar punições')
      return
    }
    setPunicoesAtuais((data || []) as PunicaoRow[])
  }

  function parseNumeroPositivo(s: string) {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  async function aplicarPunicao() {
    if (!idTime) return toast.error('Selecione um time')
    if (!tipo) return toast.error('Selecione um tipo de punição')
    if (!motivo.trim()) return toast.error('Informe o motivo')

    let valorNumerico: number | null = null
    if (precisaValor) {
      const parsed = parseNumeroPositivo(valor)
      if (parsed === null) {
        return toast.error(
          tipo === 'desconto_pontos'
            ? 'Informe um número de pontos > 0'
            : 'Informe um valor de multa (R$) > 0'
        )
      }
      valorNumerico = tipo === 'desconto_pontos' ? Math.floor(parsed) : parsed
    }

    setCarregando(true)
    try {
      const time = times.find((t) => t.id === idTime)
      if (!time) throw new Error('Time não encontrado')

      // 1) Inserir punição e recuperar o id (exibe erro real se houver)
      const ins = await supabase
        .from('punicoes')
        .insert({
          id_time: idTime,
          nome_time: time.nome,
          tipo_punicao: tipo,
          valor: valorNumerico,
          motivo,
          ativo: true
        })
        .select('id')
        .single()

      if (ins.error) {
        console.error('ERRO INSERT PUNICAO:', ins.error)
        toast.error(`Erro ao aplicar punição: ${ins.error.message}`)
        setCarregando(false)
        return
      }

      // 2) Efeito prático no banco (se usar)
      if (tipo === 'desconto_pontos') {
        const rpc = await supabase.rpc('remover_pontos_classificacao', {
          id_time_param: idTime,
          pontos_remover: valorNumerico
        })
        if (rpc.error) {
          console.error('ERRO RPC remover_pontos_classificacao:', rpc.error)
          toast.error(`Erro ao descontar pontos: ${rpc.error.message}`)
        }
      } else if (tipo === 'multa_dinheiro') {
        const rpc = await supabase.rpc('descontar_dinheiro', {
          id_time_param: idTime,
          valor_multa: valorNumerico
        })
        if (rpc.error) {
          console.error('ERRO RPC descontar_dinheiro:', rpc.error)
          toast.error(`Erro ao debitar multa: ${rpc.error.message}`)
        }
      } else if (tipo === 'bloqueio_leilao' || tipo === 'bloqueio_mercado') {
        // Se desejar, marque flags em uma tabela de configurações aqui.
      }

      toast.success('Punição aplicada com sucesso!')
      setIdTime('')
      setTipo('desconto_pontos')
      setValor('')
      setMotivo('')
      await carregarPunicoes()
    } catch (e: any) {
      console.error('FALHA GERAL APLICAR PUNIÇÃO:', e)
      toast.error(`Falha ao aplicar punição: ${e?.message || 'erro'}`)
    } finally {
      setCarregando(false)
    }
  }

  async function removerPunicao(id: string) {
    const ok = confirm('Remover esta punição?')
    if (!ok) return
    const { error } = await supabase.from('punicoes').update({ ativo: false }).eq('id', id)
    if (error) {
      console.error('ERRO REMOVER PUNICAO:', error)
      return toast.error('Não foi possível remover')
    }
    toast.success('Punição removida')
    carregarPunicoes()
  }

  const punicoesFiltradas = useMemo(() => {
    if (!filtro.trim()) return punicoesAtuais
    const f = filtro.toLowerCase()
    return punicoesAtuais.filter(
      (p) =>
        p.nome_time.toLowerCase().includes(f) ||
        p.tipo_punicao.toLowerCase().includes(f) ||
        (p.motivo || '').toLowerCase().includes(f)
    )
  }, [punicoesAtuais, filtro])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-900 bg-gradient-to-b from-zinc-900/60 to-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              ⚠️ Painel de Punições
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Aplique multas e descontos de pontos. Tudo refletirá na liga e no caixa dos clubes.
            </p>
          </div>
          <span className="hidden md:inline-flex text-xs px-2 py-1 rounded border border-zinc-700 bg-zinc-900/60 text-zinc-300">
            Admin • Live
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Form Card */}
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 backdrop-blur p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Nova Punição</h2>
                {carregando ? (
                  <span className="text-xs text-amber-300">Aplicando…</span>
                ) : (
                  <span className="text-xs text-emerald-300">Pronto</span>
                )}
              </div>

              {/* Time + Tipo */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm text-zinc-300">👥 Time</label>
                  <select
                    value={idTime}
                    onChange={(e) => setIdTime(e.target.value)}
                    className="w-full h-11 rounded-xl bg-zinc-950 border border-zinc-800 px-3 outline-none focus:ring-2 focus:ring-zinc-500/40"
                  >
                    <option value="">Selecione um time</option>
                    {times.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-sm text-zinc-300">🚨 Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { k: 'desconto_pontos', label: 'Desconto de Pontos', emoji: '📉' },
                        { k: 'multa_dinheiro', label: 'Multa em Dinheiro', emoji: '💰' },
                        { k: 'bloqueio_leilao', label: 'Bloq. Leilão', emoji: '⛔' },
                        { k: 'bloqueio_mercado', label: 'Bloq. Mercado', emoji: '🚫' }
                      ] as { k: TipoPunicao; label: string; emoji: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.k}
                        type="button"
                        onClick={() => setTipo(opt.k)}
                        className={classNames(
                          'h-11 rounded-xl border px-3 text-sm transition-all',
                          tipo === opt.k
                            ? 'border-zinc-500 bg-zinc-800'
                            : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                        )}
                      >
                        <span className="mr-1">{opt.emoji}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Valor (condicional) */}
              {precisaValor && (
                <div className="mt-4">
                  <label className="block mb-1 text-sm text-zinc-300">
                    {tipo === 'desconto_pontos' ? 'Pontos a remover' : 'Valor da multa (R$)'}
                  </label>

                  {tipo === 'multa_dinheiro' ? (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">
                        R$
                      </div>
                      <input
                        type="number"
                        min={1}
                        step="0.01"
                        inputMode="decimal"
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                        placeholder="Ex.: 1000000"
                        className="w-full h-11 pl-9 pr-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:ring-2 focus:ring-zinc-500/40"
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      placeholder="Ex.: 3"
                      className="w-full h-11 rounded-xl bg-zinc-950 border border-zinc-800 px-3 outline-none focus:ring-2 focus:ring-zinc-500/40"
                    />
                  )}
                </div>
              )}

              {/* Motivo */}
              <div className="mt-4">
                <label className="block mb-1 text-sm text-zinc-300">📝 Motivo</label>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Explique o motivo da punição..."
                  className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-500/40"
                />
              </div>

              {/* Actions */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={aplicarPunicao}
                  disabled={carregando}
                  className={classNames(
                    'h-11 px-5 rounded-xl font-semibold transition-colors',
                    carregando
                      ? 'bg-zinc-800 text-zinc-400'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  )}
                >
                  {carregando ? 'Aplicando...' : 'Aplicar Punição'}
                </button>

                <button
                  onClick={() => {
                    setIdTime(''); setTipo('desconto_pontos'); setValor(''); setMotivo('')
                  }}
                  disabled={carregando}
                  className="h-11 px-4 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300"
                >
                  Limpar
                </button>
              </div>

              {/* Dica */}
              <p className="mt-4 text-xs text-zinc-400">
                • <b>Desconto de pontos</b> impacta a classificação da liga. <br />
                • <b>Multa</b> debita o saldo do clube automaticamente.
              </p>
            </div>
          </div>

          {/* Lateral - Status rápido */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Status Rápido</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between">
                  <span className="text-zinc-400">Times carregados</span>
                  <span className="text-zinc-200 font-medium">{times.length}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="text-zinc-400">Punições ativas</span>
                  <span className="text-zinc-200 font-medium">{punicoesAtuais.length}</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/70 to-zinc-950 p-5">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Ajuda</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Use <span className="text-zinc-300">Desconto de Pontos</span> para punir tabela (ex.: -3).<br />
                Use <span className="text-zinc-300">Multa em Dinheiro</span> para debitar o caixa do clube.
              </p>
            </div>
          </div>
        </div>

        {/* Lista de punições */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Punições Ativas</h2>
            <div className="relative w-72 max-w-full">
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Filtrar por time, tipo ou motivo…"
                className="w-full h-10 pl-3 pr-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:ring-2 focus:ring-zinc-500/40 text-sm"
              />
            </div>
          </div>

          {loadingTela ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl border border-zinc-800 bg-zinc-900/40 animate-pulse" />
              ))}
            </div>
          ) : punicoesFiltradas.length === 0 ? (
            <p className="text-zinc-400">Nenhuma punição ativa no momento.</p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {punicoesFiltradas.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{p.nome_time}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={classNames(
                            'text-[11px] uppercase tracking-wide px-2 py-0.5 rounded',
                            p.tipo_punicao === 'desconto_pontos' && 'bg-amber-500/20 text-amber-300',
                            p.tipo_punicao === 'multa_dinheiro' && 'bg-emerald-500/20 text-emerald-300',
                            (p.tipo_punicao === 'bloqueio_leilao' || p.tipo_punicao === 'bloqueio_mercado') &&
                              'bg-red-500/20 text-red-300'
                          )}
                        >
                          {p.tipo_punicao.replace('_', ' ')}
                        </span>

                        {p.tipo_punicao === 'multa_dinheiro' && typeof p.valor === 'number' && (
                          <span className="text-xs text-emerald-300">{fmtBRL(p.valor)}</span>
                        )}
                        {p.tipo_punicao === 'desconto_pontos' && typeof p.valor === 'number' && (
                          <span className="text-xs text-amber-300">-{p.valor} pts</span>
                        )}
                      </div>
                    </div>

                    <time className="text-[11px] text-zinc-400">
                      {new Date(p.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </time>
                  </div>

                  {p.motivo && (
                    <p className="mt-2 text-sm text-zinc-300 line-clamp-3">{p.motivo}</p>
                  )}

                  <div className="mt-3 flex items-center justify-end">
                    <button
                      onClick={() => removerPunicao(p.id)}
                      className="text-sm text-red-400 hover:text-red-300 underline underline-offset-4"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
