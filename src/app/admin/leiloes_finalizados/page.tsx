'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LeiloesFinalizadosPage() {
  const [leiloes, setLeiloes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroTime, setFiltroTime] = useState('')

  const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

  useEffect(() => {
    const buscarLeiloesFinalizados = async () => {
      const { data, error } = await supabase
        .from('leiloes_sistema')
        .select('*')
        .eq('status', 'leiloado')
        .order('fim', { ascending: false })

      if (!error) setLeiloes(data || [])
      else console.error('Erro ao buscar leilões finalizados:', error)

      setCarregando(false)
    }

    buscarLeiloesFinalizados()
  }, [])

  const enviarParaElenco = async (leilao: any) => {
    if (!leilao.id_time_vencedor) {
      alert('❌ Este leilão não possui time vencedor.')
      return
    }

    const salario = Math.round(leilao.valor_atual * 0.007)

    const { error: erroElenco } = await supabase
      .from('elenco')
      .insert({
        id_time: leilao.id_time_vencedor,
        nome: leilao.nome,
        posicao: leilao.posicao,
        overall: leilao.overall,
        valor: leilao.valor_atual,
        salario,
        imagem_url: leilao.imagem_url || '',
        link_sofifa: leilao.link_sofifa || '',
        nacionalidade: leilao.nacionalidade || ''
      })

    if (erroElenco) {
      console.error('Erro ao enviar para elenco:', erroElenco.message)
      alert('Erro ao enviar para elenco.')
      return
    }

    await supabase.rpc('atualizar_saldo_time', {
      p_id_time: leilao.id_time_vencedor,
      p_valor: -Math.abs(leilao.valor_atual)
    })

    await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)

    setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))

    alert('✅ Jogador enviado ao elenco com sucesso!')
  }

  const excluirLeilao = async (leilao: any) => {
    if (!confirm('❗ Tem certeza que deseja excluir este leilão?')) return
    await supabase.from('leiloes_sistema').delete().eq('id', leilao.id)
    setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))
    alert('✅ Leilão excluído com sucesso!')
  }

  const leiloesFiltrados = leiloes.filter((leilao) => {
    const matchPosicao = filtroPosicao ? leilao.posicao === filtroPosicao : true
    const matchTime = filtroTime
      ? leilao.nome_time_vencedor?.toLowerCase().includes(filtroTime.toLowerCase())
      : true
    return matchPosicao && matchTime
  })

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto bg-gray-800 shadow-xl rounded-xl p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-green-400">📜 Leilões Finalizados</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <select
            className="p-2 border rounded text-black"
            value={filtroPosicao}
            onChange={(e) => setFiltroPosicao(e.target.value)}
          >
            <option value="">📌 Todas as Posições</option>
            {POSICOES.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="🔍 Buscar por Time Vencedor"
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="p-2 border rounded text-black"
          />
          <button
            onClick={() => {
              setFiltroPosicao('')
              setFiltroTime('')
            }}
            className="bg-gray-300 hover:bg-gray-400 text-black py-2 px-4 rounded"
          >
            ❌ Limpar Filtros
          </button>
        </div>

        {carregando ? (
          <p className="text-center text-gray-400">⏳ Carregando...</p>
        ) : leiloesFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 italic">Nenhum leilão encontrado com os filtros.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leiloesFiltrados.map((leilao) => (
              <div key={leilao.id} className="border rounded p-4 shadow bg-gray-700 hover:bg-gray-600 transition">
                {leilao.imagem_url && (
                  <img
                    src={leilao.imagem_url}
                    alt={leilao.nome}
                    className="w-full h-48 object-cover rounded mb-2 border"
                  />
                )}
                <p className="font-bold text-lg text-white">{leilao.nome} ({leilao.posicao})</p>
                <p className="text-gray-300">⭐ Overall: {leilao.overall}</p>
                <p className="text-gray-300">🌍 {leilao.nacionalidade}</p>
                <p className="text-yellow-400">💰 Valor final: <strong>R$ {Number(leilao.valor_atual).toLocaleString()}</strong></p>
                <p className="text-gray-300">🏆 Time vencedor: <strong>{leilao.id_time_vencedor ? leilao.nome_time_vencedor : '— Sem Vencedor'}</strong></p>
                <p className="text-xs text-gray-400 mt-1">
                  🕒 Finalizado em: {new Date(leilao.fim).toLocaleString('pt-BR')}
                </p>
                {leilao.link_sofifa && (
                  <a
                    href={leilao.link_sofifa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm mt-2 inline-block hover:underline"
                  >
                    🔗 Ver no Sofifa
                  </a>
                )}
                {leilao.id_time_vencedor ? (
                  <button
                    onClick={() => enviarParaElenco(leilao)}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
                  >
                    ➕ Enviar para Elenco
                  </button>
                ) : (
                  <button
                    onClick={() => excluirLeilao(leilao)}
                    className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
                  >
                    🗑️ Excluir Leilão
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

