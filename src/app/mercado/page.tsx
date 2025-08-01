'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import { useAdmin } from '@/hooks/useAdmin'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'


import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'

const formatarValor = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function ModalConfirm({
  visible,
  titulo,
  mensagem,
  onConfirm,
  onCancel,
  loading = false,
}: {
  visible: boolean
  titulo: string
  mensagem: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}) {
  if (!visible) return null
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white rounded p-6 max-w-sm w-full shadow-lg">
        <h2 className="text-xl font-bold mb-4">{titulo}</h2>
        <p className="mb-6">{mensagem}</p>
        <div className="flex justify-end gap-4">
          <button
            disabled={loading}
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
          >
            Cancelar
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded flex items-center justify-center"
          >
            {loading ? (
              <svg
                className="animate-spin h-5 w-5 mr-2 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : null}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

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
      toast.error('Valor deve ser maior que zero')
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
<p className="text-gray-400 text-xs">
  🌎 {jogador.nacionalidade && jogador.nacionalidade.trim() !== '' ? jogador.nacionalidade : 'Resto do Mundo'}
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
  const [filtroNacionalidade, setFiltroNacionalidade] = useState('')

  const [ordenarPor, setOrdenarPor] = useState('')
  const [paginaAtual, setPaginaAtual] = useState(1)
  const jogadoresPorPagina = 40

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [loadingComprarId, setLoadingComprarId] = useState<string | null>(null)
  const [loadingAtualizarPrecoId, setLoadingAtualizarPrecoId] = useState<string | null>(null)
  const [loadingExcluir, setLoadingExcluir] = useState(false)

  const [modalComprarVisivel, setModalComprarVisivel] = useState(false)
  const [modalExcluirVisivel, setModalExcluirVisivel] = useState(false)
  const [jogadorParaComprar, setJogadorParaComprar] = useState<any | null>(null)

  const [uploadLoading, setUploadLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [marketStatus, setMarketStatus] = useState<'aberto' | 'fechado'>('fechado')

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
        const [resMercado, resTime, resMarketStatus] = await Promise.all([
          supabase.from('mercado_transferencias').select('*'),
          supabase.from('times').select('saldo').eq('id', userData.id_time).single(),
          supabase.from('configuracoes').select('aberto').eq('id', 'estado_mercado').single()
        ])

        if (resMercado.error) throw resMercado.error
        if (resTime.error) throw resTime.error
        if (resMarketStatus.error) throw resMarketStatus.error

        setJogadores(resMercado.data || [])
        setSaldo(resTime.data?.saldo || 0)
        setMarketStatus(resMarketStatus.data?.aberto ? 'aberto' : 'fechado')
      } catch (e: any) {
        console.error('Erro ao carregar dados:', e)
        setErro('Erro ao carregar dados. Tente novamente mais tarde. ' + (e.message || e.toString()))
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [router])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadLoading(true)
    setMsg('Lendo planilha...')

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(sheet)

        const jogadoresParaInserir = (json as any[]).map(item => {
  const {
    nome,
    posicao,
    overall,
    valor,
    foto: imagem_url,
    link_sofifa,
    nacionalidade,
    time_origem
  } = item

  if (!nome || !posicao || !overall || !valor) {
    throw new Error('Colunas obrigatórias: nome, posicao, overall, valor')
  }

  return {
    nome,
    posicao,
    overall: parseInt(overall),
    valor: parseInt(valor),
    imagem_url,
    link_sofifa,
    nacionalidade,
    time_origem
  }
})

        const { error } = await supabase.from('mercado_transferencias').insert(jogadoresParaInserir)
        if (error) throw error

        toast.success(`Importados ${jogadoresParaInserir.length} jogadores com sucesso!`)
        setJogadores(prev => [...prev, ...jogadoresParaInserir])
      } catch (error: any) {
        console.error('Erro ao importar:', error)
        toast.error(`Erro no upload: ${error.message || error}`)
      } finally {
        setUploadLoading(false)
        if (e.target) e.target.value = ''
        setMsg('')
      }
    }

    reader.readAsArrayBuffer(file)
  }

  const solicitarCompra = (jogador: any) => {
    if (marketStatus === 'fechado') {
      toast.error('O mercado está fechado. Não é possível comprar jogadores.')
      return
    }
    if (jogador.valor > saldo) {
      toast.error('Saldo insuficiente!')
      return
    }
    setJogadorParaComprar(jogador)
    setModalComprarVisivel(true)
  }

  const confirmarCompra = async () => {
  if (!jogadorParaComprar || !user) {
    setModalComprarVisivel(false)
    return
  }

  // 🔒 Verificar limite de elenco
  const { data: elencoAtual, error: errorElenco } = await supabase
    .from('elenco')
    .select('id')
    .eq('id_time', user.id_time)

  if (errorElenco) {
    toast.error('Erro ao verificar o elenco atual.')
    return
  }

  if ((elencoAtual?.length || 0) >= 25) {
    toast.error('🚫 Você tem 25 ou mais jogadores no seu elenco. Venda para comprar do mercado!')
    return
  }

  setLoadingComprarId(jogadorParaComprar.id)

  try {
    const { data: deletedJogador, error: deleteError } = await supabase
      .from('mercado_transferencias')
      .delete()
      .eq('id', jogadorParaComprar.id)
      .select()

    if (deleteError) throw deleteError

    if (!deletedJogador || deletedJogador.length === 0) {
      toast.error('Esse jogador já foi comprado por outro clube.')
      return
    }

    const jogador = deletedJogador[0]

    if (jogador.valor > saldo) {
      toast.error('Saldo insuficiente.')
      return
    }

    await supabase.from('bid').insert({
      tipo_evento: 'compra',
      descricao: `O ${user.nome_time} comprou ${jogador.nome} por ${formatarValor(jogador.valor)}.`,
      id_time1: user.id_time,
      valor: jogador.valor,
      data_evento: new Date().toISOString()
    })

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

    await registrarMovimentacao({
      id_time: user.id_time,
      tipo: 'saida',
      valor: jogador.valor,
      descricao: `Compra de ${jogador.nome} no mercado`
    })

    if (errorInsert) throw errorInsert

    const { error: errorUpdate } = await supabase
      .from('times')
      .update({ saldo: saldo - jogador.valor })
      .eq('id', user.id_time)

    if (errorUpdate) throw errorUpdate

    setSaldo((prev) => prev - jogador.valor)
    setJogadores((prev) => prev.filter((j) => j.id !== jogador.id))
    setSelecionados((prev) => prev.filter((id) => id !== jogador.id))

    toast.success('Jogador comprado com sucesso!')
  } catch (error) {
    console.error('Erro na compra:', error)
    toast.error('Ocorreu um erro ao comprar o jogador.')
  } finally {
    setLoadingComprarId(null)
    setModalComprarVisivel(false)
    setJogadorParaComprar(null)
  }
}

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((sel) => sel !== id) : [...prev, id]
    )
  }

  const solicitarExcluirSelecionados = () => {
    if (selecionados.length === 0) {
      toast.error('Selecione pelo menos um jogador para excluir.')
      return
    }
    setModalExcluirVisivel(true)
  }

  const confirmarExcluirSelecionados = async () => {
    setLoadingExcluir(true)
    try {
      const { error } = await supabase
        .from('mercado_transferencias')
        .delete()
        .in('id', selecionados)

      if (error) throw error

      setJogadores((prev) => prev.filter((j) => !selecionados.includes(j.id)))
      setSelecionados([])
      toast.success('Jogadores excluídos com sucesso!')
    } catch (error) {
      console.error('Erro ao excluir:', error)
      toast.error('Erro ao excluir jogadores.')
    } finally {
      setLoadingExcluir(false)
      setModalExcluirVisivel(false)
    }
  }

  const atualizarPreco = async (jogadorId: string, novoValor: number) => {
    if (novoValor <= 0) {
      toast.error('Valor deve ser maior que zero')
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
      toast.success('Valor atualizado!')
    } catch (error) {
      console.error('Erro ao atualizar preço:', error)
      toast.error('Erro ao atualizar preço.')
    } finally {
      setLoadingAtualizarPrecoId(null)
    }
  }

  const toggleMarketStatus = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const novoStatus = marketStatus === 'aberto' ? false : true

      const { error } = await supabase
        .from('configuracoes')
        .update({ aberto: novoStatus })
        .eq('id', 'estado_mercado')

      if (error) throw error

      setMarketStatus(novoStatus ? 'aberto' : 'fechado')
      toast.success(`Mercado ${novoStatus ? 'aberto' : 'fechado'} com sucesso!`)
    } catch (error) {
      console.error('Erro ao alterar status do mercado:', error)
      toast.error('Erro ao alterar status do mercado.')
    } finally {
      setLoading(false)
    }
  }

  if (!user) return <p className="text-center mt-10 text-white">🔒 Carregando sessão...</p>
  if (loading) return <p className="text-center mt-10 text-white">⏳ Carregando dados...</p>
  if (erro) return <p className="text-center mt-10 text-red-500">{erro}</p>

  const jogadoresFiltrados = jogadores
  .filter((j) => {
    const nomeMatch = j.nome.toLowerCase().includes(filtroNome.toLowerCase())
    const posicaoMatch = filtroPosicao ? j.posicao === filtroPosicao : true
    const overallMin = filtroOverallMin === '' ? 0 : filtroOverallMin
    const overallMax = filtroOverallMax === '' ? 99 : filtroOverallMax
    const valorMax = filtroValorMax === '' ? Infinity : filtroValorMax
    const nacionalidadeJogador = j.nacionalidade && j.nacionalidade.trim() !== '' ? j.nacionalidade : 'Resto do Mundo'
    const nacionalidadeMatch = filtroNacionalidade
      ? nacionalidadeJogador.toLowerCase().includes(filtroNacionalidade.toLowerCase())
      : true

    const overallMatch = j.overall >= overallMin && j.overall <= overallMax
    const valorMatch = j.valor <= valorMax
    return nomeMatch && posicaoMatch && overallMatch && valorMatch && nacionalidadeMatch
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
  <>
    <Toaster position="top-right" />

    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-green-400">
        🛒 Mercado de Transferências
      </h1>

      {/* Botão abrir/fechar mercado */}
      {isAdmin && (
        <div className="mb-4">
          <button
            onClick={toggleMarketStatus}
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-700 text-black font-bold py-2 px-4 rounded transition-opacity w-full sm:w-auto"
          >
            {loading
              ? 'Processando...'
              : marketStatus === 'aberto'
              ? '🔓 Fechar Mercado'
              : '🔒 Abrir Mercado'}
          </button>
        </div>
      )}

      {/* Upload XLSX */}
      {isAdmin && (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => document.getElementById('input-xlsx-upload')?.click()}
              disabled={uploadLoading || marketStatus === 'fechado'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploadLoading ? (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                <>📁 Importar Planilha</>
              )}
            </button>
            <input
              id="input-xlsx-upload"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              disabled={uploadLoading || marketStatus === 'fechado'}
              className="hidden"
            />
          </div>

          <div className="text-sm text-gray-300 max-w-lg">
            {msg ||
              'Formato: Nome Completo, Posição, Overall, Valor, Foto (opcional), Nacionalidade (opcional), Link_sofifa (opcional).'}
          </div>
        </div>
      )}

        {/* Botão excluir */}
        {isAdmin && (
          <button
            onClick={solicitarExcluirSelecionados}
            disabled={loadingExcluir}
            className={`bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded mb-4 transition-opacity ${
              loadingExcluir ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {loadingExcluir ? 'Excluindo...' : `🗑️ Excluir Selecionados (${selecionados.length})`}
          </button>
        )}

        {/* Paginação */}
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

        {/* Filtros */}
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

  <input
    type="text"
    placeholder="🌎 Filtrar por nacionalidade"
    value={filtroNacionalidade}
    onChange={(e) => setFiltroNacionalidade(e.target.value)}
    className="p-2 border rounded w-full bg-gray-800 border-gray-600 text-white"
  />

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

        {/* Lista de jogadores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {jogadoresPaginados.length > 0 ? (
            jogadoresPaginados.map((jogador) => (
              <JogadorCard
                key={jogador.id}
                jogador={jogador}
                isAdmin={isAdmin}
                selecionado={selecionados.includes(jogador.id)}
                toggleSelecionado={() => toggleSelecionado(jogador.id)}
                onComprar={() => solicitarCompra(jogador)}
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

      <ModalConfirm
        visible={modalComprarVisivel}
        titulo="Confirmar Compra"
        mensagem={`Deseja comprar ${jogadorParaComprar?.nome} por ${
          jogadorParaComprar ? formatarValor(jogadorParaComprar.valor) : ''
        }?`}
        onConfirm={confirmarCompra}
        onCancel={() => {
          setModalComprarVisivel(false)
          setJogadorParaComprar(null)
        }}
        loading={loadingComprarId !== null}
      />

      <ModalConfirm
        visible={modalExcluirVisivel}
        titulo="Confirmar Exclusão"
        mensagem={`Tem certeza que deseja excluir ${selecionados.length} jogador(es)?`}
        onConfirm={confirmarExcluirSelecionados}
        onCancel={() => setModalExcluirVisivel(false)}
        loading={loadingExcluir}
      />
    </>
  )
}
