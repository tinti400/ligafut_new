'use client'

import CardJogador from '@/components/CardJogador'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import { useAdmin } from '@/hooks/useAdmin'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'

const calcularValorComDesgaste = (valorInicial: number, dataListagem?: string) => {
  if (!dataListagem) return valorInicial

  const agora = Date.now()
  const listagem = new Date(dataListagem).getTime()

  const dias = Math.floor((agora - listagem) / (1000 * 60 * 60 * 24))
  const ciclos = Math.floor(dias / 3)
  const desconto = ciclos * 0.05

  const fatorMinimo = 0.6
  const fatorFinal = Math.min(1, Math.max(1 - desconto, fatorMinimo))

  return Math.round(valorInicial * fatorFinal)
}


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

/* ================= Tipos ================= */
type Jogador = {
  id: string | number
  nome: string
  posicao: string
  overall: number
  valor: number
  salario?: number | null
  nacionalidade?: string | null
  imagem_url?: string | null
  foto?: string | null
  link_sofifa?: string | null
  data_listagem?: string | null
}


type JogadorCardProps = {
  jogador: Jogador
  isAdmin: boolean
  selecionado: boolean
  toggleSelecionado: () => void
  onComprar: () => void
  onAtualizarPreco: (novoValor: number) => void
  loadingComprar: boolean
  loadingAtualizarPreco: boolean
  mercadoFechado: boolean
}

