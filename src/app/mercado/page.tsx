'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import { useAdmin } from '@/hooks/useAdmin'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'

/* ================= Util ================= */
const formatarValor = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================= Modal genérico ================= */
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
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
        <div className="p-6">
          <h2 className="text-xl font-bold tracking-tight">{titulo}</h2>
          <p className="mt-2 text-gray-300">{mensagem}</p>
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-gray-800 px-4 py-2 text-sm font-medium hover:bg-gray-700 transition"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              )}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= Card do jogador ================= */
function JogadorCard({
  jogador,
  isAdmin,
  selecionado,
  toggleSelecionado,
  onComprar,
  onAtualizarPreco,
  loadingComprar,
  loadingAtualizarPreco,
  mercadoFechado,
}: {
  jogador: any
  isAdmin: boolean
  selecionado: boolean
  toggleSelecionado: () => void
  onComprar: () => void
  onAtualizarPreco: (novoValor: number) => void
  loadingComprar: boolean
  loadingAtualizarPreco: boolean
  mercadoFechado: boolean
}) {
  const [novoValor, setNovoValor] = useState<number>(jogador.valor)

  const handleBlur = () => {
    if (novoValor <= 0) {
      toast.error('Valor deve ser maior que zero')
      setNovoValor(jogador.valor)
      return
    }
    if (novoValor !== jogador.valor) onAtualizarPreco(novoValor)
  }

  const nacionalidade =
    jogador.nacionalidade && jogador.nacionalidade.trim() !== '' ? jogador.nacionalidade : 'Resto do Mundo'

  return (
    <div
      className={[
        'relative rounded-2xl border border-white/10 bg-gradient-to-b from-gray-850 to-gray-900 p-4',
        'hover:shadow-lg hover:shadow-black/30 transition-shadow',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
        selecionado ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900' : ''
      ].join(' ')}
    >
      {/* Seleção admin */}
      {isAdmin && (
        <label className="absolute left-3 top-3 inline-flex select-none items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={toggleSelecionado}
            className="h-4 w-4 accent-red-500"
          />
          Excluir
        </label>
      )}

      {/* Cabeçalho do card */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <ImagemComFallback
            src={jogador.imagem_url || jogador.foto || ''}  {/* ✅ lê imagem da planilha em várias chaves */}
            alt={jogador.nome}
            width={80}
            height={80}
            className="h-20 w-20 rounded-full object-cover ring-2 ring-white/10"
          />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-bold text-gray-200 ring-1 ring-white/10">
            {jogador.posicao}
          </span>
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold leading-tight">{jogador.nome}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-300">
            <span className="rounded-full bg-white/5 px-2 py-0.5 ring-1 ring-white/10">OVR {jogador.overall}</span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 ring-1 ring-white/10">🌎 {nacionalidade}</span>
          </div>
        </div>
      </div>

      {/* Valores */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/10 bg-gray-800/60 p-3">
          <p className="text-xs text-gray-400">Valor</p>
          <p className="font-bold text-green-400">{formatarValor(jogador.valor)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-gray-800/60 p-3">
          <p className="text-xs text-gray-400">Salário</p>
          <p className="font-semibold text-gray-200">{formatarValor(jogador.salario || 0)}</p>
        </div>
      </div>

      {/* Admin: alterar preço */}
      {isAdmin && (
        <div className="mt-3">
          <label className="mb-1 block text-[11px] text-gray-300">💰 Alterar Preço (R$)</label>
          <input
            type="number"
            min={1}
            step={1000}
            value={novoValor}
            onChange={(e) => setNovoValor(Number(e.target.value))}
            onBlur={handleBlur}
            disabled={loadingAtualizarPreco}
            className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-green-500"
            placeholder="Novo valor"
          />
          {loadingAtualizarPreco && <p className="mt-1 text-[11px] text-gray-400">Atualizando...</p>}
        </div>
      )}

      {/* Ação */}
      <button
        onClick={onComprar}
        disabled={loadingComprar || mercadoFechado}
        className={[
          'mt-4 w-full rounded-xl px-4 py-2 text-sm font-semibold transition',
          mercadoFechado
            ? 'cursor-not-allowed bg-gray-700 text-gray-300'
            : 'bg-green-600 text-white hover:bg-green-700'
        ].join(' ')}
        title={mercadoFechado ? 'Mercado fechado' : 'Comprar jogador'}
      >
        {loadingComprar ? 'Comprando...' : mercadoFechado ? 'Mercado fechado' : 'Comprar'}
      </button>
    </div>
  )
}

/* ================= Página ================= */
export default function MercadoPage() {
  const router = useRouter()
  const { isAdmin } = useAdmin()

  const [jogadores, setJogadores] = useState<any[]>([])
  const [saldo, setSaldo] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])

  // filtros
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroOverallMin, setFiltroOverallMin] = useState<number | ''>('')
  const [filtroOverallMax, setFiltroOverallMax] = useState<number | ''>('')
  const [filtroValorMax, setFiltroValorMax] = useState<number | ''>('')
  const [filtroNacionalidade, setFiltroNacionalidade] = useState('')

  const [ordenarPor, setOrdenarPor] = useState('')
  const [itensPorPagina, setItensPorPagina] = useState(40)
  const [paginaAtual, setPaginaAtual] = useState(1)

  // estados gerais
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [loadingComprarId, setLoadingComprarId] = useState<string | null>(null)
  const [loadingAtualizarPrecoId, setLoadingAtualizarPrecoId] = useState<string | null>(null)
  const [loadingExcluir, setLoadingExcluir] = useState(false)

  const [modalComprarVisivel, setModalComprarVisivel] = useState(false)
  const [modalExcluirVisivel, setModalExcluirVisivel] = useState(false)
  const [jogadorParaComprar, setJogadorParaComprar] = useState<any | null>(null)

  // upload
  const [uploadLoading, setUploadLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // mercado
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
          supabase.from('configuracoes').select('aberto').eq('id', 'estado_mercado').single(),
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

  /* ================= Upload XLSX ================= */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadLoading(true)
    setMsg('Lendo planilha...')

    // helpers
    const normalizeKeys = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [String(k).trim().toLowerCase(), v])
      )

    const sanitizeUrl = (u?: any) => {
      if (!u) return ''
      const s = String(u).trim().replace(/\s/g, '%20')
      return s
    }

    const pickImagemUrl = (row: Record<string, any>) => {
      // aceita várias grafias comuns vindas da planilha
      const cand =
        row['imagem_url'] ??
        row['foto'] ??
        row['imagem url'] ??
        row['url_imagem'] ??
        row['imagem']

      return sanitizeUrl(cand)
    }

    const toNumber = (v: any) => {
      if (v === null || v === undefined || v === '') return 0
      // remove separadores e converte
      const num = Number(String(v).replace(/[^\d.-]/g, ''))
      return Number.isFinite(num) ? num : 0
    }

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        // prioriza a aba "Consolidado" se existir
        const sheetName = workbook.SheetNames.includes('Consolidado')
          ? 'Consolidado'
          : workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json(sheet)

        const jogadoresParaInserir = (json as any[]).map((raw) => {
          const row = normalizeKeys(raw)

          const nome = row['nome']
          const posicao = row['posicao']
          const overall = toNumber(row['overall'])
          const valor = toNumber(row['valor'])
          const link_sofifa = row['link_sofifa'] ?? row['sofifa'] ?? ''
          const nacionalidade = row['nacionalidade'] ?? row['pais'] ?? ''
          const time_origem = row['time_origem'] ?? row['time'] ?? ''
          const imagem_url = pickImagemUrl(row)

          if (!nome || !posicao || !overall || !valor) {
            throw new Error('Colunas obrigatórias: nome, posicao, overall, valor')
          }

          return {
            nome,
            posicao,
            overall,
            valor,
            imagem_url,       // ✅ agora sempre preenche
            link_sofifa,
            nacionalidade,
            time_origem,
          }
        })

        const { error } = await supabase.from('mercado_transferencias').insert(jogadoresParaInserir)
        if (error) throw error

        toast.success(`Importados ${jogadoresParaInserir.length} jogadores com sucesso!`)
        // refletir na tela imediatamente
        setJogadores((prev) => [...prev, ...jogadoresParaInserir])
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

  /* ================= Compra ================= */
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

    // Limite de elenco
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
      // garante exclusividade
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

      // BID
      await supabase.from('bid').insert({
        tipo_evento: 'compra',
        descricao: `O ${user.nome_time} comprou ${jogador.nome} por ${formatarValor(jogador.valor)}.`,
        id_time1: user.id_time,
        valor: jogador.valor,
        data_evento: new Date().toISOString(),
      })

      const salario = Math.round(jogador.valor * 0.007)

      const { error: errorInsert } = await supabase.from('elenco').insert({
        id_time: user.id_time,
        nome: jogador.nome,
        posicao: jogador.posicao,
        overall: jogador.overall,
        valor: jogador.valor,
        imagem_url: jogador.imagem_url || jogador.foto || '',   // ✅ mantém a imagem no elenco
        salario: salario,
        jogos: 0,
        link_sofifa: jogador.link_sofifa || '',
      })
      if (errorInsert) throw errorInsert

      // movimentação financeira
      await registrarMovimentacao({
        id_time: user.id_time,
        tipo: 'saida',
        valor: jogador.valor,
        descricao: `Compra de ${jogador.nome} no mercado`,
      })

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

  /* ================= Admin: excluir/atualizar preço ================= */
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => (prev.includes(id) ? prev.filter((sel) => sel !== id) : [...prev, id]))
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
      const { error } = await supabase.from('mercado_transferencias').delete().in('id', selecionados)
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
      const { error } = await supabase.from('mercado_transferencias').update({ valor: novoValor }).eq('id', jogadorId)
      if (error) throw error

      setJogadores((prev) => prev.map((j) => (j.id === jogadorId ? { ...j, valor: novoValor } : j)))
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
      const { error } = await supabase.from('configuracoes').update({ aberto: novoStatus }).eq('id', 'estado_mercado')
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

  /* ================= Filtros e listagem ================= */
  const jogadoresFiltrados = useMemo(() => {
    const lista = jogadores
      .filter((j) => {
        const nomeMatch = j.nome.toLowerCase().includes(filtroNome.toLowerCase())
        const posicaoMatch = filtroPosicao ? j.posicao === filtroPosicao : true
        const overallMin = filtroOverallMin === '' ? 0 : filtroOverallMin
        const overallMax = filtroOverallMax === '' ? 99 : filtroOverallMax
        const valorMax = filtroValorMax === '' ? Infinity : filtroValorMax
        const nacionalidadeJogador =
          j.nacionalidade && j.nacionalidade.trim() !== '' ? j.nacionalidade : 'Resto do Mundo'
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

    return lista
  }, [
    jogadores,
    filtroNome,
    filtroPosicao,
    filtroOverallMin,
    filtroOverallMax,
    filtroValorMax,
    filtroNacionalidade,
    ordenarPor,
  ])

  const totalResultados = jogadoresFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(totalResultados / itensPorPagina))
  const paginaSegura = Math.min(Math.max(1, paginaAtual), totalPaginas)
  const indexOfLast = paginaSegura * itensPorPagina
  const indexOfFirst = indexOfLast - itensPorPagina
  const jogadoresPaginados = jogadoresFiltrados.slice(indexOfFirst, indexOfLast)

  const limparFiltros = () => {
    setFiltroNome('')
    setFiltroPosicao('')
    setFiltroOverallMin('')
    setFiltroOverallMax('')
    setFiltroValorMax('')
    setFiltroNacionalidade('')
    setOrdenarPor('')
    setPaginaAtual(1)
  }

  /* ================= UI ================= */
  if (!user) return <p className="mt-10 text-center text-white">🔒 Carregando sessão...</p>
  if (loading) return <p className="mt-10 text-center text-white">⏳ Carregando dados...</p>
  if (erro) return <p className="mt-10 text-center text-red-500">{erro}</p>

  const mercadoFechado = marketStatus === 'fechado'

  return (
    <>
      <Toaster position="top-right" />

      {/* Topbar fixa */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/10 text-lg">🛒</div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">Mercado de Transferências</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset',
                    mercadoFechado
                      ? 'bg-red-500/10 text-red-300 ring-red-500/30'
                      : 'bg-green-500/10 text-green-300 ring-green-500/30',
                  ].join(' ')}
                >
                  {mercadoFechado ? '🔒 Fechado' : '🔓 Aberto'}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-gray-300 ring-1 ring-white/10">
                  {totalResultados} jogadores
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-[11px] text-gray-400">Saldo disponível</p>
              <p className="font-semibold text-green-400">{formatarValor(saldo)}</p>
            </div>

            {isAdmin && (
              <>
                <button
                  onClick={toggleMarketStatus}
                  disabled={loading}
                  className={[
                    'rounded-xl px-3 py-2 text-sm font-semibold transition',
                    mercadoFechado
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-yellow-500 text-black hover:bg-yellow-400',
                  ].join(' ')}
                >
                  {loading ? 'Processando...' : mercadoFechado ? 'Abrir mercado' : 'Fechar mercado'}
                </button>

                <button
                  type="button"
                  onClick={() => document.getElementById('input-xlsx-upload')?.click()}
                  disabled={uploadLoading || mercadoFechado}
                  className={[
                    'rounded-xl px-3 py-2 text-sm font-semibold transition',
                    uploadLoading
                      ? 'bg-gray-700 text-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700',
                    mercadoFechado ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {uploadLoading ? 'Importando...' : 'Importar planilha'}
                </button>
                <input
                  id="input-xlsx-upload"
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={uploadLoading || mercadoFechado}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mx-auto max-w-7xl px-4 py-6 text-white">
        {/* Painel de filtros */}
        <div className="rounded-2xl border border-white/10 bg-gray-900 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <input
              type="text"
              placeholder="🔎 Buscar por nome"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
            />

            <select
              value={filtroPosicao}
              onChange={(e) => setFiltroPosicao(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition focus:border-green-500"
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
              className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
            />

            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="OVR mín"
                value={filtroOverallMin}
                onChange={(e) => setFiltroOverallMin(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
                min={0}
                max={99}
              />
              <input
                type="number"
                placeholder="máx"
                value={filtroOverallMax}
                onChange={(e) => setFiltroOverallMax(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
                min={0}
                max={99}
              />
            </div>

            <input
              type="number"
              placeholder="💰 Valor máx (R$)"
              value={filtroValorMax}
              onChange={(e) => setFiltroValorMax(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
              min={0}
            />

            <select
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition focus:border-green-500"
            >
              <option value="">Ordenar...</option>
              <option value="valor_asc">Valor ↑</option>
              <option value="valor_desc">Valor ↓</option>
              <option value="overall_asc">Overall ↑</option>
              <option value="overall_desc">Overall ↓</option>
            </select>

            <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300">Por página</label>
                <select
                  value={itensPorPagina}
                  onChange={(e) => {
                    setItensPorPagina(Number(e.target.value))
                    setPaginaAtual(1)
                  }}
                  className="rounded-lg border border-white/10 bg-gray-800 px-2 py-1 text-sm outline-none transition focus:border-green-500"
                >
                  <option value={20}>20</option>
                  <option value={40}>40</option>
                  <option value={80}>80</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-300 ring-1 ring-white/10">
                  💰 Saldo: <strong className="text-green-400">{formatarValor(saldo)}</strong>
                </span>
                <button
                  onClick={limparFiltros}
                  className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm hover:bg-gray-700 transition"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={solicitarExcluirSelecionados}
                disabled={loadingExcluir}
                className={[
                  'rounded-xl px-4 py-2 text-sm font-semibold transition',
                  loadingExcluir ? 'bg-gray-700 text-gray-300' : 'bg-red-600 text-white hover:bg-red-700',
                ].join(' ')}
              >
                {loadingExcluir ? 'Excluindo...' : `🗑️ Excluir Selecionados (${selecionados.length})`}
              </button>
              {msg && <span className="text-sm text-gray-300">{msg}</span>}
            </div>
          )}
        </div>

        {/* Paginação (topo) */}
        {totalPaginas > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 transition"
            >
              ← Anterior
            </button>
            <span className="rounded-lg bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10">
              Página <strong>{paginaSegura}</strong> de <strong>{totalPaginas}</strong>
            </span>
            <button
              onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
              className="rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 transition"
            >
              Próxima →
            </button>
          </div>
        )}

        {/* Grid de jogadores */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {jogadoresPaginados.length > 0 ? (
            jogadoresPaginados.map((jogador) => (
              <JogadorCard
                key={jogador.id}
                jogador={jogador}
                isAdmin={isAdmin}
                selecionado={selecionados.includes(jogador.id)}
                toggleSelecionado={() => toggleSelecionado(jogador.id)}
                onComprar={() => solicitarCompra(jogador)}
                onAtualizarPreco={(novo) => atualizarPreco(jogador.id, novo)}
                loadingComprar={loadingComprarId === jogador.id}
                loadingAtualizarPreco={loadingAtualizarPrecoId === jogador.id}
                mercadoFechado={marketStatus === 'fechado'}
              />
            ))
          ) : (
            <p className="col-span-full mt-6 text-center text-gray-400">
              Nenhum jogador encontrado com os filtros atuais.
            </p>
          )}
        </div>

        {/* Paginação (base) */}
        {totalPaginas > 1 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 transition"
            >
              ← Anterior
            </button>
            <span className="rounded-lg bg-white/5 px-3 py-1.5 text-sm ring-1 ring-white/10">
              Página <strong>{paginaSegura}</strong> de <strong>{totalPaginas}</strong>
            </span>
            <button
              onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
              className="rounded-lg border border-white/10 bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700 transition"
            >
              Próxima →
            </button>
          </div>
        )}
      </div>

      {/* Modais */}
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
