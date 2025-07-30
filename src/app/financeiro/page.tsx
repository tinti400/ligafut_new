'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
}

interface Evento {
  tipo_evento: string
  valor: number
  data_evento: string
}

export default function Page() {
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')
  const [dataSelecionada, setDataSelecionada] = useState<string>('')

  useEffect(() => {
    async function carregarTimes() {
      const { data, error } = await supabase
        .from('times')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (!error && data) setTimes(data)
    }

    carregarTimes()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
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
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [historico, setHistorico] = useState<any[]>([])
  const [dados, setDados] = useState({
    vendas: 0,
    compras: 0,
    bonus: 0,
    salario: 0,
    saldo: 0,
    caixaNoDia: 0,
    mediaRenda: 0,
  })

  useEffect(() => {
    async function carregarDados() {
      const { data: eventos, error } = await supabase
        .from('bid')
        .select('tipo_evento, valor, data_evento')
        .eq('id_time1', id_time)

      if (error || !eventos) return

      let vendas = 0, compras = 0, bonus = 0, salario = 0, caixaNoDia = 0, totalRenda = 0, qtdRenda = 0

      const historicoPorDia: Record<string, { entradas: number, saidas: number }> = {}

      eventos.forEach((e: Evento) => {
        const valor = e.valor || 0

        switch (e.tipo_evento) {
          case 'venda':
            vendas += valor
            break
          case 'compra':
            compras += valor
            break
          case 'bonus':
            bonus += valor
            break
          case 'salario':
            salario += valor
            break
          case 'renda_estadio':
            totalRenda += valor
            qtdRenda++
            break
        }

        if (data && e.data_evento?.startsWith(data)) {
          caixaNoDia += valor
        }

        const dia = e.data_evento?.split('T')[0]
        if (dia) {
          if (!historicoPorDia[dia]) historicoPorDia[dia] = { entradas: 0, saidas: 0 }

          if (['venda', 'bonus', 'renda_estadio'].includes(e.tipo_evento)) {
            historicoPorDia[dia].entradas += valor
          } else {
            historicoPorDia[dia].saidas += valor
          }
        }
      })

      const historicoArray = Object.entries(historicoPorDia).map(([dia, val]) => ({
        dia,
        entradas: val.entradas,
        saidas: val.saidas,
        saldo: val.entradas - val.saidas,
      })).sort((a, b) => b.dia.localeCompare(a.dia))

      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      const { data: elenco } = await supabase
        .from('elenco')
        .select('salario')
        .eq('time_id', id_time)

      const folhaSalarial = (elenco || []).reduce((acc, j) => acc + (j.salario || 0), 0)

      setNomeTime(timeData?.nome || 'Time')
      setDados({
        vendas,
        compras,
        bonus,
        salario: folhaSalarial,
        saldo: timeData?.saldo || 0,
        caixaNoDia,
        mediaRenda: qtdRenda > 0 ? totalRenda / qtdRenda : 0,
      })

      setHistorico(historicoArray)
    }

    carregarDados()
  }, [id_time, data])

  return (
    <div className="bg-zinc-800 rounded-xl shadow-md p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-center mb-4">{nomeTime}</h2>
      <div className="space-y-2 text-sm">
        <p>💰 <strong>Vendas:</strong> R$ {dados.vendas.toLocaleString()}</p>
        <p>🛒 <strong>Compras:</strong> R$ {dados.compras.toLocaleString()}</p>
        <p>🎁 <strong>Bônus:</strong> R$ {dados.bonus.toLocaleString()}</p>
        <p>💼 <strong>Folha Salarial:</strong> R$ {dados.salario.toLocaleString()}</p>
        <p>🏟️ <strong>Média de Renda Estádio:</strong> R$ {dados.mediaRenda.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        <hr className="my-2 border-zinc-600" />
        <p className="text-base font-semibold">📈 <strong>Caixa Atual:</strong> R$ {dados.saldo.toLocaleString()}</p>
        {data && (
          <p className="text-sm text-zinc-400 mt-1">📅 <strong>Caixa no dia {data}:</strong> R$ {dados.caixaNoDia.toLocaleString()}</p>
        )}

        <button
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          onClick={() => setMostrarHistorico(!mostrarHistorico)}
        >
          📅 Ver Histórico
        </button>

        {mostrarHistorico && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-bold mb-2">📚 Histórico Financeiro:</h3>
            {historico.map((h) => (
              <div key={h.dia} className="flex justify-between text-xs border-b border-zinc-700 py-1">
                <span>{h.dia}</span>
                <span className="text-green-400">+R$ {h.entradas.toLocaleString()}</span>
                <span className="text-red-400">-R$ {h.saidas.toLocaleString()}</span>
                <span className={classNames("font-bold", {
                  'text-green-400': h.saldo >= 0,
                  'text-red-400': h.saldo < 0
                })}>
                  {h.saldo >= 0 ? '▲' : '▼'} R$ {h.saldo.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
