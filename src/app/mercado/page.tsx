'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import { useAdmin } from '@/hooks/useAdmin'

// Helper para formatar valor monetário em reais
const formatarValor = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function JogadorCard({
  jogador,
  isAdmin,
  selecionado,
  toggleSelecionado,
  onComprar,
  onAtualizarPreco,
  loadingComprar,
  loadingAtualizarPreco,
}: {
  jogador: any
  isAdmin: boolean
  selecionado: boolean
  toggleSelecionado: () => void
  onComprar: () => void
  onAtualizarPreco: (novoValor: number) => void
  loadingComprar: boolean
  loadingAtualizarPreco: boolean
}) {
  const [novoValor, setNovoValor] = useState(jogador.valor)

  const handleBlur = () => {
    if (novoValor <= 0) {
      alert('Valor deve ser maior que zero')
      setNovoValor(jogador.valor)
      return
    }
    if (novoValor !== jogador.valor) {
      onAtualizarPreco(novoValor)
    }
  }

  return (
    <div
      className={`bg-gray-800 p-4 rounded-xl text-center border border-gray-700 hover:shadow-lg transition-shadow relative ${
        loadingComprar ? 'opacity-70 pointer-events-none' : ''
      }`}
    >
      <ImagemComFallback
        src={jogador.imagem_url}
        alt={jogador.nome}
        width={80}
        height={80}
        className="rounded-full mb-2 mx-auto"
      />
      <h2 className="text-lg font-bold">{jogador.nome}</h2>
      <p className="text-gray-300 text-sm">
        {jogador.posicao} • Overall {jogador.overall}
      </p>
      <p className="text-green-400 font-semibold">💰 {formatarValor(jogador.valor)}</p>
      <p className="text-gray-400 text-xs">
        Salário: {formatarValor(jogador.salario || 0)}
      </p>

      {isAdmin && (
        <>
          <label className="text-xs">💰 Alterar Preço (R$):</label>
          <input
            type="number"
            min={1}
            step={1000}
            value={novoValor}
            onChange={(e) => setNovoValor(Number(e.target.value))}
            onBlur={handleBlur}
            disabled={loadingAtualizarPreco}
            className="w-full p-1 mt-1 rounded text-black text-center"
          />
          <label className="flex items-center gap-1 mt-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selecionado}
              onChange={toggleSelecionado}
              disabled={loadingComprar}
            />
            Selecionar para excluir
          </label>
        </>
      )}

      <button
        onClick={onComprar}
        disabled={loadingComprar}
        className={`mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-full text-sm w-full transition-colors ${
          loadingComprar ? 'opacity-70 cursor-not-allowed' : ''
        }`}
      >
        {loadingComprar ? 'Comprando...' : 'Comprar'}
      </button>
    </div>
  )
}

