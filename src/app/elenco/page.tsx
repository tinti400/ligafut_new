'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'
import toast from 'react-hot-toast'

/** ===== Supabase ===== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
type Ordenacao = 'valor' | 'overall' | 'salario' | 'jogos' | 'nome' | 'posicao'

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

/** ===== Regra de salário (1%) ===== */
const SALARIO_PERCENTUAL = 0.01
const calcularSalario = (valor: number | null | undefined) =>
  Math.round(Number(valor || 0) * SALARIO_PERCENTUAL)

/** ===== Util ===== */
const bandeiras: Record<string, string> = {
  Brasil: 'br', Argentina: 'ar', Portugal: 'pt', Espanha: 'es', França: 'fr',
  Inglaterra: 'gb', Alemanha: 'de', Itália: 'it', Holanda: 'nl', Bélgica: 'be',
  Uruguai: 'uy', Chile: 'cl', Colômbia: 'co', México: 'mx', Estados_Unidos: 'us',
  Canadá: 'ca', Paraguai: 'py', Peru: 'pe', Equador: 'ec', Bolívia: 'bo',
  Venezuela: 've', Congo: 'cg', Guiana: 'gy', Suriname: 'sr', Honduras: 'hn',
  Nicarágua: 'ni', Guatemala: 'gt', Costa_Rica: 'cr', Panamá: 'pa', Jamaica: 'jm',
  Camarões: 'cm', Senegal: 'sn', Marrocos: 'ma', Egito: 'eg', Argélia: 'dz',
  Croácia: 'hr', Sérvia: 'rs', Suíça: 'ch', Polônia: 'pl', Rússia: 'ru',
  Japão: 'jp', Coreia_do_Sul: 'kr', Austrália: 'au'
}

const coresPorPosicao: Record<string, string> = {
  GL: 'bg-yellow-500',
  ZAG: 'bg-blue-600', Zagueiro: 'bg-blue-600',
  LD: 'bg-indigo-500', LE: 'bg-indigo-600',
  VOL: 'bg-green-700', MC: 'bg-green-600', ME: 'bg-green-500', MD: 'bg-green-500',
  SA: 'bg-orange-600', CA: 'bg-red-600', Centroavante: 'bg-red-600',
  PD: 'bg-pink-600', PE: 'bg-pink-700',
}

const formatBRL = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(n || 0))

// Data URI 1x1 transparente
const FALLBACK_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='

/** ===== Componentes UI ===== */
function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">
      <span className="text-gray-400">{icon} {label}</span>
      <span className="ml-2 font-bold">{value}</span>
    </div>
  )
}

function ActiveFilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="group inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
      aria-label={`Remover filtro ${label}`}
    >
      {label}
      <span className="inline-block rounded-full bg-emerald-500/20 px-1.5 group-hover:bg-emerald-500/30">✕</span>
    </button>
  )
}

