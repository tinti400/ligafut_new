aí vai o **arquivo completo e corrigido** (`src/app/evento_roubo/acao/page.tsx`) — pronto pra buildar:

```tsx
'use client'

import { useEffect, useMemo, useState, ReactNode, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { useAdmin } from '@/hooks/useAdmin'

/** ===== Supabase ===== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ===== Tipos ===== */
interface Time { id: string; nome: string; logo_url: string | null }
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
  limite_roubos_por_time?: number | null
  ativo?: boolean | null
  fase?: string | null
  roubo_evento_num?: number | null
  bloqueios_persistentes?: BloqPersistMap | null
}

/** ===== Regras/Constantes ===== */
const CONFIG_ID = '56f3af29-a4ac-4a76-aeb3-35400aa2a773'
const TEMPO_POR_VEZ = 240
const LIMITE_POR_ALVO_POR_TIME = 2
const LIMITE_PERDA_DEFAULT = 3
const LIMITE_ROUBOS_POR_TIME_DEFAULT = 3
const PERCENTUAL_ROUBO = 0.5
const brl = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR')}`

/** ===== Utils ===== */
function cls(...v: (string | false | null | undefined)[]) { return v.filter(Boolean).join(' ') }
function initials(nome: string) { return nome.split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
const posColor: Record<string,string> = {
  GL: 'bg-blue-500/20 text-blue-200 border-blue-400/30',
  ZAG: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  LD: 'bg-teal-500/20 text-teal-200 border-teal-400/30',
  LE: 'bg-teal-500/20 text-teal-200 border-teal-400/30',
  VOL: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
  MC: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/30',
  MD: 'bg-purple-500/20 text-purple-200 border-purple-400/30',
  ME: 'bg-purple-500/20 text-purple-200 border-purple-400/30',
  PD: 'bg-pink-500/20 text-pink-200 border-pink-400/30',
  PE: 'bg-pink-500/20 text-pink-200 border-pink-400/30',
  SA: 'bg-orange-500/20 text-orange-200 border-orange-400/30',
  CA: 'bg-red-500/20 text-red-200 border-red-400/30',
}
// timeout genérico
function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado. Verifique a conexão.')), ms))
  ]) as Promise<T>
}
// mantém o shape { data, error } do Supabase nas chamadas com timeout
type SupaResp<T> = { data: T | null; error: any }
// ⚠️ CORRIGIDO: embrulhar PostgrestBuilder com Promise.resolve(...)
async function supa<T>(p: any, ms = 15000): Promise<SupaResp<T>> {
  return await withTimeout<SupaResp<T>>(Promise.resolve(p), ms)
}

/** ===== Cronômetro ===== */
function Cronometro({ ativo, isAdmin, onTimeout, start = TEMPO_POR_VEZ }:{
  ativo:boolean; isAdmin:boolean; onTimeout:()=>void; start?:number
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
    return () => { alive = false; clearInterval(id) }
  }, [ativo, isAdmin, onTimeout])
  return <b>{s}s</b>
}

/** ===== UI helpers ===== */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cls('rounded-2xl p-4 shadow-lg bg-gradient-to-b from-gray-800/80 to-gray-900/80 border border-white/10', className)}>{children}</div>
}
function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={cls('px-3 py-1 rounded-full text-xs font-semibold bg-white/10 border border-white/10', className)}>{children}</span>
}
function useClickOutside<T extends HTMLElement>(onOut: () => void) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onOut()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onOut])
  return ref
}

