'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Movimentacao {
  id: string
  id_time: string
  tipo: 'entrada' | 'saida'
  descricao: string
  valor: number
  data: string
}

interface EventoBID {
  id: string
  id_time1: string // Time que gastou (comprou)
  id_time2: string | null // Time que vendeu (pode ser null)
  valor: number | null
  tipo_evento: string // 'compra' ou 'venda'
  data_evento: string
}

export default function PainelFinanceiroPage() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([])
  const [compras, setCompras] = useState<number>(0)
  const [vendas, setVendas] = useState<number>(0)
  const [saldo, setSaldo] = useState<number>(0)
  const [idTime, setIdTime] = useState<string>('')

  useEffect(() => {
    const id_time = localStorage.getItem('id_time') || ''
    setIdTime(id_time)
    if (!id_time) return
    buscarMovimentacoes(id_time)
    buscarBID(id_time)
  }, [])

  async function buscarMovimentacoes(id_time: string) {
    const { data, error } = await supabase
      .from('movimentacoes')
      .select('*')
      .eq('id_time', id_time)

    if (error) {
      console.error('Erro ao buscar movimentações:', error)
      return
    }

    setMovimentacoes(data as Movimentacao[])

    const saldoAtual = data?.reduce((acc: number, mov: Movimentacao) => {
      return mov.tipo === 'entrada' ? acc + mov.valor : acc - mov.valor
    }, 0)

    setSaldo(saldoAtual)
  }

  async function buscarBID(id_time: string) {
    const { data, error } = await supabase
      .from('BID')
      .select('*')
      .or(`id_time1.eq.${id_time},id_time2.eq.${id_time}`)

    if (error) {
      console.error('Erro ao buscar BID:', error)
      return
    }

    const eventos = data as EventoBID[]

    const totalCompras = eventos
      .filter((e) => e.id_time1 === id_time && e.valor && e.tipo_evento === 'compra')
      .reduce((acc, e) => acc + (e.valor || 0), 0)

    const totalVendas = eventos
      .filter((e) => e.id_time2 === id_time && e.valor && e.tipo_evento === 'venda')
      .reduce((acc, e) => acc + (e.valor || 0), 0)

    setCompras(totalCompras)
    setVendas(totalVendas)
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">💰 Painel Financeiro</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-red-100 p-4 rounded text-center">
          <p className="text-lg font-semibold">Total em Compras</p>
          <p className="text-2xl text-red-600 font-bold">- R$ {compras.toLocaleString('pt-BR')}</p>
        </div>

        <div className="bg-green-100 p-4 rounded text-center">
          <p className="text-lg font-semibold">Total em Vendas</p>
          <p className="text-2xl text-green-600 font-bold">+ R$ {vendas.toLocaleString('pt-BR')}</p>
        </div>

        <div className="bg-blue-100 p-4 rounded text-center">
          <p className="text-lg font-semibold">Saldo Atual</p>
          <p className="text-2xl text-blue-600 font-bold">R$ {saldo.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-2">Histórico de Movimentações</h2>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Data</th>
            <th className="border p-2">Descrição</th>
            <th className="border p-2">Tipo</th>
            <th className="border p-2">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {movimentacoes.map((mov) => (
            <tr key={mov.id}>
              <td className="border p-2">{new Date(mov.data).toLocaleDateString()}</td>
              <td className="border p-2">{mov.descricao}</td>
              <td className="border p-2">{mov.tipo}</td>
              <td className="border p-2 text-right">{mov.valor.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
