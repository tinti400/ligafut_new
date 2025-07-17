'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Inicialize Supabase client usando variáveis ambiente
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Função para formatar valor em Real brasileiro
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

      // TODO: registrar movimentação financeira aqui

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

  if (loading) return <p>Carregando dados...</p>
  if (mensagem && !emprestimoAtivo) return <p>{mensagem}</p>

  return (
    <main style={{ maxWidth: 600, margin: 'auto', padding: 20 }}>
      <h1>🏦 Banco LigaFut</h1>
      <p>Invista no seu clube e escolha um jogador como garantia do empréstimo.</p>

      {emprestimoAtivo ? (
        <div style={{ border: '1px solid #ddd', padding: 15, borderRadius: 6 }}>
          <h3>Empréstimo Ativo Detectado</h3>
          <p><b>Valor Total:</b> {formatBRL(emprestimoAtivo.valor_total)}</p>
          <p><b>Parcelas Totais:</b> {emprestimoAtivo.parcelas_totais}</p>
          <p><b>Parcelas Restantes:</b> {emprestimoAtivo.parcelas_restantes}</p>
          <p><b>Valor por Turno:</b> {formatBRL(emprestimoAtivo.valor_parcela)}</p>
          <p><b>Juros:</b> {(emprestimoAtivo.juros * 100).toFixed(0)}%</p>
          {emprestimoAtivo.jogador_garantia && (
            <p>
              <b>Garantia:</b> {emprestimoAtivo.jogador_garantia.nome} ({emprestimoAtivo.jogador_garantia.posicao}) - {formatBRL(emprestimoAtivo.jogador_garantia.valor)}
            </p>
          )}
          <p>Por favor, quite o empréstimo ativo antes de solicitar um novo.</p>
        </div>
      ) : (
        <>
          <p><b>Limite de crédito para divisão {divisao.toUpperCase()}:</b> {formatBRL(limiteMaximo)}</p>

          <label>
            💰 Valor do Empréstimo (milhões):&nbsp;
            <input
              type="number"
              min={10}
              max={Math.floor(limiteMaximo / 1_000_000)}
              step={5}
              value={valorEmprestimoMilhoes}
              onChange={(e) => setValorEmprestimoMilhoes(Number(e.target.value))}
            />
          </label>

          <br /><br />

          <label>
            📆 Quantidade de Turnos para pagamento:&nbsp;
            <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
              {[1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <hr />

          <p><b>Valor Total com Juros:</b> {formatBRL(valorTotal)}</p>
          <p><b>Parcelas:</b> {parcelas}x (por turno)</p>
          <p><b>Valor por Turno:</b> {formatBRL(valorParcela)}</p>
          <p><b>Juros Aplicados:</b> {(juros * 100).toFixed(0)}%</p>

          <label>
            🎯 Selecione um jogador como garantia:<br />
            <select
              value={jogadorSelecionadoIndex}
              onChange={(e) => setJogadorSelecionadoIndex(Number(e.target.value))}
            >
              {jogadoresGarantia.map((jogador, i) => (
                <option key={jogador.id} value={i}>
                  {`${jogador.nome} - ${jogador.posicao} (${formatBRL(jogador.valor)})`}
                </option>
              ))}
            </select>
          </label>

          <br /><br />

          <button
            disabled={enviando || valorEmprestimo > limiteMaximo}
            onClick={solicitarEmprestimo}
            style={{ padding: '10px 20px', cursor: enviando ? 'not-allowed' : 'pointer' }}
          >
            {enviando ? 'Enviando...' : '✅ Solicitar Empréstimo'}
          </button>

          {mensagem && <p style={{ marginTop: 10 }}>{mensagem}</p>}
        </>
      )}

      <hr />
      <details>
        <summary>ℹ️ Como funciona o parcelamento por turno?</summary>
        <ul>
          <li>1 turno → 5% de juros</li>
          <li>2 turnos → 10% de juros</li>
          <li>3 turnos → 15% de juros</li>
          <li>4 turnos → 20% de juros</li>
        </ul>
        <p>Ao final de cada turno, será cobrada 1 parcela automaticamente.</p>
        <p><b>É obrigatório escolher um jogador como garantia</b>, entre os 7 mais valiosos do elenco.</p>
      </details>
    </main>
  )
}