export default function MercadoPage() {
  const router = useRouter()
  const { isAdmin } = useAdmin()
  const [jogadores, setJogadores] = useState<any[]>([])
  const [saldo, setSaldo] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])

  const [filtroNome, setFiltroNome] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroOverallMin, setFiltroOverallMin] = useState<number | ''>('')
  const [filtroOverallMax, setFiltroOverallMax] = useState<number | ''>('')
  const [filtroValorMax, setFiltroValorMax] = useState<number | ''>('')

  const [ordenarPor, setOrdenarPor] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const jogadoresPorPagina = 40

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [loadingComprarId, setLoadingComprarId] = useState<string | null>(null)
  const [loadingAtualizarPrecoId, setLoadingAtualizarPrecoId] = useState<string | null>(null)
  const [loadingExcluir, setLoadingExcluir] = useState(false)

  // Debounce simples para filtro nome (200ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setPaginaAtual(1)
    }, 200)
    return () => clearTimeout(handler)
  }, [filtroNome])

  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (!userStorage) {
      router.push('/login')
      return
    }

    setLoading(true)
    setErro(null)

    const userData = JSON.parse(userStorage)
    setUser(userData)

    const carregarDados = async () => {
      try {
        const [resMercado, resTime] = await Promise.all([
          supabase.from('mercado_transferencias').select('*'),
          supabase.from('times').select('saldo').eq('id', userData.id_time).single(),
        ])

        if (resMercado.error) throw resMercado.error
        if (resTime.error) throw resTime.error

        setJogadores(resMercado.data || [])
        setSaldo(resTime.data?.saldo || 0)
      } catch (e) {
        console.error(e)
        setErro('Erro ao carregar dados. Tente novamente mais tarde.')
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [router])

  const comprarJogador = async (jogador: any) => {
    if (!user) return

    if (jogador.valor > saldo) {
      alert('Saldo insuficiente!')
      return
    }

    if (!confirm(`Deseja comprar ${jogador.nome} por ${formatarValor(jogador.valor)}?`)) return

    setLoadingComprarId(jogador.id)
    try {
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
        link_sofifa: jogador.link_sofifa || '',
      })

      if (errorInsert) throw errorInsert

      const { error: errorDelete } = await supabase
        .from('mercado_transferencias')
        .delete()
        .eq('id', jogador.id)

      if (errorDelete) throw errorDelete

      const { error: errorUpdate } = await supabase
        .from('times')
        .update({ saldo: saldo - jogador.valor })
        .eq('id', user.id_time)

      if (errorUpdate) throw errorUpdate

      // Atualizar estados locais para não precisar recarregar a página
      setSaldo((prev) => prev - jogador.valor)
      setJogadores((prev) => prev.filter((j) => j.id !== jogador.id))
      setSelecionados((prev) => prev.filter((id) => id !== jogador.id))

      alert('✅ Jogador comprado com sucesso!')
    } catch (error) {
      console.error('Erro na compra:', error)
      alert('❌ Ocorreu um erro ao comprar o jogador.')
    } finally {
      setLoadingComprarId(null)
    }
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((sel) => sel !== id) : [...prev, id]
    )
  }

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um jogador para excluir.')
      return
    }
    if (!confirm(`⚠️ Tem certeza que deseja excluir ${selecionados.length} jogador(es)?`)) return

    setLoadingExcluir(true)
    try {
      const { error } = await supabase
        .from('mercado_transferencias')
        .delete()
        .in('id', selecionados)

      if (error) throw error

      setJogadores((prev) => prev.filter((j) => !selecionados.includes(j.id)))
      setSelecionados([])
      alert('✅ Jogadores excluídos com sucesso!')
    } catch (error) {
      console.error('Erro ao excluir:', error)
      alert('❌ Erro ao excluir jogadores.')
    } finally {
      setLoadingExcluir(false)
    }
  }

  const atualizarPreco = async (jogadorId: string, novoValor: number) => {
    if (novoValor <= 0) {
      alert('Valor deve ser maior que zero')
      return
    }
    setLoadingAtualizarPrecoId(jogadorId)
    try {
      const { error } = await supabase
        .from('mercado_transferencias')
        .update({ valor: novoValor })
        .eq('id', jogadorId)

      if (error) throw error

      setJogadores((prev) =>
        prev.map((j) =>
          j.id === jogadorId
            ? {
                ...j,
                valor: novoValor,
              }
            : j
        )
      )
      alert('✅ Valor atualizado!')
    } catch (error) {
      console.error('Erro ao atualizar preço:', error)
      alert('❌ Erro ao atualizar preço.')
    } finally {
      setLoadingAtualizarPrecoId(null)
    }
  }

  if (!user) return <p className="text-center mt-10 text-white">🔒 Carregando sessão...</p>
  if (loading) return <p className="text-center mt-10 text-white">⏳ Carregando dados...</p>
  if (erro) return <p className="text-center mt-10 text-red-500">{erro}</p>

  // Aplicar filtros
  const jogadoresFiltrados = jogadores
    .filter((j) => {
      const nomeMatch = j.nome.toLowerCase().includes(filtroNome.toLowerCase())
      const posicaoMatch = filtroPosicao ? j.posicao === filtroPosicao : true
      const overallMin = filtroOverallMin === '' ? 0 : filtroOverallMin
      const overallMax = filtroOverallMax === '' ? 99 : filtroOverallMax
      const valorMax = filtroValorMax === '' ? Infinity : filtroValorMax

      const overallMatch = j.overall >= overallMin && j.overall <= overallMax
      const valorMatch = j.valor <= valorMax
      return nomeMatch && posicaoMatch && overallMatch && valorMatch
    })
    .sort((a, b) => {
      if (ordenarPor === 'valor_asc') return a.valor - b.valor
      if (ordenarPor === 'valor_desc') return b.valor - a.valor
      if (ordenarPor === 'overall_asc') return a.overall - b.overall
      if (ordenarPor === 'overall_desc') return b.overall - a.overall
      return 0
    })

  // Paginação
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
          disabled={loadingExcluir}
          className={`bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mb-4 transition-opacity ${
            loadingExcluir ? 'opacity-70 cursor-not-allowed' : ''
          }`}
        >
          {loadingExcluir ? 'Excluindo...' : `🗑️ Excluir Selecionados (${selecionados.length})`}
        </button>
      )}

      {totalPaginas > 1 && (
        <div className="flex justify-center mb-6 gap-2 flex-wrap">
          {Array.from({ length: totalPaginas }, (_, i) => (
            <button
              key={i}
              onClick={() => setPaginaAtual(i + 1)}
              className={`px-3 py-1 rounded ${
                paginaAtual === i + 1
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              } transition-colors`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="🔎 Buscar por nome"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white"
        />

        <select
          value={filtroPosicao}
          onChange={(e) => setFiltroPosicao(e.target.value)}
          className="p-2 border rounded bg-gray-800 border-gray-600 text-white"
        >
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
          <input
            type="number"
            placeholder="Overall mín"
            value={filtroOverallMin}
            onChange={(e) => setFiltroOverallMin(e.target.value === '' ? '' : Number(e.target.value))}
            className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white"
            min={0}
            max={99}
          />
          <input
            type="number"
            placeholder="máx"
            value={filtroOverallMax}
            onChange={(e) => setFiltroOverallMax(e.target.value === '' ? '' : Number(e.target.value))}
            className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white"
            min={0}
            max={99}
          />
        </div>

        <input
          type="number"
          placeholder="💰 Valor máx (R$)"
          value={filtroValorMax}
          onChange={(e) => setFiltroValorMax(e.target.value === '' ? '' : Number(e.target.value))}
          className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white"
          min={0}
        />

        <select
          value={ordenarPor}
          onChange={(e) => setOrdenarPor(e.target.value)}
          className="p-2 border rounded bg-gray-800 border-gray-600 text-white"
        >
          <option value="">Ordenar...</option>
          <option value="valor_asc">Valor ↑</option>
          <option value="valor_desc">Valor ↓</option>
          <option value="overall_asc">Overall ↑</option>
          <option value="overall_desc">Overall ↓</option>
        </select>

        <div className="font-semibold text-green-400 col-span-full text-right">
          💰 Saldo: {formatarValor(saldo)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {jogadoresPaginados.length > 0 ? (
          jogadoresPaginados.map((jogador) => (
            <JogadorCard
              key={jogador.id}
              jogador={jogador}
              isAdmin={isAdmin}
              selecionado={selecionados.includes(jogador.id)}
              toggleSelecionado={() => toggleSelecionado(jogador.id)}
              onComprar={() => comprarJogador(jogador)}
              onAtualizarPreco={(novoValor) => atualizarPreco(jogador.id, novoValor)}
              loadingComprar={loadingComprarId === jogador.id}
              loadingAtualizarPreco={loadingAtualizarPrecoId === jogador.id}
            />
          ))
        ) : (
          <p className="mt-10 text-center text-gray-400 col-span-full">
            Nenhum jogador encontrado com os filtros atuais.
          </p>
        )}
      </div>
    </div>
  )
}
