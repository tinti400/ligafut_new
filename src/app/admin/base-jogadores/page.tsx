'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  Database,
  Search,
  RefreshCw,
  Upload,
  ShoppingCart,
  Gavel,
  CheckCircle2,
  Filter,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type JogadorBase = {
  id: string
  nome: string
  posicao: string | null
  overall: number
  valor: number | null
  salario: number | null
  time_origem: string | null
  nacionalidade: string | null
  foto: string | null
  imagem_url: string | null
  link_sofifa: string | null
  data_listagem: string | null
  raridade: string | null
  pac: number | null
  sho: number | null
  pas: number | null
  dri: number | null
  def: number | null
  phy: number | null
  pace: number | null
  shooting: number | null
  passing: number | null
  dribbling: number | null
  defending: number | null
  physical: number | null
  status: string | null
  destino: string | null
  enviado_em?: string | null
}

const ITENS_POR_PAGINA = 30

function dinheiro(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function normalizarTexto(v: any) {
  return String(v || '').trim()
}

function numero(v: any) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
}

function corCarta(overall: number) {
  if (overall >= 90) return 'from-yellow-200 via-yellow-400 to-yellow-700'
  if (overall >= 85) return 'from-amber-200 via-yellow-500 to-orange-700'
  if (overall >= 80) return 'from-zinc-200 via-zinc-400 to-zinc-700'
  return 'from-orange-300 via-orange-500 to-orange-800'
}

