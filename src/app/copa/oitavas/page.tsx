'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

/* ================== SUPABASE ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================== REGRAS DE PREMIAÇÃO (oitavas) ================== */
const PREMIO_VITORIA = 25_000_000
const PREMIO_POR_GOL = 650_000

/* ================== TIPOS ================== */
interface TimeRow {
  id: string
  nome: string
  logo_url: string | null
}
type JogoOitavas = {
  id: number
  ordem?: number | null
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  // opcionais
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}
type JogoLiga = {
  id?: string | number
  id_time1?: string | null
  id_time2?: string | null
  time1?: string | null
  time2?: string | null
  gols_time1: number | null
  gols_time2: number | null
}
type JogoPlayoff = {
  id?: string | number
  rodada: 1 | 2
  ordem: number
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
}

/* ================== HELPERS / UTILS ================== */
const TIMES_EXCLUIDOS = ['palmeiras', 'sociedade esportiva palmeiras']
const norm = (s?: string | null) => (s || '').toLowerCase().trim()
function ehExcluido(mapa: Record<string, { nome: string }>, idOuNome?: string | null) {
  if (!idOuNome) return false
  if (mapa[idOuNome]) return TIMES_EXCLUIDOS.includes(norm(mapa[idOuNome].nome))
  return TIMES_EXCLUIDOS.includes(norm(idOuNome))
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '')
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const toDBId = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : v)

/** type-guards p/ ler *_volta com segurança */
type BeforeIda = { gols_time1: number | null; gols_time2: number | null }
type BeforeVolta = { gols_time1_volta?: number | null; gols_time2_volta?: number | null }
function hasGolsIda(obj: unknown): obj is BeforeIda {
  return !!obj && typeof obj === 'object' && 'gols_time1' in obj && 'gols_time2' in obj
}
function hasGolsVolta(obj: unknown): obj is BeforeVolta {
  return !!obj && typeof obj === 'object' && ('gols_time1_volta' in obj || 'gols_time2_volta' in obj)
}

/* ================== CLASSIFICAÇÃO — fase liga (base igual ao playoff) ================== */
interface LinhaClassificacao {
  id_time: string
  pontos: number
  vitorias: number
  gols_pro: number
  gols_contra: number
  saldo: number
  jogos: number
}

async function carregarJogosFaseLiga(): Promise<JogoLiga[]> {
  const { data: a, error: ea } = await supabase
    .from('copa_fase_liga')
    .select('*')
    .not('gols_time1', 'is', null)
    .not('gols_time2', 'is', null)
  if (!ea && a && a.length) return a as JogoLiga[]

  const { data: b } = await supabase
    .from('fase_liga')
    .select('*')
    .not('gols_time1', 'is', null)
    .not('gols_time2', 'is', null)
  return (b || []) as JogoLiga[]
}

async function pegarTop8FaseLiga(): Promise<TimeRow[]> {
  const { data: times, error: errTimes } = await supabase
    .from('times')
    .select('id, nome, logo_url')
  if (errTimes) throw errTimes

  const mapaTimes: Record<string, { id: string; nome: string; logo_url: string | null }> = {}
  for (const t of (times || [])) {
    if (TIMES_EXCLUIDOS.includes(norm(t.nome))) continue
    mapaTimes[t.id] = { id: t.id, nome: t.nome, logo_url: t.logo_url ?? null }
  }

  const jogos = await carregarJogosFaseLiga()

  const base: Record<string, LinhaClassificacao> = {}
  for (const id of Object.keys(mapaTimes)) {
    base[id] = { id_time: id, pontos: 0, vitorias: 0, gols_pro: 0, gols_contra: 0, saldo: 0, jogos: 0 }
  }

  const resolverIdDoTime = (j: JogoLiga, lado: 1 | 2) => {
    const direto = lado === 1 ? j.id_time1 : j.id_time2
    if (direto && mapaTimes[direto]) return direto
    const raw = lado === 1 ? j.time1 : j.time2
    if (!raw) return null
    if ((mapaTimes as any)[raw]) return raw
    const alvo = norm(raw)
    for (const [id, info] of Object.entries(mapaTimes)) {
      if (norm(info.nome) === alvo) return id
    }
    return null
  }

  for (const j of jogos) {
    if (j.gols_time1 == null || j.gols_time2 == null) continue
    const id1 = resolverIdDoTime(j, 1)
    const id2 = resolverIdDoTime(j, 2)
    if (!id1 || !id2) continue
    if (ehExcluido(mapaTimes as any, id1) || ehExcluido(mapaTimes as any, id2)) continue
    if (!base[id1] || !base[id2]) continue

    const g1 = Number(j.gols_time1)
    const g2 = Number(j.gols_time2)

    base[id1].gols_pro += g1
    base[id1].gols_contra += g2
    base[id1].jogos += 1

    base[id2].gols_pro += g2
    base[id2].gols_contra += g1
    base[id2].jogos += 1

    if (g1 > g2) {
      base[id1].vitorias += 1
      base[id1].pontos += 3
    } else if (g2 > g1) {
      base[id2].vitorias += 1
      base[id2].pontos += 3
    } else {
      base[id1].pontos += 1
      base[id2].pontos += 1
    }

    base[id1].saldo = base[id1].gols_pro - base[id1].gols_contra
    base[id2].saldo = base[id2].gols_pro - base[id2].gols_contra
  }

  const ordenada = Object.values(base).sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    const saldoA = a.gols_pro - a.gols_contra
    const saldoB = b.gols_pro - b.gols_contra
    if (saldoB !== saldoA) return saldoB - saldoA
    if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
    return b.vitorias - a.vitorias
  })

  const top8 = ordenada.slice(0, 8)
  return top8.map((l) => ({
    id: l.id_time,
    nome: mapaTimes[l.id_time]?.nome ?? 'Time',
    logo_url: mapaTimes[l.id_time]?.logo_url ?? null
  }))
}

