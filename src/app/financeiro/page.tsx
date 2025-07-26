'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import useSession from '@/hooks/useSession'
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

interface TimeOption {
  id: string
  nome: string
}

export default function FinanceiroPage() {
  const { session, loading: carregandoSession } = useSession()
  const [movs, setMovs] = useState<Movimentacao[]>([])
  const [saldoAtual, setSaldoAtual] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [totalLeiloes, setTotalLeiloes] = useState(0)
  const [times, setTimes] = useState<TimeOption[]>([])
  const [idSelecionado, setIdSelecionado] = useState<string>('')
  const [nomeSelecionado, setNomeSelecionado] = useState<string>('')

  const isAdmin = session?.isAdmin
  const idTime = isAdmin ? idSelecionado : session?.idTime
  const nomeTime = isAdmin ? nomeSelecionado : session?.nomeTime

  useEffect(() => {
    if (isAdmin) carregarTimes()
  }, [isAdmin])

  useEffect(() => {
    if (!carregandoSession && idTime) {
      carregarDados()
    }
  }, [carregandoSession, idTime])

  async function carregarTimes() {
    const { data } = await supabase.from('times').select('id, nome').order('nome', { ascending: true })
    setTimes(data || [])
  }

  async function carregarDados() {
    setLoading(true)

    const { data: timeData } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()

    setSaldoAtual(timeData?.saldo || 0)

    const { data: movimentacoes } = await supabase
      .from('movimentacoes_financeiras')
      .select('*')
      .eq('id_time', idTime)
      .order('data', { ascending: false })

    setMovs(movimentacoes || [])

    const { data: leiloes } = await supabase
      .from('movimentacoes')
      .select('valor')
      .eq('id_time', idTime)
      .eq('categoria', 'leilao')
      .eq('tipo', 'compra')

    const total = leiloes?.reduce((acc, item) => acc + Math.abs(item.valor || 0), 0) || 0
    setTotalLeiloes(total)

    setLoading(false)
  }

  if (carregandoSession || loading || !session || !idTime) {
    return <Loading />
  }

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

  function somar(palavra: string) {
    return movs
      .filter((m) => m.descricao?.toLowerCase().includes(palavra))
      .reduce((acc, m) => acc + (m.valor || 0), 0)
  }

  const totais = {
    compras: somar('compra de'),
    vendas: somar('venda de'),
    salario: somar('pagamento de sal'),
    bonus: somar('bônus de gols'),
    premiacao: somar('premiação por resultado')
  }

  const totalGeral =
    totais.vendas +
    totais.bonus +
    totais.premiacao -
    totais.salario -
    totais.compras -
    totalLeiloes

  return (
    <div className="p-6 max-w-6xl mx-auto text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">📊 Extrato Financeiro</h1>

      {isAdmin && (
        <div className="mb-6 flex gap-4 items-center justify-center">
          <select
            className="bg-zinc-800 p-2 rounded text-white border border-gray-600"
            value={idSelecionado}
            onChange={(e) => {
              const selectedId = e.target.value
              setIdSelecionado(selectedId)
              const nome = times.find((t) => t.id === selectedId)?.nome || ''
              setNomeSelecionado(nome)
            }}
          >
            <option value="">Selecione um time</option>
            {times.map((time) => (
              <option key={time.id} value={time.id}>{time.nome}</option>
            ))}
          </select>
          <button
            onClick={carregarDados}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Ver Extrato
          </button>
        </div>
      )}

      {idTime && (
        <>
          <h2 className="text-xl mb-4 text-center">Time: <span className="text-yellow-300">{nomeTime}</span></h2>

          <div className="bg-zinc-900 p-4 rounded-lg shadow-md mb-6">
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-base">
              <li>🛒 Compras: <span className="text-red-500">{formatarValor(totais.compras, true)}</span></li>
              <li>📤 Vendas: <span className="text-green-400">{formatarValor(totais.vendas)}</span></li>
              <li>📣 Leilões: <span className="text-red-500">{formatarValor(totalLeiloes, true)}</span></li>
              <li>🥅 Bônus: <span className="text-green-400">{formatarValor(totais.bonus)}</span></li>
              <li>🏆 Premiações: <span className="text-green-400">{formatarValor(totais.premiacao)}</span></li>
              <li>💼 Salários: <span className="text-red-500">{formatarValor(totais.salario, true)}</span></li>
            </ul>
            <p className="mt-4 text-xl">
              💰 Total Geral:{' '}
              <span className={totalGeral >= 0 ? 'text-green-400' : 'text-red-500'}>
                {formatarValor(totalGeral, totalGeral < 0)}
              </span>
            </p>
            <p className="text-sm text-gray-400">📦 Saldo atual: {formatarValor(saldoAtual)}</p>
          </div>

          <table className="w-full text-sm table-auto border-collapse border border-gray-700">
            <thead className="bg-zinc-800">
              <tr>
                <th className="p-2 border border-gray-700">📅 Data</th>
                <th className="p-2 border border-gray-700">📌 Tipo</th>
                <th className="p-2 border border-gray-700">📝 Descrição</th>
                <th className="p-2 border border-gray-700">💸 Valor</th>
                <th className="p-2 border border-gray-700">📦 Anterior</th>
                <th className="p-2 border border-gray-700">💰 Atual</th>
              </tr>
            </thead>
            <tbody>
              {extrato.map((mov, idx) => (
                <tr key={idx} className="text-center border-t border-gray-800">
                  <td className="p-2">{new Date(mov.data).toLocaleString('pt-BR')}</td>
                  <td className="p-2 capitalize">{mov.tipo}</td>
                  <td className="p-2">{mov.descricao}</td>
                  <td className={`p-2 ${mov.tipo === 'saida' ? 'text-red-500' : 'text-green-400'}`}>
                    {formatarValor(mov.valor, mov.tipo === 'saida')}
                  </td>
                  <td className="p-2">{formatarValor(mov.caixa_anterior)}</td>
                  <td className="p-2">{formatarValor(mov.caixa_atual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}




