'use client'

import CardJogador from '@/components/CardJogador'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

/** ===== Supabase ===== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
type Ordenacao = 'valor' | 'overall' | 'salario' | 'jogos' | 'nome' | 'posicao'
type ViewMode = 'grid' | 'table'

interface Jogador {
  id: string
  id_time: string
  nome: string
  posicao: string
  overall: number | null
  valor: number | null
  salario: number | null
  jogos: number | null
  nacionalidade?: string | null
  imagem_url?: string | null
  link_sofifa?: string | null
  protegido?: boolean | null
  lesionado?: boolean | null
  percentual?: number | null
}

/** ===== Regra de salário (7.5%) ===== */
const SALARIO_PERCENTUAL = 0.075
const calcularSalario = (valor: number | null | undefined) =>
  Math.round(Number(valor || 0) * SALARIO_PERCENTUAL)

/** ===== Util ===== */
const bandeiras: Record<string, string> = {
  Brasil: 'br',
  Argentina: 'ar',
  Portugal: 'pt',
  Espanha: 'es',
  França: 'fr',
  Inglaterra: 'gb',
  Alemanha: 'de',
  Itália: 'it',
  Holanda: 'nl',
  Bélgica: 'be',
  Uruguai: 'uy',
  Chile: 'cl',
  Colômbia: 'co',
  México: 'mx',
  Estados_Unidos: 'us',
  Canadá: 'ca',
  Paraguai: 'py',
  Peru: 'pe',
  Equador: 'ec',
  Bolívia: 'bo',
  Venezuela: 've',
  Congo: 'cg',
  Guiana: 'gy',
  Suriname: 'sr',
  Honduras: 'hn',
  Nicarágua: 'ni',
  Guatemala: 'gt',
  Costa_Rica: 'cr',
  Panamá: 'pa',
  Jamaica: 'jm',
  Camarões: 'cm',
  Senegal: 'sn',
  Marrocos: 'ma',
  Egito: 'eg',
  Argélia: 'dz',
  Croácia: 'hr',
  Sérvia: 'rs',
  Suíça: 'ch',
  Polônia: 'pl',
  Rússia: 'ru',
  Japão: 'jp',
  Coreia_do_Sul: 'kr',
  Austrália: 'au',
}

const formatBRL = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))

/** ===== Componentes UI ===== */
function StatPill({
  icon,
  label,
  value,
}: {
  icon: string
  label: string
  value: string
}) {
  return (
    <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-xs text-gray-400">
        {icon} {label}
      </div>
      <div className="mt-1 text-lg font-extrabold tracking-tight">{value}</div>
    </div>
  )
}

