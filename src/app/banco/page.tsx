'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ============ Utils ============ */
function formatBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Juros por quantidade de turnos */
const jurosPorTurno: Record<number, number> = {
  1: 0.08,
  2: 0.16,
  3: 0.25,
  4: 0.35,
}

/** Limites por divisão – AQUI você pode “turbinar” o crédito */
const limitesDivisao: Record<string, number> = {
  '1': 1_200_000_000, // 1.2 bi
  '2': 900_000_000,   // 900 mi
  '3': 600_000_000,   // 600 mi
}

export default function BancoPage() {
  const [loading, setLoading] = useState(true)
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState('')
  const [divisao, setDivisao] = useState('1')
  const [saldoAtual, setSaldoAtual] = useState(0)

  const [emprestimoAtivo, setEmprestimoAtivo] = useState<any | null>(null)

  // UI / simulação
  const [limiteMaximo, setLimiteMaximo] = useState(600_000_000)
  const [valorEmprestimoMilhoes, setValorEmprestimoMilhoes] = useState(100) // default 100 mi
  const [parcelas, setParcelas] = useState(2)
  const [juros, setJuros] = useState(jurosPorTurno[2])
  const [jogadoresGarantia, setJogadoresGarantia] = useState<any[]>([])
  const [jogadorSelecionadoIndex, setJogadorSelecionadoIndex] = useState(0)

  const [mensagem, setMensagem] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pagando, setPagando] = useState(false)

  /** ============ Carregar dados iniciais ============ */
  useEffect(() => {
    async function carregarDados() {
      try {
        const id_time_local = localStorage.getItem('id_time')
        const nome_time_local = localStorage.getItem('nome_time') || ''

        if (!id_time_local) {
          setMensagem('⚠️ Usuário não autenticado. Faça login.')
          setLoading(false)
          return
        }
        setIdTime(id_time_local)
        setNomeTime(nome_time_local)

        // Buscar divisão e saldo
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
        setDivisao(div)
        setSaldoAtual(Number(timeData.saldo || 0))

        const limite = limitesDivisao[div] ?? 600_000_000
        setLimiteMaximo(limite)

        // Verificar empréstimo ativo
        const { data: emprestimos, error: errorEmprestimo } = await supabase
          .from('emprestimos')
          .select('*')
          .eq('id_time', id_time_local)
          .eq('status', 'ativo')

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

        // Buscar top 7 jogadores para garantia
        const { data: elenco, error: errorElenco } = await supabase
          .from('elenco')
          .select('id, nome, posicao, valor')
          .eq('id_time', id_time_local)

        if (errorElenco || !elenco) {
          setMensagem('Erro ao buscar elenco do time.')
          setLoading(false)
          return
        }

        const jogadoresTop7 = [...elenco]
          .sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0))
          .slice(0, 7)

        setJogadoresGarantia(jogadoresTop7)
        setLoading(false)
      } catch {
        setMensagem('Erro desconhecido ao carregar dados.')
        setLoading(false)
      }
    }
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ============ Atualiza juros quando muda o número de parcelas ============ */
  useEffect(() => {
    setJuros(jurosPorTurno[parcelas] || 0.20)
  }, [parcelas])

  /** ============ Cálculos de simulação ============ */
  const valorEmprestimo = useMemo(
    () => Math.max(0, valorEmprestimoMilhoes * 1_000_000),
    [valorEmprestimoMilhoes]
  )

  const valorTotal = useMemo(() => Math.round(valorEmprestimo * (1 + juros)), [valorEmprestimo, juros])
  const valorParcela = useMemo(() => Math.round(valorTotal / parcelas), [valorTotal, parcelas])

  const usoDoLimitePct = useMemo(() => {
    if (limiteMaximo <= 0) return 0
    return Math.min(100, Math.round((valorEmprestimo / limiteMaximo) * 100))
  }, [valorEmprestimo, limiteMaximo])

  /** ============ Ações ============ */
  async function solicitarEmprestimo() {
    if (!idTime) {
      setMensagem('Usuário não autenticado.')
      return
    }
    if (valorEmprestimo <= 0) {
      setMensagem('Informe um valor de empréstimo válido.')
      return
    }
    if (valorEmprestimo > limiteMaximo) {
      setMensagem('Valor do empréstimo excede o limite para sua divisão.')
      return
    }
    if (!jogadoresGarantia.length) {
      setMensagem('Não há jogadores suficientes para garantia.')
      return
    }

    const jogadorGarantia = jogadoresGarantia[jogadorSelecionadoIndex]
    setEnviando(true)
    setMensagem(null)

    try {
      // Cria o empréstimo (status: ativo)
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
          id: jogadorGarantia.id,
          nome: jogadorGarantia.nome,
          posicao: jogadorGarantia.posicao,
          valor: Number(jogadorGarantia.valor || 0),
        },
      })

      if (insertError) {
        setMensagem(`Erro ao solicitar empréstimo: ${insertError.message}`)
        setEnviando(false)
        return
      }

      // Credita o valor solicitado no saldo do time
      const novoSaldo = saldoAtual + valorEmprestimo
      const { error: saldoError } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', idTime)

      if (saldoError) {
        setMensagem(`Erro ao atualizar saldo: ${saldoError.message}`)
        setEnviando(false)
        return
      }

      setSaldoAtual(novoSaldo)
      setEmprestimoAtivo({
        valor_total: valorTotal,
        parcelas_totais: parcelas,
        parcelas_restantes: parcelas,
        valor_parcela: valorParcela,
        juros,
        jogador_garantia: jogadorGarantia,
        status: 'ativo',
      })
      setMensagem('✅ Empréstimo aprovado! O valor já foi creditado no caixa do clube.')
    } catch {
      setMensagem('Erro desconhecido ao solicitar empréstimo.')
    } finally {
      setEnviando(false)
    }
  }

  async function pagarParcela() {
    if (!idTime || !emprestimoAtivo) return

    if (saldoAtual < emprestimoAtivo.valor_parcela) {
      setMensagem('🚫 Saldo insuficiente para pagar a parcela.')
      return
    }

    setPagando(true)
    setMensagem(null)

    try {
      // Debita do caixa
      const novoSaldo = saldoAtual - emprestimoAtivo.valor_parcela
      const { error: saldoError } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', idTime)

      if (saldoError) {
        setMensagem(`Erro ao debitar saldo: ${saldoError.message}`)
        setPagando(false)
        return
      }

      // Atualiza parcelas do empréstimo
      const parcelasRestantesNovas = Number(emprestimoAtivo.parcelas_restantes) - 1
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
        setMensagem(`Erro ao atualizar parcelas: ${emprestimoError.message}`)
        setPagando(false)
        return
      }

      setSaldoAtual(novoSaldo)

      if (statusNovo === 'quitado') {
        setEmprestimoAtivo({ ...emprestimoAtivo, parcelas_restantes: 0, status: 'quitado' })
        setMensagem('🏁 Empréstimo totalmente quitado! Parabéns.')
      } else {
        setEmprestimoAtivo({
          ...emprestimoAtivo,
          parcelas_restantes: parcelasRestantesNovas,
          status: 'ativo',
        })
        setMensagem('✅ Parcela paga com sucesso!')
      }
    } catch {
      setMensagem('Erro desconhecido ao pagar parcela.')
    } finally {
      setPagando(false)
    }
  }

  /** ============ Render ============ */
  if (loading) {
    return (
      <p style={{ textAlign: 'center', marginTop: 30, color: '#ddd' }}>Carregando dados...</p>
    )
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: '40px auto',
        padding: '24px',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
        background: 'linear-gradient(180deg, #0e0e10, #111113 60%, #0b0b0d)',
        color: '#eaeef2',
        borderRadius: 16,
        boxShadow: '0 0 20px rgba(0,0,0,0.6)',
      }}
    >
      {/* Cabeçalho */}
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 16,
          alignItems: 'center',
          marginBottom: 24,
          padding: '16px 20px',
          background:
            'radial-gradient(1200px 400px at 10% -50%, rgba(56,142,60,0.25), transparent 60%), radial-gradient(900px 300px at 90% -50%, rgba(25,118,210,0.25), transparent 60%)',
          border: '1px solid #1f242b',
          borderRadius: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: 0.3 }}>🏦 Banco LigaFut</h1>
          <p style={{ margin: '6px 0 0', opacity: 0.9 }}>
            Limites maiores e escalonados por divisão. Selecione um jogador como garantia e
            simule o seu crédito.
          </p>
        </div>

        <div
          style={{
            justifySelf: 'end',
            padding: '10px 14px',
            borderRadius: 10,
            backgroundColor: '#15171a',
            border: '1px solid #23262b',
            textAlign: 'right',
            minWidth: 260,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Clube</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{nomeTime || '—'}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Saldo atual</div>
          <div style={{ fontWeight: 700, color: '#81c784' }}>{formatBRL(saldoAtual)}</div>
        </div>
      </header>

      {/* Empréstimo ativo */}
      {emprestimoAtivo ? (
        <section
          style={{
            border: '1px solid #23262b',
            borderRadius: 14,
            padding: 22,
            backgroundColor: '#141619',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25) inset',
            marginBottom: 24,
          }}
        >
          <h2 style={{ marginTop: 0, color: '#90caf9', textAlign: 'center' }}>
            Empréstimo Ativo
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              fontSize: 16,
            }}
          >
            <Info title="Valor Total" value={formatBRL(emprestimoAtivo.valor_total)} />
            <Info title="Parcelas Totais" value={String(emprestimoAtivo.parcelas_totais)} />
            <Info title="Restantes" value={String(emprestimoAtivo.parcelas_restantes)} />
            <Info title="Por Turno" value={formatBRL(emprestimoAtivo.valor_parcela)} />
            <Info title="Juros" value={`${(emprestimoAtivo.juros * 100).toFixed(0)}%`} />
            {emprestimoAtivo?.jogador_garantia?.nome && (
              <Info
                title="Garantia"
                value={`${emprestimoAtivo.jogador_garantia.nome} (${emprestimoAtivo.jogador_garantia.posicao})`}
                colSpan={3}
              />
            )}
          </div>

          {emprestimoAtivo.status === 'ativo' && emprestimoAtivo.parcelas_restantes > 0 && (
            <div style={{ marginTop: 22, textAlign: 'center' }}>
              <button
                onClick={pagarParcela}
                disabled={pagando}
                style={{
                  padding: '12px 28px',
                  fontSize: 18,
                  fontWeight: 800,
                  color: '#fff',
                  background:
                    pagando
                      ? '#3f4a55'
                      : 'linear-gradient(180deg, #1f6fd6 0%, #155ab2 100%)',
                  border: 'none',
                  borderRadius: 10,
                  cursor: pagando ? 'not-allowed' : 'pointer',
                  boxShadow: pagando ? 'none' : '0 10px 18px rgba(33, 150, 243, 0.25)',
                  transition: 'transform .04s ease',
                }}
              >
                {pagando ? 'Processando...' : '💸 Pagar Parcela'}
              </button>
            </div>
          )}

          {mensagem && (
            <p
              style={{
                marginTop: 16,
                fontWeight: 700,
                textAlign: 'center',
                color: mensagem.startsWith('✅') ? '#81c784' : '#ef9a9a',
              }}
            >
              {mensagem}
            </p>
          )}
        </section>
      ) : (
        <>
          {/* Painel de Limite */}
          <section
            style={{
              border: '1px solid #23262b',
              borderRadius: 14,
              padding: 22,
              backgroundColor: '#141619',
              marginBottom: 24,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                alignItems: 'stretch',
              }}
            >
              <Info title="Divisão" value={`Divisão ${divisao}`} />
              <Info title="Limite de Crédito" value={formatBRL(limiteMaximo)} />
              <div
                style={{
                  background: '#0f1114',
                  border: '1px solid #1f242b',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Uso do Limite (simulação)
                </div>
                <div
                  style={{
                    height: 10,
                    background: '#1a1d22',
                    borderRadius: 999,
                    overflow: 'hidden',
                    border: '1px solid #23262b',
                  }}
                >
                  <div
                    style={{
                      width: `${usoDoLimitePct}%`,
                      height: '100%',
                      background:
                        'linear-gradient(90deg, rgba(129,199,132,0.95), rgba(76,175,80,0.95))',
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, fontSize: 12, textAlign: 'right', opacity: 0.85 }}>
                  {usoDoLimitePct}%
                </div>
              </div>
            </div>
          </section>

          {/* Simulador */}
          <section
            style={{
              border: '1px solid #23262b',
              borderRadius: 14,
              padding: 22,
              backgroundColor: '#141619',
              marginBottom: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>🧮 Simulador de Empréstimo</h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: 24,
              }}
            >
              {/* Coluna esquerda: controles */}
              <div>
                {/* Valor (range + number) */}
                <div
                  style={{
                    background: '#0f1114',
                    border: '1px solid #1f242b',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>
                    💰 Valor do Empréstimo (em milhões)
                  </label>

                  <input
                    type="range"
                    min={10}
                    max={Math.floor(limiteMaximo / 1_000_000)}
                    step={5}
                    value={valorEmprestimoMilhoes}
                    onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="number"
                      min={10}
                      max={Math.floor(limiteMaximo / 1_000_000)}
                      step={5}
                      value={valorEmprestimoMilhoes}
                      onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
                      style={{
                        width: 120,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1.5px solid #2b2f35',
                        background: '#0c0e11',
                        color: '#eaeef2',
                        fontWeight: 700,
                      }}
                    />
                    <span style={{ opacity: 0.7 }}>= {formatBRL(valorEmprestimo)}</span>
                  </div>
                </div>

                {/* Parcelas */}
                <div
                  style={{
                    background: '#0f1114',
                    border: '1px solid #1f242b',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>
                    📆 Quantidade de Turnos (parcelas)
                  </label>
                  <select
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #2b2f35',
                      background: '#0c0e11',
                      color: '#eaeef2',
                      fontWeight: 700,
                    }}
                  >
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        {p} turno{p > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                    Juros aplicado: <b>{(juros * 100).toFixed(0)}%</b>
                  </div>
                </div>

                {/* Garantia */}
                <div
                  style={{
                    background: '#0f1114',
                    border: '1px solid #1f242b',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 700 }}>
                    🎯 Jogador como Garantia (Top 7 do elenco)
                  </label>
                  <select
                    value={jogadorSelecionadoIndex}
                    onChange={(e) => setJogadorSelecionadoIndex(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #2b2f35',
                      background: '#0c0e11',
                      color: '#eaeef2',
                      fontWeight: 700,
                    }}
                  >
                    {jogadoresGarantia.map((jogador, i) => (
                      <option key={jogador.id} value={i}>
                        {`${jogador.nome} - ${jogador.posicao} (${formatBRL(
                          Number(jogador.valor || 0)
                        )})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Coluna direita: resumo & ação */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    background: '#0f1114',
                    border: '1px solid #1f242b',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: 12 }}>Resumo da Simulação</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      fontSize: 16,
                    }}
                  >
                    <InfoCompact title="Total com Juros" value={formatBRL(valorTotal)} />
                    <InfoCompact title="Parcelas" value={`${parcelas}x / por turno`} />
                    <InfoCompact title="Valor por Turno" value={formatBRL(valorParcela)} />
                    <InfoCompact title="Juros" value={`${(juros * 100).toFixed(0)}%`} />
                  </div>
                </div>

                <button
                  disabled={enviando || valorEmprestimo > limiteMaximo || emprestimoAtivo}
                  onClick={solicitarEmprestimo}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: 18,
                    fontWeight: 900,
                    color: '#fff',
                    background:
                      enviando
                        ? '#3f4a55'
                        : 'linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%)',
                    border: 'none',
                    borderRadius: 12,
                    cursor: enviando ? 'not-allowed' : 'pointer',
                    boxShadow: enviando ? 'none' : '0 16px 28px rgba(56,142,60,0.25)',
                    transition: 'transform .04s ease',
                  }}
                  title={
                    emprestimoAtivo
                      ? 'Já existe um empréstimo ativo.'
                      : valorEmprestimo > limiteMaximo
                      ? 'Valor solicitado excede o limite para a sua divisão.'
                      : ''
                  }
                >
                  {enviando ? 'Enviando...' : '✅ Solicitar Empréstimo'}
                </button>

                {mensagem && (
                  <p
                    style={{
                      marginTop: 4,
                      fontWeight: 700,
                      textAlign: 'center',
                      color: mensagem.startsWith('✅') ? '#81c784' : '#ef9a9a',
                    }}
                  >
                    {mensagem}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Ajuda */}
          <details
            style={{
              fontSize: 15,
              color: '#cbd5e1',
              background: '#101215',
              border: '1px solid #23262b',
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>
              ℹ️ Como funciona o parcelamento por turno?
            </summary>
            <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.65 }}>
              <li>1 turno → 5% de juros</li>
              <li>2 turnos → 10% de juros</li>
              <li>3 turnos → 15% de juros</li>
              <li>4 turnos → 20% de juros</li>
            </ul>
            <p style={{ marginTop: 6 }}>
              Ao final de cada turno, o sistema cobra automaticamente 1 parcela do seu empréstimo.
            </p>
            <p style={{ marginTop: 6 }}>
              <b>Garantia obrigatória:</b> escolha um jogador entre os 7 mais valiosos do seu elenco.
            </p>
          </details>
        </>
      )}
    </main>
  )
}

/** ============ Componentes de UI pequenos ============ */
function Info({
  title,
  value,
  colSpan = 1,
}: {
  title: string
  value: string
  colSpan?: number
}) {
  return (
    <div
      style={{
        gridColumn: `span ${colSpan}`,
        background: '#0f1114',
        border: '1px solid #1f242b',
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{title}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  )
}

function InfoCompact({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        background: '#0c0e11',
        border: '1px solid #1f242b',
        borderRadius: 10,
        padding: 10,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{title}</div>
      <div style={{ fontWeight: 800 }}>{value}</div>
    </div>
  )
}
