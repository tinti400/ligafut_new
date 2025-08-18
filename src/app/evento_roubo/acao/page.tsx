'use client'

import { useEffect, useMemo, useState, ReactNode, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { useAdmin } from '@/hooks/useAdmin'

/** ===== Supabase ===== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ===== Tipos ===== */
interface Time { id: string; nome: string; logo_url: string | null; saldo?: number }
interface Jogador { id: string; nome: string; posicao: string; valor: number; id_time: string }
type RoubosMap = Record<string, Record<string, number>>
type BloqueadosMap = Record<string, { id?: string; nome: string; posicao: string }[]>
type BloqPersistMap = Record<string, number>
type ConfigEvento = {
  id: string
  ordem: string[] | null
  vez: string | number | null
  roubos: RoubosMap | null
  bloqueios: BloqueadosMap | null
  limite_perda?: number | null
  // sua base pode usar um destes dois:
  limite_roubos_por_time?: number | null
  limite_roubo?: number | null
  ativo?: boolean | null
  fase?: string | null
  roubo_evento_num?: number | null
  // sua base pode usar um destes dois:
  bloqueios_persistentes?: BloqPersistMap | null
  rebloqueio_ate_evento?: BloqPersistMap | null
  // flags que alguns schemas têm
  evento_roubo?: boolean | null
  tipo?: string | null
}

/** ===== Regras/Constantes ===== */
const CONFIG_ID_DEFAULT = '56f3af29-a4ac-4a76-aeb3-35400aa2a773' // usado só como fallback
const TEMPO_POR_VEZ = 240
const LIMITE_POR_ALVO_POR_TIME = 2
const LIMITE_PERDA_DEFAULT = 3
const LIMITE_ROUBOS_POR_TIME_DEFAULT = 3
const PERCENTUAL_ROUBO = 0.5
const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR')}`

/** ===== Cronômetro (isolado) ===== */
function Cronometro({
  ativo,
  isAdmin,
  onTimeout,
  start = TEMPO_POR_VEZ,
}: {
  ativo: boolean
  isAdmin: boolean
  onTimeout: () => void
  start?: number
}) {
  const [s, setS] = useState(start)

  useEffect(() => {
    if (!ativo) return
    let alive = true
    const id = setInterval(() => {
      setS((prev) => {
        if (!alive) return prev
        if (prev <= 1) {
          clearInterval(id)
          if (isAdmin) onTimeout()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [ativo, isAdmin, onTimeout])

  return <b>{s}s</b>
}

export default function EventoRouboPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()
  const [idTime, setIdTime] = useState<string>('')

  // id real da config (descoberto em runtime)
  const [configId, setConfigId] = useState<string>('')

  // estado do evento
  const [ordem, setOrdem] = useState<Time[]>([])
  const [vez, setVez] = useState<number>(0)
  const [ordemSorteada, setOrdemSorteada] = useState(false)

  const [roubos, setRoubos] = useState<RoubosMap>({})
  const [bloqueados, setBloqueados] = useState<BloqueadosMap>({})
  const [limitePerda, setLimitePerda] = useState<number>(LIMITE_PERDA_DEFAULT)
  const [limiteRoubosPorTime, setLimiteRoubosPorTime] = useState<number>(LIMITE_ROUBOS_POR_TIME_DEFAULT)

  // bloqueio persistente
  const [eventoNum, setEventoNum] = useState<number>(0)
  const [bloqPersist, setBloqPersist] = useState<BloqPersistMap>({})

  // alvo / jogadores
  const [alvoSelecionado, setAlvoSelecionado] = useState<string>('')
  const [jogadoresAlvo, setJogadoresAlvo] = useState<Jogador[]>([])
  const [mostrarJogadores, setMostrarJogadores] = useState(false)
  const [carregandoJogadores, setCarregandoJogadores] = useState(false)

  // modal de confirmação
  const [confirmJogador, setConfirmJogador] = useState<Jogador | null>(null)
  const [confirmValor, setConfirmValor] = useState<number>(0)
  const [processandoRoubo, setProcessandoRoubo] = useState(false)

  const [loading, setLoading] = useState(true)
  const [bloqueioBotao, setBloqueioBotao] = useState(false)

  // banner pós-finalização
  const [eventoFinalizado, setEventoFinalizado] = useState(false)

  /** ===== Busca dinâmica da configuração ===== */
  async function findConfigRow(): Promise<ConfigEvento | null> {
    // 1) tenta o id já descoberto
    if (configId) {
      const { data } = await supabase.from('configuracoes').select('*').eq('id', configId).maybeSingle()
      if (data) return data as ConfigEvento
    }
    // 2) tenta ID default do código
    if (CONFIG_ID_DEFAULT) {
      const { data } = await supabase.from('configuracoes').select('*').eq('id', CONFIG_ID_DEFAULT).maybeSingle()
      if (data) return data as ConfigEvento
    }
    // 3) tenta flag evento_roubo = true
    const { data } = await supabase.from('configuracoes').select('*').eq('evento_roubo', true).maybeSingle()
    if (data) return data as ConfigEvento
    // 4) último fallback: tipo = 'geral'
    const { data: geral } = await supabase.from('configuracoes').select('*').eq('tipo', 'geral').maybeSingle()
    return (geral as ConfigEvento) || null
  }

  /** ===== Init / Realtime ===== */
  useEffect(() => {
    const id = localStorage.getItem('id_time') || localStorage.getItem('idTime') || ''
    if (id) setIdTime(id)
    carregarEvento()

    // sem filtrar por ID (evita ficar preso a um id errado)
    const canal = supabase
      .channel('evento-roubo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, () => carregarEvento())
      .subscribe()

    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ===== Carregar estado do evento ===== */
  async function carregarEvento() {
    setLoading(true)

    const cfg = await findConfigRow()
    if (!cfg) {
      setLoading(false)
      toast.error('Configuração do evento não encontrada.')
      return
    }
    setConfigId(cfg.id)

    setVez(Number(cfg.vez ?? 0) || 0)
    setRoubos((cfg.roubos || {}) as RoubosMap)
    setBloqueados((cfg.bloqueios || {}) as BloqueadosMap)
    setLimitePerda(cfg.limite_perda ?? LIMITE_PERDA_DEFAULT)
    setLimiteRoubosPorTime(
      (cfg.limite_roubos_por_time ?? cfg.limite_roubo ?? LIMITE_ROUBOS_POR_TIME_DEFAULT)
    )
    setEventoNum(Number(cfg.roubo_evento_num ?? 0))
    setBloqPersist(((cfg.bloqueios_persistentes ?? cfg.rebloqueio_ate_evento) || {}) as BloqPersistMap)
    setEventoFinalizado((cfg.fase || '') === 'finalizado')

    if (cfg.ordem?.length) {
      const { data: times, error: errTimes } = await supabase
        .from('times')
        .select('id, nome, logo_url')
        .in('id', cfg.ordem)

      if (!errTimes && times) {
        const ordemCompleta = (cfg.ordem as string[])
          .map((id) => (times as any[]).find((t) => t.id === id))
          .filter(Boolean) as Time[]
        setOrdem(ordemCompleta)
        setOrdemSorteada(true)
      } else {
        setOrdem([]); setOrdemSorteada(false)
      }
    } else {
      setOrdem([]); setOrdemSorteada(false)
    }

    setLoading(false)
  }

  /** ===== Regras / Cálculos ===== */
  const totalPerdasDoAlvo = useCallback((alvoId: string) =>
    Object.values(roubos).map(r => r[alvoId] || 0).reduce((a, b) => a + b, 0)
  , [roubos])

  const totalRoubosDoMeuTime = useCallback(() => {
    const meu = roubos[idTime] || {}
    return Object.values(meu).reduce((a, b) => a + b, 0)
  }, [roubos, idTime])

  const jaRoubouDesseAlvo = useCallback((alvoId: string) =>
    roubos[idTime]?.[alvoId] || 0
  , [roubos, idTime])

  const podeRoubar = useCallback((alvoId: string) => {
    if (totalPerdasDoAlvo(alvoId) >= limitePerda) return false
    if (jaRoubouDesseAlvo(alvoId) >= LIMITE_POR_ALVO_POR_TIME) return false
    if (totalRoubosDoMeuTime() >= limiteRoubosPorTime) return false
    return true
  }, [totalPerdasDoAlvo, jaRoubouDesseAlvo, totalRoubosDoMeuTime, limitePerda, limiteRoubosPorTime])

  const idTimeDaVez = ordem[vez]?.id || ''
  const nomeTimeDaVez = ordem[vez]?.nome || ''
  const minhaVez = idTime === idTimeDaVez

  // *** LISTO SEM FILTRAR POR REGRAS para nunca ficar vazio; mostro motivos no rótulo ***
  const alvosListados = useMemo(
    () => ordem.filter((t) => t.id !== idTime),
    [ordem, idTime]
  )

  const nomeAlvoSelecionado = useMemo(
    () => ordem.find(t => t.id === alvoSelecionado)?.nome || '',
    [ordem, alvoSelecionado]
  )

  /** ===== Carregar jogadores do alvo (APENAS por id_time) ===== */
  async function carregarJogadoresDoAlvo() {
    if (!alvoSelecionado) {
      toast('Selecione um time-alvo.')
      return
    }

    setMostrarJogadores(true)
    setCarregandoJogadores(true)

    const { data, error } = await supabase
      .from('elenco')
      .select('id, nome, posicao, valor, id_time')
      .eq('id_time', alvoSelecionado)
      .order('nome', { ascending: true })

    if (error) {
      setCarregandoJogadores(false)
      toast.error(`Erro ao carregar jogadores do alvo: ${error.message}`)
      return
    }

    const base = (data || []) as Jogador[]

    const bloqueiosDoAlvo = (bloqueados[alvoSelecionado] || [])
    const idsBloqueados = new Set(bloqueiosDoAlvo.map((b) => b.id).filter(Boolean))
    const nomesBloqueados = new Set(bloqueiosDoAlvo.map((b) => b.nome))

    const semBloqueadosDoTime = base.filter((j) =>
      (idsBloqueados.size ? !idsBloqueados.has(j.id) : !nomesBloqueados.has(j.nome))
    )

    const filtrados = semBloqueadosDoTime.filter((j) => {
      const ate = bloqPersist[j.id]
      return !(ate != null && ate >= eventoNum)
    })

    setJogadoresAlvo(filtrados)
    setCarregandoJogadores(false)

    if (base.length === 0) {
      toast('Esse time não tem jogadores cadastrados.')
    } else if (filtrados.length === 0) {
      toast('Todos os jogadores desse time estão bloqueados no momento.')
    } else {
      toast.success(`✅ ${filtrados.length} jogador(es) disponíveis.`)
    }
  }

  /** ===== Saldo: CAS com retry ===== */
  async function ajustarSaldoCompareAndSwap(timeId: string, delta: number, saldoAtualEsperado?: number) {
    let esperado = saldoAtualEsperado
    if (esperado == null) {
      const { data: t } = await supabase.from('times').select('saldo').eq('id', timeId).single()
      esperado = (t as any)?.saldo ?? 0
    }
    const { data: upd, error } = await supabase
      .from('times')
      .update({ saldo: (esperado || 0) + delta })
      .eq('id', timeId)
      .eq('saldo', esperado)
      .select('id')
    if (!error && upd && (upd as any[]).length === 1) return true

    const { data: fresh } = await supabase.from('times').select('saldo').eq('id', timeId).single()
    const freshSaldo = (fresh as any)?.saldo ?? 0
    const { data: upd2 } = await supabase
      .from('times')
      .update({ saldo: freshSaldo + delta })
      .eq('id', timeId)
      .eq('saldo', freshSaldo)
      .select('id')
    return !!(upd2 && (upd2 as any[]).length === 1)
  }

  /** ===== Modal ===== */
  function abrirConfirmacao(j: Jogador) {
    const valor = Math.floor(Number(j.valor || 0) * PERCENTUAL_ROUBO)
    setConfirmJogador(j)
    setConfirmValor(valor)
  }
  function fecharConfirmacao() {
    setConfirmJogador(null)
    setConfirmValor(0)
  }

  /** ===== Roubar ===== */
  async function confirmarRoubo() {
    if (!confirmJogador) return
    await roubarJogador(confirmJogador, confirmValor)
  }

  async function roubarJogador(jogador: Jogador, valorPagoCalculado?: number) {
    if (bloqueioBotao || processandoRoubo) return
    if (!idTime) {
      toast.error('Identidade do time não encontrada.')
      return
    }
    const timeDaVez = ordem[vez]?.id
    if (!timeDaVez || timeDaVez !== idTime) {
      toast.error('Não é a sua vez.')
      return
    }

    setProcessandoRoubo(true)
    setBloqueioBotao(true)
    try {
      const cfg = await findConfigRow()
      if (!cfg) { toast.error('Configuração do evento não encontrada.'); return }

      const thisConfigId = cfg.id

      const vezAtual = Number(cfg.vez ?? 0)
      const ordemIds = cfg.ordem || []
      const idDaVezServidor = ordemIds?.[vezAtual]
      if (!idDaVezServidor || idDaVezServidor !== idTime) {
        toast.error('A vez mudou. Atualize a página.')
        return
      }

      const roubosSrv = (cfg.roubos || {}) as RoubosMap
      const totalPerdasSrv = Object.values(roubosSrv).map((r) => r[jogador.id_time] || 0).reduce((a, b) => a + b, 0)
      const limitePerdaSrv = cfg.limite_perda ?? LIMITE_PERDA_DEFAULT
      const limiteRoubosPorTimeSrv = (cfg.limite_roubos_por_time ?? cfg.limite_roubo ?? LIMITE_ROUBOS_POR_TIME_DEFAULT)
      const jaRoubouDesseSrv = (roubosSrv[idTime]?.[jogador.id_time] || 0)
      const totalMeuSrv = Object.values(roubosSrv[idTime] || {}).reduce((a, b) => a + b, 0)

      if (totalPerdasSrv + 1 > limitePerdaSrv) { toast.error('Esse time não pode perder mais jogadores neste evento.'); return }
      if (jaRoubouDesseSrv + 1 > LIMITE_POR_ALVO_POR_TIME) { toast.error('Você já atingiu o limite contra esse alvo (2).'); return }
      if (totalMeuSrv + 1 > limiteRoubosPorTimeSrv) { toast.error('Você atingiu o limite total de roubos neste evento.'); return }

      const valorPago = valorPagoCalculado != null ? valorPagoCalculado : Math.floor((jogador.valor || 0) * PERCENTUAL_ROUBO)

      // transferência condicionada ao id_time original
      const { data: updJog, error: errJog } = await supabase
        .from('elenco')
        .update({ id_time: idTime })
        .eq('id', jogador.id)
        .eq('id_time', jogador.id_time)
        .select('id')
      if (errJog || !updJog || (updJog as any[]).length === 0) {
        toast.error('Outro time levou esse jogador primeiro. Atualize a lista.')
        return
      }

      const [{ data: alvoInfo }, { data: meuInfo }] = await Promise.all([
        supabase.from('times').select('saldo,nome').eq('id', jogador.id_time).single(),
        supabase.from('times').select('saldo,nome').eq('id', idTime).single()
      ])
      const nomeAlvo = (alvoInfo as any)?.nome || 'Time Alvo'
      const nomeMeu = (meuInfo as any)?.nome || 'Seu Time'

      const debitei = await ajustarSaldoCompareAndSwap(idTime, -valorPago, (meuInfo as any)?.saldo)
      const creditei = await ajustarSaldoCompareAndSwap(jogador.id_time, +valorPago, (alvoInfo as any)?.saldo)
      if (!debitei || !creditei) toast.error('Conflito ao atualizar saldos. Verifique o extrato e recarregue.')

      const atualizado: RoubosMap = { ...(cfg.roubos || {}) }
      if (!atualizado[idTime]) atualizado[idTime] = {}
      if (!atualizado[idTime][jogador.id_time]) atualizado[idTime][jogador.id_time] = 0
      atualizado[idTime][jogador.id_time]++

      // bloqueio do jogador no novo time (evento atual)
      const bloqAtual: BloqueadosMap = { ...(cfg.bloqueios || {}) }
      const listaNovo = Array.isArray(bloqAtual[idTime]) ? bloqAtual[idTime] : []
      const existe = listaNovo.some((b) => (b.id ? b.id === jogador.id : b.nome === jogador.nome))
      if (!existe) {
        listaNovo.push({ id: jogador.id, nome: jogador.nome, posicao: jogador.posicao })
        bloqAtual[idTime] = listaNovo
      }

      // bloqueio persistente até o próximo evento (respeitando o campo existente)
      const persistRaw = (cfg.bloqueios_persistentes ?? cfg.rebloqueio_ate_evento ?? {}) as BloqPersistMap
      const persist: BloqPersistMap = { ...persistRaw }
      const atualEvento = Number(cfg.roubo_evento_num ?? 0)
      persist[jogador.id] = atualEvento + 1

      await supabase.from('configuracoes')
        .update({
          roubos: atualizado,
          bloqueios: bloqAtual,
          ...(cfg.bloqueios_persistentes != null
            ? { bloqueios_persistentes: persist }
            : { rebloqueio_ate_evento: persist })
        })
        .eq('id', thisConfigId)

      await supabase.from('bid').insert({
        tipo_evento: 'roubo',
        descricao: `${jogador.nome} foi roubado por ${nomeMeu} de ${nomeAlvo} por ${brl(valorPago)}`,
        id_time1: idTime,
        id_time2: jogador.id_time,
        valor: valorPago
      })

      setRoubos(atualizado)
      setMostrarJogadores(false)
      setAlvoSelecionado('')
      setJogadoresAlvo([])
      fecharConfirmacao()
      toast.success(`✅ ${jogador.nome} roubado! ${nomeMeu} pagou ${brl(valorPago)}.`)
    } catch (e) {
      console.error(e)
      toast.error('Erro ao processar roubo.')
    } finally {
      setProcessandoRoubo(false)
      setBloqueioBotao(false)
    }
  }

  /** ===== Admin: ordem/vez/limpar/finalizar ===== */
  async function getConfigIdOrFail(): Promise<string | null> {
    if (configId) return configId
    const cfg = await findConfigRow()
    if (!cfg) { toast.error('Configuração do evento não encontrada.'); return null }
    setConfigId(cfg.id)
    return cfg.id
  }

  async function sortearOrdem() {
    const cid = await getConfigIdOrFail(); if (!cid) return

    const { data: times, error } = await supabase.from('times').select('id, nome, logo_url')
    if (error || !times) { toast.error('Erro ao buscar times.'); return }

    const { data: cfg } = await supabase
      .from('configuracoes').select('roubo_evento_num').eq('id', cid).maybeSingle()
    const novoNum = Number((cfg as any)?.roubo_evento_num ?? 0) + 1

    const embaralhado: Time[] = [...(times as any[])]
      .map((t) => ({ ...t, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ r, ...rest }) => rest)

    const ids = embaralhado.map((t) => t.id)
    const { error: errUpd } = await supabase
      .from('configuracoes')
      .update({ ordem: ids, vez: '0', roubo_evento_num: novoNum, ativo: true, fase: 'acao', evento_roubo: true })
      .eq('id', cid)
    if (errUpd) { toast.error('Erro ao sortear a ordem.'); return }

    setEventoFinalizado(false)
    setOrdem(embaralhado)
    setVez(0)
    setOrdemSorteada(true)
    setEventoNum(novoNum)
    toast.success('🎲 Ordem sorteada! Boa sorte.')
  }

  async function passarVez() {
    const cid = await getConfigIdOrFail(); if (!cid) return
    const novaVez = vez + 1
    await supabase.from('configuracoes').update({ vez: String(novaVez) }).eq('id', cid)
    setVez(novaVez)
    setAlvoSelecionado('')
    setJogadoresAlvo([])
    setMostrarJogadores(false)
  }

  async function limparSorteio() {
    const cid = await getConfigIdOrFail(); if (!cid) return
    await supabase.from('configuracoes').update({ ordem: null, vez: '0' }).eq('id', cid)
    setOrdem([])
    setOrdemSorteada(false)
    setVez(0)
    toast('🧹 Sorteio limpo.')
  }

  async function finalizarEvento() {
    const cid = await getConfigIdOrFail(); if (!cid) return

    const { data: cfg, error } = await supabase
      .from('configuracoes')
      .select('roubo_evento_num,bloqueios_persistentes,rebloqueio_ate_evento')
      .eq('id', cid)
      .maybeSingle<ConfigEvento>()
    if (error) { toast.error('Erro ao carregar configuração.'); return }

    const ev = Number((cfg as any)?.roubo_evento_num ?? 0)
    const persistRaw = ((cfg as any)?.bloqueios_persistentes ?? (cfg as any)?.rebloqueio_ate_evento ?? {}) as BloqPersistMap
    const novoPersist: BloqPersistMap = {}
    for (const [jid, ate] of Object.entries(persistRaw)) if ((ate as number) >= ev) novoPersist[jid] = ate as number

    const updatePayload: any = { ativo: false, fase: 'finalizado', roubos: {}, bloqueios: {} }
    if ((cfg as any)?.bloqueios_persistentes != null) updatePayload.bloqueios_persistentes = novoPersist
    else updatePayload.rebloqueio_ate_evento = novoPersist

    const { error: updErr } = await supabase
      .from('configuracoes')
      .update(updatePayload)
      .eq('id', cid)
    if (updErr) { toast.error('Erro ao finalizar evento.'); return }

    setEventoFinalizado(true)
    setOrdem([]); setOrdemSorteada(false); setVez(0)
    setAlvoSelecionado(''); setJogadoresAlvo([]); setMostrarJogadores(false)
    toast.success('✅ Evento finalizado! Sorteie a ordem para iniciar um novo evento.')
  }

  /** ===== UI ===== */
  function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`rounded-2xl p-4 shadow-lg bg-gradient-to-b from-gray-800/80 to-gray-900/80 border border-white/10 ${className}`}>{children}</div>
  }
  function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <span className={`px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/10 ${className}`}>{children}</span>
  }

  const StatusPerdas = () => (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">📉 Status dos Times no Evento</h3>
        <Chip>Limite por time: {limitePerda}</Chip>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {ordem.map((t) => {
          const perdas = totalPerdasDoAlvo(t.id)
          const restante = Math.max(0, limitePerda - perdas)
          const cor =
            restante === 0 ? 'bg-red-500/20 border-red-500/30 text-red-300' :
            restante === 1 ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-200' :
            'bg-green-500/20 border-green-500/30 text-green-200'
          return (
            <div key={t.id} className={`flex items-center gap-3 rounded-xl p-3 border ${cor}`}>
              {t.logo_url ? <img src={t.logo_url} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-white/10" />}
              <div className="flex-1">
                <p className="font-semibold">{t.nome}</p>
                <p className="text-xs opacity-80">Pode perder: <b>{restante}</b> / {limitePerda}</p>
              </div>
              <Chip>{perdas} perdidos</Chip>
            </div>
          )
        })}
      </div>
    </Card>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0a0f1a] text-white">
      <div className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">⚔️ Evento de Roubo</h1>
          {ordem.length > 0 && (
            <div className="text-right">
              <p className="text-sm opacity-80">Agora:</p>
              <div className="flex items-center gap-2 justify-end">
                {ordem[vez]?.logo_url && <img src={ordem[vez]!.logo_url!} className="h-7 w-7 rounded-full" alt="" />}
                <p className="text-lg font-semibold text-green-300">{nomeTimeDaVez || '—'}</p>
              </div>
              <p className="text-sm mt-1">⏳ Tempo restante: <Cronometro key={vez} ativo={ordemSorteada} isAdmin={!!isAdmin} onTimeout={passarVez} /></p>
            </div>
          )}
        </div>

        {/* Banner pós-finalização */}
        {eventoFinalizado && (
          <Card className="border-green-500/40 bg-green-900/20 flex items-center justify-between">
            <div className="text-sm">✅ <b>Evento finalizado!</b> Sorteie a ordem para iniciar um novo evento.</div>
            {isAdmin && (
              <button onClick={sortearOrdem} className="rounded-xl px-3 py-2 bg-yellow-500 hover:bg-yellow-600 transition font-semibold shadow">
                🎲 Sortear Ordem
              </button>
            )}
          </Card>
        )}

        {/* Seletor de time-alvo (sempre mostra times) */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">🎯 Escolha o time-alvo</h3>
            <Chip>Seu limite total: {limiteRoubosPorTime} • Já roubou: {totalRoubosDoMeuTime()}</Chip>
          </div>

          <select
            value={alvoSelecionado}
            onChange={(e) => { setAlvoSelecionado(e.target.value); setMostrarJogadores(false); setJogadoresAlvo([]) }}
            className="w-full p-3 rounded-xl bg-white/10 border border-white/10 focus:outline-none"
            disabled={!minhaVez || !ordemSorteada}
          >
            <option value="">Selecione um time...</option>
            {alvosListados.map((time) => {
              const perdas = totalPerdasDoAlvo(time.id)
              const restante = Math.max(0, limitePerda - perdas)
              const jaRoubei = jaRoubouDesseAlvo(time.id)
              const bloqueadoPorRegra = !podeRoubar(time.id)
              const labelMotivo = bloqueadoPorRegra
                ? ` (limite atingido)`
                : ''
              return (
                <option key={time.id} value={time.id}>
                  {time.nome} — pode perder {restante}/{limitePerda} • você: {jaRoubei}/{LIMITE_POR_ALVO_POR_TIME}{labelMotivo}
                </option>
              )
            })}
          </select>

          <div className="mt-3">
            <button
              onClick={carregarJogadoresDoAlvo}
              disabled={!minhaVez || !alvoSelecionado}
              className="w-full rounded-xl py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed transition font-semibold"
            >
              🔎 Ver jogadores do {nomeAlvoSelecionado || 'time selecionado'}
            </button>
          </div>
        </Card>

        {/* Ações do Admin / Jogador */}
        {!loading && !loadingAdmin && (
          <div className="grid md:grid-cols-4 gap-3">
            {isAdmin ? (
              <>
                <button onClick={sortearOrdem} className="rounded-xl py-3 bg-yellow-500 hover:bg-yellow-600 transition font-semibold shadow">
                  🎲 Sortear Ordem
                </button>
                <button onClick={passarVez} className="rounded-xl py-3 bg-red-600 hover:bg-red-700 transition font-semibold shadow">
                  ⏭️ Passar Vez
                </button>
                <button onClick={finalizarEvento} className="rounded-xl py-3 bg-red-700 hover:bg-red-800 transition font-semibold shadow">
                  🛑 Finalizar Evento
                </button>
                <button onClick={limparSorteio} className="rounded-xl py-3 bg-gray-600 hover:bg-gray-700 transition font-semibold shadow">
                  🧹 Limpar Sorteio
                </button>
              </>
            ) : (
              <>
                <div className="md:col-span-3" />
                {minhaVez && (
                  <button onClick={passarVez} className="rounded-xl py-3 bg-red-600 hover:bg-red-700 transition font-semibold shadow">
                    ⏭️ Encerrar Minha Vez
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Status de perdas */}
        {ordem.length > 0 && <StatusPerdas />}

        {/* Área de ação / elenco */}
        <Card className="space-y-3">
          {loading || loadingAdmin ? (
            <p className="text-center">Carregando...</p>
          ) : ordemSorteada ? (
            <>
              {minhaVez ? (
                <>
                  {!mostrarJogadores ? (
                    <div className="text-center py-6 opacity-80">
                      Selecione um <b>time-alvo</b> e clique em <b>“Ver jogadores do time”</b>.
                    </div>
                  ) : carregandoJogadores ? (
                    <p className="text-center opacity-80">Carregando elenco...</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {jogadoresAlvo.length === 0 && (
                        <p className="col-span-full text-center opacity-80">Nenhum jogador disponível (bloqueado ou já levado).</p>
                      )}
                      {jogadoresAlvo.map((j) => {
                        const valorRoubo = Math.floor(Number(j.valor || 0) * PERCENTUAL_ROUBO)
                        return (
                          <div key={j.id} className="rounded-xl p-3 bg-white/5 border border-white/10 hover:bg-white/10 transition">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold">{j.nome}</p>
                                <p className="text-xs opacity-80">{j.posicao}</p>
                              </div>
                              <Chip>{brl(j.valor)}</Chip>
                            </div>
                            <button
                              onClick={() => abrirConfirmacao(j)}
                              disabled={bloqueioBotao || !podeRoubar(j.id_time)}
                              className="mt-3 w-full rounded-lg py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:cursor-not-allowed transition font-semibold"
                            >
                              ✅ Roubar por {brl(valorRoubo)}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 opacity-80">
                  Aguarde sua vez. Time da vez: <b>{nomeTimeDaVez || '—'}</b>.
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-yellow-300 font-bold">⚠️ Sorteie a ordem para iniciar o evento!</p>
          )}
        </Card>
      </div>

      {/* ===== Modal de Confirmação ===== */}
      {confirmJogador && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-white/10 p-5">
            <h3 className="text-xl font-bold mb-2">Confirmar Roubo</h3>
            <p className="text-sm opacity-90">
              Você está prestes a roubar <b>{confirmJogador.nome}</b> ({confirmJogador.posicao}).<br />
              O valor será <b>{brl(confirmValor)}</b>, descontado do seu caixa.
            </p>

            <div className="flex items-center justify-between mt-4 text-sm">
              <Chip>Preço do jogador: {brl(confirmJogador.valor)}</Chip>
              <Chip>Você paga: {brl(confirmValor)}</Chip>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={fecharConfirmacao} className="rounded-xl py-2 bg-gray-700 hover:bg-gray-600 transition font-semibold">
                Cancelar
              </button>
              <button onClick={confirmarRoubo} disabled={processandoRoubo} className="rounded-xl py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:cursor-not-allowed transition font-semibold">
                {processandoRoubo ? 'Processando...' : 'Confirmar Roubo'}
              </button>
            </div>
            <p className="text-xs opacity-70 mt-3">
              * Após a confirmação, o jogador será transferido para o seu elenco e não poderá ser roubado novamente neste e no próximo evento.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
