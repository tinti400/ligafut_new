'use client'

import CardJogador from '@/components/CardJogador'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const calcularValorComDesgaste = (valorInicial: number, dataListagem?: string | null) => {
  if (!dataListagem) return valorInicial

  const agora = Date.now()
  const listagem = new Date(dataListagem).getTime()
  if (!Number.isFinite(listagem)) return valorInicial

  const dias = Math.floor((agora - listagem) / (1000 * 60 * 60 * 24))
  const ciclos = Math.floor(Math.max(0, dias) / 3)
  const desconto = ciclos * 0.05

  const fatorMinimo = 0.6
  const fatorFinal = Math.min(1, Math.max(1 - desconto, fatorMinimo))
  return Math.round(valorInicial * fatorFinal)
}

const formatarValor = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0)

const formatarDataHora = (valor?: string | null) => {
  if (!valor) return 'Não definido'

  const data = new Date(valor)
  if (!Number.isFinite(data.getTime())) return 'Não definido'

  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const converterDatetimeLocalParaISO = (valor: string) => {
  if (!valor) return null
  const data = new Date(valor)
  if (!Number.isFinite(data.getTime())) return null
  return data.toISOString()
}

const converterISOParaDatetimeLocal = (valor?: string | null) => {
  if (!valor) return ''

  const data = new Date(valor)
  if (!Number.isFinite(data.getTime())) return ''

  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  const hora = String(data.getHours()).padStart(2, '0')
  const minuto = String(data.getMinutes()).padStart(2, '0')

  return `${ano}-${mes}-${dia}T${hora}:${minuto}`
}

type StatusMercadoCalculado = {
  abertoManual: boolean
  abertoAgora: boolean
  abreEm: string | null
  fechaEm: string | null
  motivoFechado: string
}

const calcularStatusMercado = (config: any): StatusMercadoCalculado => {
  const abertoManual = !!config?.aberto
  const abreEm = config?.abre_em ?? null
  const fechaEm = config?.fecha_em ?? null

  const agora = new Date()
  const dataAbertura = abreEm ? new Date(abreEm) : null
  const dataFechamento = fechaEm ? new Date(fechaEm) : null

  const aberturaValida = dataAbertura && Number.isFinite(dataAbertura.getTime())
  const fechamentoValido = dataFechamento && Number.isFinite(dataFechamento.getTime())

  if (!abertoManual) {
    return {
      abertoManual,
      abertoAgora: false,
      abreEm,
      fechaEm,
      motivoFechado: 'Fechado manualmente pelo administrador',
    }
  }

  if (aberturaValida && agora < dataAbertura) {
    return {
      abertoManual,
      abertoAgora: false,
      abreEm,
      fechaEm,
      motivoFechado: `Mercado abre em ${formatarDataHora(abreEm)}`,
    }
  }

  if (fechamentoValido && agora > dataFechamento) {
    return {
      abertoManual,
      abertoAgora: false,
      abreEm,
      fechaEm,
      motivoFechado: `Mercado fechou em ${formatarDataHora(fechaEm)}`,
    }
  }

  return {
    abertoManual,
    abertoAgora: true,
    abreEm,
    fechaEm,
    motivoFechado: '',
  }
}

function getTimeLogadoLocal(userData?: any) {
  if (typeof window === 'undefined') {
    return {
      id_time: null as string | null,
      nome_time: null as string | null,
    }
  }

  const id_time =
    localStorage.getItem('id_time') ||
    localStorage.getItem('time_id') ||
    userData?.id_time ||
    userData?.time_id ||
    userData?.time?.id ||
    null

  const nome_time =
    localStorage.getItem('nome_time') ||
    localStorage.getItem('time_nome') ||
    userData?.nome_time ||
    userData?.time_nome ||
    userData?.nome ||
    'clube'

  return { id_time, nome_time }
}

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gray-900 shadow-2xl">
        <div className="p-6">
          <h2 className="text-xl font-bold tracking-tight text-white">{titulo}</h2>
          <p className="mt-2 text-gray-300">{mensagem}</p>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-70"
            >
              Cancelar
            </button>

            <button
              onClick={onConfirm}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-70"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
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
  time_origem?: string | null

  pace?: number | null
  shooting?: number | null
  passing?: number | null
  dribbling?: number | null
  defending?: number | null
  physical?: number | null

  pac?: number | null
  sho?: number | null
  pas?: number | null
  dri?: number | null
  def?: number | null
  phy?: number | null
  ritmo?: number | null
  finalizacao?: number | null
  passe?: number | null
  drible?: number | null
  defesa?: number | null
  fisico?: number | null
}

function ResumoCard({
  titulo,
  valor,
  subtitulo,
}: {
  titulo: string
  valor: string
  subtitulo: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
      <div className="text-xs uppercase tracking-[0.18em] text-white/50">{titulo}</div>
      <div className="mt-2 text-2xl font-black text-white">{valor}</div>
      <div className="mt-1 text-xs text-white/60">{subtitulo}</div>
    </div>
  )
}

