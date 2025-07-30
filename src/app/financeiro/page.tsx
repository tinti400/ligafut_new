'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

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
  const [dados, setDados] = useState({
    vendas: 0,
    compras: 0,
    bonus: 0,
    salario: 0,
    saldo: 0,
    caixaNoDia: 0,
  })

  useEffect(() => {
    async function carregarDados() {
      const { data: eventos, error } = await supabase
        .from('bid')
        .select('tipo_evento, valor, data_evento')
        .eq('id_time1', id_time)

      if (error || !eventos) return

      let vendas = 0, compras = 0, bonus = 0, salario = 0, caixaNoDia = 0

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
        }

        // Se tem filtro de data, soma só os do dia
        if (data && e.data_evento?.startsWith(data)) {
          caixaNoDia += valor
        }
      })

      const { data: timeData } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      setNomeTime(timeData?.nome || 'Time')
      setDados({
        vendas,
        compras,
        bonus,
        salario,
        saldo: timeData?.saldo || 0,
        caixaNoDia,
      })
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
        <p>💼 <strong>Salários descontados:</strong> R$ {dados.salario.toLocaleString()}</p>
        <hr className="my-2 border-zinc-600" />
        <p className="text-base font-semibold">📈 <strong>Caixa Atual:</strong> R$ {dados.saldo.toLocaleString()}</p>
        {data && (
          <p className="text-sm text-zinc-400 mt-1">📅 <strong>Caixa no dia {data}:</strong> R$ {dados.caixaNoDia.toLocaleString()}</p>
        )}
      </div>
    </div>
  )
}
