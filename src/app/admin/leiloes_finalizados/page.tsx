'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

export default function LeiloesFinalizadosPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [leiloes, setLeiloes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroTime, setFiltroTime] = useState('')

  useEffect(() => {
    const verificarAdmin = async () => {
      const emailUsuario = localStorage.getItem('email')?.toLowerCase() || ''
      if (!emailUsuario) {
        setIsAdmin(false)
        return
      }

      const { data, error } = await supabase
        .from('admins')
        .select('email')
        .eq('email', emailUsuario)
        .single()

      if (error || !data) {
        setIsAdmin(false)
        return
      }

      setIsAdmin(true)
    }

    verificarAdmin()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      buscarLeiloesFinalizados()
    } else {
      setCarregando(false)
    }
  }, [isAdmin])

  const buscarLeiloesFinalizados = async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'leiloado')
      .order('fim', { ascending: false })

    if (!error) setLeiloes(data || [])
    else console.error('Erro ao buscar leilões finalizados:', error)

    setCarregando(false)
  }

  const enviarParaElenco = async (leilao: any) => {
    if (!leilao.id_time_vencedor) {
      alert('❌ Este leilão não possui time vencedor.')
      return
    }

    const salario = Math.round(leilao.valor_atual * 0.007)

    const { error: erroInsert } = await supabase.from('elenco').insert({
      id_time: leilao.id_time_vencedor,
      nome: leilao.nome,
      posicao: leilao.posicao,
      overall: leilao.overall,
      valor: leilao.valor_atual,
      salario,
      imagem_url: leilao.imagem_url || '',
      link_sofifa: leilao.link_sofifa || '',
      nacionalidade: leilao.nacionalidade || '',
      jogos: 0
    })

    if (erroInsert) {
      console.error('❌ Erro ao enviar para elenco:', erroInsert)
      alert(`❌ Erro ao enviar para elenco:\n${erroInsert.message}`)
      return
    }

    const { data: timeData, error: errorBusca } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', leilao.id_time_vencedor)
      .single()

    if (errorBusca || !timeData) {
      console.error('❌ Erro ao buscar saldo:', errorBusca)
      alert('Erro ao buscar saldo do time.')
      return
    }

    await supabase
      .from('times')
      .update({ saldo: timeData.saldo - leilao.valor_atual })
      .eq('id', leilao.id_time_vencedor)

    await supabase
      .from('leiloes_sistema')
      .update({ status: 'concluido' })
      .eq('id', leilao.id)

    alert('✅ Jogador enviado ao elenco e saldo debitado!')
    location.reload()
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

  if (isAdmin === null) {
    return <p className="text-center mt-10 text-white">Verificando permissão...</p>
  }

  if (isAdmin === false) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center text-red-500 text-xl font-semibold">
        🚫 Você não tem permissão para acessar esta página.
      </main>
    )
  }

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
              <option key={pos} value={pos}>{pos}</option>
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
            onClick={() => { setFiltroPosicao(''); setFiltroTime('') }}
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
                <p className="font-bold text-lg">{leilao.nome} ({leilao.posicao})</p>
                <p className="text-gray-300">⭐ Overall: {leilao.overall}</p>
                <p className="text-gray-300">🌍 {leilao.nacionalidade}</p>
                <p className="text-yellow-400">💰 R$ {Number(leilao.valor_atual).toLocaleString()}</p>
                <p className="text-gray-300">🏆 {leilao.nome_time_vencedor || '— Sem Vencedor'}</p>
                <p className="text-xs text-gray-400 mt-1">🕒 {new Date(leilao.fim).toLocaleString('pt-BR')}</p>

                {leilao.link_sofifa && (
                  <a href={leilao.link_sofifa} target="_blank" className="text-blue-400 text-sm mt-2 inline-block hover:underline">
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