function Paginacao({
  paginaAtual,
  totalPaginas,
  totalResultados,
  exibindo,
  onChange,
}: {
  paginaAtual: number
  totalPaginas: number
  totalResultados: number
  exibindo: number
  onChange: (page: number) => void
}) {
  if (totalPaginas <= 1) return null

  const paginaSegura = Math.min(Math.max(1, paginaAtual), totalPaginas)

  const paginasVisiveis = Array.from({ length: totalPaginas }, (_, i) => i + 1).filter((page) => {
    return page === 1 || page === totalPaginas || Math.abs(page - paginaSegura) <= 2
  })

  return (
    <div className="mt-10 flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl backdrop-blur-md">
      <div className="text-center text-sm text-white/60">
        Página <strong className="text-white">{paginaSegura}</strong> de{' '}
        <strong className="text-white">{totalPaginas}</strong> — exibindo{' '}
        <strong className="text-white">{exibindo}</strong> de{' '}
        <strong className="text-white">{totalResultados}</strong> jogador(es)
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => onChange(1)}
          disabled={paginaSegura === 1}
          className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          « Primeira
        </button>

        <button
          onClick={() => onChange(Math.max(1, paginaSegura - 1))}
          disabled={paginaSegura === 1}
          className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ‹ Anterior
        </button>

        {paginasVisiveis.map((page, index, array) => {
          const previousPage = array[index - 1]
          const mostrarReticencias = previousPage && page - previousPage > 1

          return (
            <div key={page} className="flex items-center gap-2">
              {mostrarReticencias && <span className="px-1 text-white/40">...</span>}

              <button
                onClick={() => onChange(page)}
                className={[
                  'rounded-xl px-4 py-2 text-sm font-black transition',
                  page === paginaSegura
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                    : 'border border-white/10 bg-gray-800 text-white hover:bg-gray-700',
                ].join(' ')}
              >
                {page}
              </button>
            </div>
          )
        })}

        <button
          onClick={() => onChange(Math.min(totalPaginas, paginaSegura + 1))}
          disabled={paginaSegura === totalPaginas}
          className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Próxima ›
        </button>

        <button
          onClick={() => onChange(totalPaginas)}
          disabled={paginaSegura === totalPaginas}
          className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm font-bold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Última »
        </button>
      </div>
    </div>
  )
}