/* ================== VENCEDORES DO PLAYOFF => Pote B ================== */
async function pegarVencedoresPlayoff(): Promise<TimeRow[]> {
  const { data, error } = await supabase
    .from('copa_playoff')
    .select('*')
    .order('ordem', { ascending: true })
  if (error) throw error

  const jogos = (data || []) as JogoPlayoff[]
  if (!jogos.length) return []

  // pares por (ordem): cada confronto usa duas ordens consecutivas
  const pares: Record<number, { ida?: JogoPlayoff; volta?: JogoPlayoff }> = {}
  for (const j of jogos) {
    const key = Math.ceil(j.ordem / 2) // 1..8
    if (j.rodada === 1) pares[key] = { ...(pares[key] || {}), ida: j }
    else pares[key] = { ...(pares[key] || {}), volta: j }
  }

  const vencedoresIds: string[] = []
  for (let k = 1; k <= Object.keys(pares).length; k++) {
    const { ida, volta } = pares[k] || {}
    if (!ida || !volta) continue
    if (ida.gols_time1 == null || ida.gols_time2 == null || volta.gols_time1 == null || volta.gols_time2 == null) continue

    // ida: A x B  | volta: B x A
    const gA = (ida.gols_time1 || 0) + (volta.gols_time2 || 0)
    const gB = (ida.gols_time2 || 0) + (volta.gols_time1 || 0)
    const vencedorId = gA >= gB ? ida.id_time1 : ida.id_time2 // empate -> A
    vencedoresIds.push(vencedorId)
  }

  if (vencedoresIds.length !== 8) return []

  const { data: times } = await supabase
    .from('times')
    .select('id, nome, logo_url')
    .in('id', vencedoresIds)
  const mapa = new Map((times || []).map(t => [t.id, t]))
  return vencedoresIds.map(id => ({
    id,
    nome: mapa.get(id)?.nome ?? 'Time',
    logo_url: mapa.get(id)?.logo_url ?? null
  }))
}

