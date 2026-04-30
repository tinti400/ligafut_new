'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

function formatBRL(valor: number) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

const jurosPorTurno: Record<number, number> = {
  1: 0.08,
  2: 0.16,
  3: 0.25,
  4: 0.35,
}

const limitesDivisao: Record<string, number> = {
  '1': 1_200_000_000,
  '2': 900_000_000,
  '3': 600_000_000,
}

export default function BancoPage() {
  const [loading, setLoading] = useState(true)
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState('')
  const [divisao, setDivisao] = useState('1')
  const [saldoAtual, setSaldoAtual] = useState(0)
  const [emprestimoAtivo, setEmprestimoAtivo] = useState<any | null>(null)

  const [limiteMaximo, setLimiteMaximo] = useState(600_000_000)
  const [valorEmprestimoMilhoes, setValorEmprestimoMilhoes] = useState(100)
  const [parcelas, setParcelas] = useState(2)
  const [juros, setJuros] = useState(jurosPorTurno[2])
  const [jogadoresGarantia, setJogadoresGarantia] = useState<any[]>([])
  const [jogadorSelecionadoIndex, setJogadorSelecionadoIndex] = useState(0)

  const [mensagem, setMensagem] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pagando, setPagando] = useState(false)

  useEffect(() => {
    async function carregarDados() {
      try {
        const id_time_local = localStorage.getItem('id_time')
        const nome_time_local = localStorage.getItem('nome_time') || ''

        if (!id_time_local) {
          setMensagem('Usuário não autenticado. Faça login novamente.')
          setLoading(false)
          return
        }

        setIdTime(id_time_local)
        setNomeTime(nome_time_local)

        const { data: timeData, error: errorTime } = await supabase
          .from('times')
          .select('divisao, saldo')
          .eq('id', id_time_local)
          .single()

        if (errorTime || !timeData) {
          setMensagem('Erro ao buscar dados do time.')
          setLoading(false)
          return
        }

        const div = String(timeData.divisao ?? '1').trim()
        const limite = limitesDivisao[div] ?? 600_000_000

        setDivisao(div)
        setSaldoAtual(Number(timeData.saldo || 0))
        setLimiteMaximo(limite)

        const { data: emprestimos, error: errorEmprestimo } = await supabase
          .from('emprestimos')
          .select('*')
          .eq('id_time', id_time_local)
          .eq('status', 'ativo')
          .limit(1)

        if (errorEmprestimo) {
          setMensagem('Erro ao verificar empréstimos ativos.')
          setLoading(false)
          return
        }

        if (emprestimos && emprestimos.length > 0) {
          setEmprestimoAtivo(emprestimos[0])
          setLoading(false)
          return
        }

        const { data: elenco, error: errorElenco } = await supabase
          .from('elenco')
          .select('id, nome, posicao, valor, overall, imagem_url')
          .eq('id_time', id_time_local)

        if (errorElenco || !elenco) {
          setMensagem('Erro ao buscar elenco do time.')
          setLoading(false)
          return
        }

        const jogadoresTop7 = [...elenco]
          .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))
          .slice(0, 7)

        setJogadoresGarantia(jogadoresTop7)
        setLoading(false)
      } catch {
        setMensagem('Erro desconhecido ao carregar dados.')
        setLoading(false)
      }
    }

    carregarDados()
  }, [])

  useEffect(() => {
    setJuros(jurosPorTurno[parcelas] || 0.16)
  }, [parcelas])

  const valorEmprestimo = useMemo(() => {
    return Math.max(0, valorEmprestimoMilhoes * 1_000_000)
  }, [valorEmprestimoMilhoes])

  const valorTotal = useMemo(() => {
    return Math.round(valorEmprestimo * (1 + juros))
  }, [valorEmprestimo, juros])

  const valorParcela = useMemo(() => {
    return Math.round(valorTotal / parcelas)
  }, [valorTotal, parcelas])

  const usoDoLimitePct = useMemo(() => {
    if (limiteMaximo <= 0) return 0
    return Math.min(100, Math.round((valorEmprestimo / limiteMaximo) * 100))
  }, [valorEmprestimo, limiteMaximo])

  const jogadorSelecionado = jogadoresGarantia[jogadorSelecionadoIndex]

  async function solicitarEmprestimo() {
    if (!idTime) {
      setMensagem('Usuário não autenticado.')
      return
    }

    if (valorEmprestimo <= 0) {
      setMensagem('Informe um valor válido.')
      return
    }

    if (valorEmprestimo > limiteMaximo) {
      setMensagem('Valor solicitado excede o limite da divisão.')
      return
    }

    if (!jogadoresGarantia.length || !jogadorSelecionado) {
      setMensagem('Você precisa ter jogadores disponíveis para garantia.')
      return
    }

    setEnviando(true)
    setMensagem(null)

    try {
      const { error: insertError } = await supabase.from('emprestimos').insert({
        id_time: idTime,
        nome_time: nomeTime,
        valor_total: valorTotal,
        parcelas_totais: parcelas,
        parcelas_restantes: parcelas,
        valor_parcela: valorParcela,
        juros,
        status: 'ativo',
        data_inicio: new Date().toISOString(),
        jogador_garantia: {
          id: jogadorSelecionado.id,
          nome: jogadorSelecionado.nome,
          posicao: jogadorSelecionado.posicao,
          valor: Number(jogadorSelecionado.valor || 0),
          overall: jogadorSelecionado.overall || null,
          imagem_url: jogadorSelecionado.imagem_url || null,
        },
      })

      if (insertError) {
        setMensagem(`Erro ao solicitar empréstimo: ${insertError.message}`)
        return
      }

      const novoSaldo = saldoAtual + valorEmprestimo

      const { error: saldoError } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', idTime)

      if (saldoError) {
        setMensagem(`Erro ao atualizar saldo: ${saldoError.message}`)
        return
      }

      setSaldoAtual(novoSaldo)

      setEmprestimoAtivo({
        valor_total: valorTotal,
        parcelas_totais: parcelas,
        parcelas_restantes: parcelas,
        valor_parcela: valorParcela,
        juros,
        jogador_garantia: jogadorSelecionado,
        status: 'ativo',
      })

      setMensagem('Empréstimo aprovado! O valor já caiu no caixa do clube.')
    } catch {
      setMensagem('Erro desconhecido ao solicitar empréstimo.')
    } finally {
      setEnviando(false)
    }
  }

  async function pagarParcela() {
    if (!idTime || !emprestimoAtivo) return

    if (saldoAtual < Number(emprestimoAtivo.valor_parcela || 0)) {
      setMensagem('Saldo insuficiente para pagar a parcela.')
      return
    }

    setPagando(true)
    setMensagem(null)

    try {
      const novoSaldo = saldoAtual - Number(emprestimoAtivo.valor_parcela || 0)

      const { error: saldoError } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', idTime)

      if (saldoError) {
        setMensagem(`Erro ao debitar saldo: ${saldoError.message}`)
        return
      }

      const parcelasRestantesNovas = Number(emprestimoAtivo.parcelas_restantes || 0) - 1
      const statusNovo = parcelasRestantesNovas <= 0 ? 'quitado' : 'ativo'

      const { error: emprestimoError } = await supabase
        .from('emprestimos')
        .update({
          parcelas_restantes: Math.max(0, parcelasRestantesNovas),
          status: statusNovo,
        })
        .eq('id_time', idTime)
        .eq('status', 'ativo')

      if (emprestimoError) {
        setMensagem(`Erro ao atualizar empréstimo: ${emprestimoError.message}`)
        return
      }

      setSaldoAtual(novoSaldo)

      if (statusNovo === 'quitado') {
        setEmprestimoAtivo({
          ...emprestimoAtivo,
          parcelas_restantes: 0,
          status: 'quitado',
        })
        setMensagem('Empréstimo quitado com sucesso!')
      } else {
        setEmprestimoAtivo({
          ...emprestimoAtivo,
          parcelas_restantes: parcelasRestantesNovas,
          status: 'ativo',
        })
        setMensagem('Parcela paga com sucesso!')
      }
    } catch {
      setMensagem('Erro desconhecido ao pagar parcela.')
    } finally {
      setPagando(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05070b] text-white flex items-center justify-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-8 py-6 shadow-2xl">
          <div className="animate-pulse text-lg font-bold">Carregando Banco LigaFut...</div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.22),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_30%),linear-gradient(180deg,#05070b,#090d14)]" />

      <section className="relative mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur-xl">
          <div className="relative p-6 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute bottom-0 left-20 h-32 w-32 rounded-full bg-blue-500/20 blur-3xl" />

            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                  Banco Oficial LigaFut
                </div>

                <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                  Crédito para o seu clube
                </h1>

                <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
                  Simule empréstimos, escolha parcelas por turno e use um jogador do elenco como
                  garantia para reforçar o caixa do clube.
                </p>
              </div>

              <div className="grid min-w-full grid-cols-2 gap-3 md:min-w-[360px]">
                <MiniCard label="Clube" value={nomeTime || '—'} />
                <MiniCard label="Divisão" value={`Divisão ${divisao}`} />
                <MiniCard label="Saldo atual" value={formatBRL(saldoAtual)} green />
                <MiniCard label="Limite" value={formatBRL(limiteMaximo)} blue />
              </div>
            </div>
          </div>
        </header>

        {mensagem && (
          <div
            className={`mb-5 rounded-2xl border px-5 py-4 text-sm font-bold shadow-xl ${
              mensagem.includes('sucesso') ||
              mensagem.includes('aprovado') ||
              mensagem.includes('quitado') ||
              mensagem.includes('caiu')
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                : 'border-red-400/30 bg-red-400/10 text-red-200'
            }`}
          >
            {mensagem}
          </div>
        )}

        {emprestimoAtivo ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl md:p-7">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
                    Contrato ativo
                  </p>
                  <h2 className="mt-1 text-2xl font-black md:text-3xl">Empréstimo em andamento</h2>
                </div>

                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black uppercase text-emerald-300">
                  Ativo
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Valor total" value={formatBRL(Number(emprestimoAtivo.valor_total || 0))} />
                <Stat label="Parcelas totais" value={`${emprestimoAtivo.parcelas_totais}`} />
                <Stat label="Restantes" value={`${emprestimoAtivo.parcelas_restantes}`} />
                <Stat label="Valor por turno" value={formatBRL(Number(emprestimoAtivo.valor_parcela || 0))} />
                <Stat label="Juros" value={`${(Number(emprestimoAtivo.juros || 0) * 100).toFixed(0)}%`} />
                <Stat label="Saldo atual" value={formatBRL(saldoAtual)} green />
              </div>

              {Number(emprestimoAtivo.parcelas_restantes || 0) > 0 && emprestimoAtivo.status === 'ativo' && (
                <button
                  onClick={pagarParcela}
                  disabled={pagando}
                  className="mt-6 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-4 text-base font-black uppercase tracking-wide text-white shadow-xl shadow-emerald-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pagando ? 'Processando pagamento...' : 'Pagar próxima parcela'}
                </button>
              )}
            </div>

            <GuaranteeCard jogador={emprestimoAtivo.jogador_garantia} />
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl md:p-7">
              <div className="mb-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
                  Simulador
                </p>
                <h2 className="mt-1 text-2xl font-black md:text-3xl">Monte seu empréstimo</h2>
              </div>

              <div className="mb-6 rounded-3xl border border-white/10 bg-black/30 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-300">Uso do limite</span>
                  <span className="text-sm font-black text-emerald-300">{usoDoLimitePct}%</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500"
                    style={{ width: `${usoDoLimitePct}%` }}
                  />
                </div>

                <div className="mt-3 flex justify-between text-xs text-slate-400">
                  <span>{formatBRL(valorEmprestimo)}</span>
                  <span>{formatBRL(limiteMaximo)}</span>
                </div>
              </div>

              <div className="grid gap-5">
                <Panel title="Valor do empréstimo">
                  <input
                    type="range"
                    min={10}
                    max={Math.floor(limiteMaximo / 1_000_000)}
                    step={5}
                    value={valorEmprestimoMilhoes}
                    onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />

                  <div className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr]">
                    <input
                      type="number"
                      min={10}
                      max={Math.floor(limiteMaximo / 1_000_000)}
                      step={5}
                      value={valorEmprestimoMilhoes}
                      onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
                      className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-lg font-black text-white outline-none focus:border-emerald-400"
                    />

                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                      <p className="text-xs font-bold uppercase text-emerald-300">Valor liberado</p>
                      <p className="text-xl font-black">{formatBRL(valorEmprestimo)}</p>
                    </div>
                  </div>
                </Panel>

                <Panel title="Parcelamento por turno">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map((p) => (
                      <button
                        key={p}
                        onClick={() => setParcelas(p)}
                        className={`rounded-2xl border px-4 py-4 text-left transition hover:scale-[1.02] ${
                          parcelas === p
                            ? 'border-emerald-400 bg-emerald-400/15'
                            : 'border-white/10 bg-black/30'
                        }`}
                      >
                        <p className="text-lg font-black">{p}x</p>
                        <p className="text-xs text-slate-400">{(jurosPorTurno[p] * 100).toFixed(0)}% juros</p>
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Jogador em garantia">
                  {jogadoresGarantia.length > 0 ? (
                    <select
                      value={jogadorSelecionadoIndex}
                      onChange={(e) => setJogadorSelecionadoIndex(Number(e.target.value))}
                      className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-4 font-bold text-white outline-none focus:border-emerald-400"
                    >
                      {jogadoresGarantia.map((jogador, i) => (
                        <option key={jogador.id} value={i}>
                          {jogador.nome} - {jogador.posicao} - {formatBRL(Number(jogador.valor || 0))}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-red-300">Nenhum jogador disponível para garantia.</p>
                  )}
                </Panel>
              </div>
            </div>

            <aside className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl md:p-7">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
                Resumo
              </p>

              <h2 className="mt-1 text-2xl font-black">Contrato simulado</h2>

              <div className="mt-6 grid gap-3">
                <ResumeRow label="Valor solicitado" value={formatBRL(valorEmprestimo)} />
                <ResumeRow label="Juros" value={`${(juros * 100).toFixed(0)}%`} />
                <ResumeRow label="Total a pagar" value={formatBRL(valorTotal)} highlight />
                <ResumeRow label="Parcelas" value={`${parcelas}x por turno`} />
                <ResumeRow label="Valor da parcela" value={formatBRL(valorParcela)} highlight />
              </div>

              <div className="my-6 h-px bg-white/10" />

              <GuaranteeCard jogador={jogadorSelecionado} small />

              <button
                disabled={enviando || valorEmprestimo > limiteMaximo || !jogadorSelecionado}
                onClick={solicitarEmprestimo}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-600 px-5 py-4 text-base font-black uppercase tracking-wide text-white shadow-xl shadow-emerald-500/20 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enviando ? 'Enviando solicitação...' : 'Solicitar empréstimo'}
              </button>

              <p className="mt-4 text-center text-xs text-slate-400">
                O valor é creditado imediatamente no caixa do clube após aprovação.
              </p>
            </aside>
          </section>
        )}
      </section>
    </main>
  )
}

function MiniCard({
  label,
  value,
  green,
  blue,
}: {
  label: string
  value: string
  green?: boolean
  blue?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-black md:text-base ${
          green ? 'text-emerald-300' : blue ? 'text-blue-300' : 'text-white'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  green,
}: {
  label: string
  value: string
  green?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className={`mt-2 text-lg font-black ${green ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
      <h3 className="mb-4 text-base font-black">{title}</h3>
      {children}
    </div>
  )
}

function ResumeRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`font-black ${highlight ? 'text-emerald-300' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

function GuaranteeCard({ jogador, small }: { jogador: any; small?: boolean }) {
  if (!jogador) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/30 p-5 text-sm text-slate-400">
        Nenhum jogador selecionado.
      </div>
    )
  }

  return (
    <div className={`rounded-[28px] border border-white/10 bg-black/30 p-5 ${small ? '' : 'shadow-2xl'}`}>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">
        Garantia
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          {jogador.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={jogador.imagem_url} alt={jogador.nome} className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-black">LF</span>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-lg font-black">{jogador.nome}</h3>
          <p className="text-sm text-slate-400">
            {jogador.posicao || 'POS'} {jogador.overall ? `• OVR ${jogador.overall}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
        <p className="text-xs font-bold uppercase text-emerald-300">Valor de mercado</p>
        <p className="text-xl font-black">{formatBRL(Number(jogador.valor || 0))}</p>
      </div>
    </div>
  )
}