export default function MercadoPage() {
  const router = useRouter()
  const { isAdmin } = useAdmin()

  const [jogadores, setJogadores] = useState<Jogador[]>([])
  const [saldo, setSaldo] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [selecionados, setSelecionados] = useState<(string | number)[]>([])

  const [filtroNome, setFiltroNome] = useState('')
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroOverallMin, setFiltroOverallMin] = useState<number | ''>('')
  const [filtroOverallMax, setFiltroOverallMax] = useState<number | ''>('')
  const [filtroValorMax, setFiltroValorMax] = useState<number | ''>('')
  const [filtroNacionalidade, setFiltroNacionalidade] = useState('')

  const [excluirOverallMin, setExcluirOverallMin] = useState<number>(79)
  const [excluirOverallMax, setExcluirOverallMax] = useState<number>(80)
  const [modalExcluirFaixaVisivel, setModalExcluirFaixaVisivel] = useState(false)
  const [loadingExcluirFaixa, setLoadingExcluirFaixa] = useState(false)

  const [ordenarPor, setOrdenarPor] = useState('')
  const [itensPorPagina, setItensPorPagina] = useState(40)
  const [paginaAtual, setPaginaAtual] = useState(1)

  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [loadingComprarId, setLoadingComprarId] = useState<string | number | null>(null)
  const [loadingExcluir, setLoadingExcluir] = useState(false)

  const [modalComprarVisivel, setModalComprarVisivel] = useState(false)
  const [modalExcluirVisivel, setModalExcluirVisivel] = useState(false)
  const [jogadorParaComprar, setJogadorParaComprar] = useState<Jogador | null>(null)

  const [uploadLoading, setUploadLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const [marketStatus, setMarketStatus] = useState<'aberto' | 'fechado'>('fechado')
  const [mercadoAbertoManual, setMercadoAbertoManual] = useState(false)
  const [mercadoMotivoFechado, setMercadoMotivoFechado] = useState('')
  const [mercadoAbreEm, setMercadoAbreEm] = useState<string | null>(null)
  const [mercadoFechaEm, setMercadoFechaEm] = useState<string | null>(null)
  const [inputAbreEm, setInputAbreEm] = useState('')
  const [inputFechaEm, setInputFechaEm] = useState('')
  const [loadingSalvarHorario, setLoadingSalvarHorario] = useState(false)

  useEffect(() => {
    const userStorage = localStorage.getItem('user')
    if (!userStorage) {
      router.push('/login')
      return
    }

    setLoading(true)
    setErro(null)

    const userData = JSON.parse(userStorage)
    const identidade = getTimeLogadoLocal(userData)

    if (!identidade.id_time) {
      toast.error('Time logado não identificado. Faça login novamente.')
      router.push('/login')
      return
    }

    const userPadronizado = {
      ...userData,
      id_time: identidade.id_time,
      nome_time: identidade.nome_time,
    }

    setUser(userPadronizado)

    const carregarDados = async () => {
      try {
        const [resMercado, resTime, resMarketStatus] = await Promise.all([
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
              data_listagem,
              time_origem,
              pace,
              shooting,
              passing,
              dribbling,
              defending,
              physical
            `),
          supabase.from('times').select('saldo').eq('id', identidade.id_time).single(),
          supabase.from('configuracoes').select('aberto, abre_em, fecha_em').eq('id', 'estado_mercado').single(),
        ])

        if (resMercado.error) throw resMercado.error
        if (resTime.error) throw resTime.error
        if (resMarketStatus.error) throw resMarketStatus.error

        const statusCalculado = calcularStatusMercado(resMarketStatus.data)

        setJogadores(resMercado.data || [])
        setSaldo(resTime.data?.saldo || 0)
        setMarketStatus(statusCalculado.abertoAgora ? 'aberto' : 'fechado')
        setMercadoAbertoManual(statusCalculado.abertoManual)
        setMercadoMotivoFechado(statusCalculado.motivoFechado)
        setMercadoAbreEm(statusCalculado.abreEm)
        setMercadoFechaEm(statusCalculado.fechaEm)
        setInputAbreEm(converterISOParaDatetimeLocal(statusCalculado.abreEm))
        setInputFechaEm(converterISOParaDatetimeLocal(statusCalculado.fechaEm))
      } catch (e: any) {
        console.error('Erro ao carregar dados:', e)
        setErro('Erro ao carregar dados. ' + (e?.message || e?.toString() || ''))
      } finally {
        setLoading(false)
      }
    }

    carregarDados()
  }, [router])

  useEffect(() => {
    const intervalo = setInterval(() => {
      const statusCalculado = calcularStatusMercado({
        aberto: mercadoAbertoManual,
        abre_em: mercadoAbreEm,
        fecha_em: mercadoFechaEm,
      })

      setMarketStatus(statusCalculado.abertoAgora ? 'aberto' : 'fechado')
      setMercadoMotivoFechado(statusCalculado.motivoFechado)
    }, 15000)

    return () => clearInterval(intervalo)
  }, [mercadoAbertoManual, mercadoAbreEm, mercadoFechaEm])

  const irParaPagina = (page: number) => {
    setPaginaAtual(page)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const resetarPagina = () => {
    setPaginaAtual(1)
  }

  const recarregarStatusMercado = async () => {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('aberto, abre_em, fecha_em')
      .eq('id', 'estado_mercado')
      .single()

    if (error) throw error

    const statusCalculado = calcularStatusMercado(data)

    setMarketStatus(statusCalculado.abertoAgora ? 'aberto' : 'fechado')
    setMercadoAbertoManual(statusCalculado.abertoManual)
    setMercadoMotivoFechado(statusCalculado.motivoFechado)
    setMercadoAbreEm(statusCalculado.abreEm)
    setMercadoFechaEm(statusCalculado.fechaEm)
    setInputAbreEm(converterISOParaDatetimeLocal(statusCalculado.abreEm))
    setInputFechaEm(converterISOParaDatetimeLocal(statusCalculado.fechaEm))

    return statusCalculado
  }

  const salvarHorarioMercado = async () => {
    if (!isAdmin) return

    const abreEmISO = converterDatetimeLocalParaISO(inputAbreEm)
    const fechaEmISO = converterDatetimeLocalParaISO(inputFechaEm)

    if (abreEmISO && fechaEmISO && new Date(abreEmISO).getTime() >= new Date(fechaEmISO).getTime()) {
      toast.error('O horário de abertura precisa ser antes do horário de fechamento.')
      return
    }

    setLoadingSalvarHorario(true)

    try {
      const { error } = await supabase
        .from('configuracoes')
        .update({
          abre_em: abreEmISO,
          fecha_em: fechaEmISO,
        })
        .eq('id', 'estado_mercado')

      if (error) throw error

      await recarregarStatusMercado()
      toast.success('Horário do mercado salvo com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar horário do mercado:', error)
      toast.error('Erro ao salvar horário do mercado.')
    } finally {
      setLoadingSalvarHorario(false)
    }
  }

  const limparHorarioMercado = async () => {
    if (!isAdmin) return

    setLoadingSalvarHorario(true)

    try {
      const { error } = await supabase
        .from('configuracoes')
        .update({
          abre_em: null,
          fecha_em: null,
        })
        .eq('id', 'estado_mercado')

      if (error) throw error

      await recarregarStatusMercado()
      toast.success('Horários removidos. O mercado agora depende apenas do botão abrir/fechar.')
    } catch (error) {
      console.error('Erro ao limpar horário do mercado:', error)
      toast.error('Erro ao limpar horário do mercado.')
    } finally {
      setLoadingSalvarHorario(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadLoading(true)
    setMsg('Lendo planilha...')

    const normalizeKeys = (obj: any) =>
      Object.fromEntries(Object.entries(obj).map(([k, v]) => [String(k).trim().toLowerCase(), v]))

    const sanitizeUrl = (u?: any) => {
      if (!u) return ''
      return String(u).trim().replace(/\s/g, '%20')
    }

    const pickImagemUrl = (row: Record<string, any>) => {
      const cand = row['imagem_url'] ?? row['foto'] ?? row['imagem url'] ?? row['url_imagem'] ?? row['imagem']
      return sanitizeUrl(cand)
    }

    const toNumber = (v: any) => {
      if (v === null || v === undefined || v === '') return 0
      const num = Number(String(v).replace(/[^\d.-]/g, ''))
      return Number.isFinite(num) ? num : 0
    }

    const pickNumber = (row: Record<string, any>, keys: string[]) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
          return toNumber(row[key])
        }
      }
      return 0
    }

    type NovoJogador = Omit<Jogador, 'id'>

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames.includes('Consolidado') ? 'Consolidado' : workbook.SheetNames[0]
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

          const pace = pickNumber(row, ['pace', 'pac', 'velocidade'])
          const shooting = pickNumber(row, ['shooting', 'sho', 'finalizacao', 'chute'])
          const passing = pickNumber(row, ['passing', 'pas', 'passe'])
          const dribbling = pickNumber(row, ['dribbling', 'dri', 'drible'])
          const defending = pickNumber(row, ['defending', 'def', 'defesa'])
          const physical = pickNumber(row, ['physical', 'phy', 'fisico', 'físico'])

          if (!nome || !posicao || !overall || !valor) {
            throw new Error('Colunas obrigatórias: nome, posicao, overall, valor')
          }

          return {
            nome,
            posicao,
            overall,
            valor,
            imagem_url,
            link_sofifa,
            nacionalidade,
            time_origem,
            data_listagem: new Date().toISOString(),
            pace,
            shooting,
            passing,
            dribbling,
            defending,
            physical,
          } as any
        })

        const { data: inseridos, error } = await supabase
          .from('mercado_transferencias')
          .insert(jogadoresParaInserir as any[])
          .select('*')

        if (error) throw error

        toast.success(`Importados ${inseridos?.length ?? 0} jogadores com sucesso!`)
        setJogadores((prev) => [...prev, ...((inseridos as unknown as Jogador[]) ?? [])])
        resetarPagina()
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

  const solicitarCompra = async (jogador: Jogador) => {
    try {
      const statusAtual = await recarregarStatusMercado()

      if (!statusAtual.abertoAgora) {
        toast.error(statusAtual.motivoFechado || 'O mercado está fechado. Não é possível comprar jogadores.')
        return
      }
    } catch {
      if (marketStatus === 'fechado') {
        toast.error(mercadoMotivoFechado || 'O mercado está fechado. Não é possível comprar jogadores.')
        return
      }
    }

    const valorCompra = calcularValorComDesgaste(jogador.valor, jogador.data_listagem ?? null)

    if (valorCompra > saldo) {
      toast.error('Saldo insuficiente!')
      return
    }

    setJogadorParaComprar(jogador)
    setModalComprarVisivel(true)
  }

  const registrarFinanceiroCompraMercado = async ({
    idTimeComprador,
    jogadorMercado,
    valorCompra,
    saldoAtual,
    novoSaldo,
  }: {
    idTimeComprador: string
    jogadorMercado: any
    valorCompra: number
    saldoAtual: number
    novoSaldo: number
  }) => {
    const registrar = registrarMovimentacao as unknown as (payload: any) => Promise<boolean>

    const ok = await registrar({
      id_time: idTimeComprador,
      tipo: 'saida',
      valor: valorCompra,
      descricao: `Compra no mercado: ${jogadorMercado.nome}`,
      origem: 'mercado_transferencias',
      id_referencia: String(jogadorMercado.id),
      saldo_antes: saldoAtual,
      saldo_depois: novoSaldo,
    })

    if (!ok) {
      console.warn('⚠️ Compra mantida, mas a movimentação financeira não foi registrada.')
    }
  }

  const registrarBIDCompraMercado = async ({
    idTimeComprador,
    nomeTimeComprador,
    jogadorMercado,
    valorCompra,
  }: {
    idTimeComprador: string
    nomeTimeComprador: string
    jogadorMercado: any
    valorCompra: number
  }) => {
    const descricaoCompra = `${nomeTimeComprador} comprou ${jogadorMercado.nome} no Mercado de Transferências por ${formatarValor(valorCompra)}.`

    const payloadCompleto = {
      tipo_evento: 'compra_mercado',
      descricao: descricaoCompra,
      id_time1: idTimeComprador,
      id_time2: null,
      valor: valorCompra,
      nome_jogador: jogadorMercado.nome,
      foto_jogador_url: jogadorMercado.imagem_url || jogadorMercado.foto || null,
      data_evento: new Date().toISOString(),
    }

    const { error } = await supabase.from('bid').insert(payloadCompleto)

    if (!error) return

    console.warn('⚠️ Erro ao registrar BID completo. Tentando payload básico:', error)

    const { error: errorBasico } = await supabase.from('bid').insert({
      tipo_evento: 'compra_mercado',
      descricao: descricaoCompra,
      id_time1: idTimeComprador,
      valor: valorCompra,
      data_evento: new Date().toISOString(),
    })

    if (errorBasico) {
      console.warn('⚠️ Compra mantida, mas não foi possível registrar no BID:', errorBasico)
    }
  }

  const confirmarCompra = async () => {
    if (!jogadorParaComprar || !user) {
      setModalComprarVisivel(false)
      return
    }

    const identidade = getTimeLogadoLocal(user)

    const idTimeComprador = identidade.id_time
    const nomeTimeComprador = identidade.nome_time || 'clube'

    if (!idTimeComprador) {
      toast.error('Time comprador não identificado.')
      setModalComprarVisivel(false)
      setJogadorParaComprar(null)
      return
    }

    let idElencoInserido: string | number | null = null

    try {
      setLoadingComprarId(jogadorParaComprar.id)

      const [resTime, resMarketStatus, resJogadorMercado] = await Promise.all([
        supabase.from('times').select('saldo').eq('id', idTimeComprador).single(),
        supabase.from('configuracoes').select('aberto, abre_em, fecha_em').eq('id', 'estado_mercado').single(),
        supabase.from('mercado_transferencias').select('*').eq('id', jogadorParaComprar.id).maybeSingle(),
      ])

      if (resTime.error) throw resTime.error
      if (resMarketStatus.error) throw resMarketStatus.error
      if (resJogadorMercado.error) throw resJogadorMercado.error

      const statusCalculado = calcularStatusMercado(resMarketStatus.data)
      const saldoAtual = Number(resTime.data?.saldo ?? 0)
      const jogadorMercado = resJogadorMercado.data as any

      setSaldo(saldoAtual)
      setMarketStatus(statusCalculado.abertoAgora ? 'aberto' : 'fechado')
      setMercadoAbertoManual(statusCalculado.abertoManual)
      setMercadoMotivoFechado(statusCalculado.motivoFechado)
      setMercadoAbreEm(statusCalculado.abreEm)
      setMercadoFechaEm(statusCalculado.fechaEm)

      if (!statusCalculado.abertoAgora) {
        toast.error(statusCalculado.motivoFechado || 'O mercado está fechado. Não é possível comprar agora.')
        return
      }

      if (!jogadorMercado) {
        toast.error('Esse jogador já foi comprado por outro clube.')
        setJogadores((prev) => prev.filter((j) => j.id !== jogadorParaComprar.id))
        return
      }

      const valorCompra = calcularValorComDesgaste(
        Number(jogadorMercado.valor || 0),
        jogadorMercado.data_listagem ?? null
      )

      if (valorCompra > saldoAtual) {
        toast.error('Saldo insuficiente.')
        return
      }

      const { data: elencoAtual, error: errorElenco } = await supabase
        .from('elenco')
        .select('id')
        .eq('id_time', idTimeComprador)

      if (errorElenco) throw errorElenco

      if ((elencoAtual?.length || 0) >= 25) {
        toast.error('🚫 Você tem 25 ou mais jogadores no seu elenco. Venda para comprar do mercado!')
        return
      }

      const { data: jaNoElenco, error: erroDuplicado } = await supabase
        .from('elenco')
        .select('id')
        .eq('id_time', idTimeComprador)
        .eq('nome', jogadorMercado.nome)
        .maybeSingle()

      if (erroDuplicado) throw erroDuplicado

      if (jaNoElenco) {
        toast.error('Esse jogador já está no seu elenco.')
        return
      }

      const salarioCalculado = jogadorMercado.salario || Math.round(valorCompra * 0.075)

      const payloadElenco = {
        id_time: idTimeComprador,
        nome: jogadorMercado.nome,
        posicao: jogadorMercado.posicao,
        overall: jogadorMercado.overall,
        valor: valorCompra,
        imagem_url: jogadorMercado.imagem_url || jogadorMercado.foto || '',
        salario: salarioCalculado,
        jogos: 0,
        nacionalidade: jogadorMercado.nacionalidade || null,
        link_sofifa: jogadorMercado.link_sofifa || '',
        percentual: 100,
        pace: jogadorMercado.pace ?? 0,
        shooting: jogadorMercado.shooting ?? 0,
        passing: jogadorMercado.passing ?? 0,
        dribbling: jogadorMercado.dribbling ?? 0,
        defending: jogadorMercado.defending ?? 0,
        physical: jogadorMercado.physical ?? 0,
      }

      const { data: novoElenco, error: errorInsert } = await supabase
        .from('elenco')
        .insert(payloadElenco)
        .select('*')
        .single()

      if (errorInsert) {
        console.error('❌ Erro ao inserir jogador no elenco:', {
          message: errorInsert.message,
          details: errorInsert.details,
          hint: errorInsert.hint,
          code: errorInsert.code,
          payloadElenco,
        })
        toast.error(`Erro ao inserir no elenco: ${errorInsert.message}`)
        return
      }

      idElencoInserido = novoElenco?.id ?? null

      const novoSaldo = saldoAtual - valorCompra
      const { error: errorUpdateSaldo } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', idTimeComprador)

      if (errorUpdateSaldo) {
        if (idElencoInserido) {
          await supabase.from('elenco').delete().eq('id', idElencoInserido)
        }
        throw errorUpdateSaldo
      }

      try {
        await registrarFinanceiroCompraMercado({
          idTimeComprador,
          jogadorMercado,
          valorCompra,
          saldoAtual,
          novoSaldo,
        })
      } catch (e) {
        console.warn('⚠️ Erro ao registrar no painel financeiro, mas compra mantida:', e)
      }

      try {
        await registrarBIDCompraMercado({
          idTimeComprador,
          nomeTimeComprador,
          jogadorMercado,
          valorCompra,
        })
      } catch (e) {
        console.warn('⚠️ Erro inesperado ao registrar compra no BID, mas compra mantida:', e)
      }

      const { error: deleteError } = await supabase
        .from('mercado_transferencias')
        .delete()
        .eq('id', jogadorMercado.id)

      if (deleteError) {
        console.warn('⚠️ Jogador entrou no elenco, mas não saiu do mercado:', deleteError)
        toast.error('Jogador entrou no elenco, mas não saiu do mercado. Remova manualmente no admin.')
      }

      try {
        localStorage.setItem('id_time', String(idTimeComprador))
        if (nomeTimeComprador) localStorage.setItem('nome_time', String(nomeTimeComprador))
      } catch {}

      setSaldo(novoSaldo)
      setJogadores((prev) => prev.filter((j) => j.id !== jogadorMercado.id))
      setSelecionados((prev) => prev.filter((id) => id !== jogadorMercado.id))

      toast.success(`${jogadorMercado.nome} foi contratado e entrou no elenco!`)
    } catch (error: any) {
      console.error('❌ Erro na compra:', error)
      toast.error(error?.message || 'Ocorreu um erro ao comprar o jogador.')

      if (idElencoInserido) {
        await supabase.from('elenco').delete().eq('id', idElencoInserido)
      }
    } finally {
      setLoadingComprarId(null)
      setModalComprarVisivel(false)
      setJogadorParaComprar(null)
    }
  }

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
      resetarPagina()
      toast.success('Jogadores excluídos com sucesso!')
    } catch (error) {
      console.error('Erro ao excluir:', error)
      toast.error('Erro ao excluir jogadores.')
    } finally {
      setLoadingExcluir(false)
      setModalExcluirVisivel(false)
    }
  }

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
      resetarPagina()
      toast.success(`Excluídos ${ids.length} jogador(es) com OVR entre ${excluirOverallMin} e ${excluirOverallMax}.`)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir por faixa de OVR.')
    } finally {
      setLoadingExcluirFaixa(false)
      setModalExcluirFaixaVisivel(false)
    }
  }

  const toggleMarketStatus = async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const novoStatus = !mercadoAbertoManual
      const { error } = await supabase
        .from('configuracoes')
        .update({ aberto: novoStatus })
        .eq('id', 'estado_mercado')

      if (error) throw error
      await recarregarStatusMercado()
      toast.success(`Mercado ${novoStatus ? 'liberado pelo admin' : 'fechado manualmente'} com sucesso!`)
    } catch (error) {
      console.error('Erro ao alterar status do mercado:', error)
      toast.error('Erro ao alterar status do mercado.')
    } finally {
      setLoading(false)
    }
  }

  const jogadoresFiltrados = useMemo(() => {
    const lista = jogadores
      .filter((j) => {
        const nomeMatch = (j.nome ?? '').toLowerCase().includes(filtroNome.toLowerCase())
        const posicaoMatch = filtroPosicao ? j.posicao === filtroPosicao : true
        const overallMin = filtroOverallMin === '' ? 0 : filtroOverallMin
        const overallMax = filtroOverallMax === '' ? 99 : filtroOverallMax
        const valorMax = filtroValorMax === '' ? Infinity : filtroValorMax

        const nacionalidadeJogador =
          j.nacionalidade && j.nacionalidade.trim() !== '' ? j.nacionalidade : 'Resto do Mundo'

        const nacionalidadeMatch = filtroNacionalidade
          ? nacionalidadeJogador.toLowerCase().includes(filtroNacionalidade.toLowerCase())
          : true

        const overallMatch = Number(j.overall || 0) >= overallMin && Number(j.overall || 0) <= overallMax
        const valorMatch = Number(j.valor || 0) <= valorMax

        return nomeMatch && posicaoMatch && overallMatch && valorMatch && nacionalidadeMatch
      })
      .sort((a, b) => {
        if (ordenarPor === 'valor_asc') return Number(a.valor || 0) - Number(b.valor || 0)
        if (ordenarPor === 'valor_desc') return Number(b.valor || 0) - Number(a.valor || 0)
        if (ordenarPor === 'overall_asc') return Number(a.overall || 0) - Number(b.overall || 0)
        if (ordenarPor === 'overall_desc') return Number(b.overall || 0) - Number(a.overall || 0)
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

  useEffect(() => {
    if (paginaAtual > totalPaginas) {
      setPaginaAtual(1)
    }
  }, [paginaAtual, totalPaginas])

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

  if (!user) return <p className="mt-10 text-center text-white">🔒 Carregando sessão...</p>
  if (loading) return <p className="mt-10 text-center text-white">⏳ Carregando dados...</p>
  if (erro) return <p className="mt-10 text-center text-red-500">{erro}</p>

  const mercadoFechado = marketStatus === 'fechado'

  const valorModalCompra = jogadorParaComprar
    ? calcularValorComDesgaste(jogadorParaComprar.valor, jogadorParaComprar.data_listagem ?? null)
    : 0

  const mediaOverall =
    jogadores.length > 0
      ? Math.round(jogadores.reduce((acc, j) => acc + Number(j.overall || 0), 0) / jogadores.length)
      : 0

  const maisCaro =
    jogadores.length > 0 ? jogadores.reduce((prev, curr) => (curr.valor > prev.valor ? curr : prev), jogadores[0]) : null

  return (
    <>
      <Toaster position="top-right" />

      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#050505_45%,#000_100%)] text-white">
        <div className="border-b border-white/10 bg-black/40 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div
                  className={[
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                    mercadoFechado
                      ? 'border-red-500/20 bg-red-500/10 text-red-300'
                      : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
                  ].join(' ')}
                >
                  {mercadoFechado ? 'Mercado fechado' : 'Mercado aberto'}
                </div>

                <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                  <span className="bg-gradient-to-r from-yellow-300 via-emerald-300 to-lime-300 bg-clip-text text-transparent">
                    MERCADO DE TRANSFERÊNCIAS
                  </span>
                </h1>

                <p className="mt-3 max-w-2xl text-sm text-white/65">
                  Negocie, filtre, compare e fortaleça seu elenco com jogadores listados no mercado.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ring-1 ring-inset',
                    mercadoFechado
                      ? 'bg-red-500/10 text-red-300 ring-red-500/30'
                      : 'bg-green-500/10 text-green-300 ring-green-500/30',
                  ].join(' ')}
                >
                  {mercadoFechado ? '🔒 Mercado fechado' : '🔓 Mercado aberto'}
                </span>

                {isAdmin && (
                  <>
                    <button
                      onClick={toggleMarketStatus}
                      disabled={loading}
                      className={[
                        'rounded-2xl px-4 py-2.5 text-sm font-bold transition',
                        !mercadoAbertoManual
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-yellow-500 text-black hover:bg-yellow-400',
                      ].join(' ')}
                    >
                      {loading ? 'Processando...' : !mercadoAbertoManual ? 'Liberar mercado' : 'Fechar manualmente'}
                    </button>

                    <button
                      type="button"
                      onClick={() => document.getElementById('input-xlsx-upload')?.click()}
                      disabled={uploadLoading || mercadoFechado}
                      className={[
                        'rounded-2xl px-4 py-2.5 text-sm font-bold transition',
                        uploadLoading ? 'bg-gray-700 text-gray-300' : 'bg-blue-600 text-white hover:bg-blue-700',
                        mercadoFechado ? 'cursor-not-allowed opacity-60' : '',
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
        </div>

        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ResumoCard titulo="Saldo disponível" valor={formatarValor(saldo)} subtitulo="Caixa atual do seu clube" />
            <ResumoCard titulo="Jogadores no mercado" valor={String(jogadores.length)} subtitulo="Total de atletas listados" />
            <ResumoCard titulo="Overall médio" valor={String(mediaOverall)} subtitulo="Nível médio dos jogadores" />
            <ResumoCard titulo="Mais caro" valor={maisCaro ? formatarValor(maisCaro.valor) : '—'} subtitulo={maisCaro ? maisCaro.nome : 'Sem dados'} />
          </div>

          <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Janela do mercado</h2>
                <p className="mt-1 text-sm text-white/60">
                  {mercadoFechado
                    ? mercadoMotivoFechado || 'O mercado está fechado no momento.'
                    : 'O mercado está aberto para compras.'}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-white/45">Abre em:</span>{' '}
                    <strong className="text-emerald-300">{formatarDataHora(mercadoAbreEm)}</strong>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-white/45">Fecha em:</span>{' '}
                    <strong className="text-red-300">{formatarDataHora(mercadoFechaEm)}</strong>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="grid w-full gap-3 lg:max-w-2xl lg:grid-cols-[1fr_1fr_auto_auto]">
                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-white/45">
                      Abrir em
                    </label>
                    <input
                      type="datetime-local"
                      value={inputAbreEm}
                      onChange={(e) => setInputAbreEm(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-white/45">
                      Fechar em
                    </label>
                    <input
                      type="datetime-local"
                      value={inputFechaEm}
                      onChange={(e) => setInputFechaEm(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition focus:border-green-500"
                    />
                  </div>

                  <button
                    onClick={salvarHorarioMercado}
                    disabled={loadingSalvarHorario}
                    className="self-end rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingSalvarHorario ? 'Salvando...' : 'Salvar horário'}
                  </button>

                  <button
                    onClick={limparHorarioMercado}
                    disabled={loadingSalvarHorario}
                    className="self-end rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm font-black text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-md">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">Filtros do mercado</h2>
                <p className="text-sm text-white/60">Refine sua busca para encontrar exatamente o perfil que deseja.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-gray-300 ring-1 ring-white/10">
                  {totalResultados} resultado(s)
                </span>
                <button
                  onClick={limparFiltros}
                  className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm transition hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
              <input
                type="text"
                placeholder="🔎 Buscar por nome"
                value={filtroNome}
                onChange={(e) => {
                  setFiltroNome(e.target.value)
                  resetarPagina()
                }}
                className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
              />

              <select
                value={filtroPosicao}
                onChange={(e) => {
                  setFiltroPosicao(e.target.value)
                  resetarPagina()
                }}
                className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition focus:border-green-500"
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
                onChange={(e) => {
                  setFiltroNacionalidade(e.target.value)
                  resetarPagina()
                }}
                className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
              />

              <select
                value={ordenarPor}
                onChange={(e) => {
                  setOrdenarPor(e.target.value)
                  resetarPagina()
                }}
                className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition focus:border-green-500"
              >
                <option value="">Ordenar...</option>
                <option value="valor_asc">Valor ↑</option>
                <option value="valor_desc">Valor ↓</option>
                <option value="overall_asc">Overall ↑</option>
                <option value="overall_desc">Overall ↓</option>
              </select>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="OVR mín"
                  value={filtroOverallMin}
                  onChange={(e) => {
                    setFiltroOverallMin(e.target.value === '' ? '' : Number(e.target.value))
                    resetarPagina()
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
                  min={0}
                  max={99}
                />
                <input
                  type="number"
                  placeholder="OVR máx"
                  value={filtroOverallMax}
                  onChange={(e) => {
                    setFiltroOverallMax(e.target.value === '' ? '' : Number(e.target.value))
                    resetarPagina()
                  }}
                  className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
                  min={0}
                  max={99}
                />
              </div>

              <input
                type="number"
                placeholder="💰 Valor máx (R$)"
                value={filtroValorMax}
                onChange={(e) => {
                  setFiltroValorMax(e.target.value === '' ? '' : Number(e.target.value))
                  resetarPagina()
                }}
                className="w-full rounded-2xl border border-white/10 bg-gray-800 px-4 py-3 text-sm outline-none transition placeholder:text-gray-500 focus:border-green-500"
                min={0}
              />

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300">Por página</label>
                <select
                  value={itensPorPagina}
                  onChange={(e) => {
                    setItensPorPagina(Number(e.target.value))
                    setPaginaAtual(1)
                  }}
                  className="rounded-xl border border-white/10 bg-gray-800 px-3 py-2 text-sm outline-none transition focus:border-green-500"
                >
                  <option value={20}>20</option>
                  <option value={40}>40</option>
                  <option value={80}>80</option>
                  <option value={120}>120</option>
                </select>
              </div>
            </div>

            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
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

          <Paginacao
            paginaAtual={paginaSegura}
            totalPaginas={totalPaginas}
            totalResultados={totalResultados}
            exibindo={jogadoresPaginados.length}
            onChange={irParaPagina}
          />

          <div className="mt-6 grid grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {jogadoresPaginados.length > 0 ? (
              jogadoresPaginados.map((jogador) => (
                <div key={String(jogador.id)} className="relative flex justify-center">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => toggleSelecionado(jogador.id)}
                      className={[
                        'absolute right-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-black shadow-lg backdrop-blur-md transition',
                        selecionados.includes(jogador.id)
                          ? 'border-red-400/60 bg-red-500/30 text-white'
                          : 'border-white/20 bg-black/45 text-white hover:bg-white/15',
                      ].join(' ')}
                      title="Selecionar para excluir"
                    >
                      {selecionados.includes(jogador.id) ? '✓' : '+'}
                    </button>
                  )}

                  <CardJogador
                    modo="mercado"
                    selecionado={selecionados.includes(jogador.id)}
                    onToggleSelecionado={isAdmin ? () => toggleSelecionado(jogador.id) : undefined}
                    onComprar={() => solicitarCompra(jogador)}
                    loadingComprar={loadingComprarId === jogador.id}
                    mercadoFechado={mercadoFechado}
                    jogador={{
                      id: jogador.id,
                      nome: jogador.nome,
                      overall: jogador.overall ?? 0,
                      posicao: jogador.posicao,
                      nacionalidade: jogador.nacionalidade ?? undefined,
                      imagem_url: jogador.imagem_url ?? jogador.foto ?? undefined,
                      foto: jogador.foto ?? undefined,
                      valor: calcularValorComDesgaste(jogador.valor, jogador.data_listagem ?? null),
                      salario:
                        jogador.salario ??
                        Math.round(calcularValorComDesgaste(jogador.valor, jogador.data_listagem ?? null) * 0.075),

                      pace: jogador.pace ?? jogador.pac ?? jogador.ritmo ?? null,
                      shooting: jogador.shooting ?? jogador.sho ?? jogador.finalizacao ?? null,
                      passing: jogador.passing ?? jogador.pas ?? jogador.passe ?? null,
                      dribbling: jogador.dribbling ?? jogador.dri ?? jogador.drible ?? null,
                      defending: jogador.defending ?? jogador.def ?? jogador.defesa ?? null,
                      physical: jogador.physical ?? jogador.phy ?? jogador.fisico ?? null,

                      pac: jogador.pac ?? jogador.pace ?? jogador.ritmo ?? null,
                      sho: jogador.sho ?? jogador.shooting ?? jogador.finalizacao ?? null,
                      pas: jogador.pas ?? jogador.passing ?? jogador.passe ?? null,
                      dri: jogador.dri ?? jogador.dribbling ?? jogador.drible ?? null,
                      def: jogador.def ?? jogador.defending ?? jogador.defesa ?? null,
                      phy: jogador.phy ?? jogador.physical ?? jogador.fisico ?? null,
                    }}
                  />
                </div>
              ))
            ) : (
              <div className="col-span-full rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
                <div className="text-2xl">🧐</div>
                <p className="mt-3 text-gray-300">Nenhum jogador encontrado com os filtros atuais.</p>
                <p className="mt-1 text-sm text-gray-500">Tente limpar os filtros ou ajustar a busca.</p>
              </div>
            )}
          </div>

          <Paginacao
            paginaAtual={paginaSegura}
            totalPaginas={totalPaginas}
            totalResultados={totalResultados}
            exibindo={jogadoresPaginados.length}
            onChange={irParaPagina}
          />
        </div>
      </main>

      <ModalConfirm
        visible={modalComprarVisivel}
        titulo="Confirmar Compra"
        mensagem={
          jogadorParaComprar
            ? `Deseja comprar ${jogadorParaComprar.nome} por ${formatarValor(valorModalCompra)}?`
            : 'Deseja confirmar a compra?'
        }
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
