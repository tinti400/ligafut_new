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

export default function BaseJogadoresPage() {
  const [jogadores, setJogadores] = useState<JogadorBase[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [previewImportacao, setPreviewImportacao] = useState<any[]>([])

  const [busca, setBusca] = useState('')
  const [posicao, setPosicao] = useState('')
  const [nacionalidade, setNacionalidade] = useState('')
  const [overallMin, setOverallMin] = useState('')
  const [overallMax, setOverallMax] = useState('')
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

  const posicoes = useMemo(() => {
    return Array.from(
      new Set(jogadores.map((j) => j.posicao).filter(Boolean))
    ).sort() as string[]
  }, [jogadores])

  const nacionalidades = useMemo(() => {
    return Array.from(
      new Set(jogadores.map((j) => j.nacionalidade).filter(Boolean))
    ).sort() as string[]
  }, [jogadores])

  const filtrados = useMemo(() => {
    return jogadores.filter((j) => {
      const nomeOk = j.nome.toLowerCase().includes(busca.toLowerCase())
      const posOk = !posicao || j.posicao === posicao
      const nacOk = !nacionalidade || j.nacionalidade === nacionalidade
      const minOk = !overallMin || j.overall >= Number(overallMin)
      const maxOk = !overallMax || j.overall <= Number(overallMax)

      return nomeOk && posOk && nacOk && minOk && maxOk
    })
  }, [jogadores, busca, posicao, nacionalidade, overallMin, overallMax])

  function toggleSelecionado(id: string) {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function selecionarTodosFiltrados() {
    setSelecionados(filtrados.map((j) => j.id))
  }

  function limparFiltros() {
    setBusca('')
    setPosicao('')
    setNacionalidade('')
    setOverallMin('')
    setOverallMax('')
    setSelecionados([])
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
          data_listagem:
            j.data_listagem || new Date().toISOString().slice(0, 10),
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
      console.error('Erro ao ler planilha:', err)
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
        (existentes || [])
          .map((j: any) => String(j.link_sofifa || '').trim())
          .filter(Boolean)
      )

      const nomesExistentes = new Set(
        (existentes || [])
          .map((j: any) => String(j.nome || '').trim().toLowerCase())
          .filter(Boolean)
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
        setImportando(false)
        return
      }

      const payload = novos.map((j) => ({
        nome: j.nome,
        posicao: j.posicao,
        overall: j.overall,
        valor: j.valor,
        salario: j.salario || 0,
        time_origem: j.time_origem,
        nacionalidade: j.nacionalidade,
        foto: j.foto,
        imagem_url: j.imagem_url || j.foto,
        link_sofifa: j.link_sofifa || null,
        data_listagem: j.data_listagem,
        raridade: j.raridade,

        pac: j.pac || 0,
        sho: j.sho || 0,
        pas: j.pas || 0,
        dri: j.dri || 0,
        def: j.def || 0,
        phy: j.phy || 0,

        pace: j.pace || j.pac || 0,
        shooting: j.shooting || j.sho || 0,
        passing: j.passing || j.pas || 0,
        dribbling: j.dribbling || j.dri || 0,
        defending: j.defending || j.def || 0,
        physical: j.physical || j.phy || 0,

        status: 'base',
        destino: null,
        enviado_em: null,
      }))

      const { error } = await supabase
        .from('jogadores_base_liga')
        .insert(payload)

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
      const { data: existentes, error: erroBusca } = await supabase
        .from('mercado_transferencias')
        .select('id, nome, link_sofifa')

      if (erroBusca) throw erroBusca

      const linksExistentes = new Set(
        (existentes || [])
          .map((j: any) => String(j.link_sofifa || '').trim())
          .filter(Boolean)
      )

      const nomesExistentes = new Set(
        (existentes || [])
          .map((j: any) => String(j.nome || '').trim().toLowerCase())
          .filter(Boolean)
      )

      for (const jogador of lista) {
        const nome = String(jogador.nome || '').trim().toLowerCase()
        const link = String(jogador.link_sofifa || '').trim()

        const jaExiste =
          Boolean(link && linksExistentes.has(link)) ||
          Boolean(nome && nomesExistentes.has(nome))

        if (!jaExiste) {
          const { error: insertError } = await supabase
            .from('mercado_transferencias')
            .insert(montarPayloadMercado(jogador))

          if (insertError) throw insertError

          if (link) linksExistentes.add(link)
          if (nome) nomesExistentes.add(nome)
        }

        const { error: updateError } = await supabase
          .from('jogadores_base_liga')
          .update({
            status: 'mercado',
            destino: jaExiste
              ? 'mercado_duplicado_bloqueado'
              : 'mercado_transferencias',
            enviado_em: new Date().toISOString(),
          })
          .eq('id', jogador.id)

        if (updateError) throw updateError
      }

      toast.success('Jogadores enviados para o mercado.')
      await carregarJogadores()
    } catch (err: any) {
      console.error('Erro ao enviar mercado:', err)
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
      const { data: existentes, error: erroBusca } = await supabase
        .from('leiloes_sistema')
        .select('id, nome, link_sofifa')

      if (erroBusca) throw erroBusca

      const linksExistentes = new Set(
        (existentes || [])
          .map((j: any) => String(j.link_sofifa || '').trim())
          .filter(Boolean)
      )

      const nomesExistentes = new Set(
        (existentes || [])
          .map((j: any) => String(j.nome || '').trim().toLowerCase())
          .filter(Boolean)
      )

      for (const jogador of lista) {
        const nome = String(jogador.nome || '').trim().toLowerCase()
        const link = String(jogador.link_sofifa || '').trim()

        const jaExiste =
          Boolean(link && linksExistentes.has(link)) ||
          Boolean(nome && nomesExistentes.has(nome))

        if (!jaExiste) {
          const { error: insertError } = await supabase
            .from('leiloes_sistema')
            .insert(montarPayloadLeilao(jogador))

          if (insertError) throw insertError

          if (link) linksExistentes.add(link)
          if (nome) nomesExistentes.add(nome)
        }

        const { error: updateError } = await supabase
          .from('jogadores_base_liga')
          .update({
            status: 'leilao',
            destino: jaExiste
              ? 'leilao_duplicado_bloqueado'
              : 'leiloes_sistema',
            enviado_em: new Date().toISOString(),
          })
          .eq('id', jogador.id)

        if (updateError) throw updateError
      }

      toast.success('Jogadores enviados para o leilão.')
      await carregarJogadores()
    } catch (err: any) {
      console.error('Erro ao enviar leilão:', err)
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
                Importe jogadores por planilha, filtre por posição,
                nacionalidade e overall, depois envie em lote para o Mercado ou
                para o Leilão sem duplicidade.
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

              <div className="max-h-[320px] overflow-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-black text-zinc-400">
                    <tr>
                      <th className="p-3 text-left">Nome</th>
                      <th className="p-3 text-left">Posição</th>
                      <th className="p-3 text-left">OVR</th>
                      <th className="p-3 text-left">Nacionalidade</th>
                      <th className="p-3 text-left">Valor</th>
                      <th className="p-3 text-left">PAC</th>
                      <th className="p-3 text-left">SHO</th>
                      <th className="p-3 text-left">PAS</th>
                      <th className="p-3 text-left">DRI</th>
                      <th className="p-3 text-left">DEF</th>
                      <th className="p-3 text-left">PHY</th>
                    </tr>
                  </thead>

                  <tbody>
                    {previewImportacao.slice(0, 80).map((j, i) => (
                      <tr key={i} className="border-t border-white/10">
                        <td className="p-3 font-bold">{j.nome}</td>
                        <td className="p-3">{j.posicao}</td>
                        <td className="p-3 text-yellow-400 font-black">
                          {j.overall}
                        </td>
                        <td className="p-3">{j.nacionalidade || '-'}</td>
                        <td className="p-3">{dinheiro(j.valor)}</td>
                        <td className="p-3">{j.pac}</td>
                        <td className="p-3">{j.sho}</td>
                        <td className="p-3">{j.pas}</td>
                        <td className="p-3">{j.dri}</td>
                        <td className="p-3">{j.def}</td>
                        <td className="p-3">{j.phy}</td>
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
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar jogador"
                className="w-full h-12 rounded-2xl bg-black border border-white/10 pl-10 pr-3 outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={posicao}
              onChange={(e) => setPosicao(e.target.value)}
              className="h-12 rounded-2xl bg-black border border-white/10 px-3 outline-none focus:border-emerald-500"
            >
              <option value="">Todas posições</option>
              {posicoes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={nacionalidade}
              onChange={(e) => setNacionalidade(e.target.value)}
              className="h-12 rounded-2xl bg-black border border-white/10 px-3 outline-none focus:border-emerald-500"
            >
              <option value="">Todas nacionalidades</option>
              {nacionalidades.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={overallMin}
              onChange={(e) => setOverallMin(e.target.value)}
              placeholder="Overall mín."
              className="h-12 rounded-2xl bg-black border border-white/10 px-3 outline-none focus:border-emerald-500"
            />

            <input
              type="number"
              value={overallMax}
              onChange={(e) => setOverallMax(e.target.value)}
              placeholder="Overall máx."
              className="h-12 rounded-2xl bg-black border border-white/10 px-3 outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <button
              onClick={selecionarTodosFiltrados}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold"
            >
              Selecionar filtrados
            </button>

            <button
              onClick={limparFiltros}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 font-bold"
            >
              Limpar filtros
            </button>

            <button
              disabled={enviando}
              onClick={enviarParaMercado}
              className="h-11 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-black flex items-center justify-center gap-2"
            >
              <ShoppingCart size={18} />
              Mandar para Mercado
            </button>

            <button
              disabled={enviando}
              onClick={enviarParaLeilao}
              className="h-11 px-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-black flex items-center justify-center gap-2"
            >
              <Gavel size={18} />
              Mandar para Leilão
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-zinc-950 border border-white/10 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">
              Carregando jogadores...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              Nenhum jogador encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-white/5 text-zinc-400 text-sm">
                  <tr>
                    <th className="p-4 text-left">Selecionar</th>
                    <th className="p-4 text-left">Jogador</th>
                    <th className="p-4 text-left">Posição</th>
                    <th className="p-4 text-left">Nacionalidade</th>
                    <th className="p-4 text-left">OVR</th>
                    <th className="p-4 text-left">Valor</th>
                    <th className="p-4 text-left">PAC</th>
                    <th className="p-4 text-left">SHO</th>
                    <th className="p-4 text-left">PAS</th>
                    <th className="p-4 text-left">DRI</th>
                    <th className="p-4 text-left">DEF</th>
                    <th className="p-4 text-left">PHY</th>
                  </tr>
                </thead>

                <tbody>
                  {filtrados.map((j) => (
                    <tr
                      key={j.id}
                      className="border-t border-white/10 hover:bg-white/[0.03]"
                    >
                      <td className="p-4">
                        <input
                          type="checkbox"
                          checked={selecionados.includes(j.id)}
                          onChange={() => toggleSelecionado(j.id)}
                          className="w-5 h-5 accent-emerald-500"
                        />
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-white/10">
                            {j.imagem_url || j.foto ? (
                              <img
                                src={j.imagem_url || j.foto || ''}
                                alt={j.nome}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs font-black">
                                LF
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="font-black">{j.nome}</p>
                            <p className="text-xs text-zinc-500">
                              {j.time_origem || 'Base LigaFut'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">{j.posicao || '-'}</td>
                      <td className="p-4">{j.nacionalidade || '-'}</td>

                      <td className="p-4">
                        <span className="px-3 py-1 rounded-full bg-yellow-400 text-black font-black">
                          {j.overall}
                        </span>
                      </td>

                      <td className="p-4 font-bold">{dinheiro(j.valor)}</td>
                      <td className="p-4">{j.pac || j.pace || 0}</td>
                      <td className="p-4">{j.sho || j.shooting || 0}</td>
                      <td className="p-4">{j.pas || j.passing || 0}</td>
                      <td className="p-4">{j.dri || j.dribbling || 0}</td>
                      <td className="p-4">{j.def || j.defending || 0}</td>
                      <td className="p-4">{j.phy || j.physical || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}