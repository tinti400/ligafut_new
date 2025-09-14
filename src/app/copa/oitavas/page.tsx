'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

/* ================== SUPABASE ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ================== REGRAS DE PREMIAÇÃO ================== */
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
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

/* ================== UTILS (classificação) ================== */
const TIMES_EXCLUIDOS = ['palmeiras', 'sociedade esportiva palmeiras']
const norm = (s?: string | null) => (s || '').toLowerCase().trim()
function ehExcluido(mapa: Record<string, { nome: string }>, idOuNome?: string | null) {
  if (!idOuNome) return false
  if ((mapa as any)[idOuNome]) return TIMES_EXCLUIDOS.includes(norm((mapa as any)[idOuNome].nome))
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

/* ================== FINANCEIRO (saldo + BID + painel) ================== */
async function creditarSaldo(id_time: string, valor: number): Promise<boolean> {
  if (!valor) return true
  const { error: e1 } = await supabase.rpc('atualizar_saldo', { id_time, valor })
  if (!e1) return true
  const { error: e2 } = await supabase.rpc('incrementar_saldo', { p_id_time: id_time, p_valor: valor })
  if (!e2) return true
  console.error('Falha ao creditar saldo', { id_time, valor, e1, e2 })
  return false
}
async function registrarNoBID(id_time: string, descricao: string, valor: number) {
  try {
    await supabase.from('bid').insert({
      tipo_evento: 'premiacao_copa',
      descricao,
      id_time1: id_time, // compatível com teu painel/BID
      valor,
      data_evento: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Falha ao registrar no BID', e)
  }
}
async function registrarNoPainelFinanceiro(id_time: string, descricao: string, valor: number) {
  const now = new Date().toISOString()
  const candidatos = [
    { table: 'financeiro', payload: { id_time1: id_time, descricao, valor, tipo: 'Crédito', origem: 'oitavas', data_evento: now } },
    { table: 'painel_financeiro', payload: { id_time1: id_time, descricao, valor, tipo: 'Crédito', origem: 'oitavas', data_evento: now } },
    { table: 'financeiro_mov', payload: { id_time1: id_time, descricao, valor, tipo: 'Crédito', data_evento: now } },
  ] as const
  for (const cand of candidatos) {
    // @ts-expect-error payload dinâmico
    const { error } = await supabase.from(cand.table).insert(cand.payload)
    if (!error) return true
  }
  console.warn('⚠️ Ajuste o nome/colunas da tabela do painel financeiro no helper registrarNoPainelFinanceiro.')
  return false
}
async function pagarPremio(id_time: string, descricao: string, valor: number) {
  if (!valor) return
  const okSaldo = await creditarSaldo(id_time, valor)
  await registrarNoBID(id_time, descricao, valor)
  await registrarNoPainelFinanceiro(id_time, descricao, valor)
  if (!okSaldo) toast.error(`⚠️ Falha ao atualizar saldo: ${descricao}`)
}

/* ================== CLASSIFICAÇÃO FASE LIGA (Top 1–8) ================== */
type JogoLiga = {
  id?: string | number
  id_time1?: string | null
  id_time2?: string | null
  time1?: string | null
  time2?: string | null
  gols_time1: number | null
  gols_time2: number | null
}
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

function resolverIdDoTime(
  j: JogoLiga,
  lado: 1 | 2,
  mapa: Record<string, { id: string; nome: string }>
) {
  const direto = lado === 1 ? j.id_time1 : j.id_time2
  if (direto && mapa[direto]) return direto
  const raw = lado === 1 ? j.time1 : j.time2
  if (!raw) return null
  if (mapa[raw]) return raw
  const alvo = norm(raw)
  for (const [id, info] of Object.entries(mapa)) {
    if (norm(info.nome) === alvo) return id
  }
  return null
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

  for (const j of jogos) {
    if (j.gols_time1 == null || j.gols_time2 == null) continue
    const id1 = resolverIdDoTime(j, 1, mapaTimes as any)
    const id2 = resolverIdDoTime(j, 2, mapaTimes as any)
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

/* ================== VENCEDORES DO PLAYOFF (Pote B) ================== */
type JogoPlayoff = {
  id?: string | number
  rodada: 1 | 2
  id_time1: string
  id_time2: string
  time1?: string | null
  time2?: string | null
  gols_time1: number | null
  gols_time2: number | null
}
async function pegarVencedoresPlayoff(): Promise<TimeRow[]> {
  const { data, error } = await supabase
    .from('copa_playoff')
    .select('*')
    .order('rodada', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error

  const jogos = (Array.isArray(data) ? data : []) as JogoPlayoff[]
  // agrupar por par usando chave independente de mando
  const grupos = new Map<string, JogoPlayoff[]>()
  for (const j of jogos) {
    const key = [j.id_time1, j.id_time2].sort().join('-')
    const prev = grupos.get(key) || []
    prev.push(j)
    grupos.set(key, prev)
  }

  const winners: string[] = []
  for (const [_, arr] of grupos) {
    // considerar apenas pares com as duas pernas definidas
    const definidas = arr.filter(x => x.gols_time1 != null && x.gols_time2 != null)
    if (definidas.length < 2) continue
    // somar agregados por id_time
    const ids = new Set<string>(arr.flatMap(x => [x.id_time1, x.id_time2]))
    const tot: Record<string, number> = {}
    for (const id of ids) tot[id] = 0
    for (const x of arr) {
      if (x.gols_time1 == null || x.gols_time2 == null) continue
      tot[x.id_time1] += x.gols_time1
      tot[x.id_time2] += x.gols_time2
    }
    // empates: favorece o time1 da IDA (rodada 1) se existir
    const ida = arr.find(x => x.rodada === 1)
    const a = ida?.id_time1!, b = ida?.id_time2!
    const ta = tot[a] ?? 0, tb = tot[b] ?? 0
    winners.push(ta >= tb ? a : b)
  }

  if (winners.length !== 8) {
    throw new Error(`Esperava 8 vencedores do playoff, obtive ${winners.length}.`)
  }

  const { data: times, error: tErr } = await supabase
    .from('times')
    .select('id, nome, logo_url')
    .in('id', winners)
  if (tErr) throw tErr

  const map = new Map<string, TimeRow>()
  for (const t of (times || []) as any[]) {
    map.set(t.id, { id: t.id, nome: t.nome, logo_url: t.logo_url ?? null })
  }
  return winners.map(id => map.get(id)!).filter(Boolean)
}

/* ================== COMPONENTE ================== */
export default function OitavasPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  // dados
  const [jogos, setJogos] = useState<JogoOitavas[]>([])
  const [loading, setLoading] = useState(true)
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})

  // UI (layout igual playoff)
  const [activeTab, setActiveTab] = useState<'todos' | 'ida' | 'volta'>('todos')
  const totalJogos = jogos.length
  const comPlacar = jogos.filter(j => j.gols_time1 != null && j.gols_time2 != null &&
    (!supportsVolta || ((j as any).gols_time1_volta != null && (j as any).gols_time2_volta != null))
  ).length
  const pendentes = totalJogos - comPlacar

  // sorteio ao vivo (potes)
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [filaA, setFilaA] = useState<TimeRow[]>([])
  const [filaB, setFilaB] = useState<TimeRow[]>([])
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [flipA, setFlipA] = useState(false)
  const [flipB, setFlipB] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // realtime
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef({ sorteioAberto, filaA, filaB, pares, parAtual, flipA, flipB })
  useEffect(() => { stateRef.current = { sorteioAberto, filaA, filaB, pares, parAtual, flipA, flipB } },
    [sorteioAberto, filaA, filaB, pares, parAtual, flipA, flipB])

  useEffect(() => {
    carregarJogosELogos()

    // evita eco (self:false) para não sobrescrever estado depois do clique
    const ch = supabase.channel('oitavas-sorteio', { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
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
    channelRef.current?.send({
      type: 'broadcast',
      event: 'state',
      payload: { ...stateRef.current, ...partial }
    })
  }

  /* ================== CARREGAR JOGOS + LOGOS ================== */
  async function carregarJogosELogos() {
    try {
      setLoading(true)
      // tenta com colunas de volta
      let req = await supabase
        .from('copa_oitavas')
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
        .order('ordem', { ascending: true })
      if (req.error && mentionsVolta(req.error.message)) {
        setSupportsVolta(false)
        req = await supabase
          .from('copa_oitavas')
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
          .order('ordem', { ascending: true })
      }
      if (req.error) throw req.error

      const arr = Array.isArray(req.data) ? (req.data as unknown as JogoOitavas[]) : []
      setJogos(arr)

      const ids = Array.from(new Set(arr.flatMap(j => [j.id_time1, j.id_time2]).filter(Boolean)))
      if (ids.length) {
        const { data: timesData, error: tErr } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', ids)
        if (tErr) throw tErr
        const mapa: Record<string, TimeRow> = {}
        for (const t of (timesData || []) as any[]) mapa[t.id] = { id: t.id, nome: t.nome, logo_url: t.logo_url ?? null }
        setTimesMap(mapa)
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

  /* ================== SORTEIO: ABRIR (Pote A=Top1–8 liga, Pote B=vencedores playoff) ================== */
  async function abrirSorteio() {
    if (!isAdmin) return
    const { count, error: cErr } = await supabase
      .from('copa_oitavas')
      .select('*', { count: 'exact', head: true })
    if (cErr) { toast.error('Erro ao checar confrontos'); return }
    if ((count ?? 0) > 0) {
      toast.error('Apague os confrontos antes de sortear.')
      return
    }
    try {
      const poteA = await pegarTop8FaseLiga()
      const poteB = await pegarVencedoresPlayoff()
      if (poteA.length !== 8 || poteB.length !== 8) {
        toast.error('Precisamos de 8 times no Pote A e 8 vencedores no Pote B.')
        return
      }
      setSorteioAberto(true)
      setFilaA([...poteA])
      setFilaB(shuffle([...poteB]))
      setPares([])
      setParAtual({ A:null, B:null })
      setFlipA(false); setFlipB(false)
      broadcast({
        sorteioAberto: true,
        filaA: poteA,
        filaB: poteB,
        pares: [],
        parAtual: {A:null, B:null},
        flipA: false, flipB: false
      })
    } catch (e: any) {
      console.error(e)
      toast.error('Falha ao montar potes (liga + playoff).')
    }
  }

  async function apagarConfrontos() {
    if (!isAdmin) return
    const temPlacar = jogos.some(j => j.gols_time1 != null || j.gols_time2 != null || (supportsVolta && (((j as any).gols_time1_volta ?? null) != null || ((j as any).gols_time2_volta ?? null) != null)))
    const msg = (temPlacar ? '⚠️ Existem jogos com placar lançado.\n\n' : '') + 'Tem certeza que deseja APAGAR todos os confrontos das Oitavas?'
    if (!confirm(msg)) return

    const { error } = await supabase.from('copa_oitavas').delete().gte('ordem', 0)
    if (error) {
      toast.error('Erro ao apagar confrontos')
      return
    }
    toast.success('Confrontos apagados!')
    await carregarJogosELogos()
  }

  /* ================== CONTROLES DO SORTEIO ================== */
  function sortearTimeA() {
    if (!isAdmin) return
    if (parAtual.A) return
    if (filaA.length === 0) return
    const idx = Math.floor(Math.random() * filaA.length)
    const escolhido = filaA[idx]
    const nova = [...filaA]
    nova.splice(idx, 1)
    setFilaA(nova); setParAtual({ A: escolhido, B: parAtual.B }); setFlipA(true)
    broadcast({ filaA: nova, parAtual: { A: escolhido, B: parAtual.B }, flipA: true })
  }
  function sortearTimeB() {
    if (!isAdmin) return
    if (!parAtual.A || parAtual.B || filaB.length === 0) return
    const escolhido = filaB[0]
    const nova = filaB.slice(1)
    setFilaB(nova); setParAtual({ A: parAtual.A, B: escolhido }); setFlipB(true)
    broadcast({ filaB: nova, parAtual: { A: parAtual.A, B: escolhido }, flipB: true })
  }
  function confirmarPar() {
    if (!isAdmin) return
    if (!parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A, parAtual.B] as [TimeRow, TimeRow]]
    setPares(novos); setParAtual({ A:null, B:null }); setFlipA(false); setFlipB(false)
    broadcast({ pares: novos, parAtual: {A:null, B:null}, flipA:false, flipB:false })
  }

  async function gravarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) { toast.error('Finalize os 8 confrontos.'); return }
    try {
      setConfirming(true)
      await supabase.from('copa_oitavas').delete().gte('ordem', 0).throwOnError()

      const base = pares.map(([A,B], idx) => ({
        rodada: 1,
        ordem: idx + 1,
        id_time1: toDBId(A.id),
        id_time2: toDBId(B.id),
        time1: A.nome,
        time2: B.nome,
        gols_time1: null,
        gols_time2: null,
      }))

      const ins1 = await supabase.from('copa_oitavas')
        .insert(base.map(p => ({ ...p, gols_time1_volta: null, gols_time2_volta: null })))
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')

      if (ins1.error && mentionsVolta(ins1.error.message)) {
        const ins2 = await supabase.from('copa_oitavas')
          .insert(base)
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        if (ins2.error) throw ins2.error
        setSupportsVolta(false)
        setJogos(Array.isArray(ins2.data) ? (ins2.data as unknown as JogoOitavas[]) : [])
      } else if (ins1.error) {
        throw ins1.error
      } else {
        setSupportsVolta(true)
        setJogos(Array.isArray(ins1.data) ? (ins1.data as unknown as JogoOitavas[]) : [])
      }

      toast.success('Oitavas sorteadas e gravadas!')
      setSorteioAberto(false)
      broadcast({ sorteioAberto: false })
      await carregarJogosELogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao gravar confrontos: ${e?.message || e}`)
    } finally {
      setConfirming(false)
    }
  }

  /* ================== SALVAR PLACAR (+ premiações & BID) ================== */
  async function salvarPlacar(jogo: JogoOitavas) {
    if (!isAdmin) return
    try {
      // ler estado anterior para pagar delta corretamente
      const cols = supportsVolta
        ? 'gols_time1,gols_time2,gols_time1_volta,gols_time2_volta'
        : 'gols_time1,gols_time2'
      const { data: beforeRaw, error: readErr } = await supabase
        .from('copa_oitavas')
        .select(cols)
        .eq('id', jogo.id)
        .maybeSingle()
      if (readErr) {
        toast.error('Erro ao ler placar anterior')
        return
      }
      const before: any = beforeRaw || {}

      const update: any = {
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
      }
      if (supportsVolta) {
        update.gols_time1_volta = (jogo as any).gols_time1_volta ?? null
        update.gols_time2_volta = (jogo as any).gols_time2_volta ?? null
      }

      const { error: upErr } = await supabase
        .from('copa_oitavas')
        .update(update)
        .eq('id', jogo.id)
      if (upErr) {
        toast.error('Erro ao salvar')
        return
      }

      // === Pagamentos (saldo + BID + painel) ===
      try {
        // Vitória IDA (primeira vez definida)
        const idaAntesDef = before?.gols_time1 != null && before?.gols_time2 != null
        const idaAgoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
        if (!idaAntesDef && idaAgoraDef && jogo.gols_time1 !== jogo.gols_time2) {
          const vencedorId = (jogo.gols_time1! > jogo.gols_time2!) ? jogo.id_time1 : jogo.id_time2
          await pagarPremio(
            vencedorId,
            `Vitória (ida): ${jogo.time1} ${jogo.gols_time1 ?? 0} x ${jogo.gols_time2 ?? 0} ${jogo.time2}`,
            PREMIO_VITORIA
          )
        }

        // Vitória VOLTA (primeira vez definida)
        if (supportsVolta) {
          const volAntesDef = (before?.gols_time1_volta ?? null) != null && (before?.gols_time2_volta ?? null) != null
          const g1v = (jogo as any).gols_time1_volta as number | null
          const g2v = (jogo as any).gols_time2_volta as number | null
          const volAgoraDef = g1v != null && g2v != null

          if (!volAntesDef && volAgoraDef && g1v !== g2v) {
            const vencedorId = (g1v! > g2v!) ? jogo.id_time1 : jogo.id_time2
            await pagarPremio(
              vencedorId,
              `Vitória (volta): ${jogo.time2} ${g2v ?? 0} x ${g1v ?? 0} ${jogo.time1}`,
              PREMIO_VITORIA
            )
          }
        }

        // Gols — paga apenas o DELTA (ida + volta)
        const beforeIda1 = before?.gols_time1 ?? 0
        const beforeIda2 = before?.gols_time2 ?? 0
        const beforeVol1 = supportsVolta ? (before?.gols_time1_volta ?? 0) : 0
        const beforeVol2 = supportsVolta ? (before?.gols_time2_volta ?? 0) : 0

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
          await pagarPremio(jogo.id_time1, `Gols marcados (+${delta1}) — ${jogo.time1}`, delta1 * PREMIO_POR_GOL)
        }
        if (delta2 > 0) {
          await pagarPremio(jogo.id_time2, `Gols marcados (+${delta2}) — ${jogo.time2}`, delta2 * PREMIO_POR_GOL)
        }
      } catch (e) {
        console.error(e)
      }

      toast.success('Placar salvo! Premiação aplicada.')
      setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, ...update } : j))
    } catch (e) {
      console.error(e)
      toast.error('Erro ao salvar placar')
    }
  }

  /* ================== DERIVADOS ================== */
  const podeGravar = useMemo(() => pares.length === 8 && !parAtual.A && !parAtual.B, [pares, parAtual])
  const oitavasCompletas = useMemo(() => {
    if (jogos.length !== 8) return false
    return jogos.every(j =>
      j.gols_time1 !== null && j.gols_time2 !== null &&
      (!supportsVolta || ((j as any).gols_time1_volta !== null && (j as any).gols_time2_volta !== null))
    )
  }, [jogos, supportsVolta])

  /* ================== RENDER ================== */
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_50%_-100px,rgba(34,197,94,.15),transparent),linear-gradient(180deg,#0a0a0b,70%,#000)] text-white">
      {/* HEADER */}
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
                <Badge>Ida e volta</Badge>
              </div>
            </div>

            {!loadingAdmin && isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={apagarConfrontos}
                  className="btn ghost danger"
                  title="Remove todos os confrontos das Oitavas"
                >
                  🗑️ Apagar confrontos
                </button>
                <button
                  onClick={abrirSorteio}
                  className="btn primary"
                  title="Abrir sala de sorteio (Pote A: Top 1–8 Liga, Pote B: vencedores do Playoff)"
                >
                  🎥 Abrir sorteio (1–8 x Playoff)
                </button>
              </div>
            )}
          </div>

          {/* métricas */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Stat label="Confrontos" value={String(totalJogos)} />
            <Stat label="Placar lançado" value={String(comPlacar)} />
            <Stat label="Pendentes" value={String(pendentes)} />
          </div>

          {/* tabs simples (visual) */}
          <div className="mt-3 inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
            <TabButton active={activeTab === 'todos'} onClick={() => setActiveTab('todos')}>Todos</TabButton>
            <TabButton active={activeTab === 'ida'} onClick={() => setActiveTab('ida')}>Somente ida</TabButton>
            <TabButton active={activeTab === 'volta'} onClick={() => setActiveTab('volta')}>Somente volta</TabButton>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <SkeletonList />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {jogos.map((jogo) => (
              <MatchCard
                key={jogo.id}
                j={jogo}
                supportsVolta={supportsVolta}
                timesMap={timesMap}
                activeTab={activeTab}
                onChange={(g1, g2, gv1, gv2) => {
                  setJogos(prev => prev.map(x => x.id === jogo.id
                    ? { ...x, gols_time1: g1, gols_time2: g2, ...(supportsVolta ? { gols_time1_volta: gv1, gols_time2_volta: gv2 } : {}) }
                    : x))
                }}
                onSave={() => salvarPlacar(jogo)}
              />
            ))}
          </div>
        )}

        {/* ações adicionais */}
        {!loadingAdmin && isAdmin && (
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              className={`btn ${oitavasCompletas ? 'indigo' : 'disabled'}`}
              disabled={!oitavasCompletas}
              title={oitavasCompletas ? 'Habilitado' : 'Preencha todos os placares (ida e volta, se houver)'}
              onClick={() => toast('Use o botão das Quartas na página de Quartas 😉')}
            >
              🎲 Sortear Quartas (pote único)
            </button>
          </div>
        )}
      </div>

      {/* MODAL SORTEIO (layout igual playoff) */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-white/10 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-emerald-300">🎥 Sorteio Oitavas — Pote A (Top 1–8 Liga) x Pote B (Vencedores Playoff)</h3>
              {isAdmin && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setSorteioAberto(false)
                    broadcast({ sorteioAberto: false })
                  }}
                >
                  Fechar
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mb-5 text-sm">
              <div className="text-zinc-400 font-medium">
                Restantes: A {filaA.length} • B {filaB.length}
              </div>
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
                  onClick={sortearTimeA}
                  disabled={!!parAtual.A || filaA.length === 0}
                >
                  🎲 Sortear Pote A
                </button>
                <button
                  className={`btn ${parAtual.A && !parAtual.B && filaB.length > 0 ? 'indigo' : 'disabled'}`}
                  onClick={sortearTimeB}
                  disabled={!parAtual.A || !!parAtual.B || filaB.length === 0}
                >
                  🎲 Sortear Pote B
                </button>
                <button
                  className={`btn ${parAtual.A && parAtual.B ? 'success' : 'disabled'}`}
                  onClick={confirmarPar}
                  disabled={!parAtual.A || !parAtual.B}
                >
                  ✅ Confirmar confronto
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

            {isAdmin && (
              <div className="mt-6 flex justify-end gap-2">
                <button
                  className={`btn ${podeGravar && !confirming ? 'success' : 'disabled'}`}
                  disabled={!podeGravar || confirming}
                  onClick={gravarConfrontos}
                >
                  {confirming ? 'Gravando…' : '✅ Gravar confrontos'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STYLES HELPERS (iguais ao playoff) */}
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

/* ================== SUBCOMPONENTES UI (iguais ao playoff) ================== */
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

function TabButton({ active, onClick, children }: { active:boolean; onClick:()=>void; children:React.ReactNode }) {
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

/* ====== Match Card (layout de playoff, mas com ida/volta no mesmo card) ====== */
function MatchCard({
  j, supportsVolta, timesMap, activeTab, onChange, onSave
}: {
  j: JogoOitavas
  supportsVolta: boolean
  timesMap: Record<string, TimeRow>
  activeTab: 'todos' | 'ida' | 'volta'
  onChange: (g1: number|null, g2: number|null, gv1?: number|null, gv2?: number|null) => void
  onSave: () => void
}) {
  const n1 = timesMap[j.id_time1]?.nome || j.time1
  const n2 = timesMap[j.id_time2]?.nome || j.time2
  const [ida1, setIda1] = useState<number | null>(j.gols_time1)
  const [ida2, setIda2] = useState<number | null>(j.gols_time2)
  const [vol1, setVol1] = useState<number | null>(j.gols_time1_volta ?? null)
  const [vol2, setVol2] = useState<number | null>(j.gols_time2_volta ?? null)

  useEffect(() => {
    setIda1(j.gols_time1)
    setIda2(j.gols_time2)
    setVol1(j.gols_time1_volta ?? null)
    setVol2(j.gols_time2_volta ?? null)
  }, [j.id, j.gols_time1, j.gols_time2, j.gols_time1_volta, j.gols_time2_volta])

  useEffect(() => {
    onChange(ida1, ida2, vol1, vol2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ida1, ida2, vol1, vol2])

  const showIda = activeTab !== 'volta'
  const showVolta = supportsVolta && activeTab !== 'ida'

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-black/70 p-4 shadow hover:shadow-lg hover:border-white/20 transition">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-3">
        <span className="inline-flex items-center gap-2">
          <Badge tone="emerald">Oitavas</Badge>
          <span>Ordem #{j.ordem ?? '—'}</span>
        </span>
        <span className="text-zinc-500">ID {String(j.id ?? '—')}</span>
      </div>

      {/* IDA */}
      {showIda && (
        <>
          <div className="flex items-center gap-3">
            <Escudo url={timesMap[j.id_time1]?.logo_url} alt={n1} />
            <div className="flex-1">
              <div className="font-semibold">{n1}</div>
              <div className="text-[11px] text-zinc-400">Mandante (Ida)</div>
            </div>

            <div className="flex items-center gap-3">
              <ScoreInput value={ida1} onChange={(v) => setIda1(v)} />
              <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
              <ScoreInput value={ida2} onChange={(v) => setIda2(v)} />
            </div>

            <div className="flex-1 text-right">
              <div className="font-semibold">{n2}</div>
              <div className="text-[11px] text-zinc-400">Visitante</div>
            </div>
            <Escudo url={timesMap[j.id_time2]?.logo_url} alt={n2} />
          </div>
          <div className="my-3 h-px bg-white/10" />
        </>
      )}

      {/* VOLTA */}
      {showVolta && (
        <div className="flex items-center gap-3">
          <Escudo url={timesMap[j.id_time2]?.logo_url} alt={n2} />
          <div className="flex-1">
            <div className="font-semibold">{n2}</div>
            <div className="text-[11px] text-zinc-400">Mandante (Volta)</div>
          </div>

          <div className="flex items-center gap-3">
            <ScoreInput value={vol2} onChange={(v) => setVol2(v)} />
            <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
            <ScoreInput value={vol1} onChange={(v) => setVol1(v)} />
          </div>

          <div className="flex-1 text-right">
            <div className="font-semibold">{n1}</div>
            <div className="text-[11px] text-zinc-400">Visitante</div>
          </div>
          <Escudo url={timesMap[j.id_time1]?.logo_url} alt={n1} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button className="btn success" onClick={onSave} title="Salvar placar e aplicar premiações">
          💾 Salvar placar
        </button>
      </div>
    </article>
  )
}