export default function ElencoPage() {
  /** ===== Estados ===== */
  const [elenco, setElenco] = useState<Jogador[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [nomeTime, setNomeTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [filtroNacionalidade, setFiltroNacionalidade] = useState<string | null>(null)
  const [filtroPosicao, setFiltroPosicao] = useState<string | null>(null)
  const [filtroNome, setFiltroNome] = useState<string>('')
  const [nomeDebounced, setNomeDebounced] = useState<string>('') // debounce
  const [filtroOverall, setFiltroOverall] = useState<number>(0)
  const [soVendiveis, setSoVendiveis] = useState<boolean>(false) // jogos >= 3
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const [selecionados, setSelecionados] = useState<string[]>([]) // Ações em massa (venda)

  // ===== Escalação =====
  const [titulares, setTitulares] = useState<string[]>([])          // exatamente 11
  const [escalaFixada, setEscalaFixada] = useState<boolean>(false)  // bloqueio pós-salvar
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
    const key = Object.keys(bandeiras).find((nome) =>
      nome.toLowerCase().replace(/[^a-z]/g, '') === (pais || '').toLowerCase().replace(/[^a-z]/g, '')
    )
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
    valor
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
      data_evento: new Date().toISOString()
    })
    if (error) {
      console.error('Erro ao registrar no BID:', error)
      toast.error('⚠️ Falha ao registrar no BID.')
    }
  }

  /** ===== Toggle titular (⭐) ===== */
  const toggleTitular = (id: string) => {
    if (escalaFixada) return
    setTitulares(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 11) {
        toast('Limite de 11 titulares atingido.')
        return prev
      }
      return [...prev, id]
    })
  }
  const jogadorEhTitular = (id: string) => titulares.includes(id)

  /** ===== Fetch ===== */
  const fetchElenco = async () => {
    setLoading(true)
    setErro(null)
    try {
      const id_time =
        typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
      if (!id_time) {
        setElenco([]); setSaldo(0); setNomeTime('')
        setSelecionados([]); setTitulares([]); setEscalaFixada(false)
        return
      }

      const [{ data: elencoData, error: e1 }, { data: timeData, error: e2 }] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single()
      ])
      if (e1) throw e1
      if (e2) throw e2

      // sincroniza salários (1% do valor)
      const needsUpdate = (elencoData || []).filter(j => {
        const esperado = calcularSalario(j.valor)
        return Number(j.salario || 0) !== esperado
      })
      if (needsUpdate.length > 0) {
        await Promise.all(
          needsUpdate.map(j =>
            supabase.from('elenco').update({ salario: calcularSalario(j.valor) }).eq('id', j.id)
          )
        )
      }

      const elencoComRegra = (elencoData || []).map(j => ({
        ...j, salario: calcularSalario(j.valor)
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

      const idsElenco = new Set(elencoComRegra.map(j => j.id))
      const titularesValidos = titularesSalvos.filter((tid: string) => idsElenco.has(tid)).slice(0, 11)

      setElenco(elencoComRegra)
      setSaldo(Number(timeData?.saldo || 0))
      setNomeTime(timeData?.nome || '')
      setSelecionados([]); setTitulares(titularesValidos); setEscalaFixada(fixada)
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchElenco() }, [])

  /** ===== Ações em massa ===== */
  const toggleSelecionado = (id: string) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }
  const selecionarTodosFiltrados = () => setSelecionados(elencoFiltrado.map(j => j.id))
  const limparSelecao = () => setSelecionados([])

  /** ===== Vender selecionados ===== */
  const venderSelecionados = async () => {
    const jogadores = elenco.filter(j => selecionados.includes(j.id))
    if (jogadores.length === 0) return
    const id_time_local = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null

    for (const jogador of jogadores) {
      try {
        if ((jogador.jogos || 0) < 3) { toast('🚫 Jogador precisa de pelo menos 3 jogos.'); continue }
        const percentualStr = prompt(`Quantos % de ${jogador.nome} deseja vender?`, String(jogador.percentual ?? 100))
        if (percentualStr === null) continue
        const percentualNum = Number(percentualStr)
        const percentualAtual = Number(jogador.percentual ?? 100)
        if (!Number.isFinite(percentualNum) || percentualNum <= 0 || percentualNum > percentualAtual) {
          toast.error('❌ Percentual inválido.'); continue
        }

        const baseValor = Number(jogador.valor || 0)
        const valorVenda = Math.round((baseValor * percentualNum / 100) * 0.3)

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
            created_at: new Date().toISOString()
          })
await registrarNoBID({
  tipo_evento: 'anuncio_mercado',
  descricao: `${jogador.nome} (${jogador.posicao}) colocado no mercado (${percentualNum}%) por ${formatBRL(baseValor)}`,
  id_time1: jogador.id_time,
  valor: baseValor
})

          if (error) { console.error('Erro ao inserir no mercado:', error); toast.error(`❌ Falha ao anunciar ${jogador.nome}.`); continue }
        }

        // 2) Atualizar percentual
        const novoPercentual = (jogador.percentual ?? 100) - percentualNum
        if (novoPercentual <= 0) {
          const { error } = await supabase.from('elenco').delete().eq('id', jogador.id)
          if (error) { console.error('Erro ao remover do elenco:', error); toast('⚠️ Falha ao remover do elenco.') }
        } else {
          const { error } = await supabase.from('elenco').update({ percentual: novoPercentual }).eq('id', jogador.id)
          if (error) { console.error(`Erro ao atualizar percentual de ${jogador.nome}.`, error); toast('⚠️ Falha ao atualizar percentual.') }
        }

        // 3) Crédito (RPC)
        {
          const { data: dataRPC, error } = await supabase.rpc('increment_saldo_return', {
            p_time_id: jogador.id_time, p_delta: valorVenda
          })
          if (error) { console.error('Erro RPC:', error); toast.error(`❌ Falha ao creditar ${formatBRL(valorVenda)}.`); continue }
          const novoSaldo = Number(dataRPC)
          if (id_time_local && id_time_local === jogador.id_time) setSaldo(novoSaldo)

          await registrarNoBID({
            tipo_evento: 'venda_mercado',
            descricao: `Venda de ${percentualNum}% de ${jogador.nome} por ${formatBRL(valorVenda)}`,
            id_time1: jogador.id_time,
            valor: valorVenda
          })

          toast.success(`✅ ${jogador.nome}: venda de ${percentualNum}% registrada (+${formatBRL(valorVenda)}).`)
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
    () => (elenco.length > 0
      ? elenco.reduce((acc, j) => acc + Number(j.overall || 0), 0) / elenco.length
      : 0),
    [elenco]
  )

  const elencoFiltrado = useMemo(() => {
    let arr = elenco.filter(j =>
      (!filtroNacionalidade || j.nacionalidade === filtroNacionalidade) &&
      (!filtroPosicao || j.posicao === filtroPosicao) &&
      (!nomeDebounced || j.nome.toLowerCase().includes(nomeDebounced.toLowerCase())) &&
      (!filtroOverall || Number(j.overall || 0) >= filtroOverall) &&
      (!soVendiveis || Number(j.jogos || 0) >= 3)
    )
    arr.sort((a, b) => {
      if (ordenacao === 'valor') return Number(b.valor || 0) - Number(a.valor || 0)
      if (ordenacao === 'overall') return Number(b.overall || 0) - Number(a.overall || 0)
      if (ordenacao === 'salario') return calcularSalario(b.valor) - calcularSalario(a.valor)
      if (ordenacao === 'jogos') return Number(b.jogos || 0) - Number(a.jogos || 0)
      if (ordenacao === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR')
      if (ordenacao === 'posicao') return (a.posicao || '').localeCompare(b.posicao || '', 'pt-BR')
      return 0
    })
    return arr
  }, [elenco, filtroNacionalidade, filtroPosicao, nomeDebounced, filtroOverall, soVendiveis, ordenacao])

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

  if (loading) {
    return (
      <div className="p-4 max-w-7xl mx-auto min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white">
        <header className="sticky top-0 z-40 -mx-4 px-4 py-3 bg-gray-950/85 backdrop-blur border-b border-white/10">
          <h1 className="text-xl font-bold">👥 Elenco</h1>
          <p className="text-sm text-gray-400">Carregando dados...</p>
        </header>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-5">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  /** ===== Helper visual: anel por OVR ===== */
  const ringByOVR = (ovr?: number | null) => {
    const n = Number(ovr || 0)
    if (n >= 85) return 'ring-amber-400/40'
    if (n >= 80) return 'ring-emerald-400/30'
    if (n >= 75) return 'ring-sky-400/25'
    return 'ring-gray-700'
  }

  /** ===== Salvar / Fixar Escalação ===== */
  const salvarEscalacao = async () => {
    if (escalaFixada) return
    if (titulares.length !== 11) { toast('Selecione exatamente 11 titulares.'); return }
    const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
    if (!id_time) { toast.error('Time não identificado.'); return }
    setSalvandoEscalacao(true)
    try {
      const { error } = await supabase
        .from('escalacoes')
        .upsert({ id_time, titulares, fixada: true, fixada_em: new Date().toISOString() }, { onConflict: 'id_time' })
      if (error) throw error
      setEscalaFixada(true)
      await registrarNoBID({
        tipo_evento: 'escala_fixa',
        descricao: `Escalação do ${nomeTime} fixada com 11 titulares.`,
        id_time1: id_time
      })
      toast.success('✅ Escalação salva e fixada!')
    } catch (e: any) {
      console.error(e); toast.error('❌ Falha ao salvar a escalação.')
    } finally { setSalvandoEscalacao(false) }
  }

  const desbloquearEscalacao = async () => {
    const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
    if (!id_time) return
    const ok = confirm('Desbloquear a escalação para editar?')
    if (!ok) return
    const { error } = await supabase.from('escalacoes').update({ fixada: false }).eq('id_time', id_time)
    if (error) toast.error('Falha ao desbloquear.')
    else { setEscalaFixada(false); toast.success('Escalação desbloqueada.') }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto bg-gradient-to-b from-gray-950 to-gray-900 text-white min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur supports-[backdrop-filter]:bg-gray-950/65 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight truncate">
              👥 Elenco do <span className="text-green-400">{nomeTime || '—'}</span>
              <span className="text-xs sm:text-sm text-gray-400 ml-2">({elenco.length})</span>
            </h1>
          </div>
          <div className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm">
            💳 <b className="ml-1">{formatBRL(saldo)}</b>
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
            className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
          >
            🧰 Filtros
          </button>
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

        {/* Stat chips – horizontal scroll (mobile) / grid (desktop) */}
        <div className="mt-3 overflow-x-auto pb-1 sm:overflow-visible">
          <div className="flex gap-2 sm:grid sm:grid-cols-4">
            <StatPill icon="📦" label="Valor elenco" value={formatBRL(valorTotal)} />
            <StatPill icon="💸" label="Salários" value={formatBRL(salarioTotal)} />
            <StatPill icon="⭐" label="Média OVR" value={mediaOverall.toFixed(1)} />
            <StatPill icon="🔒" label="Escalação" value={escalaFixada ? 'Fixada' : `${titulares.length}/11`} />
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
              className="px-3 py-2 rounded-lg text-black w-64"
              aria-label="Buscar por nome"
            />
              <input
                type="number"
                placeholder="OVR mínimo"
                value={filtroOverall}
                onChange={(e) => setFiltroOverall(Number(e.target.value))}
                className="px-3 py-2 rounded-lg text-black w-44"
                aria-label="OVR mínimo"
              />
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className="px-3 py-2 rounded-lg text-black w-48"
                aria-label="Ordenação"
              >
                <option value="valor">💰 Valor</option>
                <option value="overall">⭐ Overall</option>
                <option value="salario">💸 Salário</option>
                <option value="jogos">🏟️ Jogos</option>
                <option value="nome">🔤 Nome</option>
                <option value="posicao">🎯 Posição</option>
              </select>
              <label className="inline-flex items-center gap-2 text-sm bg-gray-800/60 border border-gray-700 px-3 py-2 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={soVendiveis}
                  onChange={(e) => setSoVendiveis(e.target.checked)}
                  aria-label="Somente vendíveis (3+ jogos)"
                />
                <span>Somente vendíveis (≥ 3 jogos)</span>
              </label>
          </div>

          <div className="flex items-center gap-2">
            {!escalaFixada ? (
              <button
                type="button"
                onClick={salvarEscalacao}
                disabled={titulares.length !== 11 || salvandoEscalacao}
                className={`px-4 py-2 rounded-lg font-semibold transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60
                  ${titulares.length === 11 && !salvandoEscalacao ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-700 cursor-not-allowed'}`}
                title="Salvar e fixar escalação"
                aria-label="Salvar e fixar escalação"
              >
                {salvandoEscalacao ? 'Salvando...' : `Salvar Escalação (${titulares.length}/11)`}
              </button>
            ) : (
              <span className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm">🔒 Escalação fixada</span>
            )}
            <button
              type="button"
              onClick={fetchElenco}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
            >
              🔄 Atualizar
            </button>
          </div>
        </div>

        {/* Filtros ativos (chips) */}
        <div className="mt-3 flex flex-wrap gap-2">
          {filtroNome && <ActiveFilterChip label={`Nome: "${filtroNome}"`} onClear={() => setFiltroNome('')} />}
          {filtroOverall > 0 && <ActiveFilterChip label={`OVR ≥ ${filtroOverall}`} onClear={() => setFiltroOverall(0)} />}
          {soVendiveis && <ActiveFilterChip label="Vendíveis (≥ 3 jogos)" onClear={() => setSoVendiveis(false)} />}
          {filtroNacionalidade && <ActiveFilterChip label={`Nac: ${filtroNacionalidade}`} onClear={() => setFiltroNacionalidade(null)} />}
          {filtroPosicao && <ActiveFilterChip label={`Pos: ${filtroPosicao}`} onClear={() => setFiltroPosicao(null)} />}
        </div>
      </header>

      {/* Sheet de filtros (MOBILE) */}
      {showFiltersMobile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowFiltersMobile(false)} aria-hidden />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-gray-900 border-t border-gray-800 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-700 mb-3" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Filtros</h3>
              <button
                type="button"
                onClick={() => setShowFiltersMobile(false)}
                className="text-sm px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
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
                className="w-full px-3 py-3 rounded-xl text-black"
              />
              <input
                type="number"
                placeholder="OVR mínimo"
                value={filtroOverall}
                onChange={(e) => setFiltroOverall(Number(e.target.value))}
                className="w-full px-3 py-3 rounded-xl text-black"
              />
              <select
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                className="w-full px-3 py-3 rounded-xl text-black"
              >
                <option value="valor">💰 Valor</option>
                <option value="overall">⭐ Overall</option>
                <option value="salario">💸 Salário</option>
                <option value="jogos">🏟️ Jogos</option>
                <option value="nome">🔤 Nome</option>
                <option value="posicao">🎯 Posição</option>
              </select>

              <label className="flex items-center justify-between bg-gray-800/60 border border-gray-700 px-4 py-3 rounded-xl">
                <span className="text-sm">Somente vendíveis (≥ 3 jogos)</span>
                <input
                  type="checkbox"
                  checked={soVendiveis}
                  onChange={(e) => setSoVendiveis(e.target.checked)}
                  className="h-5 w-5 accent-emerald-500"
                />
              </label>

              {(filtroNome || filtroOverall || soVendiveis || filtroNacionalidade || filtroPosicao) && (
                <button
                  type="button"
                  onClick={() => { setFiltroNome(''); setFiltroOverall(0); setSoVendiveis(false); setFiltroNacionalidade(null); setFiltroPosicao(null) }}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
                >
                  Limpar todos filtros
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowFiltersMobile(false)}
                className="w-full px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 font-semibold"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chips dinâmicos (colapsados em detalhes, rolagem horizontal) */}
      <section className="mt-4">
        <details className="open:mt-0 sm:open mt-0">
          <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">🌎 Nacionalidades</summary>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {Object.entries(contPorNac).map(([nac, count]) => (
              <button
                key={nac}
                type="button"
                onClick={() => setFiltroNacionalidade(nac)}
                className={`px-2.5 py-1.5 rounded-full text-xs whitespace-nowrap border
                  ${filtroNacionalidade === nac ? 'bg-green-700/60 border-green-600 text-green-100' : 'bg-gray-800/60 border-gray-700 text-gray-200'} hover:bg-gray-800`}
                title={nac}
              >
                {getFlagUrl(nac) && <img src={getFlagUrl(nac)} className="inline-block w-5 h-3 mr-1" alt={nac} loading="lazy" decoding="async" />}
                {nac} ({count})
              </button>
            ))}
          </div>
        </details>

        <details className="mt-2 open:mt-2">
          <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">🎯 Posições</summary>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {Object.entries(contPorPos).map(([pos, count]) => (
              <button
                key={pos}
                type="button"
                onClick={() => setFiltroPosicao(pos)}
                className={`px-2.5 py-1.5 rounded-full text-xs whitespace-nowrap border
                  ${filtroPosicao === pos ? 'bg-green-700/60 border-green-600 text-green-100' : 'bg-gray-800/60 border-gray-700 text-gray-200'} hover:bg-gray-800`}
              >
                {pos} ({count})
              </button>
            ))}
          </div>
        </details>

        {erro && <p className="mt-2 text-red-400 text-sm">{erro}</p>}
      </section>

      {/* Ações em massa (barra fixa) */}
      {selecionados.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-2xl shadow-2xl px-3 sm:px-4 py-3 w-[92%] sm:w-auto pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-sm text-gray-300">{selecionados.length} jogador(es) selecionado(s)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={venderSelecionados}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg font-semibold"
              >
                💸 Vender
              </button>
              <button
                type="button"
                onClick={selecionarTodosFiltrados}
                className="flex-1 sm:flex-none bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm"
              >
                Selecionar todos
              </button>
              <button
                type="button"
                onClick={limparSelecao}
                className="flex-1 sm:flex-none bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {elencoFiltrado.length === 0 ? (
        <div className="mt-8 text-center text-gray-300">Nenhum jogador encontrado com os filtros aplicados.</div>
      ) : viewMode === 'grid' ? (
        <div className="mt-5 grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {elencoFiltrado.map(jogador => {
            const selecionado = selecionados.includes(jogador.id)
            const status: string[] = []
            if (jogador.protegido) status.push('🛡️ Protegido')
            if (jogador.lesionado) status.push('⚠️ Lesionado')
            if ((jogador.jogos || 0) >= 7) status.push('🔥 Em Alta')

            const imgSrc = jogador.imagem_url ?? FALLBACK_SRC
            const ehTitular = jogadorEhTitular(jogador.id)

            return (
              <div
                key={jogador.id}
                className={`relative bg-white/[0.04] p-3 rounded-2xl border transition
                  ${selecionado ? 'border-emerald-500 ring-1 ring-emerald-400/30' : 'border-white/10 hover:border-white/20'}
                  shadow-lg`}
              >
                {/* checkbox */}
                <label className="absolute top-2 left-2 inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleSelecionado(jogador.id)}
                    className="h-5 w-5 accent-emerald-500"
                    aria-label={`Selecionar ${jogador.nome}`}
                  />
                </label>

                {/* estrela */}
                <button
                  type="button"
                  onClick={() => toggleTitular(jogador.id)}
                  disabled={escalaFixada}
                  className={`absolute top-2 right-2 rounded-full px-2 py-1 text-base border
                    ${ehTitular ? 'border-amber-400/60 bg-amber-400/20' : 'border-white/10 bg-gray-800/70'}
                    ${escalaFixada ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700/70'}`}
                  title={ehTitular ? 'Titular (remover)' : 'Marcar como titular'}
                  aria-label={ehTitular ? 'Remover titular' : 'Marcar como titular'}
                >
                  {ehTitular ? '⭐' : '☆'}
                </button>

                <div className="cursor-default select-none">
                  <ImagemComFallback
                    src={imgSrc}
                    alt={jogador.nome}
                    width={96}
                    height={96}
                    className={`rounded-full mb-2 mx-auto ring-2 ${ringByOVR(jogador.overall)} h-20 w-20 sm:h-24 sm:w-24 object-cover`}
                  />

                  <h2 className="text-sm sm:text-base font-extrabold text-center leading-tight line-clamp-1" title={jogador.nome}>
                    {jogador.nome}
                  </h2>

                  <div className="flex justify-center items-center gap-2 text-xs text-gray-300 mt-0.5">
                    {getFlagUrl(jogador.nacionalidade) && (
                      <img
                        src={getFlagUrl(jogador.nacionalidade)}
                        alt={jogador.nacionalidade || '—'}
                        className="w-5 h-3"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <span className="line-clamp-1">{jogador.nacionalidade || 'Outro'}</span>
                  </div>

                  <div className="mt-2 flex justify-center items-center gap-2">
                    <span className={`inline-block ${coresPorPosicao[jogador.posicao] || 'bg-gray-600'} text-[11px] text-white px-3 py-1 rounded-full`}>
                      {jogador.posicao}
                    </span>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-gray-800/80 border border-white/10">
                      OVR <b>{jogador.overall ?? 0}</b>
                    </span>
                  </div>

                  {status.length > 0 && (
                    <div className="mt-2 flex flex-wrap justify-center gap-1">
                      {status.map((s, i) => (
                        <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-gray-800/80 border border-white/10">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 text-center">
                    <p className="text-emerald-400 font-semibold text-sm">💰 {formatBRL(jogador.valor)}</p>
                    <p className="text-[11px] text-gray-400">
                      Salário: {formatBRL(calcularSalario(jogador.valor))} • Jogos: {jogador.jogos ?? 0} • {jogador.percentual ?? 100}%
                    </p>
                  </div>

                  {jogador.link_sofifa && (
                    <a
                      href={jogador.link_sofifa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs underline inline-block mt-1 text-center w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 rounded"
                    >
                      🔗 Ver no SoFIFA
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        // Tabela (principalmente desktop)
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10 hidden md:block">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-gray-900/80 sticky top-[56px] z-10 backdrop-blur supports-[backdrop-filter]:bg-gray-900/60 shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
              <tr className="text-left text-sm text-gray-300">
                <th className="px-3 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={selecionados.length > 0 && selecionados.length === elencoFiltrado.length}
                    onChange={(e) => e.target.checked ? selecionarTodosFiltrados() : limparSelecao()}
                    className="h-5 w-5 accent-emerald-500"
                    aria-label="Selecionar todos visíveis"
                  />
                </th>
                <th className="px-3 py-3 w-12">⭐</th>
                <th className="px-3 py-3">Jogador</th>
                <th className="px-3 py-3">País</th>
                <th className="px-3 py-3">Posição</th>
                <th className="px-3 py-3 cursor-pointer" onClick={() => setOrdenacao('overall')}>OVR {ordenacao==='overall' ? '▲' : '↕'}</th>
                <th className="px-3 py-3 cursor-pointer" onClick={() => setOrdenacao('valor')}>Valor {ordenacao==='valor' ? '▲' : '↕'}</th>
                <th className="px-3 py-3 cursor-pointer" onClick={() => setOrdenacao('salario')}>Salário {ordenacao==='salario' ? '▲' : '↕'}</th>
                <th className="px-3 py-3 cursor-pointer" onClick={() => setOrdenacao('jogos')}>Jogos {ordenacao==='jogos' ? '▲' : '↕'}</th>
                <th className="px-3 py-3">%</th>
                <th className="px-3 py-3">Link</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-gray-950/40">
              {elencoFiltrado.map((jogador) => {
                const selecionado = selecionados.includes(jogador.id)
                const imgSrc = jogador.imagem_url ?? FALLBACK_SRC
                const ehTitular = jogadorEhTitular(jogador.id)
                return (
                  <tr key={jogador.id} className={`text-sm hover:bg-gray-900/40 ${selecionado ? 'bg-gray-900/60' : 'odd:bg-gray-950/30'}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selecionado}
                        onChange={() => toggleSelecionado(jogador.id)}
                        className="h-5 w-5 accent-emerald-500"
                        aria-label={`Selecionar ${jogador.nome}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleTitular(jogador.id)}
                        disabled={escalaFixada}
                        className={`rounded-full px-2 py-1 text-sm border
                          ${ehTitular ? 'border-amber-400/60 bg-amber-400/20' : 'border-white/10 bg-gray-800/70'}
                          ${escalaFixada ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700/70'}`}
                        aria-label={ehTitular ? 'Remover titular' : 'Marcar como titular'}
                        title={ehTitular ? 'Titular (clique para remover)' : 'Marcar como titular'}
                      >
                        {ehTitular ? '⭐' : '☆'}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <ImagemComFallback src={imgSrc} alt={jogador.nome} width={36} height={36} className={`rounded-full ring-2 ${ringByOVR(jogador.overall)}`} />
                        <span className="font-semibold">{jogador.nome}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {getFlagUrl(jogador.nacionalidade) && <img src={getFlagUrl(jogador.nacionalidade)} className="w-5 h-3" alt={jogador.nacionalidade || '—'} loading="lazy" decoding="async" />}
                        <span className="text-gray-300">{jogador.nacionalidade || 'Outro'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs text-white ${coresPorPosicao[jogador.posicao] || 'bg-gray-600'}`}>
                        {jogador.posicao}
                      </span>
                    </td>
                    <td className="px-3 py-3">{jogador.overall ?? 0}</td>
                    <td className="px-3 py-3">{formatBRL(jogador.valor)}</td>
                    <td className="px-3 py-3">{formatBRL(calcularSalario(jogador.valor))}</td>
                    <td className="px-3 py-3">{jogador.jogos ?? 0}</td>
                    <td className="px-3 py-3">{jogador.percentual ?? 100}%</td>
                    <td className="px-3 py-3">
                      {jogador.link_sofifa ? (
                        <a href={jogador.link_sofifa} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
                          SoFIFA
                        </a>
                      ) : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {jogador.protegido && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-white/10">🛡️ Protegido</span>}
                        {jogador.lesionado && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-white/10">⚠️ Lesionado</span>}
                        {(jogador.jogos || 0) >= 7 && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-white/10">🔥 Em Alta</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
