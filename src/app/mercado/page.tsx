'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function MercadoPage() {
  const router = useRouter()
  const { isAdmin } = useAdmin()
  const [jogadores, setJogadores] = useState<any[]>([])
  const [saldo, setSaldo] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])

  const [filtroNome, setFiltroNome] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroOverallMin, setFiltroOverallMin] = useState(0)
  const [filtroOverallMax, setFiltroOverallMax] = useState(99)
  const [filtroValorMax, setFiltroValorMax] = useState(Infinity)
  const [ordenarPor, setOrdenarPor] = useState('')

  const [paginaAtual, setPaginaAtual] = useState(1)
  const jogadoresPorPagina = 40

  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (!userStorage) {
      router.push('/login')
      return
    }

    const userData = JSON.parse(userStorage)
    setUser(userData)

    const carregarDados = async () => {
      const [resMercado, resTime] = await Promise.all([
        supabase.from('mercado_transferencias').select('*'),
        supabase.from('times').select('saldo').eq('id', userData.id_time).single()
      ])

      if (resMercado.data) setJogadores(resMercado.data)
      if (resTime.data) setSaldo(resTime.data.saldo)
    }

    carregarDados()
  }, [router])

  const comprarJogador = async (jogador: any) => {
    if (!user) return

    const confirmar = confirm(`Deseja comprar ${jogador.nome} por R$${jogador.valor.toLocaleString()}?`)
    if (!confirmar) return

    if (jogador.valor > saldo) {
      alert('Saldo insuficiente!')
      return
    }

    const salario = Math.round(jogador.valor * 0.007)

    const { error: errorInsert } = await supabase.from('elenco').insert({
      id_time: user.id_time,
      nome: jogador.nome,
      posicao: jogador.posicao,
      overall: jogador.overall,
      valor: jogador.valor,
      imagem_url: jogador.imagem_url,
      salario: salario,
      jogos: 0,
      link_sofifa: jogador.link_sofifa || ''
    })

    if (errorInsert) {
      console.error('❌ Erro ao inserir no elenco:', errorInsert)
      alert('❌ Erro ao inserir o jogador no elenco.')
      return
    }

    await supabase.from('mercado_transferencias').delete().eq('id', jogador.id)

    await supabase.from('times').update({
      saldo: saldo - jogador.valor
    }).eq('id', user.id_time)

    alert('✅ Jogador comprado com sucesso!')
    location.reload()
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((sel) => sel !== id) : [...prev, id]
    )
  }

  const excluirSelecionados = async () => {
    if (!confirm('⚠️ Tem certeza que deseja excluir os jogadores selecionados?')) return

    await supabase.from('mercado_transferencias').delete().in('id', selecionados)
    alert('✅ Jogadores excluídos com sucesso!')
    location.reload()
  }

  const atualizarPreco = async (jogadorId: string, novoValor: number) => {
    await supabase.from('mercado_transferencias').update({ valor: novoValor }).eq('id', jogadorId)
    alert('✅ Valor atualizado!')
    location.reload()
  }

  if (!user) return <p className="text-center mt-10 text-white">🔒 Carregando sessão...</p>

  const jogadoresFiltrados = jogadores
    .filter((j) => {
      const nomeMatch = j.nome.toLowerCase().includes(filtroNome.toLowerCase())
      const posicaoMatch = filtroPosicao ? j.posicao === filtroPosicao : true
      const overallMatch = j.overall >= filtroOverallMin && j.overall <= filtroOverallMax
      const valorMatch = j.valor <= filtroValorMax
      return nomeMatch && posicaoMatch && overallMatch && valorMatch
    })
    .sort((a, b) => {
      if (ordenarPor === 'valor_asc') return a.valor - b.valor
      if (ordenarPor === 'valor_desc') return b.valor - a.valor
      if (ordenarPor === 'overall_asc') return a.overall - b.overall
      if (ordenarPor === 'overall_desc') return b.overall - a.overall
      return 0
    })

  const indexOfLastJogador = paginaAtual * jogadoresPorPagina
  const indexOfFirstJogador = indexOfLastJogador - jogadoresPorPagina
  const jogadoresPaginados = jogadoresFiltrados.slice(indexOfFirstJogador, indexOfLastJogador)
  const totalPaginas = Math.ceil(jogadoresFiltrados.length / jogadoresPorPagina)

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-green-400">🛒 Mercado de Transferências</h1>

      {isAdmin && (
        <button
          onClick={excluirSelecionados}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mb-4"
        >
          🗑️ Excluir Selecionados ({selecionados.length})
        </button>
      )}

      {totalPaginas > 1 && (
        <div className="flex justify-center mb-6 gap-2">
          {Array.from({ length: totalPaginas }, (_, i) => (
            <button
              key={i}
              onClick={() => setPaginaAtual(i + 1)}
              className={`px-3 py-1 rounded ${paginaAtual === i + 1 ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <input type="text" placeholder="🔎 Buscar por nome" value={filtroNome} onChange={(e) => setFiltroNome(e.target.value)}
          className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white" />

        <select value={filtroPosicao} onChange={(e) => setFiltroPosicao(e.target.value)}
          className="p-2 border rounded bg-gray-800 border-gray-600 text-white">
          <option value="">Todas as posições</option>
          <option value="GL">Goleiro</option>
          <option value="ZAG">Zagueiro</option>
          <option value="LE">Lateral Esquerdo</option>
          <option value="LD">Lateral Direito</option>
          <option value="VOL">Volante</option>
          <option value="MC">Meio Campo</option>
          <option value="MD">Meia Direita</option>
          <option value="ME">Meia Esquerda</option>
          <option value="PD">Ponta Direita</option>
          <option value="PE">Ponta Esquerda</option>
          <option value="SA">Segundo Atacante</option>
          <option value="CA">Centroavante</option>
        </select>

        <div className="flex gap-2 items-center">
          <input type="number" placeholder="Overall mín" value={filtroOverallMin} onChange={(e) => setFiltroOverallMin(Number(e.target.value))}
            className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white" />
          <input type="number" placeholder="máx" value={filtroOverallMax} onChange={(e) => setFiltroOverallMax(Number(e.target.value))}
            className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white" />
        </div>

        <input type="number" placeholder="💰 Valor máx (R$)" onChange={(e) => setFiltroValorMax(Number(e.target.value) || Infinity)}
          className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white" />

        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}
          className="p-2 border rounded bg-gray-800 border-gray-600 text-white">
          <option value="">Ordenar...</option>
          <option value="valor_asc">Valor ↑</option>
          <option value="valor_desc">Valor ↓</option>
          <option value="overall_asc">Overall ↑</option>
          <option value="overall_desc">Overall ↓</option>
        </select>

        <div className="font-semibold text-green-400 col-span-full text-right">
          💰 Saldo: R${saldo.toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {jogadoresPaginados.map((jogador) => (
          <div key={jogador.id} className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700">
            <ImagemComFallback src={jogador.imagem_url} alt={jogador.nome} width={80} height={80} className="rounded-full mb-2 mx-auto" />
            <h2 className="text-lg font-bold">{jogador.nome}</h2>
            <p className="text-gray-300 text-sm">{jogador.posicao} • Overall {jogador.overall}</p>
            <p className="text-green-400 font-semibold">💰 R$ {jogador.valor.toLocaleString()}</p>
            <p className="text-gray-400 text-xs">Salário: R${(jogador.salario || 0).toLocaleString()}</p>

            {isAdmin && (
              <>
                <label className="text-xs">💰 Alterar Preço (R$):</label>
                <input type="number" defaultValue={jogador.valor}
                  onBlur={(e) => atualizarPreco(jogador.id, Number(e.target.value))}
                  className="w-full p-1 mt-1 rounded text-black text-center" />
                <label className="flex items-center gap-1 mt-2 text-xs">
                  <input type="checkbox" checked={selecionados.includes(jogador.id)}
                    onChange={() => toggleSelecionado(jogador.id)} />
                  Selecionar para excluir
                </label>
              </>
            )}

            <button onClick={() => comprarJogador(jogador)}
              className="mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-full text-sm w-full">
              Comprar
            </button>
          </div>
        ))}
      </div>

      {jogadoresFiltrados.length === 0 && (
        <p className="mt-10 text-center text-gray-400">Nenhum jogador encontrado com os filtros atuais.</p>
      )}
    </div>
  )
}
