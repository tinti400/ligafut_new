'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const bandeiras: Record<string, string> = {
  Brasil: 'br', Argentina: 'ar', Portugal: 'pt', Espanha: 'es', França: 'fr',
  Inglaterra: 'gb', Alemanha: 'de', Itália: 'it', Holanda: 'nl', Bélgica: 'be',
  Uruguai: 'uy', Chile: 'cl', Colômbia: 'co', México: 'mx', Estados_Unidos: 'us',
  Canadá: 'ca', Paraguai: 'py', Peru: 'pe', Equador: 'ec', Bolívia: 'bo',
  Venezuela: 've', Congo: 'cg', Guiana: 'gy', Suriname: 'sr', Honduras: 'hn',
  Nicarágua: 'ni', Guatemala: 'gt', Costa_Rica: 'cr', Panamá: 'pa', Jamaica: 'jm',
  Camarões: 'cm', Senegal: 'sn', Marrocos: 'ma', Egito: 'eg', Argélia: 'dz',
  Croácia: 'hr', Sérvia: 'rs', Suíça: 'ch', Polônia: 'pl', Rússia: 'ru',
  Japão: 'jp', Coreia_do_Sul: 'kr', Austrália: 'au'
}

interface TimeInfo {
  id: string
  nome: string
  logo_url: string
  saldo: number
  gasto: number
  recebido: number
  media_overall: number
  qtd_jogadores: number
  salario_total: number
  saldo_anterior: number
  nacionalidades: Record<string, number>
}

interface RegistroBID {
  valor: number
  tipo_evento: string
  data_evento: string
  id_time1?: string
  id_time2?: string
}

export default function PainelTimesAdmin() {
  const [times, setTimes] = useState<TimeInfo[]>([])
  const [filtroNome, setFiltroNome] = useState('')
  const [ordenacao, setOrdenacao] = useState<'nome' | 'saldo' | 'salario_total'>('nome')

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    const { data: timesData } = await supabase
      .from('times')
      .select('id, nome, saldo, logo_url')

    if (!timesData) return

    const hoje = new Date().toISOString().split('T')[0]

    const timesComDados = await Promise.all(timesData.map(async (time) => {
      const { data: elenco } = await supabase
        .from('elenco')
        .select('overall, salario, nacionalidade')
        .eq('id_time', time.id)

      const qtdJogadores = elenco?.length || 0

      const mediaOverall = elenco && elenco.length > 0
        ? elenco.reduce((acc, j) => acc + (j.overall || 0), 0) / elenco.length
        : 0

      const salarioTotal = elenco?.reduce((acc, j) => acc + (j.salario || 0), 0) || 0

      const nacionalidades: Record<string, number> = {}
      elenco?.forEach(j => {
        const nac = j.nacionalidade || 'Outro'
        nacionalidades[nac] = (nacionalidades[nac] || 0) + 1
      })

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

      const { data: movsAnteriores } = await supabase
        .from('bid')
        .select('valor, tipo_evento, data_evento, id_time1, id_time2')
        .or(`id_time1.eq.${time.id},id_time2.eq.${time.id}`)

      const saldoAnterior = movsAnteriores?.reduce((acc: number, m: RegistroBID) => {
        if (!m.data_evento || m.data_evento >= hoje) return acc
        const valor = m.valor || 0
        const tipo = m.tipo_evento

        if (m.id_time1 === time.id) {
          if (['venda', 'bonus', 'bonus_gol', 'receita_partida'].includes(tipo)) return acc + valor
          if (['salario', 'despesas'].includes(tipo)) return acc - valor
        } else if (m.id_time2 === time.id) {
          if (['compra', 'leilao'].includes(tipo)) return acc - valor
        }
        return acc
      }, 0) || 0

      return {
        id: time.id,
        nome: time.nome,
        logo_url: time.logo_url,
        saldo: time.saldo,
        gasto,
        recebido,
        media_overall: Math.round(mediaOverall),
        qtd_jogadores: qtdJogadores,
        salario_total: salarioTotal,
        saldo_anterior: saldoAnterior,
        nacionalidades
      }
    }))

    setTimes(timesComDados)
  }

  function formatarValor(valor: number) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function exportarCSV() {
    if (times.length === 0) return

    const header = Object.keys(times[0]).join(',')
    const rows = times.map(obj => Object.values(obj).join(',')).join('\n')
    const csvContent = `${header}\n${rows}`

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
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
      if (ordenacao === 'saldo') return b.saldo - a.saldo
      if (ordenacao === 'salario_total') return b.salario_total - a.salario_total
      return 0
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
          <option value="salario_total">Ordenar por Salário Total</option>
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
            <th className="border p-2">Saldo Antes</th>
            <th className="border p-2">Saldo Agora</th>
            <th className="border p-2">Gasto</th>
            <th className="border p-2">Recebido</th>
            <th className="border p-2">Média Overall</th>
            <th className="border p-2"># Jogadores</th>
            <th className="border p-2">Salário Total</th>
            <th className="border p-2">Nacionalidades</th>
          </tr>
        </thead>
        <tbody>
          {timesFiltrados.map((time) => (
            <tr key={time.id} className="text-center">
              <td className="border p-2">
                <img src={time.logo_url} alt="Logo" className="h-6 mx-auto" />
              </td>
              <td className="border p-2">{time.nome}</td>
              <td className="border p-2">{formatarValor(time.saldo_anterior)}</td>
              <td className="border p-2">{formatarValor(time.saldo)}</td>
              <td className="border p-2">{formatarValor(time.gasto)}</td>
              <td className="border p-2">{formatarValor(time.recebido)}</td>
              <td className="border p-2">{time.media_overall}</td>
              <td className="border p-2">{time.qtd_jogadores}</td>
              <td className="border p-2">{formatarValor(time.salario_total)}</td>
              <td className="border p-2">
                <div className="flex flex-wrap justify-center gap-1">
                  {Object.entries(time.nacionalidades).map(([nac, qtd]) => {
                    const codigo = bandeiras[nac] || ''
                    return (
                      <div key={nac} title={`${nac}: ${qtd}`} className="flex items-center gap-1">
                        {codigo && (
                          <img
                            src={`https://flagcdn.com/w20/${codigo}.png`}
                            alt={nac}
                            className="w-5 h-3"
                          />
                        )}
                        <span className="text-xs">{qtd}</span>
                      </div>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
