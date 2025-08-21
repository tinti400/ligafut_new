'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback'

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
  `R$ ${Number(n || 0).toLocaleString('pt-BR')}`

// Data URI 1x1 transparente
const FALLBACK_SRC =
  'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='

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
  const [filtroOverall, setFiltroOverall] = useState<number>(0)
  const [soVendiveis, setSoVendiveis] = useState<boolean>(false) // jogos >= 3
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('valor')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  const [selecionados, setSelecionados] = useState<string[]>([])

  // UI Mobile
  const [showFiltersMobile, setShowFiltersMobile] = useState(false)

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
        return
      }

      const [{ data: elencoData, error: e1 }, { data: timeData, error: e2 }] = await Promise.all([
        supabase.from('elenco').select('*').eq('id_time', id_time),
        supabase.from('times').select('nome, saldo').eq('id', id_time).single()
      ])

      if (e1) throw e1
      if (e2) throw e2

      // --- Garantia DB: sincroniza salários = 1% do valor ---
      const needsUpdate = (elencoData || []).filter(j => {
        const esperado = calcularSalario(j.valor)
        return Number(j.salario || 0) !== esperado
      })

      if (needsUpdate.length > 0) {
        await Promise.all(
          needsUpdate.map(j =>
            supabase.from('elenco')
              .update({ salario: calcularSalario(j.valor) })
              .eq('id', j.id)
          )
        )
      }

      // Atualiza estado já refletindo o salário esperado
      const elencoComRegra = (elencoData || []).map(j => ({
        ...j,
        salario: calcularSalario(j.valor)
      }))

      setElenco(elencoComRegra as Jogador[])
      setSaldo(Number(timeData?.saldo || 0))
      setNomeTime(timeData?.nome || '')
      setSelecionados([])
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao carregar elenco.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ===== UI helpers ===== */
  const exibirMensagem = (mensagem: string, cor: string) => {
    const div = document.createElement('div')
    div.innerHTML = `<div style="background:${cor};color:white;padding:14px 18px;border-radius:12px;text-align:center;position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;box-shadow:0 10px 25px rgba(0,0,0,.35)">${mensagem}</div>`
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 3500)
  }

  const getFlagUrl = (pais?: string | null) => {
    if (!pais) return ''
    const key = Object.keys(bandeiras).find((nome) =>
      nome.toLowerCase().replace(/[^a-z]/g, '') === pais.toLowerCase().replace(/[^a-z]/g, '')
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

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }

  const selecionarTodosFiltrados = () => {
    const ids = elencoFiltrado.map(j => j.id)
    setSelecionados(ids)
  }
  const limparSelecao = () => setSelecionados([])

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
      exibirMensagem('⚠️ Falha ao registrar no BID.', '#b45309')
    }
  }

  /** ===== Ação: vender selecionados (parcial) ===== */
  const venderSelecionados = async () => {
    const jogadores = elenco.filter(j => selecionados.includes(j.id))
    if (jogadores.length === 0) return

    for (const jogador of jogadores) {
      try {
        if ((jogador.jogos || 0) < 3) {
          exibirMensagem(`🚫 ${jogador.nome} não completou 3 jogos.`, '#b91c1c')
          continue
        }

        const percentualStr = prompt(
          `Quantos % de ${jogador.nome} deseja vender?`,
          String(jogador.percentual ?? 100)
        )
        if (percentualStr === null) continue

        const percentualNum = Number(percentualStr)
        const percentualAtual = Number(jogador.percentual ?? 100)

        if (!Number.isFinite(percentualNum) || percentualNum <= 0 || percentualNum > percentualAtual) {
          exibirMensagem('❌ Percentual inválido.', '#b91c1c')
          continue
        }

        const baseValor = Number(jogador.valor || 0)
        const valorVenda = Math.round((baseValor * percentualNum / 100) * 0.7)

        // 1) Inserir no mercado (salário já como 1% do valor)
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
          if (error) {
            console.error('Erro ao inserir no mercado:', error)
            exibirMensagem(`❌ Falha ao anunciar ${jogador.nome} no mercado.`, '#b91c1c')
            continue
          }
        }

        // 2) Atualizar percentual no elenco (ou remover)
        const novoPercentual = (jogador.percentual ?? 100) - percentualNum
        if (novoPercentual <= 0) {
          const { error } = await supabase.from('elenco').delete().eq('id', jogador.id)
          if (error) {
            console.error('Erro ao remover do elenco:', error)
            exibirMensagem(`⚠️ Falha ao remover ${jogador.nome} do elenco.`, '#b45309')
          }
        } else {
          const { error } = await supabase.from('elenco').update({ percentual: novoPercentual }).eq('id', jogador.id)
          if (error) {
            console.error('Erro ao atualizar percentual de ${jogador.nome}.', error)
            exibirMensagem(`⚠️ Falha ao atualizar percentual de ${jogador.nome}.`, '#b45309')
          }
        }

        // 3) Crédito atômico (RPC) + saldo novo
        let saldoNovo: number | null = null
        {
          let saldoAntigo = saldo
          const { data: timeRow } = await supabase
            .from('times')
            .select('saldo')
            .eq('id', jogador.id_time)
            .single()
          if (timeRow?.saldo != null) {
            saldoAntigo = Number(timeRow.saldo)
          }

          const { data, error } = await supabase.rpc('increment_saldo_return', {
            p_time_id: jogador.id_time,
            p_delta: valorVenda
          })
          if (error) {
            console.error('Erro ao incrementar saldo via RPC:', error)
            exibirMensagem(`❌ Falha ao creditar ${formatBRL(valorVenda)} para o time.`, '#b91c1c')
            continue
          }
          saldoNovo = Number(data)

          const id_time_local = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
          if (id_time_local && id_time_local === jogador.id_time) {
            setSaldo(saldoNovo)
          }

          await registrarNoBID({
            tipo_evento: 'venda_mercado',
            descricao: `Venda de ${percentualNum}% de ${jogador.nome} por ${formatBRL(valorVenda)}`,
            id_time1: jogador.id_time,
            valor: valorVenda
          })

          exibirMensagem(
            `✅ ${jogador.nome}: venda de ${percentualNum}% registrada (+${formatBRL(valorVenda)}). Caixa: ${formatBRL(saldoAntigo)} → ${formatBRL(Number(saldoNovo))}`,
            '#16a34a'
          )
        }
      } catch (err) {
        console.error('Erro na venda:', err)
        exibirMensagem('❌ Ocorreu um erro ao processar a venda.', '#b91c1c')
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
    // usa a regra 1% independentemente do que veio do DB
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
      (!filtroNome || j.nome.toLowerCase().includes(filtroNome.toLowerCase())) &&
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
  }, [elenco, filtroNacionalidade, filtroPosicao, filtroNome, filtroOverall, soVendiveis, ordenacao])

  /** ===== Skeleton ===== */
  const SkeletonCard = () => (
    <div className="animate-pulse bg-gray-800/70 p-4 rounded-xl border-2 border-gray-700">
      <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-gray-700 mx-auto mb-3" />
      <div className="h-4 bg-gray-700 rounded w-3/4 mx-auto mb-2" />
      <div className="h-3 bg-gray-700 rounded w-1/2 mx-auto mb-4" />
      <div className="h-6 bg-gray-700 rounded w-full mb-2" />
      <div className="h-6 bg-gray-700 rounded w-5/6 mb-2" />
      <div className="h-6 bg-gray-700 rounded w-4/6" />
    </div>
  )

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white">
        <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur border-b border-gray-800">
          <h1 className="text-xl sm:text-2xl font-bold">👥 Elenco</h1>
          <p className="text-sm text-gray-400">Carregando dados...</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-6">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto bg-gradient-to-b from-gray-950 to-gray-900 text-white min-h-screen">
      {/* Header / Resumo */}
      <div className="sticky top-0 z-40 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-gray-950/85 backdrop-blur supports-[backdrop-filter]:bg-gray-950/65 border-b border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">
              👥 Elenco do <span className="text-green-400">{nomeTime || '—'}</span>
              <span className="text-xs sm:text-sm text-gray-400 ml-2">({elenco.length} atletas)</span>
            </h1>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3 text-xs sm:text-sm">
              <span className="px-2 py-1 rounded-full bg-emerald-700/40 border border-emerald-600/40 text-center">
                💰 Caixa: <b className="text-emerald-300">{formatBRL(saldo)}</b>
              </span>
              <span className="px-2 py-1 rounded-full bg-yellow-700/40 border border-yellow-600/40 text-center">
                📦 Valor elenco: <b className="text-yellow-300">{formatBRL(valorTotal)}</b>
              </span>
              <span className="px-2 py-1 rounded-full bg-rose-700/40 border border-rose-600/40 text-center">
                💸 Salários: <b className="text-rose-300">{formatBRL(salarioTotal)}</b>
              </span>
              <span className="px-2 py-1 rounded-full bg-sky-700/40 border border-sky-600/40 text-center">
                ⭐ Média OVR: <b className="text-sky-300">{mediaOverall.toFixed(1)}</b>
              </span>
            </div>
          </div>

          {/* Ações rápidas (desktop) */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={fetchElenco}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition shadow-sm"
              title="Atualizar elenco"
            >
              🔄 Atualizar
            </button>
            <div className="hidden sm:block h-8 w-px bg-gray-800" />
            <div className="hidden md:inline-flex rounded-lg border border-gray-700 overflow-hidden">
              <button
                className={`px-3 py-2 text-sm ${viewMode === 'grid' ? 'bg-gray-800' : 'bg-transparent'} hover:bg-gray-800`}
                onClick={() => setViewMode('grid')}
                title="Visualização em cartões"
              >
                🗂️ Cards
              </button>
              <button
                className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-gray-800' : 'bg-transparent'} hover:bg-gray-800`}
                onClick={() => setViewMode('table')}
                title="Visualização em tabela"
              >
                📋 Tabela
              </button>
            </div>
          </div>

          {/* Ações rápidas (mobile) */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setShowFiltersMobile(true)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              🔎 Filtros
            </button>
            <button
              onClick={fetchElenco}
              className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm"
              title="Atualizar elenco"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Toolbar de filtros (desktop) */}
        <div className="mt-3 hidden lg:flex lg:items-end gap-3">
          <div className="flex flex-1 flex-wrap gap-2">
            <input
              type="text"
              placeholder="Buscar por nome"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="px-3 py-2 rounded-lg text-black w-64"
            />
            <input
              type="number"
              placeholder="OVR mínimo"
              value={filtroOverall}
              onChange={(e) => setFiltroOverall(Number(e.target.value))}
              className="px-3 py-2 rounded-lg text-black w-44"
            />
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              className="px-3 py-2 rounded-lg text-black w-48"
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
              />
              <span>Somente vendíveis (≥ 3 jogos)</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            { (filtroNome || filtroOverall || soVendiveis || filtroNacionalidade || filtroPosicao) && (
              <button
                onClick={() => {
                  setFiltroNome(''); setFiltroOverall(0); setSoVendiveis(false)
                  setFiltroNacionalidade(null); setFiltroPosicao(null)
                }}
                className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Chips dinâmicos (colapsáveis no mobile) */}
        <div className="mt-3">
          <details className="lg:open">
            <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">
              🌎 Nacionalidades
            </summary>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {Object.entries(contar('nacionalidade')).map(([nac, count]) => (
                <button
                  key={nac}
                  onClick={() => setFiltroNacionalidade(nac)}
                  className={`px-2.5 py-1.5 rounded-full text-xs whitespace-nowrap border
                    ${filtroNacionalidade === nac ? 'bg-green-700/60 border-green-600 text-green-100' : 'bg-gray-800/60 border-gray-700 text-gray-200'} hover:bg-gray-800`}
                  title={nac}
                >
                  {getFlagUrl(nac) && <img src={getFlagUrl(nac)} className="inline-block w-5 h-3 mr-1" />}
                  {nac} ({count})
                </button>
              ))}
            </div>
          </details>

          <details className="mt-2 lg:open">
            <summary className="cursor-pointer text-sm text-gray-300 select-none py-1">
              🎯 Posições
            </summary>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {Object.entries(contar('posicao')).map(([pos, count]) => (
                <button
                  key={pos}
                  onClick={() => setFiltroPosicao(pos)}
                  className={`px-2.5 py-1.5 rounded-full text-xs whitespace-nowrap border
                    ${filtroPosicao === pos ? 'bg-green-700/60 border-green-600 text-green-100' : 'bg-gray-800/60 border-gray-700 text-gray-200'} hover:bg-gray-800`}
                >
                  {pos} ({count})
                </button>
              ))}
            </div>
          </details>
        </div>

        {erro && <p className="mt-2 text-red-400 text-sm">{erro}</p>}
      </div>

      {/* Sheet de filtros (MOBILE) */}
      {showFiltersMobile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => setShowFiltersMobile(false)}
            aria-hidden
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-gray-900 border-t border-gray-800 p-4">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-700 mb-3" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Filtros</h3>
              <button
                onClick={() => setShowFiltersMobile(false)}
                className="text-sm px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700"
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
                  onClick={() => {
                    setFiltroNome(''); setFiltroOverall(0); setSoVendiveis(false)
                    setFiltroNacionalidade(null); setFiltroPosicao(null)
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"
                >
                  Limpar todos filtros
                </button>
              )}

              <button
                onClick={() => setShowFiltersMobile(false)}
                className="w-full px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 font-semibold"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ações em massa (barra fixa) */}
      {selecionados.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-2xl shadow-2xl px-3 sm:px-4 py-3 w-[92%] sm:w-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="text-sm text-gray-300">
              {selecionados.length} jogador(es) selecionado(s)
            </span>
            <div className="flex gap-2">
              <button
                onClick={venderSelecionados}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg font-semibold"
              >
                💸 Vender
              </button>
              <button
                onClick={selecionarTodosFiltrados}
                className="flex-1 sm:flex-none bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm"
              >
                Selecionar todos
              </button>
              <button
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
        <div className="mt-8 text-center text-gray-300">
          Nenhum jogador encontrado com os filtros aplicados.
        </div>
      ) : viewMode === 'grid' ? (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {elencoFiltrado.map(jogador => {
            const selecionado = selecionados.includes(jogador.id)
            const status: string[] = []
            if (jogador.protegido) status.push('🛡️ Protegido')
            if (jogador.lesionado) status.push('⚠️ Lesionado')
            if ((jogador.jogos || 0) >= 7) status.push('🔥 Em Alta')

            const imgSrc = jogador.imagem_url ?? FALLBACK_SRC

            return (
              <div
                key={jogador.id}
                className={`relative bg-gray-900/70 p-3 sm:p-4 rounded-2xl border-2 transition
                  ${selecionado ? 'border-green-500 ring-1 ring-green-400/30' : 'border-gray-800 hover:border-gray-700'}
                  shadow-lg hover:shadow-emerald-900/10`}
              >
                {/* Checkbox seleção */}
                <label className="absolute top-3 left-3 inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => toggleSelecionado(jogador.id)}
                    className="h-5 w-5 accent-emerald-500"
                    aria-label={`Selecionar ${jogador.nome}`}
                  />
                </label>

                {/* Insígnias */}
                <div className="absolute top-3 right-3 flex gap-1">
                  {status.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-gray-700">
                      {s}
                    </span>
                  ))}
                </div>

                <div onClick={() => toggleSelecionado(jogador.id)} className="cursor-pointer select-none">
                  <ImagemComFallback
                    src={imgSrc}
                    alt={jogador.nome}
                    width={88}
                    height={88}
                    className="rounded-full mb-2 sm:mb-3 mx-auto ring-1 ring-gray-700 h-20 w-20 object-cover"
                  />

                  <h2 className="text-base sm:text-lg font-extrabold text-center leading-tight line-clamp-2">
                    {jogador.nome}
                  </h2>

                  <div className="flex justify-center items-center gap-2 text-xs sm:text-sm text-gray-300 mb-1">
                    {getFlagUrl(jogador.nacionalidade) && (
                      <img
                        src={getFlagUrl(jogador.nacionalidade)}
                        alt={jogador.nacionalidade || '—'}
                        className="w-5 h-3"
                        loading="lazy"
                      />
                    )}
                    <span className="line-clamp-1">{jogador.nacionalidade || 'Outro'}</span>
                  </div>

                  <div className="flex justify-center">
                    <span
                      className={`inline-block ${coresPorPosicao[jogador.posicao] || 'bg-gray-600'}
                      text-[11px] sm:text-xs text-white px-3 py-1 rounded-full mb-2`}
                    >
                      {jogador.posicao}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs sm:text-sm">
                    <p className="text-gray-300">OVR: <b>{jogador.overall ?? 0}</b></p>
                    <p className="text-gray-300">Jogos: <b>{jogador.jogos ?? 0}</b></p>
                    <p className="col-span-2 text-emerald-400 font-semibold">💰 {formatBRL(jogador.valor)}</p>
                    <p className="col-span-2 text-gray-400">Salário: {formatBRL(calcularSalario(jogador.valor))}</p>
                    <p className="col-span-2 text-gray-400">Percentual: {jogador.percentual ?? 100}%</p>
                  </div>

                  {jogador.link_sofifa && (
                    <a
                      href={jogador.link_sofifa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 text-xs underline inline-block mt-1 text-center w-full"
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
        <div className="mt-5 overflow-x-auto rounded-xl border border-gray-800">
          {/* Tabela só faz sentido ≥ md; no mobile o grid já cobre bem */}
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900/80">
              <tr className="text-left text-sm text-gray-300">
                <th className="px-3 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={selecionados.length > 0 && selecionados.length === elencoFiltrado.length}
                    onChange={(e) => e.target.checked ? selecionarTodosFiltrados() : limparSelecao()}
                    className="h-5 w-5 accent-emerald-500"
                  />
                </th>
                <th className="px-3 py-3">Jogador</th>
                <th className="px-3 py-3">País</th>
                <th className="px-3 py-3">Posição</th>
                <th className="px-3 py-3">OVR</th>
                <th className="px-3 py-3">Valor</th>
                <th className="px-3 py-3">Salário</th>
                <th className="px-3 py-3">Jogos</th>
                <th className="px-3 py-3">%</th>
                <th className="px-3 py-3">Link</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/70 bg-gray-950/40">
              {elencoFiltrado.map((jogador) => {
                const selecionado = selecionados.includes(jogador.id)
                const imgSrc = jogador.imagem_url ?? FALLBACK_SRC
                return (
                  <tr key={jogador.id} className={`text-sm hover:bg-gray-900/50 ${selecionado ? 'bg-gray-900/70' : ''}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selecionado}
                        onChange={() => toggleSelecionado(jogador.id)}
                        className="h-5 w-5 accent-emerald-500"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <ImagemComFallback src={imgSrc} alt={jogador.nome} width={36} height={36} className="rounded-full ring-1 ring-gray-700" />
                        <span className="font-semibold">{jogador.nome}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {getFlagUrl(jogador.nacionalidade) && <img src={getFlagUrl(jogador.nacionalidade)} className="w-5 h-3" />}
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
                        {jogador.protegido && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-gray-700">🛡️ Protegido</span>}
                        {jogador.lesionado && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-gray-700">⚠️ Lesionado</span>}
                        {(jogador.jogos || 0) >= 7 && <span className="text-[10px] px-2 py-1 rounded-full bg-gray-800 border border-gray-700">🔥 Em Alta</span>}
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

