'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface TimeInfo {
  id: string
  nome: string
  logo_url: string
  saldo: number
  gasto: number
  recebido: number
  media_overall: number
  qtd_jogadores: number
}

export default function PainelTimesAdmin() {
  const [times, setTimes] = useState<TimeInfo[]>([])
  const [filtroNome, setFiltroNome] = useState('')
  const [ordenacao, setOrdenacao] = useState<'nome' | 'saldo'>('nome')

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    const { data: timesData } = await supabase
      .from('times')
      .select('id, nome, saldo, logo_url')

    if (!timesData) return

    const timesComDados = await Promise.all(timesData.map(async (time) => {
      const { data: elenco } = await supabase
        .from('elenco')
        .select('overall')
        .eq('id_time', time.id)

      const qtdJogadores = elenco?.length || 0
      const mediaOverall = elenco && elenco.length > 0
        ? elenco.reduce((acc, j) => acc + (j.overall || 0), 0) / elenco.length
        : 0

      const { data: movsCompra } = await supabase
        .from('movimentacoes')
        .select('valor')
        .eq('id_time', time.id)
        .eq('tipo', 'compra')

      const gasto = movsCompra?.reduce((acc, m) => acc + (m.valor || 0), 0) || 0

      const { data: movsVenda } = await supabase
        .from('movimentacoes')
        .select('valor')
        .eq('id_time', time.id)
        .eq('tipo', 'venda')

      const recebido = movsVenda?.reduce((acc, m) => acc + (m.valor || 0), 0) || 0

      return {
        id: time.id,
        nome: time.nome,
        logo_url: time.logo_url,
        saldo: time.saldo,
        gasto,
        recebido,
        media_overall: Math.round(mediaOverall),
        qtd_jogadores: qtdJogadores
      }
    }))

    setTimes(timesComDados)
  }

  function formatarValor(valor: number) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function exportarCSV() {
    const csv = Papa.unparse(times)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'times_ligafut.csv'
    link.click()
  }

  const timesFiltrados = times
    .filter(t => t.nome.toLowerCase().includes(filtroNome.toLowerCase()))
    .sort((a, b) => {
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome)
      return b.saldo - a.saldo
    })

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">📊 Painel de Times - Admin</h1>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          placeholder="Filtrar por nome..."
          className="border p-2 rounded w-1/2"
        />

        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as any)}
          className="border p-2 rounded"
        >
          <option value="nome">Ordenar por Nome</option>
          <option value="saldo">Ordenar por Saldo</option>
        </select>

        <button
          onClick={exportarCSV}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          📥 Exportar CSV
        </button>
      </div>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100 text-center">
            <th className="border p-2">Logo</th>
            <th className="border p-2">Nome</th>
            <th className="border p-2">Saldo</th>
            <th className="border p-2">Gasto</th>
            <th className="border p-2">Recebido</th>
            <th className="border p-2">Média Overall</th>
            <th className="border p-2"># Jogadores</th>
          </tr>
        </thead>
        <tbody>
          {timesFiltrados.map((time) => (
            <tr key={time.id} className="text-center">
              <td className="border p-2">
                <img src={time.logo_url} alt="Logo" className="h-6 mx-auto" />
              </td>
              <td className="border p-2">{time.nome}</td>
              <td className="border p-2">{formatarValor(time.saldo)}</td>
              <td className="border p-2">{formatarValor(time.gasto)}</td>
              <td className="border p-2">{formatarValor(time.recebido)}</td>
              <td className="border p-2">{time.media_overall}</td>
              <td className="border p-2">{time.qtd_jogadores}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
