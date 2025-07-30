'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
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

      if (data && !error) setTimes(data)
    }

    carregarTimes()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
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

  useEffect(() => {
    async function carregarDados() {
      let vendas = 0, compras = 0, bonus_resultado = 0, bonus_gols = 0, salariosPagos = 0, leiloes = 0
      let caixaNoDia = 0, caixaAnterior = 0

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

      // 🔎 Processar eventos onde o time é origem
      eventosOrigem?.forEach((e) => {
        const valor = e.valor || 0
        if (e.tipo_evento === 'venda') vendas += valor
        else if (e.tipo_evento === 'bonus') bonus_resultado += valor
        else if (e.tipo_evento === 'bonus_gol') bonus_gols += valor
        else if (e.tipo_evento === 'salario') salariosPagos += valor

        if (data && e.data_evento?.startsWith(data)) caixaNoDia += valor
        else if (data && e.data_evento < data) caixaAnterior += valor
      })

      // 🔎 Processar eventos onde o time é destino
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

      // 🔎 Buscar saldo atual e nome do time
      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      setNomeTime(timeData?.nome || 'Time')

      // 🧮 Buscar e calcular folha salarial (soma de todos os salários do elenco atual)
      const { data: elenco } = await supabase
        .from('elenco')
        .select('salario')
        .eq('time_id', id_time)

      const folhaSalarial = elenco?.reduce((acc, jogador) => acc + (jogador.salario || 0), 0) || 0

      // 🧾 Verificação de consistência
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

  return (
    <div className="bg-zinc-900 rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-center mb-4">{nomeTime}</h2>
      <div className="space-y-2 text-sm">
        <p>💰 <strong>Vendas:</strong> R$ {dados.vendas.toLocaleString()}</p>
        <p>🛒 <strong>Compras:</strong> R$ {dados.compras.toLocaleString()}</p>
        <p>🔨 <strong>Leilões:</strong> R$ {dados.leiloes.toLocaleString()}</p>
        <p>🏆 <strong>Bônus por Resultado:</strong> R$ {dados.bonus_resultado.toLocaleString()}</p>
        <p>⚽ <strong>Bônus por Gols:</strong> R$ {dados.bonus_gols.toLocaleString()}</p>
        <p>💼 <strong>Salários Pagos:</strong> R$ {dados.salariosPagos.toLocaleString()}</p>
        <p>📄 <strong>Folha Salarial Atual:</strong> R$ {dados.folhaSalarial.toLocaleString()}</p>
        <hr className="my-2 border-zinc-600" />
        <p className="text-base font-semibold">📈 <strong>Caixa Atual:</strong> R$ {dados.saldoAtual.toLocaleString()}</p>
        {data && (
          <>
            <p className="text-sm text-zinc-400">📅 <strong>Caixa no dia {data}:</strong> R$ {dados.caixaNoDia.toLocaleString()}</p>
            <p className="text-sm text-zinc-400">📉 <strong>Caixa antes do dia:</strong> R$ {dados.caixaAnterior.toLocaleString()}</p>
          </>
        )}
        <p className="text-sm mt-2">
          🔍 <strong>Verificação:</strong>{' '}
          {Math.abs(dados.saldoAtual - (dados.caixaAnterior + dados.caixaNoDia)) > 1000
            ? <span className="text-red-500 font-bold">⚠️ Inconsistência</span>
            : <span className="text-green-400 font-semibold">OK</span>}
        </p>
      </div>
    </div>
  )
}
