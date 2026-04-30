'use client'

import CardJogador from '@/components/CardJogador'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast, { Toaster } from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STATUS = {
  PENDENTE: 'pendente',
  ACEITA: 'aceita',
  RECUSADA: 'recusada',
} as const

type StatusProposta = (typeof STATUS)[keyof typeof STATUS]
type AbaFiltro = 'pendentes' | 'concluidas'

type JogadorCard = {
  id: string
  nome: string
  imagem_url?: string | null
  foto?: string | null
  posicao?: string | null
  valor?: number | null
  overall?: number | null
  salario?: number | null
  nacionalidade?: string | null
  jogos?: number | null
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
}

type Proposta = {
  id: string
  id_time_origem: string
  id_time_alvo: string
  nome_time_origem?: string | null
  nome_time_alvo?: string | null
  jogador_id: string
  valor_oferecido?: number | null
  jogadores_oferecidos?: any[] | null
  tipo_proposta?: string | null
  status: StatusProposta
  created_at?: string | null
  percentual?: number | null
  percentual_desejado?: number | null
  aceita_em?: string | null
}

const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v)

const isUUID = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

const pickAnyId = (obj: any): string | null => {
  if (!isObj(obj)) return null
  const cand =
    obj.id ??
    obj.jogador_id ??
    obj.player_id ??
    obj.elenco_id ??
    obj.jogadorId ??
    obj.playerId ??
    null

  if (cand == null) return null
  const s = String(cand).trim()
  return s || null
}

const extractOfferedIds = (raw: any): string[] => {
  const arr: any[] = Array.isArray(raw) ? raw : []

  const ids = arr
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (isObj(item)) return pickAnyId(item)
      return String(item || '').trim()
    })
    .filter(Boolean) as string[]

  const unique = Array.from(new Set(ids.map((s) => s.trim())))
  return unique.filter((s) => isUUID(s))
}

const toBRL = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0))

const formatData = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'

  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const normalizarTipo = (tipo?: string | null) => String(tipo || '').trim().toLowerCase()

const tipoLabel = (tipo?: string | null) => {
  const t = normalizarTipo(tipo)
  if (t === 'dinheiro') return 'Apenas dinheiro'
  if (t === 'troca_simples') return 'Troca simples'
  if (t === 'troca_composta') return 'Troca + dinheiro'
  if (t === 'comprar_percentual' || t === 'percentual') return 'Compra percentual'
  return tipo || 'Proposta'
}

const statusStyle: Record<StatusProposta, string> = {
  pendente: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200 shadow-yellow-500/10',
  aceita: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200 shadow-emerald-500/10',
  recusada: 'border-red-400/30 bg-red-400/10 text-red-200 shadow-red-500/10',
}

const statusLabel: Record<StatusProposta, string> = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  recusada: 'Recusada',
}

const pageFade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, staggerChildren: 0.08 } },
}

const itemUp = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35 } },
}