export default function EventoRouboPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()
  const [idTime, setIdTime] = useState<string>('')

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
  const [filtroJogador, setFiltroJogador] = useState('')

  // confirmação e resumo
  const [confirmJogador, setConfirmJogador] = useState<Jogador | null>(null)
  const [confirmValor, setConfirmValor] = useState<number>(0)
  const [processandoRoubo, setProcessandoRoubo] = useState(false)
  const [erroConfirm, setErroConfirm] = useState<string | null>(null)
  const [ultimoRoubo, setUltimoRoubo] = useState<{ jogador: string; de: string; para: string; valor: number } | null>(null)
  const [roubosDaRodada, setRoubosDaRodada] = useState<Array<{ id: string; nome: string; posicao: string; de: string; para: string; valor: number }>>([])
  const [resumoFinal, setResumoFinal] = useState<typeof roubosDaRodada>([])

  // modal Antes × Depois
  const [comparativo, setComparativo] = useState<null | {
    jogador: { id: string; nome: string; posicao: string; valor: number }
    de: { id: string; nome: string; logo_url: string | null; saldoAntes: number; saldoDepois: number }
    para: { id: string; nome: string; logo_url: string | null; saldoAntes: number; saldoDepois: number }
    valorPago: number
  }>(null)

  const [loading, setLoading] = useState(true)
  const [bloqueioBotao, setBloqueioBotao] = useState(false)

  // banner pós-finalização
  const [eventoFinalizado, setEventoFinalizado] = useState(false)

  /** ===== Init / Realtime ===== */
  useEffect(() => {
    const id = localStorage.getItem('id_time') || localStorage.getItem('idTime') || ''
    if (id) setIdTime(id)
    carregarEvento()

    const canal = supabase
      .channel('evento-roubo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes', filter: `id=eq.${CONFIG_ID}` }, () => carregarEvento())
      .subscribe()

    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** ===== Carregar estado do evento ===== */
  async function carregarEvento() {
    setLoading(true)
    const { data, error } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', CONFIG_ID)
      .single<ConfigEvento>()

    if (error) { setLoading(false); toast.error('Erro ao carregar evento.'); return }

    setVez(Number(data.vez ?? 0) || 0)
    setRoubos((data.roubos || {}) as RoubosMap)
    setBloqueados((data.bloqueios || {}) as BloqueadosMap)
    setLimitePerda(data.limite_perda ?? LIMITE_PERDA_DEFAULT)
    setLimiteRoubosPorTime(data.limite_roubos_por_time ?? LIMITE_ROUBOS_POR_TIME_DEFAULT)
    setEventoNum(Number(data.roubo_evento_num ?? 0))
    setBloqPersist((data.bloqueios_persistentes || {}) as BloqPersistMap)
    setEventoFinalizado((data.fase || '') === 'finalizado')

    if (data.ordem?.length) {
      const { data: times, error: errTimes } = await supabase.from('times').select('id, nome, logo_url').in('id', data.ordem)
      if (!errTimes && times) {
        const ordemCompleta = (data.ordem as string[]).map((id) => times.find((t) => t.id === id)).filter(Boolean) as Time[]
        setOrdem(ordemCompleta); setOrdemSorteada(true)
      } else { setOrdem([]); setOrdemSorteada(false) }
    } else { setOrdem([]); setOrdemSorteada(false) }
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

  const alvosListados = useMemo(() => ordem.filter((t) => t.id !== idTime), [ordem, idTime])
  const nomeAlvoSelecionado = useMemo(() => ordem.find(t => t.id === alvoSelecionado)?.nome || '', [ordem, alvoSelecionado])

  /** ===== Carregar jogadores do alvo ===== */
  async function carregarJogadoresDoAlvo() {
    if (!alvoSelecionado) { toast('Selecione um time-alvo.'); return }
    setMostrarJogadores(true); setCarregandoJogadores(true)

    const { data, error } = await supabase
      .from('elenco')
      .select('id, nome, posicao, valor, id_time')
      .eq('id_time', alvoSelecionado)
      .order('nome', { ascending: true })

    if (error) { setCarregandoJogadores(false); toast.error(`Erro ao carregar jogadores do alvo: ${error.message}`); return }

    const base = (data || []) as Jogador[]
    const bloqueiosDoAlvo = (bloqueados[alvoSelecionado] || [])
    const idsBloqueados = new Set(bloqueiosDoAlvo.map((b) => b.id).filter(Boolean))
    const nomesBloqueados = new Set(bloqueiosDoAlvo.map((b) => b.nome))

    const semBloqueadosDoTime = base.filter((j) => (idsBloqueados.size ? !idsBloqueados.has(j.id) : !nomesBloqueados.has(j.nome)))
    const filtrados = semBloqueadosDoTime.filter((j) => {
      const ate = bloqPersist[j.id]
      return !(ate != null && ate >= eventoNum)
    })

    setJogadoresAlvo(filtrados); setCarregandoJogadores(false)

    if (base.length === 0) toast('Esse time não tem jogadores cadastrados.')
    else if (filtrados.length === 0) toast('Todos os jogadores desse time estão bloqueados no momento.')
    else toast.success(`✅ ${filtrados.length} jogador(es) disponíveis.`)
  }

  /** ===== Saldo: CAS com retry ===== */
  async function ajustarSaldoCompareAndSwap(timeId: string, delta: number, saldoAtualEsperado?: number) {
    let esperado = saldoAtualEsperado
    if (esperado == null) {
      const { data: t } = await supabase.from('times').select('saldo').eq('id', timeId).single()
      esperado = t?.saldo ?? 0
    }
    const { data: upd, error } = await supabase
      .from('times')
      .update({ saldo: (esperado || 0) + delta })
      .eq('id', timeId)
      .eq('saldo', esperado)
      .select('id')
    if (!error && upd && upd.length === 1) return true

    const { data: fresh } = await supabase.from('times').select('saldo').eq('id', timeId).single()
    const freshSaldo = fresh?.saldo ?? 0
    const { data: upd2 } = await supabase
      .from('times')
      .update({ saldo: freshSaldo + delta })
      .eq('id', timeId)
      .eq('saldo', freshSaldo)
      .select('id')
    return !!(upd2 && upd2.length === 1)
  }

  /** ===== Modal confirmar ===== */
  function abrirConfirmacao(j: Jogador) {
    const valor = Math.floor(Number(j.valor || 0) * PERCENTUAL_ROUBO)
    setErroConfirm(null)
    setConfirmJogador(j)
    setConfirmValor(valor)
  }
  function fecharConfirmacao() { setConfirmJogador(null); setConfirmValor(0); setErroConfirm(null) }

  /** ===== Roubar ===== */
  async function confirmarRoubo() {
    if (!confirmJogador) return
    await roubarJogador(confirmJogador, confirmValor)
  }

  async function roubarJogador(jogador: Jogador, valorPagoCalculado?: number) {
    if (bloqueioBotao || processandoRoubo) return
    setErroConfirm(null)

    if (!idTime) { setErroConfirm('Identidade do time não encontrada.'); return }
    const timeDaVez = ordem[vez]?.id
    if (!timeDaVez || timeDaVez !== idTime) {
      setErroConfirm('A vez mudou. Recarregando…')
      fecharConfirmacao()
      await carregarEvento()
      return
    }

    setProcessandoRoubo(true)
    setBloqueioBotao(true)

    try {
      // 1) Snapshot config (servidor)
      const { data: cfg, error: cfgErr } = await supa<ConfigEvento>(
        supabase.from('configuracoes')
          .select('ordem,vez,roubos,limite_perda,limite_roubos_por_time,bloqueios,roubo_evento_num,bloqueios_persistentes')
          .eq('id', CONFIG_ID)
          .single<ConfigEvento>()
      )
      if (cfgErr) throw new Error('Falha ao ler configuração: ' + (cfgErr.message ?? ''))

      const vezAtual = Number(cfg?.vez ?? 0)
      const idDaVezServidor = (cfg?.ordem || [])[vezAtual]
      if (!idDaVezServidor || idDaVezServidor !== idTime) {
        setErroConfirm('A vez mudou no servidor. Atualizei a lista.')
        fecharConfirmacao(); await carregarEvento(); return
      }

      // 2) Limites
      const roubosSrv = (cfg?.roubos || {}) as RoubosMap
      const totalPerdasSrv = Object.values(roubosSrv).map((r) => r[jogador.id_time] || 0).reduce((a, b) => a + b, 0)
      const limitePerdaSrv = cfg?.limite_perda ?? LIMITE_PERDA_DEFAULT
      const limiteRoubosPorTimeSrv = cfg?.limite_roubos_por_time ?? LIMITE_ROUBOS_POR_TIME_DEFAULT
      const jaRoubouDesseSrv = (roubosSrv[idTime]?.[jogador.id_time] || 0)
      const totalMeuSrv = Object.values(roubosSrv[idTime] || {}).reduce((a, b) => a + b, 0)

      if (totalPerdasSrv + 1 > limitePerdaSrv) { setErroConfirm('Esse time não pode perder mais jogadores neste evento.'); return }
      if (jaRoubouDesseSrv + 1 > LIMITE_POR_ALVO_POR_TIME) { setErroConfirm('Você já atingiu o limite contra esse alvo (2).'); return }
      if (totalMeuSrv + 1 > limiteRoubosPorTimeSrv) { setErroConfirm('Você atingiu o limite total de roubos neste evento.'); return }

      const valorPago = valorPagoCalculado != null ? valorPagoCalculado : Math.floor((jogador.valor || 0) * PERCENTUAL_ROUBO)
      const timeOrigemId = jogador.id_time // salvar antes

      // 3) Transferência de elenco
      const { data: updJog, error: errJog } = await supa<{id:string}[]>(
        supabase.from('elenco')
          .update({ id_time: idTime })
          .eq('id', jogador.id)
          .eq('id_time', timeOrigemId)
          .select('id')
      )
      if (errJog) { setErroConfirm('Falha ao transferir jogador (elenco): ' + (errJog.message ?? '')); return }
      if (!updJog || updJog.length === 0) { setErroConfirm('Outro time levou esse jogador primeiro.'); await carregarEvento(); return }

      // 4) Saldos (antes)
      const [{ data: alvoInfo, error: alvoErr }, { data: meuInfo, error: meuErr }] = await Promise.all([
        supa<{id:string; nome:string; logo_url:string|null; saldo:number}>(supabase.from('times').select('id,nome,logo_url,saldo').eq('id', timeOrigemId).single()),
        supa<{id:string; nome:string; logo_url:string|null; saldo:number}>(supabase.from('times').select('id,nome,logo_url,saldo').eq('id', idTime).single())
      ])
      if (alvoErr) { setErroConfirm('Erro ao ler saldo do time alvo: ' + (alvoErr.message ?? '')); return }
      if (meuErr)  { setErroConfirm('Erro ao ler saldo do seu time: ' + (meuErr.message ?? '')); return }

      const nomeAlvo = alvoInfo?.nome || 'Time Alvo'
      const nomeMeu  = meuInfo?.nome  || 'Seu Time'
      const saldoAlvoAntes = Number(alvoInfo?.saldo || 0)
      const saldoMeuAntes  = Number(meuInfo?.saldo  || 0)

      // 5) Débito / Crédito (CAS)
      const debitei = await withTimeout(ajustarSaldoCompareAndSwap(idTime, -valorPago, saldoMeuAntes))
      const creditei = await withTimeout(ajustarSaldoCompareAndSwap(timeOrigemId, +valorPago, saldoAlvoAntes))
      if (!debitei || !creditei) { setErroConfirm('Conflito ao atualizar saldos.'); return }

      // 6) Saldos (depois) para o modal Antes × Depois
      const { data: timesFresh, error: freshErr } = await supa<Array<{id:string; nome:string; logo_url:string|null; saldo:number}>>(
        supabase.from('times').select('id,nome,logo_url,saldo').in('id', [idTime, timeOrigemId])
      )
      if (freshErr) { setErroConfirm('Erro ao ler saldos atualizados: ' + (freshErr.message ?? '')); return }
      const freshMeu  = timesFresh?.find(t => t.id === idTime)
      const freshAlvo = timesFresh?.find(t => t.id === timeOrigemId)
      const saldoMeuDepois  = Number(freshMeu?.saldo  ?? (saldoMeuAntes  - valorPago))
      const saldoAlvoDepois = Number(freshAlvo?.saldo ?? (saldoAlvoAntes + valorPago))

      // 7) Config: contadores/bloqueios
      const atualizado: RoubosMap = { ...(cfg?.roubos || {}) }
      if (!atualizado[idTime]) atualizado[idTime] = {}
      if (!atualizado[idTime][timeOrigemId]) atualizado[idTime][timeOrigemId] = 0
      atualizado[idTime][timeOrigemId]++

      const bloqAtual: BloqueadosMap = { ...(cfg?.bloqueios || {}) }
      const listaNovo = Array.isArray(bloqAtual[idTime]) ? bloqAtual[idTime] : []
      if (!listaNovo.some((b) => (b.id ? b.id === jogador.id : b.nome === jogador.nome))) {
        listaNovo.push({ id: jogador.id, nome: jogador.nome, posicao: jogador.posicao })
        bloqAtual[idTime] = listaNovo
      }

      const persist: BloqPersistMap = { ...(cfg?.bloqueios_persistentes || {}) }
      persist[jogador.id] = Number(cfg?.roubo_evento_num ?? 0) + 1

      const { error: cfgUpdErr } = await supa<unknown>(
        supabase.from('configuracoes')
          .update({ roubos: atualizado, bloqueios: bloqAtual, bloqueios_persistentes: persist })
          .eq('id', CONFIG_ID)
      )
      if (cfgUpdErr) { setErroConfirm('Erro ao salvar configuração: ' + (cfgUpdErr.message ?? '')); return }

      // 8) BID
      const { error: bidErr } = await supa<unknown>(
        supabase.from('bid').insert({
          tipo_evento: 'roubo',
          descricao: `${jogador.nome} foi roubado por ${nomeMeu} de ${nomeAlvo} por ${brl(valorPago)}`,
          id_time1: idTime,
          id_time2: timeOrigemId,
          valor: valorPago
        })
      )
      if (bidErr) { setErroConfirm('Erro ao publicar no BID: ' + (bidErr.message ?? '')); return }

      // 9) Feedbacks & modal Antes × Depois
      setUltimoRoubo({ jogador: jogador.nome, de: nomeAlvo, para: nomeMeu, valor: valorPago })
      setRoubosDaRodada(prev => [...prev, { id: jogador.id, nome: jogador.nome, posicao: jogador.posicao, de: nomeAlvo, para: nomeMeu, valor: valorPago }])
      setRoubos(atualizado)

      setComparativo({
        jogador: { id: jogador.id, nome: jogador.nome, posicao: jogador.posicao, valor: jogador.valor },
        de:   { id: timeOrigemId, nome: nomeAlvo, logo_url: freshAlvo?.logo_url ?? (ordem.find(t => t.id === timeOrigemId)?.logo_url ?? null), saldoAntes: saldoAlvoAntes, saldoDepois: saldoAlvoDepois },
        para: { id: idTime,       nome: nomeMeu,  logo_url: freshMeu?.logo_url ?? (ordem.find(t => t.id === idTime)?.logo_url ?? null),  saldoAntes: saldoMeuAntes,  saldoDepois: saldoMeuDepois },
        valorPago
      })

      // limpa UI
      fecharConfirmacao()
      setMostrarJogadores(false); setAlvoSelecionado(''); setJogadoresAlvo([]); setFiltroJogador('')

      toast.success(`✅ Você roubou o jogador ${jogador.nome}.`)
    } catch (e: any) {
      console.error(e)
      setErroConfirm(e?.message || 'Erro inesperado ao processar roubo.')
    } finally {
      setProcessandoRoubo(false)
      setBloqueioBotao(false)
    }
  }

  /** ===== Admin: ordem/vez/limpar/finalizar ===== */
  async function sortearOrdem() {
    const { data: times, error } = await supabase.from('times').select('id, nome, logo_url')
    if (error || !times) { toast.error('Erro ao buscar times.'); return }

    const { data: cfg } = await supabase.from('configuracoes').select('roubo_evento_num').eq('id', CONFIG_ID).single()
    const novoNum = Number(cfg?.roubo_evento_num ?? 0) + 1

    const embaralhado: Time[] = [...times]
      .map((t) => ({ ...t, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ r, ...rest }) => rest)

    const ids = embaralhado.map((t) => t.id)
    const { error: errUpd } = await supabase
      .from('configuracoes')
      .update({ ordem: ids, vez: '0', roubo_evento_num: novoNum, ativo: true, fase: 'acao' })
      .eq('id', CONFIG_ID)
    if (errUpd) { toast.error('Erro ao sortear a ordem.'); return }

    setEventoFinalizado(false)
    setResumoFinal([])
    setRoubosDaRodada([])
    setUltimoRoubo(null)

    setOrdem(embaralhado); setVez(0); setOrdemSorteada(true); setEventoNum(novoNum)
    toast.success('🎲 Ordem sorteada! Boa sorte.')
  }

  async function passarVez() {
    const novaVez = vez + 1
    await supabase.from('configuracoes').update({ vez: String(novaVez) }).eq('id', CONFIG_ID)
    setVez(novaVez)
    setAlvoSelecionado('')
    setJogadoresAlvo([])
    setMostrarJogadores(false)
    setFiltroJogador('')
  }

  async function limparSorteio() {
    await supabase.from('configuracoes').update({ ordem: null, vez: '0' }).eq('id', CONFIG_ID)
    setOrdem([]); setOrdemSorteada(false); setVez(0)
    setResumoFinal([]); setRoubosDaRodada([]); setUltimoRoubo(null)
    toast('🧹 Sorteio limpo.')
  }

  async function finalizarEvento() {
    // guarda resumo antes de limpar
    setResumoFinal(roubosDaRodada)

    const { data: cfg, error } = await supabase
      .from('configuracoes')
      .select('roubo_evento_num,bloqueios_persistentes')
      .eq('id', CONFIG_ID)
      .single<ConfigEvento>()
    if (error) { toast.error('Erro ao carregar configuração.'); return }

    const ev = Number(cfg?.roubo_evento_num ?? 0)
    const persist = (cfg?.bloqueios_persistentes ?? {}) as BloqPersistMap
    const novoPersist: BloqPersistMap = {}
    for (const [jid, ate] of Object.entries(persist)) if (ate >= ev) novoPersist[jid] = ate

    const { error: updErr } = await supabase
      .from('configuracoes')
      .update({ ativo: false, fase: 'finalizado', roubos: {}, bloqueios: {}, bloqueios_persistentes: novoPersist })
      .eq('id', CONFIG_ID)
    if (updErr) { toast.error('Erro ao finalizar evento.'); return }

    setEventoFinalizado(true)
    setOrdem([]); setOrdemSorteada(false); setVez(0)
    setAlvoSelecionado(''); setJogadoresAlvo([]); setMostrarJogadores(false); setFiltroJogador('')
    setRoubosDaRodada([]); setUltimoRoubo(null)

    toast.success('✅ Evento finalizado! Resumo abaixo.')
  }

  /** ===== Componentes Internos ===== */
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
            <div key={t.id} className={cls('flex items-center gap-3 rounded-xl p-3 border', cor)}>
              {t.logo_url
                ? <img src={t.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                : <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs">{initials(t.nome)}</div>}
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

  const TeamSelect = () => {
    const [open, setOpen] = useState(false)
    const [busca, setBusca] = useState('')
    const ref = useClickOutside<HTMLDivElement>(() => setOpen(false))

    const lista = useMemo(() => {
      const b = busca.trim().toLowerCase()
      return b ? alvosListados.filter(t => t.nome.toLowerCase().includes(b)) : alvosListados
    }, [alvosListados, busca])

    const selecionado = ordem.find(t => t.id === alvoSelecionado) || null
    function onEscolher(t: Time) {
      setAlvoSelecionado(t.id)
      setMostrarJogadores(false)
      setJogadoresAlvo([])
      setFiltroJogador('')
      setOpen(false)
    }

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => ordemSorteada && minhaVez && setOpen(!open)}
          className={cls(
            'w-full p-3 rounded-xl bg-white/10 border border-white/10 focus:outline-none flex items-center justify-between gap-3',
            (!minhaVez || !ordemSorteada) && 'opacity-60 cursor-not-allowed'
          )}
          disabled={!minhaVez || !ordemSorteada}
        >
          <div className="flex items-center gap-3">
            {selecionado?.logo_url
              ? <img src={selecionado.logo_url} className="h-7 w-7 rounded-full object-cover" alt="" />
              : <div className="h-7 w-7 rounded-full bg-white/10 grid place-items-center text-xs">{selecionado ? initials(selecionado.nome) : ' '}</div>}
            <div className="text-left">
              <div className="text-sm opacity-80">Time-alvo</div>
              <div className="font-semibold">{selecionado?.nome || 'Selecione um time...'}</div>
            </div>
          </div>
          <span className="opacity-70">▾</span>
        </button>

        {open && (
          <div className="absolute z-40 mt-2 w-full rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur shadow-2xl">
            <div className="p-2 border-b border-white/10">
              <input
                placeholder="Buscar time..."
                value={busca}
                onChange={(e)=>setBusca(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-auto p-2 space-y-1">
              {lista.length === 0 && <div className="py-6 text-center text-sm opacity-70">Nenhum time encontrado.</div>}
              {lista.map((t) => {
                const perdas = totalPerdasDoAlvo(t.id)
                const restante = Math.max(0, limitePerda - perdas)
                const ja = jaRoubouDesseAlvo(t.id)
                const bloqueadoPorRegra = !podeRoubar(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => onEscolher(t)}
                    className={cls('w-full text-left rounded-lg p-2 flex items-center gap-3 border transition',
                      'bg-white/5 hover:bg-white/10 border-white/10',
                      bloqueadoPorRegra && 'opacity-60')}
                  >
                    {t.logo_url
                      ? <img src={t.logo_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                      : <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs">{initials(t.nome)}</div>}
                    <div className="flex-1">
                      <div className="font-semibold leading-tight">{t.nome}</div>
                      <div className="text-[11px] opacity-80">
                        Pode perder {restante}/{limitePerda} • seus roubos: {ja}/{LIMITE_POR_ALVO_POR_TIME}
                        {bloqueadoPorRegra && <span className="ml-1 text-red-300 font-semibold">• limite atingido</span>}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10">{perdas} perdidos</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  /** ===== Render ===== */
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
                {ordem[vez]?.logo_url
                  ? <img src={ordem[vez]!.logo_url!} className="h-7 w-7 rounded-full object-cover" alt="" />
                  : <div className="h-7 w-7 rounded-full bg-white/10 grid place-items-center text-xs">{ordem[vez]?.nome ? initials(ordem[vez]!.nome) : ''}</div>}
                <p className="text-lg font-semibold text-green-300">{nomeTimeDaVez || '—'}</p>
              </div>
              <p className="text-sm mt-1">⏳ Tempo restante: <Cronometro key={vez} ativo={ordemSorteada} isAdmin={!!isAdmin} onTimeout={passarVez} /></p>
            </div>
          )}
        </div>

        {/* Confirmação fixa após roubo */}
        {ultimoRoubo && (
          <Card className="border-green-500/40 bg-green-900/20">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                ✅ <b>Você roubou o jogador {ultimoRoubo.jogador}</b> de <b>{ultimoRoubo.de}</b> por <b>{brl(ultimoRoubo.valor)}</b>.
              </div>
              <button onClick={()=>setUltimoRoubo(null)} className="text-xs opacity-70 hover:opacity-100">fechar</button>
            </div>
          </Card>
        )}

        {/* Banner pós-finalização + Resumo */}
        {eventoFinalizado && (
          <Card className="border-green-500/40 bg-green-900/20">
            <div className="text-sm mb-3">✅ <b>Evento finalizado!</b> Sorteie a ordem para iniciar um novo evento.</div>
            <div className="mt-2">
              <h4 className="font-bold mb-2">📜 Resumo — Jogadores roubados</h4>
              {resumoFinal.length === 0 ? (
                <p className="text-sm opacity-80">Nenhum roubo registrado nesta rodada.</p>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {resumoFinal.map((r) => (
                    <div key={r.id} className="rounded-xl p-3 bg-white/5 border border-white/10">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 grid place-items-center text-xs font-bold">{initials(r.nome)}</div>
                        <div className="flex-1">
                          <div className="font-semibold leading-tight">{r.nome}</div>
                          <div className="text-[11px] opacity-80">{r.posicao}</div>
                          <div className="text-xs mt-1"><span className="opacity-80">de</span> <b>{r.de}</b> <span className="opacity-80">→ para</span> <b>{r.para}</b></div>
                        </div>
                        <Chip>{brl(r.valor)}</Chip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="mt-4 flex gap-2">
                <button onClick={sortearOrdem} className="rounded-xl px-3 py-2 bg-yellow-500 hover:bg-yellow-600 transition font-semibold shadow">🎲 Sortear nova ordem</button>
              </div>
            )}
          </Card>
        )}

        {/* Seletor de time-alvo */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold">🎯 Escolha o time-alvo</h3>
            <Chip>Seu limite total: {limiteRoubosPorTime} • Já roubou: {totalRoubosDoMeuTime()}</Chip>
          </div>
          <TeamSelect />
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
                <button onClick={sortearOrdem} className="rounded-xl py-3 bg-yellow-500 hover:bg-yellow-600 transition font-semibold shadow">🎲 Sortear Ordem</button>
                <button onClick={passarVez} className="rounded-xl py-3 bg-red-600 hover:bg-red-700 transition font-semibold shadow">⏭️ Passar Vez</button>
                <button onClick={finalizarEvento} className="rounded-xl py-3 bg-red-700 hover:bg-red-800 transition font-semibold shadow">🛑 Finalizar Evento</button>
                <button onClick={limparSorteio} className="rounded-xl py-3 bg-gray-600 hover:bg-gray-700 transition font-semibold shadow">🧹 Limpar Sorteio</button>
              </>
            ) : (
              <>
                <div className="md:col-span-3" />
                {minhaVez && <button onClick={passarVez} className="rounded-xl py-3 bg-red-600 hover:bg-red-700 transition font-semibold shadow">⏭️ Encerrar Minha Vez</button>}
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
                    <div className="text-center py-6 opacity-80">Selecione um <b>time-alvo</b> e clique em <b>“Ver jogadores do time”</b>.</div>
                  ) : (
                    <>
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                        <h4 className="font-bold text-lg">📋 Jogadores disponíveis — {nomeAlvoSelecionado}</h4>
                        <input
                          value={filtroJogador}
                          onChange={(e)=>setFiltroJogador(e.target.value)}
                          placeholder="Filtrar por nome/posição..."
                          className="w-full sm:w-72 px-3 py-2 rounded-xl bg-white/10 border border-white/10 focus:outline-none"
                        />
                      </div>

                      {carregandoJogadores ? (
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {Array.from({length:6}).map((_,i)=>(
                            <div key={i} className="rounded-xl p-3 border border-white/10 bg-white/5 animate-pulse h-28" />
                          ))}
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {jogadoresAlvo
                            .filter(j => {
                              const f = filtroJogador.trim().toLowerCase()
                              if (!f) return true
                              return j.nome.toLowerCase().includes(f) || (j.posicao || '').toLowerCase().includes(f)
                            })
                            .map((j) => {
                              const valorRoubo = Math.floor(Number(j.valor || 0) * PERCENTUAL_ROUBO)
                              const posCls = posColor[j.posicao] || 'bg-white/10 text-white/90 border-white/20'
                              return (
                                <div key={j.id} className="rounded-xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 transition group">
                                  <div className="flex items-start gap-3">
                                    <div className="h-12 w-12 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 grid place-items-center text-sm font-bold">
                                      {initials(j.nome)}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between">
                                        <p className="font-extrabold leading-tight">{j.nome}</p>
                                        <Chip className="ml-2">{brl(j.valor)}</Chip>
                                      </div>
                                      <div className="mt-1">
                                        <span className={cls('text-[11px] px-2 py-1 rounded-full border', posCls)}>{j.posicao}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => abrirConfirmacao(j)}
                                    disabled={bloqueioBotao || !podeRoubar(j.id_time)}
                                    className={cls(
                                      'mt-4 w-full rounded-lg py-2 font-semibold transition',
                                      'bg-green-600 hover:bg-green-700',
                                      (!podeRoubar(j.id_time) || bloqueioBotao) && 'bg-green-900 cursor-not-allowed hover:bg-green-900'
                                    )}
                                  >
                                    ✅ Roubar por {brl(valorRoubo)}
                                  </button>
                                </div>
                              )
                            })}
                          {jogadoresAlvo.length === 0 && <p className="col-span-full text-center opacity-80">Nenhum jogador disponível (bloqueado ou já levou).</p>}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="text-center py-6 opacity-80">Aguarde sua vez. Time da vez: <b>{nomeTimeDaVez || '—'}</b>.</div>
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
              <button onClick={fecharConfirmacao} className="rounded-xl py-2 bg-gray-700 hover:bg-gray-600 transition font-semibold">Cancelar</button>
              <button onClick={confirmarRoubo} disabled={processandoRoubo} className="rounded-xl py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-900 disabled:cursor-not-allowed transition font-semibold">
                {processandoRoubo ? 'Processando...' : 'Confirmar Roubo'}
              </button>
            </div>

            {/* ERRO visível no próprio modal */}
            {erroConfirm && <p className="text-sm text-red-300 mt-3">{erroConfirm}</p>}

            <p className="text-xs opacity-70 mt-3">
              * Após a confirmação, o jogador será transferido para o seu elenco e não poderá ser roubado novamente neste e no próximo evento.
            </p>
          </div>
        </div>
      )}

      {/* ===== Modal Antes × Depois ===== */}
      {comparativo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 border border-white/10 p-5">
            <h3 className="text-xl font-extrabold mb-1">Transferência confirmada</h3>
            <p className="text-sm opacity-90 mb-4">
              Você roubou <b>{comparativo.jogador.nome}</b> ({comparativo.jogador.posicao}) por <b>{brl(comparativo.valorPago)}</b>.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {/* De */}
              <div className="rounded-xl p-4 bg-white/5 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  {comparativo.de.logo_url
                    ? <img src={comparativo.de.logo_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                    : <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs">{initials(comparativo.de.nome)}</div>}
                  <div>
                    <div className="text-xs opacity-70">De</div>
                    <div className="font-semibold">{comparativo.de.nome}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="opacity-80 mb-1">Saldo</div>
                  <div className="flex items-center gap-2">
                    <Chip>{brl(comparativo.de.saldoAntes)}</Chip>
                    <span className="opacity-70">→</span>
                    <Chip className="bg-green-500/20 border-green-400/40 text-green-200">{brl(comparativo.de.saldoDepois)}</Chip>
                  </div>
                </div>
              </div>

              {/* Para */}
              <div className="rounded-xl p-4 bg-white/5 border border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  {comparativo.para.logo_url
                    ? <img src={comparativo.para.logo_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                    : <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs">{initials(comparativo.para.nome)}</div>}
                  <div>
                    <div className="text-xs opacity-70">Para</div>
                    <div className="font-semibold">{comparativo.para.nome}</div>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="opacity-80 mb-1">Saldo</div>
                  <div className="flex items-center gap-2">
                    <Chip className="bg-red-500/20 border-red-400/40 text-red-200">{brl(comparativo.para.saldoAntes)}</Chip>
                    <span className="opacity-70">→</span>
                    <Chip>{brl(comparativo.para.saldoDepois)}</Chip>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={()=>setComparativo(null)} className="rounded-xl py-2 bg-gray-700 hover:bg-gray-600 transition font-semibold">Fechar</button>
              <button onClick={()=>{ setComparativo(null); setUltimoRoubo(null); }} className="rounded-xl py-2 bg-green-600 hover:bg-green-700 transition font-semibold">OK</button>
            </div>
            <p className="text-xs opacity-70 mt-3">Os valores refletem os saldos lidos após a transferência.</p>
          </div>
        </div>
      )}
    </div>
  )
}
```