/* ================== COMPONENTE ================== */
export default function OitavasPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  // dados da tabela
  const [jogos, setJogos] = useState<JogoOitavas[]>([])
  const [loading, setLoading] = useState(true)
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})

  // UI header
  const [activeTab, setActiveTab] = useState<'ida' | 'volta'>('ida')

  // sorteio ao vivo (potes)
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [sorteioAtivo, setSorteioAtivo] = useState(false)
  const [filaA, setFilaA] = useState<TimeRow[]>([]) // top1-8 liga
  const [filaB, setFilaB] = useState<TimeRow[]>([]) // vencedores playoff
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [flipA, setFlipA] = useState(false)
  const [flipB, setFlipB] = useState(false)
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [confirming, setConfirming] = useState(false)

  // realtime
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef({ sorteioAberto, sorteioAtivo, filaA, filaB, pares, parAtual, flipA, flipB })
  useEffect(() => {
    stateRef.current = { sorteioAberto, sorteioAtivo, filaA, filaB, pares, parAtual, flipA, flipB }
  }, [sorteioAberto, sorteioAtivo, filaA, filaB, pares, parAtual, flipA, flipB])

  useEffect(() => {
    buscarJogosELogos()

    const ch = supabase.channel('oitavas-sorteio', { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('sorteioAtivo' in p) setSorteioAtivo(!!p.sorteioAtivo)
      if ('filaA' in p) setFilaA(p.filaA || [])
      if ('filaB' in p) setFilaB(p.filaB || [])
      if ('pares' in p) setPares(p.pares || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A:null, B:null })
      if ('flipA' in p) setFlipA(!!p.flipA)
      if ('flipB' in p) setFlipB(!!p.flipB)
    })
    ch.subscribe()
    channelRef.current = ch
    return () => { ch.unsubscribe() }
  }, [])

  function broadcast(partial: any) {
    const base = stateRef.current
    channelRef.current?.send({
      type: 'broadcast',
      event: 'state',
      payload: { ...base, ...partial, sorteioAberto: true }
    })
  }

  /* ================== CARREGAR JOGOS + LOGOS ================== */
  async function buscarJogosELogos() {
    try {
      setLoading(true)
      // detectar suporte à volta
      let cols = 'id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta'
      let req = await supabase.from('copa_oitavas').select(cols).order('ordem', { ascending: true })
      if (req.error && mentionsVolta(req.error.message)) {
        setSupportsVolta(false)
        cols = 'id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2'
        req = await supabase.from('copa_oitavas').select(cols).order('ordem', { ascending: true })
      }
      if (req.error) throw req.error

      const arr = (req.data || []) as JogoOitavas[]
      setJogos(arr)

      const ids = Array.from(new Set(arr.flatMap(j => [j.id_time1, j.id_time2])))
      if (ids.length) {
        const { data: times } = await supabase.from('times').select('id, nome, logo_url').in('id', ids)
        const map: Record<string, TimeRow> = {}
        ;(times || []).forEach(t => { map[t.id] = { id: t.id, nome: t.nome, logo_url: t.logo_url ?? null } })
        setTimesMap(map)
      } else {
        setTimesMap({})
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar Oitavas')
    } finally {
      setLoading(false)
    }
  }

  /* ================== SORTEIO (Pote A 1–8 liga | Pote B vencedores playoff) ================== */
  async function abrirSorteio() {
    if (!isAdmin) return
    const { count, error } = await supabase.from('copa_oitavas').select('*', { head: true, count: 'exact' })
    if (error) { toast.error('Erro ao checar confrontos'); return }
    if ((count ?? 0) > 0) { toast.error('Apague os confrontos antes de sortear.'); return }

    try {
      const poteA = await pegarTop8FaseLiga()
      const poteBWinners = await pegarVencedoresPlayoff()

      if (poteA.length !== 8) { toast.error('Preciso do top 8 da fase liga.'); return }
      if (poteBWinners.length !== 8) { toast.error('Preciso dos 8 vencedores do playoff.'); return }

      setSorteioAberto(true)
      setSorteioAtivo(true)
      setFilaA([...poteA])       // Pote A: mantém ordem do ranking (ou embaralhe se quiser)
      setFilaB(shuffle(poteBWinners)) // Pote B: embaralha
      setParAtual({ A: null, B: null })
      setPares([])
      setFlipA(false); setFlipB(false)

      broadcast({
        sorteioAtivo: true,
        filaA: [...poteA],
        filaB: shuffle(poteBWinners),
        pares: [],
        parAtual: {A:null, B:null},
        flipA: false, flipB: false,
      })
    } catch (e) {
      console.error(e)
      toast.error('Falha ao montar os potes.')
    }
  }

  async function apagarSorteio() {
    if (!isAdmin) return
    const temPlacar = jogos.some(j => j.gols_time1 != null || j.gols_time2 != null || (supportsVolta && (((j as any).gols_time1_volta ?? null) != null || ((j as any).gols_time2_volta ?? null) != null)))
    const msg = (temPlacar ? '⚠️ Existem jogos com placar lançado.\n\n' : '') + 'Tem certeza que deseja APAGAR todos os confrontos das Oitavas?'
    if (!confirm(msg)) return

    const { error } = await supabase.from('copa_oitavas').delete().gte('ordem', 0)
    if (error) { toast.error('Erro ao apagar confrontos'); return }
    toast.success('Confrontos apagados!')
    setSorteioAberto(false); setSorteioAtivo(false)
    setFilaA([]); setFilaB([]); setPares([])
    setParAtual({A:null, B:null}); setFlipA(false); setFlipB(false)
    broadcast({ sorteioAberto: false, sorteioAtivo: false, filaA: [], filaB: [], pares: [], parAtual:{A:null,B:null}, flipA:false, flipB:false })
    await buscarJogosELogos()
  }

  function sortearA() {
    if (!isAdmin) return
    if (parAtual.A || filaA.length === 0) return
    const idx = Math.floor(Math.random() * filaA.length)
    const escolhido = filaA[idx]
    const nova = [...filaA]; nova.splice(idx, 1)
    setFilaA(nova); setParAtual(prev => ({ ...prev, A: escolhido })); setFlipA(true)
    broadcast({ filaA: nova, parAtual: { ...stateRef.current.parAtual, A: escolhido }, flipA: true })
  }

  function sortearB() {
    if (!isAdmin) return
    if (!parAtual.A || parAtual.B || filaB.length === 0) return
    const idx = Math.floor(Math.random() * filaB.length)
    const escolhido = filaB[idx]
    const nova = [...filaB]; nova.splice(idx, 1)
    setFilaB(nova); setParAtual(prev => ({ ...prev, B: escolhido })); setFlipB(true)
    broadcast({ filaB: nova, parAtual: { ...stateRef.current.parAtual, B: escolhido }, flipB: true })
  }

  function confirmarPar() {
    if (!isAdmin) return
    if (!parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A, parAtual.B] as [TimeRow, TimeRow]]
    setPares(novos); setParAtual({ A:null, B:null }); setFlipA(false); setFlipB(false)
    const terminou = novos.length === 8
    setSorteioAtivo(!terminou)
    broadcast({
      pares: novos,
      parAtual: { A:null, B:null },
      flipA: false, flipB: false,
      sorteioAtivo: !terminou
    })
  }

  async function gravarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) { toast.error('Finalize os 8 confrontos.'); return }

    try {
      setConfirming(true)
      await supabase.from('copa_oitavas').delete().gte('ordem', 0).throwOnError()

      const base = pares.map(([A,B], i) => ({
        rodada: 1,
        ordem: i + 1,
        id_time1: toDBId(A.id),
        id_time2: toDBId(B.id),
        time1: A.nome, time2: B.nome,
        gols_time1: null, gols_time2: null,
      }))

      // tenta com *_volta
      const ins1 = await supabase.from('copa_oitavas')
        .insert(base.map(p => ({ ...p, gols_time1_volta: null, gols_time2_volta: null })))
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      if (ins1.error && mentionsVolta(ins1.error.message)) {
        const ins2 = await supabase.from('copa_oitavas').insert(base).select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        if (ins2.error) throw ins2.error
        setSupportsVolta(false)
        setJogos((ins2.data || []) as JogoOitavas[])
      } else if (ins1.error) {
        throw ins1.error
      } else {
        setSupportsVolta(true)
        setJogos((ins1.data || []) as JogoOitavas[])
      }

      toast.success('Oitavas gravadas!')
      setSorteioAberto(false)
      broadcast({ sorteioAberto: false })
      await buscarJogosELogos()
    } catch (e:any) {
      console.error(e)
      toast.error('Erro ao gravar confrontos')
    } finally {
      setConfirming(false)
    }
  }

  /* ================== SALVAR PLACAR (+ premiações) ================== */
  async function salvarPlacar(jogo: JogoOitavas) {
    if (!isAdmin) return

    const cols = supportsVolta
      ? 'gols_time1,gols_time2,gols_time1_volta,gols_time2_volta'
      : 'gols_time1,gols_time2'
    const { data: beforeRaw, error: readErr } = await supabase
      .from('copa_oitavas')
      .select(cols)
      .eq('id', jogo.id)
      .maybeSingle()
    if (readErr) { toast.error('Erro ao ler placar anterior'); return }

    const before: unknown = beforeRaw
    const update: any = { gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 }
    if (supportsVolta) {
      update.gols_time1_volta = (jogo as any).gols_time1_volta ?? null
      update.gols_time2_volta = (jogo as any).gols_time2_volta ?? null
    }

    const { error: upErr } = await supabase.from('copa_oitavas').update(update).eq('id', jogo.id)
    if (upErr) { toast.error('Erro ao salvar'); return }

    try {
      const BID_TIPO = 'Premiação fase oitavas'
      // Vitória IDA (primeira vez definido)
      const idaAntesDef = hasGolsIda(before) && before.gols_time1 != null && before.gols_time2 != null
      const idaAgoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
      if (!idaAntesDef && idaAgoraDef && jogo.gols_time1 !== jogo.gols_time2) {
        const vencedorId = (jogo.gols_time1 ?? 0) > (jogo.gols_time2 ?? 0) ? jogo.id_time1 : jogo.id_time2
        await supabase.rpc('atualizar_saldo', { id_time: vencedorId, valor: PREMIO_VITORIA })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Vitória (ida): ${jogo.time1} ${jogo.gols_time1 ?? 0} x ${jogo.gols_time2 ?? 0} ${jogo.time2}`,
          valor: PREMIO_VITORIA,
          id_time: vencedorId
        })
      }
      // Vitória VOLTA (primeira vez definido)
      if (supportsVolta) {
        const volAntesDef = hasGolsVolta(before) &&
          (before.gols_time1_volta ?? null) != null &&
          (before.gols_time2_volta ?? null) != null
        const g1v = (jogo as any).gols_time1_volta as number | null
        const g2v = (jogo as any).gols_time2_volta as number | null
        const volAgoraDef = g1v != null && g2v != null
        if (!volAntesDef && volAgoraDef && g1v !== g2v) {
          const vencedorId = (g1v ?? 0) > (g2v ?? 0) ? jogo.id_time1 : jogo.id_time2
          await supabase.rpc('atualizar_saldo', { id_time: vencedorId, valor: PREMIO_VITORIA })
          await supabase.from('bid').insert({
            tipo_evento: BID_TIPO,
            descricao: `Vitória (volta): ${jogo.time2} ${g2v ?? 0} x ${g1v ?? 0} ${jogo.time1}`,
            valor: PREMIO_VITORIA,
            id_time: vencedorId
          })
        }
      }

      // bônus por GOLS — pagar apenas o DELTA total (ida+volta)
      const beforeIda1 = hasGolsIda(before) ? (before.gols_time1 ?? 0) : 0
      const beforeIda2 = hasGolsIda(before) ? (before.gols_time2 ?? 0) : 0
      const beforeVol1 = supportsVolta && hasGolsVolta(before) ? (before.gols_time1_volta ?? 0) : 0
      const beforeVol2 = supportsVolta && hasGolsVolta(before) ? (before.gols_time2_volta ?? 0) : 0

      const nowIda1 = (jogo.gols_time1 ?? 0)
      const nowIda2 = (jogo.gols_time2 ?? 0)
      const nowVol1 = supportsVolta ? (((jogo as any).gols_time1_volta ?? 0)) : 0
      const nowVol2 = supportsVolta ? (((jogo as any).gols_time2_volta ?? 0)) : 0

      const prevTotal1 = beforeIda1 + beforeVol1
      const prevTotal2 = beforeIda2 + beforeVol2
      const newTotal1  = nowIda1 + nowVol1
      const newTotal2  = nowIda2 + nowVol2

      const delta1 = Math.max(0, newTotal1 - prevTotal1)
      const delta2 = Math.max(0, newTotal2 - prevTotal2)

      if (delta1 > 0) {
        const valor = delta1 * PREMIO_POR_GOL
        await supabase.rpc('atualizar_saldo', { id_time: jogo.id_time1, valor })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Gols marcados (${delta1}) — ${jogo.time1}`,
          valor,
          id_time: jogo.id_time1
        })
      }
      if (delta2 > 0) {
        const valor = delta2 * PREMIO_POR_GOL
        await supabase.rpc('atualizar_saldo', { id_time: jogo.id_time2, valor })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Gols marcados (${delta2}) — ${jogo.time2}`,
          valor,
          id_time: jogo.id_time2
        })
      }
    } catch (e) {
      console.error(e)
    }

    toast.success('Placar salvo! Premiação aplicada.')
    setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, ...update } : j))
  }

  /* ================== DERIVADOS ================== */
  const totalJogos = 8
  const jogosComAgregado = useMemo(() => {
    return jogos.filter(j =>
      j.gols_time1 != null &&
      j.gols_time2 != null &&
      (!supportsVolta || ((j as any).gols_time1_volta != null && (j as any).gols_time2_volta != null))
    ).length
  }, [jogos, supportsVolta])
  const pendentes = totalJogos - Math.min(totalJogos, jogosComAgregado)

  /* ================== RENDER ================== */
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-100px,rgba(34,197,94,.15),transparent),linear-gradient(180deg,#0a0a0b,70%,#000)] text-white">
      {/* HEADER (igual vibe do playoff) */}
      <div className="sticky top-0 z-40 backdrop-blur-md bg-black/50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent drop-shadow">
                  Oitavas — Champions
                </span>
              </h1>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                <Badge tone="emerald">Premiação vitória: R$ 25M</Badge>
                <Badge tone="sky">Por gol: R$ 650k</Badge>
                <Badge>{supportsVolta ? 'Ida e volta' : 'Jogo único'}</Badge>
              </div>
            </div>

            {!loadingAdmin && isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={apagarSorteio} className="btn ghost danger" title="Remove todos os confrontos das Oitavas">
                  🗑️ Apagar confrontos
                </button>
                <button
                  onClick={abrirSorteio}
                  disabled={jogos.length > 0}
                  title={jogos.length > 0 ? 'Apague os confrontos antes de sortear' : 'Abrir sala de sorteio (potes)'}
                  className={`btn primary ${jogos.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  🎥 Abrir sorteio (potes)
                </button>
              </div>
            )}
          </div>

          {/* métricas */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Stat label="Confrontos" value={String(jogos.length || 0)} />
            <Stat label="Com agregado lançado" value={String(jogosComAgregado)} />
            <Stat label="Pendentes" value={String(Math.max(0, pendentes))} />
          </div>

          {/* tabs (apenas para visualizar ida/volta nos cards) */}
          {supportsVolta && (
            <div className="mt-3 inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
              <TabButton active={activeTab === 'ida'} onClick={() => setActiveTab('ida')}>Ida</TabButton>
              <TabButton active={activeTab === 'volta'} onClick={() => setActiveTab('volta')}>Volta</TabButton>
            </div>
          )}
        </div>
      </div>

      {/* BODY: cards dos jogos */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <SkeletonList />
        ) : (
          <>
            {jogos.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {jogos.map((jogo, idx) => (
                  <MatchCard
                    key={jogo.id}
                    j={jogo}
                    supportsVolta={supportsVolta}
                    timesMap={timesMap}
                    activeTab={activeTab}
                    onChange={(g1, g2, g1v, g2v) => {
                      setJogos(prev => prev.map(x => x.id === jogo.id
                        ? { ...x, gols_time1: g1, gols_time2: g2,
                            ...(supportsVolta ? { gols_time1_volta: g1v, gols_time2_volta: g2v } : {}) }
                        : x))
                    }}
                    onSave={() => salvarPlacar(jogo)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL SORTEIO — flip cards como no playoff, mas com Pote A/B */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-white/10 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-emerald-300">🎥 Sorteio — Oitavas (Potes)</h3>
              {isAdmin && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setSorteioAberto(false)
                    channelRef.current?.send({
                      type:'broadcast', event:'state',
                      payload:{ ...stateRef.current, sorteioAberto:false }
                    })
                  }}
                >
                  Fechar
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-5 text-sm">
              <div className={`${sorteioAtivo ? 'text-emerald-400' : 'text-zinc-400'} font-medium`}>
                {sorteioAtivo ? 'Sorteio em andamento' : (pares.length === 8 ? 'Pronto para gravar confrontos' : 'Aguardando')}
              </div>
              <div className="text-zinc-400">Restantes A: {filaA.length} • Restantes B: {filaB.length}</div>
            </div>

            <div className="grid grid-cols-3 items-center gap-2 mb-6">
              <FlipCard flipped={flipA} time={parAtual.A} />
              <div className="text-center text-zinc-400 font-semibold">x</div>
              <FlipCard flipped={flipB} time={parAtual.B} />
            </div>

            {!loadingAdmin && isAdmin && (
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  className={`btn ${!parAtual.A && filaA.length > 0 ? 'primary' : 'disabled'}`}
                  onClick={sortearA} disabled={!!parAtual.A || filaA.length === 0}
                >
                  🎲 Sortear Pote A
                </button>
                <button
                  className={`btn ${parAtual.A && !parAtual.B && filaB.length > 0 ? 'indigo' : 'disabled'}`}
                  onClick={sortearB} disabled={!parAtual.A || !!parAtual.B || filaB.length === 0}
                >
                  🎲 Sortear Pote B
                </button>
                <button
                  className={`btn ${parAtual.A && parAtual.B ? 'success' : 'disabled'}`}
                  onClick={confirmarPar} disabled={!parAtual.A || !parAtual.B}
                >
                  ✅ Confirmar confronto
                </button>
                <button
                  className={`btn ${pares.length === 8 && !confirming ? 'success' : 'disabled'} ml-auto`}
                  disabled={pares.length !== 8 || confirming}
                  onClick={gravarConfrontos}
                >
                  {confirming ? 'Gravando…' : '✅ Gravar confrontos'}
                </button>
              </div>
            )}

            <div className="space-y-2">
              {pares.map(([a,b], i) => (
                <div key={a.id + b.id + i} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Escudo url={a.logo_url} alt={a.nome} />
                      <span className="font-medium">{a.nome}</span>
                    </div>
                    <span className="text-zinc-400">x</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.nome}</span>
                      <Escudo url={b.logo_url} alt={b.nome} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* STYLES HELPERS (mesmos do playoff) */}
      <style jsx global>{`
        .btn {
          @apply inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition border border-white/10 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-400/40;
        }
        .btn.primary { @apply bg-emerald-600 hover:bg-emerald-500 border-transparent; }
        .btn.indigo { @apply bg-indigo-600 hover:bg-indigo-500 border-transparent; }
        .btn.success { @apply bg-emerald-600 hover:bg-emerald-500 border-transparent; }
        .btn.ghost { @apply bg-white/5 hover:bg-white/10; }
        .btn.danger { @apply text-red-200 border-red-500/30 hover:bg-red-500/10; }
        .btn.disabled { @apply opacity-50 cursor-not-allowed; }
      `}</style>
    </div>
  )
}

/* ================== SUBCOMPONENTES ================== */
function Badge({ tone = 'zinc', children }: { tone?: 'zinc'|'emerald'|'sky'|'violet'; children: React.ReactNode }) {
  const cls =
    {
      zinc: 'bg-white/5 text-zinc-200 border-white/10',
      emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
      violet: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
    }[tone] || 'bg-white/5 text-zinc-200 border-white/10'
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${cls}`}>{children}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-white/70 text-xs">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  )
}

function TabButton({ active, onClick, children }:{ active:boolean; onClick:()=>void; children:React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition
        ${active ? 'bg-emerald-600 text-white shadow border border-emerald-400/40' : 'text-zinc-300 hover:text-white border border-white/10 bg-white/5'}
      `}
    >
      {children}
    </button>
  )
}

function SkeletonList() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-36 rounded-xl bg-white/5 border border-white/10 animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
      <div className="text-2xl">🤷‍♂️</div>
      <div className="mt-2 font-semibold">Nada por aqui…</div>
      <div className="text-sm text-zinc-400">Quando os confrontos forem criados, eles aparecem aqui.</div>
    </div>
  )
}

function Escudo({ url, alt, size=40 }: { url?: string|null; alt: string; size?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center shadow-inner"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] text-zinc-200 px-1">{alt.slice(0,3).toUpperCase()}</span>
      )}
    </div>
  )
}