function ActiveFilterChip({
  label,
  onClear,
}: {
  label: string
  onClear: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="group inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
      aria-label={`Remover filtro ${label}`}
      title="Remover filtro"
    >
      {label}
      <span className="inline-block rounded-full bg-emerald-500/20 px-1.5 group-hover:bg-emerald-500/30">
        ✕
      </span>
    </button>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-2 text-sm rounded-lg transition font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60
              ${active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06]'}
            `}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({
  onClear,
  onReload,
}: {
  onClear: () => void
  onReload: () => void
}) {
  return (
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
      <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-white/[0.06] grid place-items-center">
        🔎
      </div>
      <h3 className="text-lg font-extrabold tracking-tight">Nada por aqui</h3>
      <p className="mt-1 text-sm text-gray-400">
        Nenhum jogador encontrado com os filtros aplicados.
      </p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
        <button
          type="button"
          onClick={onClear}
          className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 font-semibold"
        >
          Limpar filtros
        </button>
        <button
          type="button"
          onClick={onReload}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 font-semibold"
        >
          Recarregar
        </button>
      </div>
    </div>
  )
}

export default function ElencoPage() {
  /** ===== Estados ===== */
  const [elenco, setElenco] = useState<Jogador[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [nomeTime, setNomeTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroNacionalidade, setFiltroNacionalidade] = useState<string | null>(
    null
  )
  const [filtroPosicao, setFiltroPosicao] = useState<string | null>(null)
  const [filtroNome, setFiltroNome] = useState<string>('')
  const [nomeDebounced, setNomeDebounced] = useState<string>('') // debounce
  const [filtroOverall, setFiltroOverall] = useState<number>(0)
  const [soVendiveis, setSoVendiveis] = useState<boolean>(false) // jogos >= 3
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const [selecionados, setSelecionados] = useState<string[]>([]) // Ações em massa (venda)

  // ===== Escalação =====
  const [titulares, setTitulares] = useState<string[]>([]) // exatamente 11
  const [escalaFixada, setEscalaFixada] = useState<boolean>(false)
  const [salvandoEscalacao, setSalvandoEscalacao] = useState(false)

  // UI Mobile
  const [showFiltersMobile, setShowFiltersMobile] = useState(false)

  /** ===== Debounce busca ===== */
  useEffect(() => {
    const t = setTimeout(() => setNomeDebounced(filtroNome), 250)
    return () => clearTimeout(t)
  }, [filtroNome])

  /** ===== Helpers ===== */
  const getFlagUrl = (pais?: string | null) => {
    if (!pais) return ''
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
    const key = Object.keys(bandeiras).find((nome) => norm(nome) === norm(pais))
    return key ? `https://flagcdn.com/w40/${bandeiras[key]}.png` : ''
  }

  const contar = (campo: keyof Jogador | string) => {
    const contagem: Record<string, number> = {}
    elenco.forEach((j) => {
      const key = (j as any)[campo] || 'Outro'
      contagem[key] = (contagem[key] || 0) + 1
    })
    return contagem
  }

  const contPorNac = useMemo(() => contar('nacionalidade'), [elenco])
  const contPorPos = useMemo(() => contar('posicao'), [elenco])

  /** ===== BID helper ===== */
  async function registrarNoBID({
    tipo_evento,
    descricao,
    id_time1,
    valor,
  }: {
    tipo_evento: string
    descricao: string
    id_time1: string
    valor?: number | null
  }) {
    const { error } = await supabase.from('bid').insert({
      tipo_evento,
      descricao,
      id_time1,
      valor: valor ?? null,
      data_evento: new Date().toISOString(),
    })
    if (error) {
      console.error('Erro ao registrar no BID:', error)
      toast.error('⚠️ Falha ao registrar no BID.')
    }
  }

  /** ===== Toggle titular (⭐) ===== */
  const toggleTitular = (id: string) => {
    if (escalaFixada) return
    setTitulares((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 11) {
        toast('Limite de 11 titulares atingido.')
        return prev
      }
      return [...prev, id]
    })
  }

  /** ===== Fetch ===== */
  const fetchElenco = async () => {
    setLoading(true)
    setErro(null)
    try {
      const id_time =
        typeof window !== 'undefined' ? localStorage.getItem('id_time') : null

      if (!id_time) {
        setElenco([])
        setSaldo(0)
        setNomeTime('')
        setSelecionados([])
        setTitulares([])
        setEscalaFixada(false)
        return
      }

      const [
        { data: elencoData, error: e1 },
        { data: timeData, error: e2 },
      ] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single(),
      ])
      if (e1) throw e1
      if (e2) throw e2

      // sincroniza salários
      const needsUpdate = (elencoData || []).filter((j) => {
        const esperado = calcularSalario(j.valor)
        return Number(j.salario || 0) !== esperado
      })
      if (needsUpdate.length > 0) {
        await Promise.all(
          needsUpdate.map((j) =>
            supabase
              .from('elenco')
              .update({ salario: calcularSalario(j.valor) })
              .eq('id', j.id)
          )
        )
      }

      const elencoComRegra = (elencoData || []).map((j) => ({
        ...j,
        salario: calcularSalario(j.valor),
      })) as Jogador[]

      // escalação salva
      let titularesSalvos: string[] = []
      let fixada = false
      try {
        const { data: esc, error: e3 } = await supabase
          .from('escalacoes')
          .select('titulares, fixada')
          .eq('id_time', id_time)
          .single()
        if (!e3 && esc) {
          titularesSalvos = Array.isArray(esc.titulares) ? esc.titulares : []
          fixada = !!esc.fixada
        }
      } catch {}

      const idsElenco = new Set(elencoComRegra.map((j) => j.id))
      const titularesValidos = titularesSalvos
        .filter((tid: string) => idsElenco.has(tid))
        .slice(0, 11)

      setElenco(elencoComRegra)
      setSaldo(Number(timeData?.saldo || 0))
      setNomeTime(timeData?.nome || '')
      setSelecionados([])
      setTitulares(titularesValidos)
      setEscalaFixada(fixada)
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  /** ===== Ações em massa ===== */
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    )
  }
  const selecionarTodosFiltrados = () =>
    setSelecionados(elencoFiltrado.map((j) => j.id))
  const limparSelecao = () => setSelecionados([])

  /** ===== Vender selecionados ===== */
  const venderSelecionados = async () => {
    const jogadores = elenco.filter((j) => selecionados.includes(j.id))
    if (jogadores.length === 0) return
    const id_time_local =
      typeof window !== 'undefined' ? localStorage.getItem('id_time') : null

    for (const jogador of jogadores) {
      try {
        if ((jogador.jogos || 0) < 3) {
          toast('🚫 Jogador precisa de pelo menos 3 jogos.')
          continue
        }

        const percentualStr = prompt(
          `Quantos % de ${jogador.nome} deseja vender?`,
          String(jogador.percentual ?? 100)
        )
        if (percentualStr === null) continue

        const percentualNum = Number(percentualStr)
        const percentualAtual = Number(jogador.percentual ?? 100)

        if (
          !Number.isFinite(percentualNum) ||
          percentualNum <= 0 ||
          percentualNum > percentualAtual
        ) {
          toast.error('❌ Percentual inválido.')
          continue
        }

        const baseValor = Number(jogador.valor || 0)
        const valorVenda = Math.round((baseValor * percentualNum) / 100 * 0.3)

        // 1) Mercado
        {
          const { error } = await supabase.from('mercado_transferencias').insert({
            jogador_id: jogador.id,
            nome: jogador.nome,
            posicao: jogador.posicao,
            overall: jogador.overall,
            valor: baseValor,
            imagem_url: jogador.imagem_url || '',
            salario: calcularSalario(baseValor),
            link_sofifa: jogador.link_sofifa || '',
            id_time_origem: jogador.id_time,
            status: 'disponivel',
            percentual: percentualNum,
            created_at: new Date().toISOString(),
          })

          if (error) {
            console.error('Erro ao inserir no mercado:', error)
            toast.error(`❌ Falha ao anunciar ${jogador.nome}.`)
            continue
          }
        }

        // 2) Atualizar percentual / remover
        const novoPercentual = (jogador.percentual ?? 100) - percentualNum
        if (novoPercentual <= 0) {
          const { error } = await supabase.from('elenco').delete().eq('id', jogador.id)
          if (error) {
            console.error('Erro ao remover do elenco:', error)
            toast('⚠️ Falha ao remover do elenco.')
          }
        } else {
          const { error } = await supabase
            .from('elenco')
            .update({ percentual: novoPercentual })
            .eq('id', jogador.id)
          if (error) {
            console.error(`Erro ao atualizar percentual de ${jogador.nome}.`, error)
            toast('⚠️ Falha ao atualizar percentual.')
          }
        }

        // 3) Crédito (RPC)
        {
          const { data: dataRPC, error } = await supabase.rpc(
            'increment_saldo_return',
            {
              p_time_id: jogador.id_time,
              p_delta: valorVenda,
            }
          )
          if (error) {
            console.error('Erro RPC:', error)
            toast.error(`❌ Falha ao creditar ${formatBRL(valorVenda)}.`)
            continue
          }

          const novoSaldo = Number(dataRPC)
          if (id_time_local && id_time_local === jogador.id_time) setSaldo(novoSaldo)

          await registrarNoBID({
            tipo_evento: 'venda_mercado',
            descricao: `Venda de ${percentualNum}% de ${jogador.nome} por ${formatBRL(
              valorVenda
            )}`,
            id_time1: jogador.id_time,
            valor: valorVenda,
          })

          toast.success(
            `✅ ${jogador.nome}: venda de ${percentualNum}% registrada (+${formatBRL(
              valorVenda
            )}).`
          )
        }
      } catch (err) {
        console.error('Erro na venda:', err)
        toast.error('❌ Ocorreu um erro ao processar a venda.')
      }
    }

    await fetchElenco()
  }

  /** ===== Derivados ===== */
  const valorTotal = useMemo(
    () => elenco.reduce((acc, j) => acc + Number(j.valor || 0), 0),
    [elenco]
  )
  const salarioTotal = useMemo(
    () => elenco.reduce((acc, j) => acc + calcularSalario(j.valor), 0),
    [elenco]
  )
  const mediaOverall = useMemo(
    () =>
      elenco.length > 0
        ? elenco.reduce((acc, j) => acc + Number(j.overall || 0), 0) / elenco.length
        : 0,
    [elenco]
  )

  const elencoFiltrado = useMemo(() => {
    let arr = elenco.filter(
      (j) =>
        (!filtroNacionalidade || j.nacionalidade === filtroNacionalidade) &&
        (!filtroPosicao || j.posicao === filtroPosicao) &&
        (!nomeDebounced ||
          j.nome.toLowerCase().includes(nomeDebounced.toLowerCase())) &&
        (!filtroOverall || Number(j.overall || 0) >= filtroOverall) &&
        (!soVendiveis || Number(j.jogos || 0) >= 3)
    )

    arr.sort((a, b) => {
      if (ordenacao === 'valor') return Number(b.valor || 0) - Number(a.valor || 0)
      if (ordenacao === 'overall')
        return Number(b.overall || 0) - Number(a.overall || 0)
      if (ordenacao === 'salario')
        return calcularSalario(b.valor) - calcularSalario(a.valor)
      if (ordenacao === 'jogos') return Number(b.jogos || 0) - Number(a.jogos || 0)
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR')
      if (ordenacao === 'posicao')
        return (a.posicao || '').localeCompare(b.posicao || '', 'pt-BR')
      return 0
    })

    return arr
  }, [
    elenco,
    filtroNacionalidade,
    filtroPosicao,
    nomeDebounced,
    filtroOverall,
    soVendiveis,
    ordenacao,
  ])

  const limparFiltros = () => {
    setFiltroNome('')
    setFiltroOverall(0)
    setSoVendiveis(false)
    setFiltroNacionalidade(null)
    setFiltroPosicao(null)
  }

  /** ===== Skeleton ===== */
  const SkeletonCard = () => (
    <div className="animate-pulse bg-white/[0.04] p-4 rounded-2xl border border-white/10">
      <div className="h-20 w-20 rounded-full bg-white/10 mx-auto mb-3" />
      <div className="h-4 bg-white/10 rounded w-3/4 mx-auto mb-2" />
      <div className="h-3 bg-white/10 rounded w-1/2 mx-auto mb-4" />
      <div className="h-6 bg-white/10 rounded w-full mb-2" />
      <div className="h-6 bg-white/10 rounded w-5/6 mb-2" />
    </div>
  )

  /** ===== Salvar / Fixar Escalação ===== */
  const salvarEscalacao = async () => {
    if (escalaFixada) return
    if (titulares.length !== 11) {
      toast('Selecione exatamente 11 titulares.')
      return
    }
    const id_time =
      typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
    if (!id_time) {
      toast.error('Time não identificado.')
      return
    }
    setSalvandoEscalacao(true)
    try {
      const { error } = await supabase
        .from('escalacoes')
        .upsert(
          {
            id_time,
            titulares,
            fixada: true,
            fixada_em: new Date().toISOString(),
          },
          { onConflict: 'id_time' }
        )
      if (error) throw error
      setEscalaFixada(true)
      await registrarNoBID({
        tipo_evento: 'escala_fixa',
        descricao: `Escalação do ${nomeTime} fixada com 11 titulares.`,
        id_time1: id_time,
      })
      toast.success('✅ Escalação salva e fixada!')
    } catch (e: any) {
      console.error(e)
      toast.error('❌ Falha ao salvar a escalação.')
    } finally {
      setSalvandoEscalacao(false)
    }
  }

  const desbloquearEscalacao = async () => {
    const id_time =
      typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
    if (!id_time) return
    const ok = confirm('Desbloquear a escalação para editar?')
    if (!ok) return
    const { error } = await supabase
      .from('escalacoes')
      .update({ fixada: false })
      .eq('id_time', id_time)
    if (error) toast.error('Falha ao desbloquear.')
    else {
      setEscalaFixada(false)
      toast.success('Escalação desbloqueada.')
    }
  }

  /** ===== Loading ===== */
  if (loading) {
    return (
      <div className="min-h-screen text-white bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-gray-950 to-gray-950">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          <header className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur border-b border-white/10">
            <h1 className="text-xl font-bold">👥 Elenco</h1>
            <p className="text-sm text-gray-400">Carregando dados...</p>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-gray-950 to-gray-950">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <header className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur supports-[backdrop-filter]:bg-gray-950/65 border-b border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight truncate">
                👥 Elenco do{' '}
                <span className="text-emerald-400">{nomeTime || '—'}</span>
                <span className="text-xs sm:text-sm text-gray-400 ml-2">
                  ({elenco.length})
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                Gerencie elenco, selecione titulares e anuncie no mercado.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:block rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
                💳 <b className="ml-1">{formatBRL(saldo)}</b>
              </div>
              <button
                type="button"
                onClick={fetchElenco}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold"
                aria-label="Atualizar elenco"
                title="Atualizar"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Mobile quick bar */}
          <div className="mt-3 flex gap-2 sm:hidden">
            <input
              type="text"
              placeholder="Buscar jogador..."
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl text-black"
              aria-label="Buscar por nome"
            />
            <button
              type="button"
              onClick={() => setShowFiltersMobile(true)}
              className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-sm border border-white/10"
            >
              🧰
            </button>
          </div>

          {/* Stat cards */}
          <div className="mt-3 overflow-x-auto pb-1 sm:overflow-visible">
            <div className="flex gap-2 sm:grid sm:grid-cols-4">
              <StatPill icon="📦" label="Valor do elenco" value={formatBRL(valorTotal)} />
              <StatPill icon="💸" label="Salários" value={formatBRL(salarioTotal)} />
              <StatPill icon="⭐" label="Média OVR" value={mediaOverall.toFixed(1)} />
              <StatPill
                icon="🔒"
                label="Escalação"
                value={escalaFixada ? 'Fixada' : `${titulares.length}/11`}
              />
            </div>
          </div>

          {/* Toolbar desktop */}
          <div className="mt-4 hidden lg:flex lg:items-end gap-3">
            <div className="flex flex-1 flex-wrap gap-2">
              <input
                type="text"
                placeholder="Buscar por nome"
                value={filtroNome}
                onChange={(e) => setFiltroNome(e.target.value)}
                className="px-3 py-2 rounded-xl text-black w-64"
                aria-label="Buscar por nome"
              />

              <input
                type="number"
                placeholder="OVR mínimo"
                value={filtroOverall}
                onChange={(e) => setFiltroOverall(Number(e.target.value))}
                className="px-3 py-2 rounded-xl text-black w-44"
                aria-label="OVR mínimo"
                min={0}
              />

              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className="px-3 py-2 rounded-xl text-black w-52"
                aria-label="Ordenação"
              >
                <option value="valor">💰 Valor</option>
                <option value="overall">⭐ Overall</option>
                <option value="salario">💸 Salário</option>
                <option value="jogos">🏟️ Jogos</option>
                <option value="nome">🔤 Nome</option>
                <option value="posicao">🎯 Posição</option>
              </select>

              <label className="inline-flex items-center gap-2 text-sm bg-white/[0.04] border border-white/10 px-3 py-2 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={soVendiveis}
                  onChange={(e) => setSoVendiveis(e.target.checked)}
                  aria-label="Somente vendíveis (3+ jogos)"
                  className="accent-emerald-500"
                />
                <span>Vendíveis (≥ 3 jogos)</span>
              </label>

              <button
                type="button"
                onClick={limparFiltros}
                className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-sm"
              >
                Limpar filtros
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as ViewMode)}
                options={[
                  { value: 'grid', label: '🧩 Cards' },
                  { value: 'table', label: '📋 Tabela' },
                ]}
              />

              {!escalaFixada ? (
                <button
                  type="button"
                  onClick={salvarEscalacao}
                  disabled={titulares.length !== 11 || salvandoEscalacao}
                  className={`px-4 py-2 rounded-xl font-extrabold transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60
                    ${
                      titulares.length === 11 && !salvandoEscalacao
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-gray-700 cursor-not-allowed'
                    }`}
                  title="Salvar e fixar escalação"
                  aria-label="Salvar e fixar escalação"
                >
                  {salvandoEscalacao
                    ? 'Salvando...'
                    : `Salvar Escalação (${titulares.length}/11)`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={desbloquearEscalacao}
                  className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 font-semibold"
                >
                  🔓 Desbloquear
                </button>
              )}
            </div>
          </div>

          {/* Filtros ativos (chips) */}
          <div className="mt-3 flex flex-wrap gap-2">
            {filtroNome && (
              <ActiveFilterChip label={`Nome: "${filtroNome}"`} onClear={() => setFiltroNome('')} />
            )}
            {filtroOverall > 0 && (
              <ActiveFilterChip label={`OVR ≥ ${filtroOverall}`} onClear={() => setFiltroOverall(0)} />
            )}
            {soVendiveis && (
              <ActiveFilterChip label="Vendíveis (≥ 3 jogos)" onClear={() => setSoVendiveis(false)} />
            )}
            {filtroNacionalidade && (
              <ActiveFilterChip label={`Nac: ${filtroNacionalidade}`} onClear={() => setFiltroNacionalidade(null)} />
            )}
            {filtroPosicao && (
              <ActiveFilterChip label={`Pos: ${filtroPosicao}`} onClear={() => setFiltroPosicao(null)} />
            )}
          </div>
        </header>

        {/* Sheet de filtros (MOBILE) */}
        {showFiltersMobile && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setShowFiltersMobile(false)} aria-hidden />
            <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-gray-950 border-t border-white/10 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-700 mb-3" />
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-extrabold tracking-tight">Filtros</h3>
                <button
                  type="button"
                  onClick={() => setShowFiltersMobile(false)}
                  className="text-sm px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Buscar por nome"
                  value={filtroNome}
                  onChange={(e) => setFiltroNome(e.target.value)}
                  className="w-full px-3 py-3 rounded-2xl text-black"
                />
                <input
                  type="number"
                  placeholder="OVR mínimo"
                  value={filtroOverall}
                  onChange={(e) => setFiltroOverall(Number(e.target.value))}
                  className="w-full px-3 py-3 rounded-2xl text-black"
                  min={0}
                />
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                  className="w-full px-3 py-3 rounded-2xl text-black"
                >
                  <option value="valor">💰 Valor</option>
                  <option value="overall">⭐ Overall</option>
                  <option value="salario">💸 Salário</option>
                  <option value="jogos">🏟️ Jogos</option>
                  <option value="nome">🔤 Nome</option>
                  <option value="posicao">🎯 Posição</option>
                </select>

                <label className="flex items-center justify-between bg-white/[0.04] border border-white/10 px-4 py-3 rounded-2xl">
                  <span className="text-sm">Vendíveis (≥ 3 jogos)</span>
                  <input
                    type="checkbox"
                    checked={soVendiveis}
                    onChange={(e) => setSoVendiveis(e.target.checked)}
                    className="h-5 w-5 accent-emerald-500"
                  />
                </label>

                <div className="flex items-center justify-between gap-2">
                  <Segmented
                    value={viewMode}
                    onChange={(v) => setViewMode(v as ViewMode)}
                    options={[
                      { value: 'grid', label: '🧩 Cards' },
                      { value: 'table', label: '📋 Tabela' },
                    ]}
                  />
                  <div className="text-sm rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                    💳 <b className="ml-1">{formatBRL(saldo)}</b>
                  </div>
                </div>

                {(filtroNome || filtroOverall || soVendiveis || filtroNacionalidade || filtroPosicao) && (
                  <button
                    type="button"
                    onClick={limparFiltros}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-sm font-semibold"
                  >
                    Limpar todos filtros
                  </button>
                )}

                {!escalaFixada ? (
                  <button
                    type="button"
                    onClick={salvarEscalacao}
                    disabled={titulares.length !== 11 || salvandoEscalacao}
                    className={`w-full px-4 py-3 rounded-2xl font-extrabold
                      ${
                        titulares.length === 11 && !salvandoEscalacao
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-gray-700 cursor-not-allowed'
                      }`}
                  >
                    {salvandoEscalacao ? 'Salvando...' : `Salvar Escalação (${titulares.length}/11)`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={desbloquearEscalacao}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 font-semibold"
                  >
                    🔓 Desbloquear escalação
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowFiltersMobile(false)}
                  className="w-full px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 font-extrabold"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chips dinâmicos */}
        <section className="mt-4">
          <details className="open:mt-0 sm:open mt-0">
            <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">
              🌎 Nacionalidades
            </summary>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {Object.entries(contPorNac).map(([nac, count]) => (
                <button
                  key={nac}
                  type="button"
                  onClick={() => setFiltroNacionalidade(nac)}
                  className={`px-3 py-2 rounded-2xl text-xs whitespace-nowrap border transition
                    ${
                      filtroNacionalidade === nac
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-100'
                        : 'bg-white/[0.04] border-white/10 text-gray-200 hover:bg-white/[0.07]'
                    }`}
                  title={nac}
                >
                  {getFlagUrl(nac) && (
                    <img
                      src={getFlagUrl(nac)}
                      className="inline-block w-5 h-3 mr-1 rounded-sm"
                      alt={nac}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {nac} <span className="text-gray-300/80">({count})</span>
                </button>
              ))}
            </div>
          </details>

          <details className="mt-2 open:mt-2">
            <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">
              🎯 Posições
            </summary>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {Object.entries(contPorPos).map(([pos, count]) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setFiltroPosicao(pos)}
                  className={`px-3 py-2 rounded-2xl text-xs whitespace-nowrap border transition
                    ${
                      filtroPosicao === pos
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-100'
                        : 'bg-white/[0.04] border-white/10 text-gray-200 hover:bg-white/[0.07]'
                    }`}
                >
                  {pos} <span className="text-gray-300/80">({count})</span>
                </button>
              ))}
            </div>
          </details>

          {erro && <p className="mt-2 text-red-400 text-sm">{erro}</p>}
        </section>

        {/* Barra ações em massa */}
        {selecionados.length > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] sm:w-auto">
            <div className="bg-gray-950/95 backdrop-blur border border-white/10 rounded-3xl shadow-2xl px-3 sm:px-4 py-3 pb-[env(safe-area-inset-bottom)]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 items-center justify-center">
                    ✅
                  </span>
                  <span className="text-sm text-gray-200">
                    <b>{selecionados.length}</b> selecionado(s)
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={venderSelecionados}
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-2xl font-extrabold"
                  >
                    💸 Vender
                  </button>
                  <button
                    type="button"
                    onClick={selecionarTodosFiltrados}
                    className="flex-1 sm:flex-none bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-2 rounded-2xl text-sm font-semibold"
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      limparSelecao()
                    }}
                    className="flex-1 sm:flex-none bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-2 rounded-2xl text-sm font-semibold"
                  >
                    Limpar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subheader da lista */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-300">
            Mostrando <b className="text-white">{elencoFiltrado.length}</b> de{' '}
            <b className="text-white">{elenco.length}</b> jogadores
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { value: 'grid', label: '🧩' },
                { value: 'table', label: '📋' },
              ]}
            />
          </div>
        </div>

        {/* Lista */}
        {elencoFiltrado.length === 0 ? (
          <EmptyState onClear={limparFiltros} onReload={fetchElenco} />
        ) : viewMode === 'grid' ? (
          <div className="mt-5 grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {elencoFiltrado.map((jogador) => (
              <div key={jogador.id} className="relative">
                {/* Badge titular (visual, opcional) */}
                {titulares.includes(jogador.id) && (
                  <span className="absolute -top-2 -left-2 z-10 text-xs font-extrabold px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                    ⭐ Titular
                  </span>
                )}

                {/* Overlay rápido de ações (clicar no card já é do componente) */}
                <div className="absolute -top-2 -right-2 z-10 flex gap-1">
                  <button
                    type="button"
                    onClick={() => toggleTitular(jogador.id)}
                    disabled={escalaFixada}
                    className={`h-9 w-9 rounded-2xl border text-sm font-extrabold transition
                      ${
                        titulares.includes(jogador.id)
                          ? 'bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/20'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      }
                      ${escalaFixada ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={escalaFixada ? 'Escalação fixada' : 'Marcar/desmarcar titular'}
                  >
                    ⭐
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSelecionado(jogador.id)}
                    className={`h-9 w-9 rounded-2xl border text-sm font-extrabold transition
                      ${
                        selecionados.includes(jogador.id)
                          ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      }`}
                    title="Selecionar"
                  >
                    ✓
                  </button>
                </div>

                <CardJogador
                  modo="elenco"
                  selecionado={selecionados.includes(jogador.id)}
                  onToggleSelecionado={() => toggleSelecionado(jogador.id)}
                  jogador={{
                    id: jogador.id,
                    nome: jogador.nome,
                    overall: jogador.overall ?? 0,
                    posicao: jogador.posicao,
                    nacionalidade: jogador.nacionalidade ?? undefined,
                    imagem_url: jogador.imagem_url ?? undefined,
                    valor: jogador.valor ?? undefined,
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-gray-950/50">
                <tr className="text-left text-xs sm:text-sm text-gray-300">
                  <th className="px-3 py-3">Jogador</th>
                  <th className="px-3 py-3">Posição</th>
                  <th className="px-3 py-3">OVR</th>
                  <th className="px-3 py-3">Jogos</th>
                  <th className="px-3 py-3">Salário</th>
                  <th className="px-3 py-3">Valor</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {elencoFiltrado.map((j) => {
                  const vendivel = Number(j.jogos || 0) >= 3
                  const isTit = titulares.includes(j.id)
                  const isSel = selecionados.includes(j.id)

                  return (
                    <tr key={j.id} className="hover:bg-white/[0.03]">
                      <td className="px-3 py-3 font-semibold">
                        <div className="flex items-center gap-2">
                          {isTit && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
                              ⭐
                            </span>
                          )}
                          <span className="truncate">{j.nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">{j.posicao}</td>
                      <td className="px-3 py-3 font-bold">{j.overall ?? 0}</td>
                      <td className="px-3 py-3">{j.jogos ?? 0}</td>
                      <td className="px-3 py-3">{formatBRL(calcularSalario(j.valor))}</td>
                      <td className="px-3 py-3 font-semibold">{formatBRL(j.valor)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleTitular(j.id)}
                            disabled={escalaFixada}
                            className={`px-3 py-2 rounded-xl border text-sm font-semibold
                              ${
                                isTit
                                  ? 'bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/20'
                                  : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                              }
                              ${escalaFixada ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={escalaFixada ? 'Escalação fixada' : 'Marcar/desmarcar titular'}
                          >
                            ⭐
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleSelecionado(j.id)}
                            className={`px-3 py-2 rounded-xl border text-sm font-semibold
                              ${
                                isSel
                                  ? 'bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/20'
                                  : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                              }`}
                            title="Selecionar"
                          >
                            {isSel ? 'Selecionado' : 'Selecionar'}
                          </button>

                          <span
                            className={`px-3 py-2 rounded-xl border text-xs font-bold
                              ${
                                vendivel
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                                  : 'bg-red-500/10 border-red-500/20 text-red-200'
                              }`}
                            title="Requisito para vender no mercado"
                          >
                            {vendivel ? 'Vendível' : '3+ jogos'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  )
}

             