/* ================= Card do jogador (ESTILO EA FC) ================= */
const JogadorCard = ({
  jogador,
  isAdmin,
  selecionado,
  toggleSelecionado,
  onComprar,
  loadingComprar,
  mercadoFechado,
}: JogadorCardProps) => {
  const valorAtual = calcularValorComDesgaste(
    jogador.valor,
    (jogador as any).data_listagem
  )

  /* ===== Tipo da carta ===== */
  const tipoCarta =
    jogador.overall <= 64
      ? 'bronze'
      : jogador.overall <= 74
      ? 'prata'
      : 'ouro'

  return (
    <div
      className={[
        'relative w-full max-w-[260px] overflow-hidden rounded-[22px]',
        'transition-transform duration-300 hover:scale-[1.03]',
        'shadow-xl',

        // 🟤 BRONZE
        tipoCarta === 'bronze' &&
          'bg-gradient-to-b from-[#7a4a1d] via-[#a97142] to-[#2a1a0f] text-yellow-100',

        // ⚪ PRATA
        tipoCarta === 'prata' &&
          'bg-gradient-to-b from-[#e5e7eb] via-[#9ca3af] to-[#374151] text-gray-900',

        // 🟡 OURO (EA FC STYLE)
tipoCarta === 'ouro' &&
  'bg-gradient-to-b from-[#fff1a8] via-[#f5c96a] to-[#c99700] text-black',


        loadingComprar ? 'opacity-70 pointer-events-none' : '',
        selecionado ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* OVR + POSIÇÃO (topo esquerdo) */}
      <div className="absolute left-3 top-3 z-10 text-left leading-none">
        <div className="text-3xl font-extrabold">{jogador.overall}</div>
        <div className="text-xs font-bold uppercase">{jogador.posicao}</div>
      </div>

      {/* IMAGEM */}
      <div className="flex justify-center pt-10">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[180px] object-contain drop-shadow-2xl"
        />
      </div>

      {/* NOME + PREÇO */}
<div className="mt-3 bg-black/25 px-3 py-2 text-center">
  <div className="text-sm font-extrabold uppercase tracking-wide">
    {jogador.nome}
  </div>

  <div className="mt-1 text-sm font-semibold text-green-300">
    {formatarValor(valorAtual)}
  </div>

  {percentualDesconto > 0 && (
    <div className="mt-0.5 text-[11px] text-red-300 font-semibold">
      🔻 -{percentualDesconto}% desde a listagem
    </div>
  )}
</div>


      {/* BOTÃO COMPRAR */}
      <div className="px-3 pb-4 pt-3">
        <button
          onClick={onComprar}
          disabled={loadingComprar || mercadoFechado}
          className={[
            'w-full rounded-xl py-2 text-sm font-bold transition',
            mercadoFechado
              ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700',
          ].join(' ')}
        >
          {loadingComprar
            ? 'Comprando...'
            : mercadoFechado
            ? 'Mercado fechado'
            : 'Comprar'}
        </button>
      </div>
    </div>
  )
}


/* ================= Página ================= */
export default function MercadoPage() {
  const router = useRouter()
  const { isAdmin } = useAdmin()

  const [jogadores, setJogadores] = useState<Jogador[]>([])
  const [saldo, setSaldo] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [selecionados, setSelecionados] = useState<(string | number)[]>([])

  // filtros
  const [filtroNome, setFiltroNome] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroOverallMin, setFiltroOverallMin] = useState<number | ''>('')
  const [filtroOverallMax, setFiltroOverallMax] = useState<number | ''>('')
  const [filtroValorMax, setFiltroValorMax] = useState<number | ''>('')
  const [filtroNacionalidade, setFiltroNacionalidade] = useState('')

  // admin: exclusão por faixa de OVR
  const [excluirOverallMin, setExcluirOverallMin] = useState<number>(79)
  const [excluirOverallMax, setExcluirOverallMax] = useState<number>(80)
  const [modalExcluirFaixaVisivel, setModalExcluirFaixaVisivel] = useState(false)
  const [loadingExcluirFaixa, setLoadingExcluirFaixa] = useState(false)

  const [ordenarPor, setOrdenarPor] = useState('')
  const [itensPorPagina, setItensPorPagina] = useState(40)
  const [paginaAtual, setPaginaAtual] = useState(1)

  // estados gerais
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [loadingComprarId, setLoadingComprarId] = useState<string | number | null>(null)
  const [loadingAtualizarPrecoId, setLoadingAtualizarPrecoId] = useState<string | number | null>(null)
  const [loadingExcluir, setLoadingExcluir] = useState(false)

  const [modalComprarVisivel, setModalComprarVisivel] = useState(false)
  const [modalExcluirVisivel, setModalExcluirVisivel] = useState(false)
  const [jogadorParaComprar, setJogadorParaComprar] = useState<Jogador | null>(null)

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
          // 🔹 IMPORTANTE: garantir data_listagem
          supabase
            .from('mercado_transferencias')
            .select(`
              id,
              nome,
              posicao,
              overall,
              valor,
              salario,
              nacionalidade,
              imagem_url,
              foto,
              link_sofifa,
              data_listagem
            `),

          supabase
            .from('times')
            .select('saldo')
            .eq('id', userData.id_time)
            .single(),

          supabase
            .from('configuracoes')
            .select('aberto')
            .eq('id', 'estado_mercado')
            .single(),
        ])

        if (resMercado.error) throw resMercado.error
        if (resTime.error) throw resTime.error
        if (resMarketStatus.error) throw resMarketStatus.error

        setJogadores(resMercado.data || [])
        setSaldo(resTime.data?.saldo || 0)
        setMarketStatus(resMarketStatus.data?.aberto ? 'aberto' : 'fechado')
      } catch (e: any) {
        console.error('Erro ao carregar dados:', e)
        setErro(
          'Erro ao carregar dados. Tente novamente mais tarde. ' +
            (e.message || e.toString())
        )
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
      const num = Number(String(v).replace(/[^\d.-]/g, ''))
      return Number.isFinite(num) ? num : 0
    }

    type NovoJogador = Omit<Jogador, 'id'>

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames.includes('Consolidado')
          ? 'Consolidado'
          : workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json(sheet)

        const jogadoresParaInserir: NovoJogador[] = (json as any[]).map((raw) => {
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

          const payload: any = {
            nome,
            posicao,
            overall,
            valor,
            imagem_url,
            link_sofifa,
            nacionalidade,
            time_origem,
            data_listagem: new Date().toISOString(),
          }

          return payload as NovoJogador
        })

        const { data: inseridos, error } = await supabase
          .from('mercado_transferencias')
          .insert(jogadoresParaInserir as any[])
          .select('*')

        if (error) throw error

        toast.success(`Importados ${inseridos?.length ?? 0} jogadores com sucesso!`)

        setJogadores((prev) => [...prev, ...((inseridos as unknown as Jogador[]) ?? [])])
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
const solicitarCompra = (jogador: Jogador) => {
  if (marketStatus === 'fechado') {
    toast.error('O mercado está fechado. Não é possível comprar jogadores.')
    return
  }

  const valorCompra = calcularValorComDesgaste(
    jogador.valor,
    (jogador as any).data_listagem
  )

  if (valorCompra > saldo) {
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

  const valorCompra = calcularValorComDesgaste(
    jogadorParaComprar.valor,
    (jogadorParaComprar as any).data_listagem
  )

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

    const jogador = deletedJogador[0] as Jogador

    if (valorCompra > saldo) {
      toast.error('Saldo insuficiente.')
      return
    }

    // BID
    await supabase.from('bid').insert({
      tipo_evento: 'compra',
      descricao: `O ${user.nome_time} comprou ${jogador.nome} por ${formatarValor(valorCompra)}.`,
      id_time1: user.id_time,
      valor: valorCompra,
      data_evento: new Date().toISOString(),
    })

    // Salário = 0.75% do valor REAL pago
    const salario = Math.round(valorCompra * 0.0075)

    const { error: errorInsert } = await supabase.from('elenco').insert({
      id_time: user.id_time,
      nome: jogador.nome,
      posicao: jogador.posicao,
      overall: jogador.overall,
      valor: valorCompra,
      imagem_url: (jogador.imagem_url || jogador.foto || '') as string,
      salario: salario,
      jogos: 0,
      link_sofifa: jogador.link_sofifa || '',
    })
    if (errorInsert) throw errorInsert

    // movimentação financeira
    await registrarMovimentacao({
      id_time: user.id_time,
      tipo: 'saida',
      valor: valorCompra,
      descricao: `Compra de ${jogador.nome} no mercado`,
    })

    const { error: errorUpdate } = await supabase
      .from('times')
      .update({ saldo: saldo - valorCompra })
      .eq('id', user.id_time)
    if (errorUpdate) throw errorUpdate

    setSaldo((prev) => prev - valorCompra)
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
  const toggleSelecionado = (id: string | number) => {
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

  // Excluir por faixa de OVR
  const solicitarExcluirPorFaixa = () => {
    if (!isAdmin) return
    if (excluirOverallMin > excluirOverallMax) {
      toast.error('OVR mín não pode ser maior que o máx')
      return
    }
    setModalExcluirFaixaVisivel(true)
  }

  const confirmarExcluirPorFaixa = async () => {
    setLoadingExcluirFaixa(true)
    try {
      const { data: deletados, error } = await supabase
        .from('mercado_transferencias')
        .delete()
        .gte('overall', excluirOverallMin)
        .lte('overall', excluirOverallMax)
        .select('id')

      if (error) throw error

      const ids = (deletados ?? []).map((d: any) => d.id)
      setJogadores((prev) => prev.filter((j) => !ids.includes(j.id)))
      setSelecionados((prev) => prev.filter((id) => !ids.includes(id)))
      toast.success(`Excluídos ${ids.length} jogador(es) com OVR entre ${excluirOverallMin} e ${excluirOverallMax}.`)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir por faixa de OVR.')
    } finally {
      setLoadingExcluirFaixa(false)
      setModalExcluirFaixaVisivel(false)
    }
  }

  const atualizarPreco = async (jogadorId: string | number, novoValor: number) => {
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

          {/* Ações Admin */}
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

              {/* Excluir por faixa de OVR */}
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-gray-800 px-3 py-2">
                <span className="text-sm text-gray-300">Excluir OVR</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={excluirOverallMin}
                  onChange={(e) => setExcluirOverallMin(Number(e.target.value))}
                  className="w-16 rounded-md border border-white/10 bg-gray-900 px-2 py-1 text-sm outline-none"
                />
                <span className="text-sm text-gray-400">até</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={excluirOverallMax}
                  onChange={(e) => setExcluirOverallMax(Number(e.target.value))}
                  className="w-16 rounded-md border border-white/10 bg-gray-900 px-2 py-1 text-sm outline-none"
                />
                <button
                  onClick={solicitarExcluirPorFaixa}
                  disabled={loadingExcluirFaixa}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                    loadingExcluirFaixa ? 'bg-gray-700 text-gray-300' : 'bg-red-600 text-white hover:bg-red-700',
                  ].join(' ')}
                >
                  {loadingExcluirFaixa ? 'Processando...' : 'Excluir por OVR'}
                </button>
              </div>

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
                key={String(jogador.id)}
                jogador={jogador}
                isAdmin={isAdmin}
                selecionado={selecionados.includes(jogador.id)}
                toggleSelecionado={() => toggleSelecionado(jogador.id)}
                onComprar={() => solicitarCompra(jogador)}
                onAtualizarPreco={(novo) => atualizarPreco(jogador.id, novo)}
                loadingComprar={loadingComprarId === jogador.id}
                loadingAtualizarPreco={loadingAtualizarPrecoId === jogador.id}
                mercadoFechado={mercadoFechado}
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
        mensagem={`Deseja comprar ${jogadorParaComprar?.nome ?? ''} por ${
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

      <ModalConfirm
        visible={modalExcluirFaixaVisivel}
        titulo="Excluir por faixa de OVR"
        mensagem={`Excluir todos os jogadores com OVR entre ${excluirOverallMin} e ${excluirOverallMax}? Esta ação não pode ser desfeita.`}
        onConfirm={confirmarExcluirPorFaixa}
        onCancel={() => setModalExcluirFaixaVisivel(false)}
        loading={loadingExcluirFaixa}
      />
    </>
  )
}