function ScoreInput({
  value, onChange, disabled
}: { value: number | null; onChange: (v: number|null) => void; disabled?: boolean }) {
  const clamp = (n:number) => {
    if (n < 0) return 0
    if (n > 99) return 99
    return Math.floor(n)
  }
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-1 shadow-inner">
      <button
        className="p-1 rounded-full hover:bg-white/10 disabled:opacity-40"
        onClick={() => onChange(value == null ? 0 : clamp((value ?? 0) - 1))}
        disabled={disabled}
        aria-label="Diminuir"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        className="w-14 text-center bg-transparent outline-none font-extrabold tracking-wider"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') return onChange(null)
          const parsed = parseInt(v, 10)
          onChange(Number.isNaN(parsed) ? null : clamp(parsed))
        }}
        disabled={disabled}
      />
      <button
        className="p-1 rounded-full hover:bg-white/10 disabled:opacity-40"
        onClick={() => onChange(clamp((value ?? 0) + 1))}
        disabled={disabled}
        aria-label="Aumentar"
      >
        +
      </button>
    </div>
  )
}

function MatchCard({
  j, supportsVolta, timesMap, activeTab, onChange, onSave
}: {
  j: JogoOitavas
  supportsVolta: boolean
  timesMap: Record<string, TimeRow>
  activeTab: 'ida' | 'volta'
  onChange: (g1: number|null, g2: number|null, g1v?: number|null, g2v?: number|null) => void
  onSave: () => void
}) {
  const n1 = timesMap[j.id_time1]?.nome || j.time1
  const n2 = timesMap[j.id_time2]?.nome || j.time2

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-black/70 p-4 shadow hover:shadow-lg hover:border-white/20 transition">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-3">
        <span className="inline-flex items-center gap-2">
          <Badge tone="emerald">Oitavas</Badge>
          <span>Ordem #{j.ordem ?? '-'}</span>
        </span>
        <span className="text-zinc-500">ID {String(j.id ?? '—')}</span>
      </div>

      {/* Linha */}
      <div className="flex items-center gap-3">
        <Escudo url={timesMap[j.id_time1]?.logo_url} alt={n1} />
        <div className="flex-1">
          <div className="font-semibold">{n1}</div>
          <div className="text-[11px] text-zinc-400">{activeTab === 'ida' ? 'Mandante' : 'Visitante'}</div>
        </div>

        <div className="flex items-center gap-3">
          <ScoreInput
            value={activeTab === 'ida' ? j.gols_time1 : (supportsVolta ? (j.gols_time2_volta ?? null) : j.gols_time1)}
            onChange={(v) => onChange(
              activeTab === 'ida' ? v : j.gols_time1,
              activeTab === 'ida' ? j.gols_time2 : j.gols_time2,
              activeTab === 'volta' ? (j.gols_time1_volta ?? null) : (j.gols_time1_volta ?? null),
              activeTab === 'volta' ? v : (j.gols_time2_volta ?? null)
            )}
            disabled={false}
          />
          <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
          <ScoreInput
            value={activeTab === 'ida' ? j.gols_time2 : (supportsVolta ? (j.gols_time1_volta ?? null) : j.gols_time2)}
            onChange={(v) => onChange(
              activeTab === 'ida' ? j.gols_time1 : j.gols_time1,
              activeTab === 'ida' ? v : j.gols_time2,
              activeTab === 'volta' ? v : (j.gols_time1_volta ?? null),
              activeTab === 'volta' ? (j.gols_time2_volta ?? null) : (j.gols_time2_volta ?? null)
            )}
            disabled={false}
          />
        </div>

        <div className="flex-1 text-right">
          <div className="font-semibold">{n2}</div>
          <div className="text-[11px] text-zinc-400">{activeTab === 'ida' ? 'Visitante' : 'Mandante'}</div>
        </div>
        <Escudo url={timesMap[j.id_time2]?.logo_url} alt={n2} />
      </div>

      {/* Agregado (mini) */}
      <div className="mt-2 text-[12px] text-zinc-400">
        Agregado: {(j.gols_time1 ?? 0) + (supportsVolta ? (j.gols_time1_volta ?? 0) : 0)} – {(j.gols_time2 ?? 0) + (supportsVolta ? (j.gols_time2_volta ?? 0) : 0)}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button className="btn success" onClick={onSave}>💾 Salvar placar</button>
      </div>
    </article>
  )
}

/* ====== Flip card (sorteio) ====== */
function FlipCard({ flipped, time }: { flipped: boolean; time: TimeRow | null }) {
  return (
    <div className="relative w-full h-28 perspective">
      <style jsx>{`
        .perspective { perspective: 1000px; }
        .flip-inner {
          position: relative;
          width: 100%;
          height: 100%;
          transition: transform 0.6s;
          transform-style: preserve-3d;
        }
        .flipped { transform: rotateY(180deg); }
        .flip-face {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,.12);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(24,24,27,.7);
        }
        .flip-back { transform: rotateY(180deg); }
      `}</style>

      <div className={`flip-inner ${flipped ? 'flipped' : ''}`}>
        <div className="flip-face">
          <span className="text-zinc-400">?</span>
        </div>
        <div className="flip-face flip-back px-3">
          {time ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                {time.logo_url
                  ? <img src={time.logo_url} alt={time.nome} className="w-full h-full object-cover" />
                  : <span className="text-xs text-zinc-300">{time.nome.slice(0,3).toUpperCase()}</span>}
              </div>
              <div className="font-medium">{time.nome}</div>
            </div>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
