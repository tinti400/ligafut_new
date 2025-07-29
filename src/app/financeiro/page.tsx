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

export default function Page() {
  const [times, setTimes] = useState<Time[]>([])

  useEffect(() => {
    async function carregarTimes() {
      const { data, error } = await supabase
        .from('times')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) {
        console.error('Erro ao buscar times:', error)
        return
      }

      setTimes(data || [])
    }

    carregarTimes()
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">📊 Painel Financeiro dos Times</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {times.map((time) => (
          <PainelFinanceiro key={time.id} id_time={time.id} nome_time={time.nome} />
        ))}
      </div>
    </div>
  )
}

function PainelFinanceiro({ id_time, nome_time }: { id_time: string, nome_time: string }) {
  const [totais, setTotais] = useState({
    vendas: 0,
    compras: 0,
    bonus: 0,
    saldo: 0,
  })

  useEffect(() => {
    async function carregarDados() {
      const { data, error } = await supabase
        .from('bid')
        .select('tipo_evento, valor')
        .eq('id_time1', id_time)

      if (error) {
        console.error('Erro ao buscar movimentações:', error)
        return
      }

      const vendas = data.filter(e => e.tipo_evento === 'venda').reduce((a, c) => a + (c.valor || 0), 0)
      const compras = data.filter(e => e.tipo_evento === 'compra').reduce((a, c) => a + (c.valor || 0), 0)
      const bonus = data.filter(e => e.tipo_evento === 'bonus').reduce((a, c) => a + (c.valor || 0), 0)

      const { data: timeData } = await supabase
        .from('times')
        .select('saldo')
        .eq('id', id_time)
        .single()

      setTotais({
        vendas,
        compras,
        bonus,
        saldo: timeData?.saldo || 0,
      })
    }

    carregarDados()
  }, [id_time])

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">{nome_time}</h2>
      <div className="space-y-1 text-sm text-gray-700">
        <p>💰 <strong>Vendas:</strong> R$ {totais.vendas.toLocaleString()}</p>
        <p>🛒 <strong>Compras:</strong> R$ {totais.compras.toLocaleString()}</p>
        <p>🎁 <strong>Bônus:</strong> R$ {totais.bonus.toLocaleString()}</p>
        <hr className="my-2" />
        <p className="text-base font-semibold">📈 <strong>Saldo Atual:</strong> R$ {totais.saldo.toLocaleString()}</p>
      </div>
    </div>
  )
}
