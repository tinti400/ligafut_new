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


function getTimeLogadoLocal() {
  if (typeof window === 'undefined') {
    return {
      id_time: null as string | null,
      nome_time: null as string | null,
      user: null as any,
    }
  }

  let user: any = null

  try {
    const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
    user = raw ? JSON.parse(raw) : null
  } catch {
    user = null
  }

  const id_time =
    localStorage.getItem('id_time') ||
    localStorage.getItem('time_id') ||
    user?.id_time ||
    user?.time_id ||
    user?.time?.id ||
    null

  const nome_time =
    localStorage.getItem('nome_time') ||
    localStorage.getItem('time_nome') ||
    user?.nome_time ||
    user?.time_nome ||
    user?.nome ||
    null

  if (id_time) {
    try {
      localStorage.setItem('id_time', String(id_time))
      if (nome_time) localStorage.setItem('nome_time', String(nome_time))
    } catch {}
  }

  return {
    id_time,
    nome_time,
    user,
  }
}

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
  const [logoTime, setLogoTime] = useState<string>('') // ✅ NOVO
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
  const [modalBloqueioVenda, setModalBloqueioVenda] = useState<Jogador | null>(null)
  const [animacaoVenda, setAnimacaoVenda] = useState<Jogador | null>(null)

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
      const { id_time } = getTimeLogadoLocal()

      if (!id_time) {
        setElenco([])
        setSaldo(0)
        setNomeTime('')
        setLogoTime('')
        setSelecionados([])
        setTitulares([])
        setEscalaFixada(false)
        toast.error('Time logado não identificado. Faça login novamente.')
        return
      }

      const [
        { data: elencoData, error: e1 },
        { data: timeData, error: e2 },
      ] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time).order('created_at', { ascending: false }),
        // ✅ pega logo
        supabase
          .from('times')
          .select('nome, saldo, logo, logo_url')
          .eq('id', id_time)
          .single(),
      ])
      if (e1) throw e1
      if (e2) throw e2

      // sincroniza salários
      const needsUpdate = (elencoData || []).filter((j: any) => {
        const esperado = calcularSalario(j.valor)
        return Number(j.salario || 0) !== esperado
      })
      if (needsUpdate.length > 0) {
        await Promise.all(
          needsUpdate.map((j: any) =>
            supabase
              .from('elenco')
              .update({ salario: calcularSalario(j.valor) })
              .eq('id', j.id)
          )
        )
      }

      const elencoComRegra = (elencoData || []).map((j: any) => ({
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
          titularesSalvos = Array.isArray((esc as any).titulares)
            ? (esc as any).titulares
            : []
          fixada = !!(esc as any).fixada
        }
      } catch {}

      const idsElenco = new Set(elencoComRegra.map((j) => j.id))
      const titularesValidos = titularesSalvos
        .filter((tid: string) => idsElenco.has(tid))
        .slice(0, 11)

      setElenco(elencoComRegra)
      setSaldo(Number((timeData as any)?.saldo || 0))
      setNomeTime(String((timeData as any)?.nome || ''))
      setLogoTime(String((timeData as any)?.logo || (timeData as any)?.logo_url || ''))
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

    const onFocus = () => fetchElenco()
    const onStorage = () => fetchElenco()

    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  /** ===== Ações em massa ===== */
  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    )
  }

  const tentarVenderJogador = async (jogador: Jogador) => {
    const jogos = Number(jogador.jogos || 0)

    if (jogos < 3) {
      setModalBloqueioVenda(jogador)
      return
    }

    await venderSelecionados([jogador])
  }

  const selecionarTodosFiltrados = () =>
    setSelecionados(elencoFiltrado.map((j) => j.id))
  const limparSelecao = () => setSelecionados([])

  /** ===== Vender selecionados ===== */
  const venderSelecionados = async (jogadoresDiretos?: Jogador[]) => {
    const jogadoresSelecionados = jogadoresDiretos ?? elenco.filter((j) => selecionados.includes(j.id))

    if (jogadoresSelecionados.length === 0) {
      toast.error('Selecione pelo menos um jogador para vender.')
      return
    }

    const bloqueadosPorJogos = jogadoresSelecionados.filter((j) => Number(j.jogos || 0) < 3)

    if (bloqueadosPorJogos.length > 0) {
      const nomesBloqueados = bloqueadosPorJogos
        .map((j) => `${j.nome} (${Number(j.jogos || 0)}/3 jogos)`)
        .join(', ')

      toast.error(
        `Venda bloqueada: ${nomesBloqueados}. O jogador precisa ter pelo menos 3 jogos para ser vendido ao mercado.`,
        { duration: 7000 }
      )

      return
    }

    const ok = confirm(
      `Confirmar venda de ${jogadoresSelecionados.length} jogador(es) para o mercado?

Regra: o jogador vai ao mercado pelo valor cheio e o clube recebe apenas 30%.`
    )

    if (!ok) return

    const { id_time, nome_time } = getTimeLogadoLocal()

    if (!id_time) {
      toast.error('Time não identificado.')
      return
    }

    let saldoAtualizado = saldo

    for (const jogador of jogadoresSelecionados) {
      try {
        if (Number(jogador.jogos || 0) < 3) {
          toast.error(`${jogador.nome} precisa de pelo menos 3 jogos para ser vendido.`)
          continue
        }

        const percentualAtual = Number(jogador.percentual ?? 100)

        if (!Number.isFinite(percentualAtual) || percentualAtual <= 0) {
          toast.error(`Percentual inválido para ${jogador.nome}.`)
          continue
        }

        // Venda direta ao mercado será sempre de 100% do percentual disponível.
        const percentualNum = percentualAtual

        const baseValor = Number(jogador.valor || 0)

        // REGRA OFICIAL:
        // Mercado recebe pelo valor proporcional cheio.
        // Clube recebe só 30% desse valor.
        const valorMercado = Math.round((baseValor * percentualNum) / 100)
        const valorRecebidoClube = Math.round(valorMercado * 0.3)

        const { data: jaExiste, error: erroBuscaMercado } = await supabase
          .from('mercado_transferencias')
          .select('id')
          .eq('jogador_id', jogador.id)
          .eq('status', 'disponivel')
          .maybeSingle()

        if (erroBuscaMercado) throw erroBuscaMercado

        if (jaExiste) {
          toast.error(`${jogador.nome} já está anunciado no mercado.`)
          continue
        }

        const payloadMercado = {
          jogador_id: jogador.id,
          nome: jogador.nome,
          posicao: jogador.posicao,
          overall: jogador.overall,
          valor: valorMercado,
          imagem_url: jogador.imagem_url || '',
          salario: calcularSalario(valorMercado),
          link_sofifa: jogador.link_sofifa || '',
          id_time_origem: jogador.id_time || id_time,
          time_origem: nomeTime || nome_time || '',
          status: 'disponivel',
          percentual: percentualNum,
          data_listagem: new Date().toISOString(),
        }

        // 1) Primeiro anuncia no mercado.
        const { error: erroMercado } = await supabase
          .from('mercado_transferencias')
          .insert(payloadMercado)

        if (erroMercado) {
          console.error('Erro ao inserir no mercado:', {
            message: erroMercado.message,
            details: erroMercado.details,
            hint: erroMercado.hint,
            code: erroMercado.code,
            payloadMercado,
          })
          toast.error(`Falha ao anunciar ${jogador.nome}: ${erroMercado.message}`)
          continue
        }

        // 2) Remove do elenco, pois vendeu 100% do percentual disponível.
        const { error: erroRemove } = await supabase
          .from('elenco')
          .delete()
          .eq('id', jogador.id)

        if (erroRemove) {
          console.error('Erro ao remover do elenco:', erroRemove)
          toast.error(`${jogador.nome} foi anunciado, mas não saiu do elenco.`)
          continue
        }

        // 3) Atualiza saldo direto na tabela times.
        saldoAtualizado += valorRecebidoClube

        const { error: erroSaldo } = await supabase
          .from('times')
          .update({ saldo: saldoAtualizado })
          .eq('id', id_time)

        if (erroSaldo) {
          console.error('Erro ao atualizar saldo:', erroSaldo)
          toast.error(`${jogador.nome} foi anunciado, mas o saldo não atualizou.`)
        } else {
          setSaldo(saldoAtualizado)
        }

        // 4) BID não trava a venda.
        try {
          await registrarNoBID({
            tipo_evento: 'venda_mercado',
            descricao: `${nomeTime || nome_time || 'Clube'} colocou ${jogador.nome} no mercado por ${formatBRL(valorMercado)} e recebeu ${formatBRL(valorRecebidoClube)}.`,
            id_time1: id_time,
            valor: valorRecebidoClube,
          })
        } catch (e) {
          console.warn('Falha ao registrar BID, mas venda mantida:', e)
        }

        toast.success(
          `${jogador.nome} foi para o mercado por ${formatBRL(valorMercado)}. Clube recebeu ${formatBRL(valorRecebidoClube)}.`
        )

        setAnimacaoVenda(jogador)

        setTimeout(() => {
          setAnimacaoVenda(null)
        }, 2400)
      } catch (err: any) {
        console.error('Erro na venda:', err)
        toast.error(`Erro ao vender ${jogador.nome}: ${err?.message || 'erro desconhecido'}`)
      }
    }

    if (!jogadoresDiretos) setSelecionados([])
    await fetchElenco()
  }

  /** ===== Salvar / Fixar Escalação ===== */
  const salvarEscalacao = async () => {
    if (escalaFixada) return
    if (titulares.length !== 11) {
      toast('Selecione exatamente 11 titulares.')
      return
    }
    const { id_time } = getTimeLogadoLocal()
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
    const { id_time } = getTimeLogadoLocal()
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
        {/* ===== Header (MELHORADO + LOGO) ===== */}
        <header className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur supports-[backdrop-filter]:bg-gray-950/65 border-b border-white/10">
          {/* Linha principal */}
          <div className="flex items-center justify-between gap-3">
            {/* Esquerda: logo + nome */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative h-11 w-11 sm:h-12 sm:w-12 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.04] shrink-0">
                {logoTime ? (
                  <img
                    src={logoTime}
                    alt={`Logo ${nomeTime || 'Time'}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center text-white/60 text-xs font-extrabold">
                    {nomeTime ? nomeTime.slice(0, 2).toUpperCase() : 'LF'}
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight truncate">
                    Elenco do <span className="text-emerald-400">{nomeTime || '—'}</span>
                  </h1>
                  <span className="hidden sm:inline text-xs sm:text-sm text-gray-400 shrink-0">
                    ({elenco.length})
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-400 mt-0.5 truncate">
                  Gerencie elenco, selecione titulares e anuncie no mercado.
                </p>
              </div>
            </div>

            {/* Direita: saldo + botões */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm">
                <span className="opacity-90">💳</span>
                <b className="tracking-tight">{formatBRL(saldo)}</b>
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

              <button
                type="button"
                onClick={() => setShowFiltersMobile(true)}
                className="sm:hidden px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-sm border border-white/10"
                aria-label="Abrir filtros"
                title="Filtros"
              >
                🧰
              </button>
            </div>
          </div>

          {/* Barra rápida MOBILE: busca + saldo */}
          <div className="mt-3 flex gap-2 sm:hidden">
            <input
              type="text"
              placeholder="Buscar jogador..."
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl text-black"
              aria-label="Buscar por nome"
            />
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm whitespace-nowrap">
              💳 <b className="ml-1">{formatBRL(saldo)}</b>
            </div>
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
              <ActiveFilterChip
                label={`Nome: "${filtroNome}"`}
                onClear={() => setFiltroNome('')}
              />
            )}
            {filtroOverall > 0 && (
              <ActiveFilterChip
                label={`OVR ≥ ${filtroOverall}`}
                onClear={() => setFiltroOverall(0)}
              />
            )}
            {soVendiveis && (
              <ActiveFilterChip
                label="Vendíveis (≥ 3 jogos)"
                onClear={() => setSoVendiveis(false)}
              />
            )}
            {filtroNacionalidade && (
              <ActiveFilterChip
                label={`Nac: ${filtroNacionalidade}`}
                onClear={() => setFiltroNacionalidade(null)}
              />
            )}
            {filtroPosicao && (
              <ActiveFilterChip
                label={`Pos: ${filtroPosicao}`}
                onClear={() => setFiltroPosicao(null)}
              />
            )}
          </div>
        </header>

        {/* Sheet de filtros (MOBILE) */}
        {showFiltersMobile && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
            <div
              className="absolute inset-0"
              onClick={() => setShowFiltersMobile(false)}
              aria-hidden
            />
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

                {(filtroNome ||
                  filtroOverall ||
                  soVendiveis ||
                  filtroNacionalidade ||
                  filtroPosicao) && (
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
                    {salvandoEscalacao
                      ? 'Salvando...'
                      : `Salvar Escalação (${titulares.length}/11)`}
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
                    onClick={() => venderSelecionados()}
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
                    onClick={limparSelecao}
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
                {/* Badge titular */}
                {titulares.includes(jogador.id) && (
                  <span className="absolute -top-2 -left-2 z-10 text-xs font-extrabold px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                    ⭐ Titular
                  </span>
                )}

                {/* Ações rápidas */}
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
                    salario: calcularSalario(jogador.valor),

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

                {(() => {
                  const jogos = Number(jogador.jogos || 0)
                  const faltam = Math.max(0, 3 - jogos)
                  const vendivel = jogos >= 3
                  const progresso = Math.min(100, (jogos / 3) * 100)

                  return (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/35 p-3 shadow-[0_14px_30px_rgba(0,0,0,0.22)] backdrop-blur">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p
                            className={`text-xs font-extrabold uppercase tracking-[0.16em] ${
                              vendivel ? 'text-emerald-300' : 'text-red-300'
                            }`}
                          >
                            {vendivel ? '✅ Liberado para venda' : '🔒 Venda bloqueada'}
                          </p>

                          <p className="mt-1 text-xs text-gray-300">
                            🎮 {vendivel ? `${jogos} jogos disputados` : `${jogos}/3 jogos • faltam ${faltam}`}
                          </p>
                        </div>

                        <div
                          className={`grid h-10 w-10 place-items-center rounded-2xl border text-sm font-black ${
                            vendivel
                              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 animate-pulse'
                              : 'border-red-400/30 bg-red-500/15 text-red-200 animate-bounce'
                          }`}
                          title={vendivel ? 'Jogador já pode ser vendido' : 'Jogador ainda não completou 3 jogos'}
                        >
                          {jogos}
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            vendivel ? 'bg-emerald-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${progresso}%` }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => tentarVenderJogador(jogador)}
                        className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-extrabold transition ${
                          vendivel
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.02]'
                            : 'bg-gray-800 text-white/80 hover:bg-red-500/20 hover:text-red-100'
                        }`}
                      >
                        {vendivel ? '💸 Vender ao mercado' : '🔒 Tentar vender'}
                      </button>
                    </div>
                  )
                })()}
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
                      <td className="px-3 py-3">
                        {formatBRL(calcularSalario(j.valor))}
                      </td>
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

                          <button
                            type="button"
                            onClick={() => tentarVenderJogador(j)}
                            className={`px-3 py-2 rounded-xl border text-xs font-bold transition
                              ${
                                vendivel
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200 hover:bg-emerald-500/20'
                                  : 'bg-red-500/10 border-red-500/20 text-red-200 hover:bg-red-500/20'
                              }`}
                            title="Vender jogador ao mercado"
                          >
                            {vendivel ? '💸 Vender' : `🔒 ${Number(j.jogos || 0)}/3 jogos`}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}



        {animacaoVenda && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-md">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,204,21,0.22),transparent_42%)] animate-pulse" />

            <div className="pointer-events-none absolute inset-0">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute text-yellow-300/80 animate-bounce"
                  style={{
                    left: `${8 + ((i * 47) % 84)}%`,
                    top: `${8 + ((i * 31) % 78)}%`,
                    animationDelay: `${(i % 6) * 0.12}s`,
                    animationDuration: `${1.1 + (i % 4) * 0.18}s`,
                  }}
                >
                  ✨
                </span>
              ))}
            </div>

            <div className="relative animate-[packReveal_0.75s_ease-out]">
              <div className="absolute -inset-8 rounded-full bg-yellow-400/25 blur-3xl animate-pulse" />

              <div className="relative rounded-[2.4rem] bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-900 p-[3px] shadow-[0_0_95px_rgba(250,204,21,0.45)]">
                <div className="relative overflow-hidden rounded-[2.25rem] bg-[#07111f] p-6 text-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.25),transparent_40%)]" />

                  <p className="relative text-xs font-black uppercase tracking-[0.32em] text-yellow-200">
                    Venda concluída
                  </p>

                  <div className="relative mx-auto mt-5 h-44 w-44 overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 shadow-inner">
                    {animacaoVenda.imagem_url ? (
                      <img
                        src={animacaoVenda.imagem_url}
                        alt={animacaoVenda.nome}
                        className="h-full w-full object-cover animate-[cardFloat_1.3s_ease-in-out_infinite]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-6xl">👤</div>
                    )}
                  </div>

                  <h2 className="relative mt-5 text-3xl font-black text-white">
                    {animacaoVenda.nome}
                  </h2>

                  <p className="relative mt-1 text-emerald-300 font-bold">
                    foi enviado ao mercado
                  </p>

                  <div className="relative mt-4 rounded-2xl border border-yellow-300/25 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
                    💰 O clube recebeu 30% do valor da venda.
                  </div>
                </div>
              </div>
            </div>

            <style jsx>{`
              @keyframes packReveal {
                0% {
                  transform: scale(0.45) rotate(-8deg);
                  opacity: 0;
                  filter: blur(8px);
                }
                55% {
                  transform: scale(1.12) rotate(2deg);
                  opacity: 1;
                  filter: blur(0);
                }
                100% {
                  transform: scale(1) rotate(0deg);
                  opacity: 1;
                }
              }

              @keyframes cardFloat {
                0%, 100% {
                  transform: translateY(0) scale(1);
                }
                50% {
                  transform: translateY(-8px) scale(1.04);
                }
              }
            `}</style>
          </div>
        )}

        {modalBloqueioVenda && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-red-400/25 bg-gray-950 p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-red-400/30 bg-red-500/15 text-3xl animate-bounce">
                🔒
              </div>

              <h2 className="mt-4 text-2xl font-black text-white">
                Jogador não pode ser vendido
              </h2>

              <p className="mt-2 text-sm text-gray-300">
                <strong className="text-red-300">{modalBloqueioVenda.nome}</strong> ainda não completou os jogos mínimos.
              </p>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm text-gray-400">Progresso atual</p>
                <p className="mt-1 text-3xl font-black text-red-300">
                  {Number(modalBloqueioVenda.jogos || 0)}/3 jogos
                </p>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-red-400 transition-all duration-700"
                    style={{
                      width: `${Math.min(100, (Number(modalBloqueioVenda.jogos || 0) / 3) * 100)}%`,
                    }}
                  />
                </div>

                <p className="mt-3 text-xs text-gray-400">
                  Para vender ao mercado, o jogador precisa disputar pelo menos <strong>3 jogos</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalBloqueioVenda(null)}
                className="mt-5 w-full rounded-2xl bg-red-600 px-4 py-3 font-extrabold text-white transition hover:bg-red-700"
              >
                Entendi
              </button>
            </div>
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  )
}

