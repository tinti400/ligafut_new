'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSession } from '@/hooks/useSession'
import { formatarValor } from '@/utils/formatarValor'
import Loading from '@/components/Loading'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Movimentacao {
  data: string
  tipo: string
  descricao: string
  valor: number
}

export default function FinanceiroPage() {
  const { usuario, idTime, isAdmin, nomeTime } = useSession()
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [saldoAtual, setSaldoAtual] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (idTime) carregarDados()
  }, [idTime])

  async function carregarDados() {
    setLoading(true)

    // Saldo atual
    const { data: timeData } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()
    setSaldoAtual(timeData?.saldo || 0)

    // Movimentações
    const { data: movimentacoes } = await supabase
      .from('movimentacoes_financeiras')
      .select('*')
      .eq('id_time', idTime)
      .order('data', { ascending: false })

    setMovs(movimentacoes || [])
    setLoading(false)
  }

  if (loading) return <Loading />

  let saldo = saldoAtual
  const extrato = movs.map((mov) => {
    const valor = mov.valor || 0
    const anterior = saldo - (mov.tipo === 'entrada' ? valor : -valor)
    const atual = saldo
    saldo = anterior

    return {
      ...mov,
      caixa_anterior: anterior,
      caixa_atual: atual
    }
  })

  const totais = {
    compras: somar('compra de'),
    vendas: somar('venda de'),
    leiloes: somarPersonalizado('leilao', 'compra'),
    salario: somar('pagamento de salário'),
    bonus: somar('bônus de gols'),
    premiacao: somar('premiação por resultado')
  }

  function somar(palavra: string) {
    return movs
      .filter((m) => m.descricao?.toLowerCase().includes(palavra))
      .reduce((acc, m) => acc + (m.valor || 0), 0)
  }

  async function somarPersonalizado(categoria: string, tipo: string) {
    const { data } = await supabase
      .from('movimentacoes')
      .select('valor')
      .eq('id_time', idTime)
      .eq('categoria', categoria)
      .eq('tipo', tipo)

    return data?.reduce((acc: number, item: any) => acc + Math.abs(item.valor || 0), 0) || 0
  }

  const totalGeral =
    totais.vendas +
    totais.bonus +
    totais.premiacao -
    totais.salario -
    totais.compras -
    totais.leiloes

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📊 Extrato Financeiro - {nomeTime}</h1>

      <div className="bg-white p-4 rounded shadow-md mb-6">
        <ul className="space-y-2 text-lg">
          <li>🛒 Compras: <span className="text-red-500">{formatarValor(totais.compras, true)}</span></li>
          <li>📤 Vendas: <span className="text-green-600">{formatarValor(totais.vendas)}</span></li>
          <li>📣 Leilões: <span className="text-red-500">{formatarValor(totais.leiloes, true)}</span></li>
          <li>🥅 Bônus: <span className="text-green-600">{formatarValor(totais.bonus)}</span></li>
          <li>🏆 Premiações: <span className="text-green-600">{formatarValor(totais.premiacao)}</span></li>
          <li>💼 Salários: <span className="text-red-500">{formatarValor(totais.salario, true)}</span></li>
        </ul>
        <p className="mt-4 text-xl">
          💰 Total Geral:{" "}
          <span className={totalGeral >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatarValor(totalGeral, totalGeral < 0)}
          </span>
        </p>
        <p className="text-sm text-gray-600">📦 Saldo atual: {formatarValor(saldoAtual)}</p>
      </div>

      <table className="w-full table-auto text-sm border">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-2">📅 Data</th>
            <th className="p-2">📌 Tipo</th>
            <th className="p-2">📝 Descrição</th>
            <th className="p-2">💸 Valor</th>
            <th className="p-2">📦 Caixa Anterior</th>
            <th className="p-2">💰 Caixa Atual</th>
          </tr>
        </thead>
        <tbody>
          {extrato.map((mov, idx) => (
            <tr key={idx} className="border-t">
              <td className="p-2">{new Date(mov.data).toLocaleString()}</td>
              <td className="p-2">{mov.tipo}</td>
              <td className="p-2">{mov.descricao}</td>
              <td className="p-2">{formatarValor(mov.valor, mov.tipo === 'saida')}</td>
              <td className="p-2">{formatarValor(mov.caixa_anterior)}</td>
              <td className="p-2">{formatarValor(mov.caixa_atual)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