export default function BaseJogadoresPage() {
  const [jogadores, setJogadores] = useState<JogadorBase[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [previewImportacao, setPreviewImportacao] = useState<any[]>([])

  const [busca, setBusca] = useState('')
  const [posicao, setPosicao] = useState('')
  const [nacionalidade, setNacionalidade] = useState('')
  const [overallMin, setOverallMin] = useState('')
  const [overallMax, setOverallMax] = useState('')
  const [pagina, setPagina] = useState(1)
  const [selecionados, setSelecionados] = useState<string[]>([])

  async function carregarJogadores() {
    setLoading(true)

    const { data, error } = await supabase
      .from('jogadores_base_liga')
      .select('*')
      .eq('status', 'base')
      .order('overall', { ascending: false })
      .order('nome', { ascending: true })

    if (error) {
      console.error(error)
      toast.error(error.message || 'Erro ao carregar jogadores.')
      setLoading(false)
      return
    }

    setJogadores(data || [])
    setSelecionados([])
    setLoading(false)
  }

  useEffect(() => {
    carregarJogadores()
  }, [])

  useEffect(() => {
    setPagina(1)
  }, [busca, posicao, nacionalidade, overallMin, overallMax])

  const posicoes = useMemo(() => {
    return Array.from(new Set(jogadores.map((j) => j.posicao).filter(Boolean))).sort() as string[]
  }, [jogadores])

  const nacionalidades = useMemo(() => {
    return Array.from(new Set(jogadores.map((j) => j.nacionalidade).filter(Boolean))).sort() as string[]
  }, [jogadores])

  const filtrados = useMemo(() => {
    const min = overallMin === '' ? null : Number(overallMin)
    const max = overallMax === '' ? null : Number(overallMax)

    return jogadores.filter((j) => {
      const nomeOk = j.nome.toLowerCase().includes(busca.toLowerCase())
      const posOk = !posicao || j.posicao === posicao
      const nacOk = !nacionalidade || j.nacionalidade === nacionalidade
      const minOk = min === null || j.overall >= min
      const maxOk = max === null || j.overall <= max

      return nomeOk && posOk && nacOk && minOk && maxOk
    })
  }, [jogadores, busca, posicao, nacionalidade, overallMin, overallMax])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA))

  const jogadoresPaginados = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA
    return filtrados.slice(inicio, inicio + ITENS_POR_PAGINA)
  }, [filtrados, pagina])

  function toggleSelecionado(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selecionarTodosDaPagina() {
    const idsPagina = jogadoresPaginados.map((j) => j.id)
    setSelecionados((prev) => Array.from(new Set([...prev, ...idsPagina])))
  }

  function limparFiltros() {
    setBusca('')
    setPosicao('')
    setNacionalidade('')
    setOverallMin('')
    setOverallMax('')
    setSelecionados([])
    setPagina(1)
  }

  async function handleImportFile(file: File) {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet)

      const tratados = json
        .map((j: any) => ({
          nome: normalizarTexto(j.nome),
          posicao: normalizarTexto(j.posicao),
          overall: numero(j.overall),
          valor: numero(j.valor),
          salario: numero(j.salario),
          time_origem: normalizarTexto(j.time_origem),
          nacionalidade: normalizarTexto(j.nacionalidade),
          foto: normalizarTexto(j.foto),
          imagem_url: normalizarTexto(j.imagem_url || j.foto),
          link_sofifa: normalizarTexto(j.link_sofifa),
          data_listagem: j.data_listagem || new Date().toISOString().slice(0, 10),
          raridade: normalizarTexto(j.raridade),

          pac: numero(j.pac || j.pace),
          sho: numero(j.sho || j.shooting),
          pas: numero(j.pas || j.passing),
          dri: numero(j.dri || j.dribbling),
          def: numero(j.def || j.defending),
          phy: numero(j.phy || j.physical),

          pace: numero(j.pace || j.pac),
          shooting: numero(j.shooting || j.sho),
          passing: numero(j.passing || j.pas),
          dribbling: numero(j.dribbling || j.dri),
          defending: numero(j.defending || j.def),
          physical: numero(j.physical || j.phy),

          status: 'base',
        }))
        .filter((j) => j.nome && j.overall >= 75)

      setPreviewImportacao(tratados)
      toast.success(`${tratados.length} jogadores +75 encontrados na planilha.`)
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao ler a planilha.')
    }
  }

  async function importarJogadores() {
    if (previewImportacao.length === 0) {
      toast.error('Nenhum jogador para importar.')
      return
    }

    setImportando(true)

    try {
      const { data: existentes, error: erroBusca } = await supabase
        .from('jogadores_base_liga')
        .select('id, nome, link_sofifa')

      if (erroBusca) throw erroBusca

      const linksExistentes = new Set(
        (existentes || []).map((j: any) => String(j.link_sofifa || '').trim()).filter(Boolean)
      )

      const nomesExistentes = new Set(
        (existentes || []).map((j: any) => String(j.nome || '').trim().toLowerCase()).filter(Boolean)
      )

      const novos = previewImportacao.filter((j) => {
        const nome = String(j.nome || '').trim().toLowerCase()
        const link = String(j.link_sofifa || '').trim()

        if (link && linksExistentes.has(link)) return false
        if (nome && nomesExistentes.has(nome)) return false

        if (link) linksExistentes.add(link)
        if (nome) nomesExistentes.add(nome)

        return true
      })

      if (novos.length === 0) {
        toast.error('Todos os jogadores da planilha já existem na base.')
        return
      }

      const payload = novos.map((j) => ({
        ...j,
        link_sofifa: j.link_sofifa || null,
        status: 'base',
        destino: null,
        enviado_em: null,
      }))

      const { error } = await supabase.from('jogadores_base_liga').insert(payload)

      if (error) throw error

      toast.success(`${payload.length} jogadores importados para a base.`)
      setPreviewImportacao([])
      await carregarJogadores()
    } catch (err: any) {
      console.error('Erro ao importar:', err)
      toast.error(err?.message || 'Erro ao importar jogadores.')
    } finally {
      setImportando(false)
    }
  }

  async function apagarImportacao() {
    const confirmar = window.confirm(
      'Tem certeza que deseja apagar TODOS os jogadores que ainda estão na base? Jogadores já enviados para mercado ou leilão não serão apagados.'
    )

    if (!confirmar) return

    setApagando(true)

    try {
      const { error } = await supabase
        .from('jogadores_base_liga')
        .delete()
        .eq('status', 'base')

      if (error) throw error

      toast.success('Importação/base apagada com sucesso.')
      setPreviewImportacao([])
      setSelecionados([])
      await carregarJogadores()
    } catch (err: any) {
      console.error('Erro ao apagar base:', err)
      toast.error(err?.message || 'Erro ao apagar importação.')
    } finally {
      setApagando(false)
    }
  }

  function montarPayloadMercado(j: JogadorBase) {
    return {
      nome: j.nome,
      posicao: j.posicao,
      overall: j.overall,
      valor: j.valor || 0,
      salario: j.salario || 0,
      time_origem: j.time_origem,
      nacionalidade: j.nacionalidade,
      foto: j.foto,
      imagem_url: j.imagem_url || j.foto,
      link_sofifa: j.link_sofifa,
      data_listagem: new Date().toISOString(),
      raridade: j.raridade,

      pac: j.pac || j.pace || 0,
      sho: j.sho || j.shooting || 0,
      pas: j.pas || j.passing || 0,
      dri: j.dri || j.dribbling || 0,
      def: j.def || j.defending || 0,
      phy: j.phy || j.physical || 0,

      pace: j.pace || j.pac || 0,
      shooting: j.shooting || j.sho || 0,
      passing: j.passing || j.pas || 0,
      dribbling: j.dribbling || j.dri || 0,
      defending: j.defending || j.def || 0,
      physical: j.physical || j.phy || 0,

      status: 'disponivel',
    }
  }

  function montarPayloadLeilao(j: JogadorBase) {
    return {
      nome: j.nome,
      posicao: j.posicao,
      overall: j.overall,
      valor_atual: j.valor || 0,
      valor_inicial: j.valor || 0,
      time_origem: j.time_origem,
      nacionalidade: j.nacionalidade,
      foto: j.foto,
      imagem_url: j.imagem_url || j.foto,
      link_sofifa: j.link_sofifa,
      raridade: j.raridade,

      pac: j.pac || j.pace || 0,
      sho: j.sho || j.shooting || 0,
      pas: j.pas || j.passing || 0,
      dri: j.dri || j.dribbling || 0,
      def: j.def || j.defending || 0,
      phy: j.phy || j.physical || 0,

      pace: j.pace || j.pac || 0,
      shooting: j.shooting || j.sho || 0,
      passing: j.passing || j.pas || 0,
      dribbling: j.dribbling || j.dri || 0,
      defending: j.defending || j.def || 0,
      physical: j.physical || j.phy || 0,

      status: 'ativo',
      fim: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
    }
  }

  async function enviarParaMercado() {
    const lista = jogadores.filter((j) => selecionados.includes(j.id))

    if (lista.length === 0) {
      toast.error('Selecione pelo menos um jogador.')
      return
    }

    setEnviando(true)

    try {
      const { data: existentes } = await supabase
        .from('mercado_transferencias')
        .select('id, nome, link_sofifa')

      const links = new Set((existentes || []).map((j: any) => String(j.link_sofifa || '').trim()).filter(Boolean))
      const nomes = new Set((existentes || []).map((j: any) => String(j.nome || '').trim().toLowerCase()).filter(Boolean))

      for (const jogador of lista) {
        const nome = jogador.nome.trim().toLowerCase()
        const link = String(jogador.link_sofifa || '').trim()
        const jaExiste = Boolean((link && links.has(link)) || nomes.has(nome))

        if (!jaExiste) {
          const { error: insertError } = await supabase
            .from('mercado_transferencias')
            .insert(montarPayloadMercado(jogador))

          if (insertError) throw insertError
        }

        const { error: updateError } = await supabase
          .from('jogadores_base_liga')
          .update({
            status: 'mercado',
            destino: jaExiste ? 'mercado_duplicado_bloqueado' : 'mercado_transferencias',
            enviado_em: new Date().toISOString(),
          })
          .eq('id', jogador.id)

        if (updateError) throw updateError
      }

      toast.success('Jogadores enviados para o mercado.')
      await carregarJogadores()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao enviar para o mercado.')
    } finally {
      setEnviando(false)
    }
  }

  async function enviarParaLeilao() {
    const lista = jogadores.filter((j) => selecionados.includes(j.id))

    if (lista.length === 0) {
      toast.error('Selecione pelo menos um jogador.')
      return
    }

    setEnviando(true)

    try {
      const { data: existentes } = await supabase
        .from('leiloes_sistema')
        .select('id, nome, link_sofifa')

      const links = new Set((existentes || []).map((j: any) => String(j.link_sofifa || '').trim()).filter(Boolean))
      const nomes = new Set((existentes || []).map((j: any) => String(j.nome || '').trim().toLowerCase()).filter(Boolean))

      for (const jogador of lista) {
        const nome = jogador.nome.trim().toLowerCase()
        const link = String(jogador.link_sofifa || '').trim()
        const jaExiste = Boolean((link && links.has(link)) || nomes.has(nome))

        if (!jaExiste) {
          const { error: insertError } = await supabase
            .from('leiloes_sistema')
            .insert(montarPayloadLeilao(jogador))

          if (insertError) throw insertError
        }

        const { error: updateError } = await supabase
          .from('jogadores_base_liga')
          .update({
            status: 'leilao',
            destino: jaExiste ? 'leilao_duplicado_bloqueado' : 'leiloes_sistema',
            enviado_em: new Date().toISOString(),
          })
          .eq('id', jogador.id)

        if (updateError) throw updateError
      }

      toast.success('Jogadores enviados para o leilão.')
      await carregarJogadores()
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Erro ao enviar para o leilão.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-black p-6 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <Database size={24} />
                <span className="text-sm font-black uppercase tracking-[0.25em]">
                  LigaFut Admin
                </span>
              </div>

              <h1 className="text-3xl md:text-5xl font-black">
                Base de Jogadores +75
              </h1>

              <p className="text-zinc-400 mt-3 max-w-2xl">
                Importe jogadores, filtre por posição, nacionalidade e overall,
                depois envie em lote para Mercado ou Leilão sem duplicidade.
              </p>
            </div>

            <button
              onClick={carregarJogadores}
              className="h-12 px-5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center gap-2"
            >
              <RefreshCw size={18} />
              Atualizar
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-zinc-950 border border-white/10 p-4">
            <p className="text-zinc-500 text-sm">Disponíveis na base</p>
            <strong className="text-3xl">{jogadores.length}</strong>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-white/10 p-4">
            <p className="text-zinc-500 text-sm">Filtrados</p>
            <strong className="text-3xl">{filtrados.length}</strong>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-white/10 p-4">
            <p className="text-zinc-500 text-sm">Selecionados</p>
            <strong className="text-3xl">{selecionados.length}</strong>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-white/10 p-4">
            <p className="text-zinc-500 text-sm">Controle</p>
            <strong className="text-emerald-400 flex items-center gap-2">
              <CheckCircle2 size={20} />
              Sem duplicar
            </strong>
          </div>
        </section>

        <section className="rounded-3xl bg-zinc-950 border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2 font-bold text-zinc-200">
            <Upload size={20} />
            Importar planilha
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImportFile(e.target.files[0])
              }}
              className="block w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-black file:bg-emerald-600 file:text-white hover:file:bg-emerald-500"
            />

            <button
              onClick={importarJogadores}
              disabled={importando || previewImportacao.length === 0}
              className="h-12 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-black whitespace-nowrap"
            >
              {importando ? 'Importando...' : 'Importar para Base'}
            </button>

            <button
              onClick={apagarImportacao}
              disabled={apagando || jogadores.length === 0}
              className="h-12 px-5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 font-black whitespace-nowrap flex items-center justify-center gap-2"
            >
              <AlertTriangle size={18} />
              {apagando ? 'Apagando...' : 'Apagar Base'}
            </button>

            {previewImportacao.length > 0 && (
              <button
                onClick={() => setPreviewImportacao([])}
                className="h-12 px-5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold flex items-center justify-center gap-2"
              >
                <Trash2 size={18} />
                Limpar preview
              </button>
            )}
          </div>

          {previewImportacao.length > 0 && (
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-3 bg-white/5 text-sm text-zinc-300">
                Preview: {previewImportacao.length} jogadores +75 encontrados
              </div>

              <div className="max-h-[300px] overflow-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <tbody>
                    {previewImportacao.slice(0, 80).map((j, i) => (
                      <tr key={i} className="border-t border-white/10">
                        <td className="p-3 font-bold">{j.nome}</td>
                        <td className="p-3">{j.posicao}</td>
                        <td className="p-3 text-yellow-400 font-black">{j.overall}</td>
                        <td className="p-3">{j.nacionalidade || '-'}</td>
                        <td className="p-3">{dinheiro(j.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-zinc-950 border border-white/10 p-5 space-y-4">
          <div className="flex items-center gap-2 font-bold text-zinc-200">
            <Filter size={20} />
            Filtros e ações em lote
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar jogador"
                className="w-full h-12 rounded-2xl bg-black border border-white/10 pl-10 pr-3 outline-none focus:border-emerald-500"
              />
            </div>

            <select value={posicao} onChange={(e) => setPosicao(e.target.value)} className="h-12 rounded-2xl bg-black border border-white/10 px-3">
              <option value="">Todas posições</option>
              {posicoes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <select value={nacionalidade} onChange={(e) => setNacionalidade(e.target.value)} className="h-12 rounded-2xl bg-black border border-white/10 px-3">
              <option value="">Todas nacionalidades</option>
              {nacionalidades.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>

            <input
              type="number"
              value={overallMin}
              onChange={(e) => setOverallMin(e.target.value)}
              placeholder="Overall mín. Ex: 75"
              className="h-12 rounded-2xl bg-black border border-white/10 px-3"
            />

            <input
              type="number"
              value={overallMax}
              onChange={(e) => setOverallMax(e.target.value)}
              placeholder="Overall máx. Ex: 80"
              className="h-12 rounded-2xl bg-black border border-white/10 px-3"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button onClick={selecionarTodosDaPagina} className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold">
              Selecionar página
            </button>

            <button onClick={limparFiltros} className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold">
              Limpar filtros
            </button>

            <button disabled={enviando} onClick={enviarParaMercado} className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-black flex items-center justify-center gap-2">
              <ShoppingCart size={18} />
              Mandar para Mercado
            </button>

            <button disabled={enviando} onClick={enviarParaLeilao} className="h-11 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black flex items-center justify-center gap-2">
              <Gavel size={18} />
              Mandar para Leilão
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-zinc-950 border border-white/10 p-5">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">Carregando jogadores...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">Nenhum jogador encontrado.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {jogadoresPaginados.map((j) => {
                  const selecionado = selecionados.includes(j.id)
                  const imagem = j.imagem_url || j.foto || ''

                  return (
                    <div
                      key={j.id}
                      onClick={() => toggleSelecionado(j.id)}
                      className={`relative cursor-pointer rounded-[26px] overflow-hidden border transition-all duration-200 ${
                        selecionado ? 'border-emerald-400 scale-[1.02] shadow-[0_0_28px_rgba(16,185,129,.45)]' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${corCarta(j.overall)}`} />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,.55),transparent_35%)]" />

                      <div className="relative p-3 text-black min-h-[285px]">
                        <div className="flex justify-between">
                          <div>
                            <div className="text-3xl font-black leading-none">{j.overall}</div>
                            <div className="text-sm font-black">{j.posicao}</div>
                          </div>

                          <input
                            type="checkbox"
                            checked={selecionado}
                            readOnly
                            className="w-5 h-5 accent-emerald-500"
                          />
                        </div>

                        <div className="flex justify-center mt-1">
                          <div className="w-28 h-28 overflow-hidden">
                            {imagem ? (
                              <img src={imagem} alt={j.nome} className="w-full h-full object-contain" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-black/80 text-white rounded-full font-black">
                                LF
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-center mt-1">
                          <div className="text-sm font-black uppercase leading-tight line-clamp-2">
                            {j.nome}
                          </div>
                          <div className="text-[11px] font-bold opacity-80">
                            {j.nacionalidade || 'Sem nacionalidade'}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-1 text-[11px] font-black text-center border-t border-black/30 pt-2">
                          <span>PAC {j.pac || j.pace || 0}</span>
                          <span>SHO {j.sho || j.shooting || 0}</span>
                          <span>PAS {j.pas || j.passing || 0}</span>
                          <span>DRI {j.dri || j.dribbling || 0}</span>
                          <span>DEF {j.def || j.defending || 0}</span>
                          <span>PHY {j.phy || j.physical || 0}</span>
                        </div>

                        <div className="mt-3 text-center text-xs font-black bg-black/80 text-white rounded-xl py-2">
                          {dinheiro(j.valor)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between gap-3 mt-6">
                <button
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-40 flex items-center gap-2"
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>

                <div className="text-sm text-zinc-400">
                  Página <span className="text-white font-black">{pagina}</span> de{' '}
                  <span className="text-white font-black">{totalPaginas}</span>
                </div>

                <button
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-40 flex items-center gap-2"
                >
                  Próxima
                  <ChevronRight size={18} />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}