function ResumoCard({
  titulo,
  valor,
  subtitulo,
  delay = 0,
}: {
  titulo: string
  valor: string
  subtitulo: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      whileHover={{ y: -4, scale: 1.01 }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl" />
      <div className="absolute -bottom-10 left-4 h-20 w-20 rounded-full bg-yellow-300/10 blur-2xl" />
      <div className="relative text-[11px] font-black uppercase tracking-[0.22em] text-white/45">{titulo}</div>
      <div className="relative mt-2 text-2xl font-black text-white">{valor}</div>
      <div className="relative mt-1 text-xs text-white/55">{subtitulo}</div>
    </motion.div>
  )
}

function Badge({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] shadow-lg ${className}`}>
      {children}
    </span>
  )
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost'
}) {
  const cls =
    variant === 'primary'
      ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-500 shadow-red-500/20'
        : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'

  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -2, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {children}
    </motion.button>
  )
}

function LoadingSpin() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

function EmptyState({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-dashed border-white/10 bg-white/[0.035] p-10 text-center shadow-xl backdrop-blur-xl"
    >
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="text-4xl"
      >
        📭
      </motion.div>
      <div className="mt-3 text-lg font-black text-white">{title}</div>
      <div className="mt-1 text-sm text-white/50">{subtitle}</div>
    </motion.div>
  )
}

export default function PropostasRecebidasPage() {
  const [pendentes, setPendentes] = useState<Proposta[]>([])
  const [concluidas, setConcluidas] = useState<Proposta[]>([])
  const [jogadores, setJogadores] = useState<Record<string, JogadorCard>>({})
  const [jogadoresOferecidosData, setJogadoresOferecidosData] = useState<Record<string, JogadorCard>>({})
  const [idTime, setIdTime] = useState<string>('')

  const [loadingInicial, setLoadingInicial] = useState(true)
  const [loadingPropostaId, setLoadingPropostaId] = useState<string | null>(null)
  const [deletingPropostaId, setDeletingPropostaId] = useState<string | null>(null)
  const [aba, setAba] = useState<AbaFiltro>('pendentes')
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('')

  useEffect(() => {
    const id_time = localStorage.getItem('id_time') || ''
    setIdTime(id_time)

    if (!id_time) {
      setLoadingInicial(false)
      return
    }

    carregarPropostas(id_time)
  }, [])

  const buscarJogadores = async (ids: string[]) => {
    if (!ids.length) return

    const { data, error } = await supabase
      .from('elenco')
      .select(`
        id,
        nome,
        imagem_url,
        foto,
        posicao,
        valor,
        overall,
        salario,
        nacionalidade,
        jogos,
        pace,
        shooting,
        passing,
        dribbling,
        defending,
        physical
      `)
      .in('id', ids)

    if (error) {
      console.error('Erro ao buscar jogadores:', error)
      return
    }

    if (data) {
      setJogadores(Object.fromEntries((data as JogadorCard[]).map((j) => [j.id, j])))
    }
  }

  const buscarJogadoresOferecidos = async (ids: string[]) => {
    if (!ids.length) return

    const { data, error } = await supabase
      .from('elenco')
      .select(`
        id,
        nome,
        imagem_url,
        foto,
        posicao,
        valor,
        overall,
        salario,
        nacionalidade,
        jogos,
        pace,
        shooting,
        passing,
        dribbling,
        defending,
        physical
      `)
      .in('id', ids)

    if (error) {
      console.error('Erro ao buscar jogadores oferecidos:', error)
      return
    }

    if (data) {
      setJogadoresOferecidosData((prev) => ({
        ...prev,
        ...Object.fromEntries((data as JogadorCard[]).map((j) => [j.id, j])),
      }))
    }
  }

  const carregarPropostas = async (id_time: string) => {
    setLoadingInicial(true)

    try {
      const [resPendentes, resConcluidas] = await Promise.all([
        supabase
          .from('propostas_app')
          .select('*')
          .eq('id_time_alvo', id_time)
          .eq('status', STATUS.PENDENTE)
          .order('created_at', { ascending: false })
          .limit(20),

        supabase
          .from('propostas_app')
          .select('*')
          .eq('id_time_alvo', id_time)
          .not('status', 'eq', STATUS.PENDENTE)
          .order('created_at', { ascending: false })
          .limit(12),
      ])

      if (resPendentes.error) throw resPendentes.error
      if (resConcluidas.error) throw resConcluidas.error

      const pendentesData = (resPendentes.data || []) as Proposta[]
      const concluidasData = (resConcluidas.data || []) as Proposta[]

      setPendentes(pendentesData)
      setConcluidas(concluidasData)

      const idsJogadores = Array.from(
        new Set([
          ...pendentesData.map((p) => p.jogador_id),
          ...concluidasData.map((p) => p.jogador_id),
        ].filter(Boolean))
      )

      await buscarJogadores(idsJogadores)

      const idsOferecidos = Array.from(
        new Set([
          ...pendentesData.flatMap((p) => extractOfferedIds(p.jogadores_oferecidos)),
          ...concluidasData.flatMap((p) => extractOfferedIds(p.jogadores_oferecidos)),
        ])
      )

      await buscarJogadoresOferecidos(idsOferecidos)
      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar propostas recebidas.')
    } finally {
      setLoadingInicial(false)
    }
  }

  const aceitarProposta = async (proposta: Proposta) => {
    const { data: jogadorData, error: errorJogador } = await supabase
      .from('elenco')
      .select('id, nome, jogos, id_time, valor, salario, imagem_url, foto, posicao, overall')
      .eq('id', proposta.jogador_id)
      .single()

    if (errorJogador || !jogadorData) {
      toast.error('Erro ao buscar dados do jogador.')
      return
    }

    if ((jogadorData.jogos ?? 0) < 3) {
      toast.error('Este jogador ainda não pode ser negociado. Precisa ter ao menos 3 jogos.')
      return
    }

    if (!window.confirm(`Aceitar proposta por ${jogadorData.nome}?`)) return
    if (loadingPropostaId === proposta.id) return

    setLoadingPropostaId(proposta.id)

    const tipo = normalizarTipo(proposta.tipo_proposta)
    const dinheiroOferecido: number | null =
      proposta.valor_oferecido == null ? null : Number(proposta.valor_oferecido)

    const isTrocaSimples = tipo === 'troca_simples'
    const isTrocaComposta = tipo === 'troca_composta'
    const isDinheiro = tipo === 'dinheiro'
    const isPercentual = tipo === 'comprar_percentual' || tipo === 'percentual'

    let valorTransacao = 0

    if (isDinheiro) {
      valorTransacao = Math.max(0, Number(dinheiroOferecido ?? 0))
    } else if (isTrocaComposta) {
      valorTransacao = dinheiroOferecido && dinheiroOferecido > 0 ? Number(dinheiroOferecido) : 0
    } else if (isPercentual) {
      const perc = Number(proposta.percentual_desejado || proposta.percentual || 0)
      valorTransacao = Math.round(Number(jogadorData.valor || 0) * (perc / 100))
    }

    const offeredIdsForBid: string[] = extractOfferedIds(proposta.jogadores_oferecidos)
    let offeredNamesForBid: string[] = []

    if (offeredIdsForBid.length) {
      const { data: offeredRows } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', offeredIdsForBid)

      offeredNamesForBid = (offeredRows || []).map((r) => r.nome).filter(Boolean)
    }

    try {
      const { error: eStatus } = await supabase
        .from('propostas_app')
        .update({ status: STATUS.ACEITA, aceita_em: new Date().toISOString() })
        .eq('id', proposta.id)

      if (eStatus) throw eStatus

      let comprador: any = null
      let vendedor: any = null

      if (valorTransacao > 0) {
        const [rComprador, rVendedor] = await Promise.all([
          supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_origem).single(),
          supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_alvo).single(),
        ])

        if (rComprador.error) throw rComprador.error
        if (rVendedor.error) throw rVendedor.error

        comprador = rComprador.data
        vendedor = rVendedor.data

        const saldoCompradorAntes = Number(comprador.saldo || 0)
        const saldoVendedorAntes = Number(vendedor.saldo || 0)
        const saldoCompradorDepois = saldoCompradorAntes - valorTransacao
        const saldoVendedorDepois = saldoVendedorAntes + valorTransacao

        const eDeb = await supabase
          .from('times')
          .update({ saldo: saldoCompradorDepois })
          .eq('id', proposta.id_time_origem)

        if (eDeb.error) throw eDeb.error

        const eCred = await supabase
          .from('times')
          .update({ saldo: saldoVendedorDepois })
          .eq('id', proposta.id_time_alvo)

        if (eCred.error) throw eCred.error

        await registrarMovimentacao({
          id_time: proposta.id_time_origem,
          tipo: 'saida',
          valor: valorTransacao,
          descricao: `Compra de ${jogadorData.nome} via proposta`,
          origem: 'propostas_recebidas',
          id_referencia: proposta.id,
          saldo_antes: saldoCompradorAntes,
          saldo_depois: saldoCompradorDepois,
        } as any)

        await registrarMovimentacao({
          id_time: proposta.id_time_alvo,
          tipo: 'entrada',
          valor: valorTransacao,
          descricao: `Venda de ${jogadorData.nome} via proposta`,
          origem: 'propostas_recebidas',
          id_referencia: proposta.id,
          saldo_antes: saldoVendedorAntes,
          saldo_depois: saldoVendedorDepois,
        } as any)

        const extraTroca = isTrocaComposta && offeredNamesForBid.length ? ` + ${offeredNamesForBid.join(', ')}` : ''

        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `O ${vendedor.nome} vendeu ${jogadorData.nome} ao ${comprador.nome} por ${toBRL(valorTransacao)}${extraTroca}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: valorTransacao,
          nome_jogador: jogadorData.nome,
          foto_jogador_url: jogadorData.imagem_url || jogadorData.foto || null,
          data_evento: new Date().toISOString(),
        })

        toast.success(`Caixa do ${vendedor.nome}: ${toBRL(saldoVendedorAntes)} → ${toBRL(saldoVendedorDepois)}`)
        toast(`Caixa do ${comprador.nome}: ${toBRL(saldoCompradorAntes)} → ${toBRL(saldoCompradorDepois)}`, {
          icon: '🏦',
        })
      } else {
        const [rComprador, rVendedor] = await Promise.all([
          supabase.from('times').select('nome').eq('id', proposta.id_time_origem).single(),
          supabase.from('times').select('nome').eq('id', proposta.id_time_alvo).single(),
        ])

        comprador = rComprador.data
        vendedor = rVendedor.data

        const listaTroca = offeredNamesForBid.length ? ` + ${offeredNamesForBid.join(', ')}` : ''

        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `Troca: ${vendedor?.nome || 'time A'} ↔ ${comprador?.nome || 'time B'} envolvendo ${jogadorData.nome}${listaTroca}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: 0,
          nome_jogador: jogadorData.nome,
          foto_jogador_url: jogadorData.imagem_url || jogadorData.foto || null,
          data_evento: new Date().toISOString(),
        })

        toast('Troca realizada sem movimentação de caixa.', { icon: '🤝' })
      }

      const updatesAlvo: any = {
        id_time: proposta.id_time_origem,
        jogos: 0,
      }

      if (isDinheiro) {
        updatesAlvo.valor = valorTransacao
        updatesAlvo.salario = Math.round(valorTransacao * 0.0075)
      }

      const eAlvo = await supabase
        .from('elenco')
        .update(updatesAlvo)
        .eq('id', proposta.jogador_id)

      if (eAlvo.error) throw eAlvo.error

      if (isTrocaSimples || isTrocaComposta) {
        const oferecidosIds = extractOfferedIds(proposta.jogadores_oferecidos)

        if (oferecidosIds.length) {
          const { data: moved, error: eOf } = await supabase
            .from('elenco')
            .update({ id_time: proposta.id_time_alvo, jogos: 0 })
            .in('id', oferecidosIds)
            .select('id')

          if (eOf) throw eOf

          const movedSet = new Set((moved || []).map((r) => r.id))
          const notMoved = oferecidosIds.filter((id) => !movedSet.has(id))

          if (notMoved.length) {
            const nomes = notMoved.map((id) => jogadoresOferecidosData[id]?.nome || id)
            toast.error(`Alguns oferecidos não foram transferidos: ${nomes.join(', ')}`)
          }
        }
      }

      await supabase.from('notificacoes').insert({
        id_time: proposta.id_time_origem,
        titulo: '✅ Proposta aceita!',
        mensagem: `Sua proposta pelo jogador ${jogadorData.nome} foi aceita.`,
      })

      setPendentes((prev) => prev.filter((p) => p.id !== proposta.id))
      setConcluidas((prev) => [
        { ...proposta, status: STATUS.ACEITA },
        ...prev,
      ].slice(0, 12))
      setAba('concluidas')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao processar a proposta.')
    } finally {
      setLoadingPropostaId(null)
    }
  }

  const recusarProposta = async (id: string) => {
    const recusada = pendentes.find((p) => p.id === id)
    if (!recusada) return

    if (!window.confirm('Recusar esta proposta?')) return

    const { error } = await supabase
      .from('propostas_app')
      .update({ status: STATUS.RECUSADA })
      .eq('id', id)

    if (error) {
      toast.error('Erro ao recusar proposta.')
      return
    }

    const jog = jogadores[recusada.jogador_id]

    await supabase.from('notificacoes').insert({
      id_time: recusada.id_time_origem,
      titulo: '❌ Proposta recusada',
      mensagem: `Sua proposta por ${jog?.nome || 'jogador'} foi recusada.`,
    })

    setPendentes((prev) => prev.filter((p) => p.id !== id))
    setConcluidas((prev) => [
      { ...recusada, status: STATUS.RECUSADA },
      ...prev,
    ].slice(0, 12))
    setAba('concluidas')
    toast('Proposta recusada.', { icon: '❌' })
  }

  const excluirProposta = async (p: Proposta) => {
    const textoAviso =
      p.status === STATUS.ACEITA
        ? 'Excluir esta proposta do histórico? Isso NÃO desfaz a transferência.'
        : 'Excluir esta proposta?'

    if (!window.confirm(textoAviso)) return
    if (deletingPropostaId === p.id) return

    setDeletingPropostaId(p.id)

    try {
      const { error } = await supabase.from('propostas_app').delete().eq('id', p.id)
      if (error) throw error

      setPendentes((prev) => prev.filter((x) => x.id !== p.id))
      setConcluidas((prev) => prev.filter((x) => x.id !== p.id))
      toast.success('Proposta excluída.')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir a proposta.')
    } finally {
      setDeletingPropostaId(null)
    }
  }

  const propostasVisiveis = useMemo(() => {
    return aba === 'pendentes' ? pendentes : concluidas
  }, [aba, pendentes, concluidas])

  const totalValorPendente = useMemo(() => {
    return pendentes.reduce((acc, p) => acc + Number(p.valor_oferecido || 0), 0)
  }, [pendentes])

  const maiorOferta = useMemo(() => {
    const todas = [...pendentes, ...concluidas]
    if (!todas.length) return 0
    return Math.max(...todas.map((p) => Number(p.valor_oferecido || 0)))
  }, [pendentes, concluidas])

  const renderProposta = (p: Proposta, index: number) => {
    const jog = jogadores[p.jogador_id]
    const offeredIds = extractOfferedIds(p.jogadores_oferecidos)
    const offeredRows = offeredIds.map((id) => jogadoresOferecidosData[id]).filter(Boolean)
    const status = p.status as StatusProposta
    const isPendente = status === STATUS.PENDENTE

    return (
      <motion.article
        layout
        key={p.id}
        variants={itemUp}
        initial="hidden"
        animate="show"
        exit={{ opacity: 0, y: -15, scale: 0.98, transition: { duration: 0.2 } }}
        transition={{ delay: index * 0.035 }}
        whileHover={{ y: -3 }}
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl backdrop-blur-xl"
      >
        <motion.div
          animate={{ x: ['-20%', '120%'] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute top-0 h-px w-1/2 bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent"
        />
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-yellow-400/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <Badge className={statusStyle[status]}>
            {status === STATUS.PENDENTE ? '⏳' : status === STATUS.ACEITA ? '✅' : '❌'} {statusLabel[status]}
          </Badge>

          <Badge className="border-white/10 bg-black/30 text-white/70">
            {tipoLabel(p.tipo_proposta)}
          </Badge>
        </div>

        <div className="relative mt-4 grid gap-4 lg:grid-cols-[270px_1fr]">
          <motion.div
            initial={{ opacity: 0, rotateY: -8 }}
            animate={{ opacity: 1, rotateY: 0 }}
            transition={{ duration: 0.35, delay: index * 0.04 }}
            className="flex justify-center"
          >
            <CardJogador
              modo="elenco"
              jogador={{
                id: jog?.id || p.jogador_id,
                nome: jog?.nome || 'Jogador',
                overall: jog?.overall ?? 0,
                posicao: jog?.posicao || '—',
                nacionalidade: jog?.nacionalidade ?? undefined,
                imagem_url: jog?.imagem_url || jog?.foto || undefined,
                foto: jog?.foto || undefined,
                valor: jog?.valor ?? 0,
                salario: jog?.salario ?? 0,
                pace: jog?.pace ?? jog?.pac ?? null,
                shooting: jog?.shooting ?? jog?.sho ?? null,
                passing: jog?.passing ?? jog?.pas ?? null,
                dribbling: jog?.dribbling ?? jog?.dri ?? null,
                defending: jog?.defending ?? jog?.def ?? null,
                physical: jog?.physical ?? jog?.phy ?? null,
                pac: jog?.pac ?? jog?.pace ?? null,
                sho: jog?.sho ?? jog?.shooting ?? null,
                pas: jog?.pas ?? jog?.passing ?? null,
                dri: jog?.dri ?? jog?.dribbling ?? null,
                def: jog?.def ?? jog?.defending ?? null,
                phy: jog?.phy ?? jog?.physical ?? null,
              }}
            />
          </motion.div>

          <div className="min-w-0">
            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Proposta recebida de</div>
              <div className="mt-1 text-2xl font-black text-white">{p.nome_time_origem || 'Clube interessado'}</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <motion.div whileHover={{ scale: 1.02 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">Valor</div>
                  <div className="mt-1 text-lg font-black text-emerald-300">{toBRL(p.valor_oferecido ?? null)}</div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">Enviada</div>
                  <div className="mt-1 text-sm font-bold text-white/80">{formatData(p.created_at)}</div>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02 }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">Percentual</div>
                  <div className="mt-1 text-sm font-bold text-white/80">
                    {['comprar_percentual', 'percentual'].includes(normalizarTipo(p.tipo_proposta))
                      ? `${p.percentual_desejado || p.percentual || 0}%`
                      : '—'}
                  </div>
                </motion.div>
              </div>

              <AnimatePresence>
                {offeredRows.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 overflow-hidden"
                  >
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-white/45">
                      Jogadores oferecidos na troca
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {offeredRows.map((j, i) => (
                        <motion.div
                          key={j.id}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          whileHover={{ y: -2, scale: 1.02 }}
                          className="rounded-2xl border border-white/10 bg-white/[0.05] p-3"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={j.imagem_url || j.foto || '/jogador_padrao.png'}
                              alt={j.nome}
                              className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/10"
                              onError={(e) => {
                                ;(e.currentTarget as HTMLImageElement).src = '/jogador_padrao.png'
                              }}
                            />

                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-white">{j.nome}</div>
                              <div className="text-xs text-white/50">
                                {j.posicao || '—'} • OVR {j.overall ?? 0}
                              </div>
                              <div className="text-xs font-bold text-emerald-300">{toBRL(j.valor)}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {isPendente && (
                  <>
                    <ActionButton
                      onClick={() => aceitarProposta(p)}
                      disabled={loadingPropostaId === p.id}
                      variant="primary"
                    >
                      {loadingPropostaId === p.id ? (
                        <>
                          <LoadingSpin /> Processando
                        </>
                      ) : (
                        <>✅ Aceitar proposta</>
                      )}
                    </ActionButton>

                    <ActionButton onClick={() => recusarProposta(p.id)} variant="danger">
                      ❌ Recusar
                    </ActionButton>
                  </>
                )}

                <ActionButton
                  onClick={() => excluirProposta(p)}
                  disabled={deletingPropostaId === p.id}
                  variant={isPendente ? 'ghost' : 'danger'}
                >
                  {deletingPropostaId === p.id ? (
                    <>
                      <LoadingSpin /> Excluindo
                    </>
                  ) : (
                    <>🗑️ Excluir</>
                  )}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      </motion.article>
    )
  }

  if (!idTime && !loadingInicial) {
    return (
      <main className="min-h-screen bg-black text-white">
        <Toaster position="top-right" />
        <div className="mx-auto max-w-5xl px-4 py-10">
          <EmptyState title="Time não identificado" subtitle="Faça login novamente para visualizar suas propostas recebidas." />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#123524_0%,#050505_42%,#000_100%)] text-white">
      <Toaster position="top-right" />

      <div className="pointer-events-none fixed inset-0 opacity-40">
        <motion.div
          animate={{ backgroundPosition: ['0px 0px', '42px 42px'] }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:42px_42px]"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.65, 0.35] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl"
        />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-yellow-400/10 blur-3xl" />
      </div>

      <motion.div variants={pageFade} initial="hidden" animate="show" className="relative mx-auto max-w-7xl px-4 py-6">
        <motion.section
          variants={itemUp}
          className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 p-5 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <motion.div
                animate={{ boxShadow: ['0 0 0 rgba(16,185,129,0)', '0 0 24px rgba(16,185,129,.25)', '0 0 0 rgba(16,185,129,0)'] }}
                transition={{ duration: 2.6, repeat: Infinity }}
                className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200"
              >
                Central de negociações
              </motion.div>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                <span className="bg-gradient-to-r from-emerald-300 via-yellow-200 to-lime-300 bg-clip-text text-transparent">
                  PROPOSTAS RECEBIDAS
                </span>
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/60">
                Analise ofertas pelo seu elenco, aceite transferências, recuse propostas e acompanhe o histórico recente.
              </p>

              {ultimaAtualizacao && (
                <p className="mt-2 text-xs text-white/40">Última atualização: {ultimaAtualizacao}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <motion.button
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => idTime && carregarPropostas(idTime)}
                className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/[0.1]"
              >
                🔄 Atualizar
              </motion.button>
            </div>
          </div>
        </motion.section>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <ResumoCard titulo="Pendentes" valor={String(pendentes.length)} subtitulo="Aguardando sua decisão" delay={0.05} />
          <ResumoCard titulo="Valor em aberto" valor={toBRL(totalValorPendente)} subtitulo="Soma das propostas pendentes" delay={0.1} />
          <ResumoCard titulo="Maior oferta" valor={toBRL(maiorOferta)} subtitulo="Entre recebidas e concluídas" delay={0.15} />
        </section>

        <motion.section variants={itemUp} className="mb-6 rounded-3xl border border-white/10 bg-white/[0.045] p-3 shadow-xl backdrop-blur-xl">
          <div className="flex flex-wrap gap-2">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setAba('pendentes')}
              className={[
                'rounded-2xl px-4 py-2.5 text-sm font-black transition',
                aba === 'pendentes'
                  ? 'bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                  : 'border border-white/10 bg-black/30 text-white hover:bg-white/10',
              ].join(' ')}
            >
              ⏳ Pendentes ({pendentes.length})
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setAba('concluidas')}
              className={[
                'rounded-2xl px-4 py-2.5 text-sm font-black transition',
                aba === 'concluidas'
                  ? 'bg-yellow-300 text-black shadow-lg shadow-yellow-500/20'
                  : 'border border-white/10 bg-black/30 text-white hover:bg-white/10',
              ].join(' ')}
            >
              📜 Concluídas ({concluidas.length})
            </motion.button>
          </div>
        </motion.section>

        <AnimatePresence mode="wait">
          {loadingInicial ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-5"
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.35, 0.75, 0.35] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }}
                  className="h-80 rounded-[2rem] border border-white/10 bg-white/[0.045]"
                />
              ))}
            </motion.div>
          ) : propostasVisiveis.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <EmptyState
                title={aba === 'pendentes' ? 'Nenhuma proposta pendente' : 'Nenhuma proposta concluída'}
                subtitle={
                  aba === 'pendentes'
                    ? 'Quando algum clube enviar proposta por seus jogadores, ela aparecerá aqui.'
                    : 'Propostas aceitas e recusadas aparecerão nesta área.'
                }
              />
            </motion.div>
          ) : (
            <motion.div key={aba} variants={pageFade} initial="hidden" animate="show" exit={{ opacity: 0, y: 10 }} className="grid gap-5">
              <AnimatePresence>
                {propostasVisiveis.map((p, index) => renderProposta(p, index))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
