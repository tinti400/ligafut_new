'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

function formatBRL(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function BancoPage() {
  const [loading, setLoading] = useState(true)
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState('')
  const [divisao, setDivisao] = useState('')
  const [saldoAtual, setSaldoAtual] = useState(0)
  const [emprestimoAtivo, setEmprestimoAtivo] = useState<any | null>(null)
  const [limiteMaximo, setLimiteMaximo] = useState(100_000_000)
  const [valorEmprestimoMilhoes, setValorEmprestimoMilhoes] = useState(20)
  const [parcelas, setParcelas] = useState(1)
  const [juros, setJuros] = useState(0.05)
  const [jogadoresGarantia, setJogadoresGarantia] = useState<any[]>([])
  const [jogadorSelecionadoIndex, setJogadorSelecionadoIndex] = useState(0)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pagando, setPagando] = useState(false)

  const limitesDivisao: Record<string, number> = {
    '1': 500_000_000,
    '2': 300_000_000,
    '3': 150_000_000,
  }

  const jurosPorTurno: Record<number, number> = {
    1: 0.05,
    2: 0.10,
    3: 0.15,
    4: 0.20,
  }

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

        const div = String(timeData.divisao).trim()
        setDivisao(div)
        setSaldoAtual(timeData.saldo || 0)
        setLimiteMaximo(limitesDivisao[div] || 100_000_000)

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

        const { data: elenco, error: errorElenco } = await supabase
          .from('elenco')
          .select('*')
          .eq('id_time', id_time_local)

        if (errorElenco || !elenco) {
          setMensagem('Erro ao buscar elenco do time.')
          setLoading(false)
          return
        }

        const jogadoresTop7 = elenco.sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 7)
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
    setJuros(jurosPorTurno[parcelas] || 0.20)
  }, [parcelas])

  const valorEmprestimo = valorEmprestimoMilhoes * 1_000_000
  const valorTotal = Math.round(valorEmprestimo * (1 + juros))
  const valorParcela = Math.round(valorTotal / parcelas)

  async function solicitarEmprestimo() {
    if (!idTime) {
      setMensagem('Usuário não autenticado.')
      return
    }
    if (valorEmprestimo > limiteMaximo) {
      setMensagem('Valor do empréstimo excede limite para sua divisão.')
      return
    }
    if (jogadoresGarantia.length === 0) {
      setMensagem('Não há jogadores suficientes para garantia.')
      return
    }

    const jogadorGarantia = jogadoresGarantia[jogadorSelecionadoIndex]

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
          nome: jogadorGarantia.nome,
          posicao: jogadorGarantia.posicao,
          valor: jogadorGarantia.valor,
        },
      })

      if (insertError) {
        setMensagem(`Erro ao solicitar empréstimo: ${insertError.message}`)
        setEnviando(false)
        return
      }

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

      setMensagem('✅ Empréstimo aprovado e saldo atualizado com sucesso!')
      setEnviando(false)
      setEmprestimoAtivo({
        valor_total: valorTotal,
        parcelas_totais: parcelas,
        parcelas_restantes: parcelas,
        valor_parcela: valorParcela,
        juros,
        jogador_garantia: jogadorGarantia,
        status: 'ativo',
      })
    } catch {
      setMensagem('Erro desconhecido ao solicitar empréstimo.')
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

      const parcelasRestantesNovas = emprestimoAtivo.parcelas_restantes - 1
      const statusNovo = parcelasRestantesNovas <= 0 ? 'quitado' : 'ativo'

      const { error: emprestimoError } = await supabase
        .from('emprestimos')
        .update({
          parcelas_restantes: parcelasRestantesNovas,
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
      setEmprestimoAtivo({
        ...emprestimoAtivo,
        parcelas_restantes: parcelasRestantesNovas,
        status: statusNovo,
      })

      setMensagem('✅ Parcela paga com sucesso!')
    } catch {
      setMensagem('Erro desconhecido ao pagar parcela.')
    } finally {
      setPagando(false)
    }
  }

  if (loading) return <p style={{ textAlign: 'center', marginTop: 30 }}>Carregando dados...</p>
  if (mensagem && !emprestimoAtivo) return <p style={{ textAlign: 'center', marginTop: 30 }}>{mensagem}</p>

  return (
    <main style={{ maxWidth: 700, margin: '40px auto', padding: 20, fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 30 }}>🏦 Banco LigaFut</h1>
      <p style={{ textAlign: 'center', marginBottom: 30, fontSize: 18 }}>
        Invista no seu clube e escolha um jogador como garantia do empréstimo.
      </p>

      {emprestimoAtivo ? (
        <section
          style={{
            border: '1px solid #ccc',
            borderRadius: 12,
            padding: 25,
            backgroundColor: '#f9f9f9',
            boxShadow: '0 4px 8px rgba(0,0,0,0.05)',
            maxWidth: 600,
            margin: '0 auto',
          }}
        >
          <h2 style={{ color: '#b71c1c', marginBottom: 20, textAlign: 'center' }}>Empréstimo Ativo Detectado</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, fontSize: 17 }}>
            <div><b>Valor Total:</b> {formatBRL(emprestimoAtivo.valor_total)}</div>
            <div><b>Parcelas Totais:</b> {emprestimoAtivo.parcelas_totais}</div>
            <div><b>Parcelas Restantes:</b> {emprestimoAtivo.parcelas_restantes}</div>
            <div><b>Valor por Turno:</b> {formatBRL(emprestimoAtivo.valor_parcela)}</div>
            <div><b>Juros:</b> {(emprestimoAtivo.juros * 100).toFixed(0)}%</div>
            {emprestimoAtivo.jogador_garantia && (
              <div><b>Garantia:</b> {emprestimoAtivo.jogador_garantia.nome} ({emprestimoAtivo.jogador_garantia.posicao})</div>
            )}
          </div>
          <p style={{ marginTop: 25, fontWeight: 'bold', textAlign: 'center', color: '#b71c1c' }}>
            Por favor, quite o empréstimo ativo antes de solicitar um novo.
          </p>

          {emprestimoAtivo.status === 'ativo' && emprestimoAtivo.parcelas_restantes > 0 && (
            <div style={{ marginTop: 25, textAlign: 'center' }}>
              <button
                onClick={pagarParcela}
                disabled={pagando}
                style={{
                  padding: '12px 25px',
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: '#fff',
                  backgroundColor: pagando ? '#9e9e9e' : '#1565c0',
                  border: 'none',
                  borderRadius: 8,
                  cursor: pagando ? 'not-allowed' : 'pointer',
                  boxShadow: pagando ? 'none' : '0 4px 10px rgba(21,101,192,0.7)',
                  transition: 'background-color 0.3s ease',
                }}
              >
                {pagando ? 'Processando...' : '💸 Pagar Parcela'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <div style={{ maxWidth: 600, margin: '0 auto', backgroundColor: '#f5f5f5', padding: 25, borderRadius: 12, boxShadow: '0 3px 6px rgba(0,0,0,0.1)' }}>
            <p style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 15 }}>
              Limite de crédito para divisão <span style={{ color: '#1565c0' }}>{divisao.toUpperCase()}</span>:
              <span style={{ color: '#2e7d32', marginLeft: 10 }}>{formatBRL(limiteMaximo)}</span>
            </p>

            <label style={{ display: 'block', marginBottom: 20 }}>
              💰 <strong>Valor do Empréstimo (milhões):</strong>
              <input
                type="number"
                min={10}
                max={Math.floor(limiteMaximo / 1_000_000)}
                step={5}
                value={valorEmprestimoMilhoes}
                onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
                style={{
                  marginLeft: 12,
                  width: '100px',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1.5px solid #888',
                  fontSize: 16,
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 25 }}>
              📆 <strong>Quantidade de Turnos para pagamento:</strong>
              <select
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value))}
                style={{
                  marginLeft: 12,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1.5px solid #888',
                  fontSize: 16,
                }}
              >
                {[1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>

            <hr style={{ margin: '20px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 15, fontSize: 16, marginBottom: 25 }}>
              <div>
                <b>Valor Total com Juros:</b> <br />
                <span style={{ color: '#1b5e20' }}>{formatBRL(valorTotal)}</span>
              </div>
              <div>
                <b>Parcelas:</b> <br />
                <span>{parcelas}x (por turno)</span>
              </div>
              <div>
                <b>Valor por Turno:</b> <br />
                <span>{formatBRL(valorParcela)}</span>
              </div>
              <div>
                <b>Juros Aplicados:</b> <br />
                <span>{(juros * 100).toFixed(0)}%</span>
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: 30 }}>
              🎯 <strong>Selecione um jogador como garantia:</strong>
              <select
                value={jogadorSelecionadoIndex}
                onChange={(e) => setJogadorSelecionadoIndex(Number(e.target.value))}
                style={{
                  marginLeft: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1.5px solid #888',
                  fontSize: 16,
                  width: '100%',
                }}
              >
                {jogadoresGarantia.map((jogador, i) => (
                  <option key={jogador.id} value={i}>
                    {`${jogador.nome} - ${jogador.posicao} (${formatBRL(jogador.valor)})`}
                  </option>
                ))}
              </select>
            </label>

            <button
              disabled={enviando || valorEmprestimo > limiteMaximo}
              onClick={solicitarEmprestimo}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 18,
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: enviando ? '#9e9e9e' : '#2e7d32',
                border: 'none',
                borderRadius: 8,
                cursor: enviando ? 'not-allowed' : 'pointer',
                boxShadow: enviando ? 'none' : '0 4px 10px rgba(46,125,50,0.6)',
                transition: 'background-color 0.3s ease',
              }}
            >
              {enviando ? 'Enviando...' : '✅ Solicitar Empréstimo'}
            </button>

            {mensagem && (
              <p
                style={{
                  marginTop: 20,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  color: mensagem.startsWith('✅') ? '#2e7d32' : '#b71c1c',
                }}
              >
                {mensagem}
              </p>
            )}
          </div>
        </>
      )}

      <hr style={{ marginTop: 40, marginBottom: 30 }} />
      <details style={{ fontSize: 15, maxWidth: 600, margin: '0 auto' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          ℹ️ Como funciona o parcelamento por turno?
        </summary>
        <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>1 turno → 5% de juros</li>
          <li>2 turnos → 10% de juros</li>
          <li>3 turnos → 15% de juros</li>
          <li>4 turnos → 20% de juros</li>
        </ul>
        <p style={{ marginTop: 8 }}>
          Ao final de cada turno, será cobrada 1 parcela automaticamente.
        </p>
        <p>
          <b>É obrigatório escolher um jogador como garantia</b>, entre os 7 mais valiosos do elenco.
        </p>
      </details>
    </main>
  )
}
