'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Tipos ========= */
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
  // opcionais, o schema pode não ter
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

/** ========= [FIX ParserError] Type guards ========= */
type BeforeIda = { gols_time1: number | null; gols_time2: number | null }
type BeforeVolta = { gols_time1_volta?: number | null; gols_time2_volta?: number | null }

function hasGolsIda(obj: unknown): obj is BeforeIda {
  return !!obj && typeof obj === 'object' && 'gols_time1' in obj && 'gols_time2' in obj
}
function hasGolsVolta(obj: unknown): obj is BeforeVolta {
  return !!obj && typeof obj === 'object' && ('gols_time1_volta' in obj || 'gols_time2_volta' in obj)
}

/** ========= Listas FORÇADAS (exemplo) ========= */
const POTE_A_KEYS = [
  'Belgrano', 'Velez', 'Independiente', 'Boca',
  'Liverpool FC', 'Sporting CP', 'Manchester City', 'Fiorentina'
] as const

const POTE_B_KEYS = [
  'Santa Clara', 'Rio Ave', 'PSG', 'Parma',
  'SV Elversberg', 'Barcelona', 'Racing', 'Chelsea'
] as const

const TEAM_ALIASES: Record<string, string[]> = {
  // Pote A
  'Belgrano': ['Belgrano'],
  'Velez': ['Velez', 'Vélez', 'Vélez Sarsfield', 'Velez Sarsfield'],
  'Independiente': ['Independiente'],
  'Boca': ['Boca', 'Boca Jrs', 'Boca Juniors'],
  'Liverpool FC': ['Liverpool FC', 'Liverpool'],
  'Sporting CP': ['Sporting CP', 'Sporting', 'Sporting Clube de Portugal'],
  'Manchester City': ['Manchester City', 'Man City', 'Manchester City FC'],
  'Fiorentina': ['Fiorentina', 'ACF Fiorentina'],
  // Pote B
  'Santa Clara': ['CD Santa Clara', 'Santa Clara'],
  'Rio Ave': ['Rio Ave'],
  'PSG': ['PSG', 'Paris Saint-Germain', 'Paris Saint Germain'],
  'Parma': ['Parma', 'Parma Calcio'],
  'SV Elversberg': ['SV Elversberg', 'Elversberg'],
  'Barcelona': ['Barcelona', 'FC Barcelona'],
  'Racing': ['Racing Club Avellaneda', 'Racing Club', 'Racing'],
  'Chelsea': ['Chelsea FC', 'Chelsea'],
}

/** ========= Utils ========= */
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

async function findTeamByAliases(aliases: string[]): Promise<TimeRow | null> {
  for (const alias of aliases) {
    const { data } = await supabase
      .from('times').select('id, nome, logo_url').eq('nome', alias)
      .limit(1).maybeSingle()
    if (data) return { id: data.id, nome: data.nome, logo_url: data.logo_url ?? null }
  }
  for (const alias of aliases) {
    const { data } = await supabase
      .from('times').select('id, nome, logo_url').ilike('nome', `%${alias}%`)
      .limit(1).maybeSingle()
    if (data) return { id: data.id, nome: data.nome, logo_url: data.logo_url ?? null }
  }
  return null
}

async function montarPotePorLista(keys: readonly string[]): Promise<TimeRow[]> {
  const faltantes: string[] = []
  const encontrados: TimeRow[] = []
  for (const key of keys) {
    const t = await findTeamByAliases(TEAM_ALIASES[key] || [key])
    if (t) encontrados.push(t); else faltantes.push(key)
  }
  if (faltantes.length) toast.error(`Times não encontrados: ${faltantes.join(', ')}`)
  return encontrados
}

/** ========= Componente ========= */
export default function OitavasPage() {
  const { isAdmin } = useAdmin()

  // dados
  const [jogos, setJogos] = useState<JogoOitavas[]>([])
  const [loading, setLoading] = useState(true)
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})

  // potes / sorteio
  const [poteA, setPoteA] = useState<TimeRow[]>([])
  const [poteB, setPoteB] = useState<TimeRow[]>([])

  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [filaA, setFilaA] = useState<TimeRow[]>([])
  const [filaB, setFilaB] = useState<TimeRow[]>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([]) // [A,B]
  const [confirming, setConfirming] = useState(false)

  // animação das bolinhas
  const [animA, setAnimA] = useState<TimeRow | null>(null)
  const [animB, setAnimB] = useState<TimeRow | null>(null)

  // realtime
  const channelRef = useRef<any>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    // 🚫 sem eco para não sobrescrever o estado local após o clique
    const ch = supabase.channel('oitavas-sorteio', { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      // aplicamos apenas o que veio no payload (deltas)
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('filaA' in p) setFilaA(p.filaA || [])
      if ('filaB' in p) setFilaB(p.filaB || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A: null, B: null })
      if ('pares' in p) setPares(p.pares || [])
      if ('animA' in p) setAnimA(p.animA || null)
      if ('animB' in p) setAnimB(p.animB || null)
      if ('poteA' in p) setPoteA(p.poteA || [])
      if ('poteB' in p) setPoteB(p.poteB || [])
      if ('logosById' in p) setLogosById(p.logosById || {})
    })
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        readyRef.current = true
      }
    })
    channelRef.current = ch
    return () => { ch.unsubscribe(); readyRef.current = false }
  }, [])

  const broadcast = useCallback((partial: any) => {
    if (!channelRef.current || !readyRef.current) return
    channelRef.current.send({ type: 'broadcast', event: 'state', payload: partial })
  }, [])

  useEffect(() => { buscarJogos() }, [])

  async function buscarJogos() {
    setLoading(true)

    // 1ª tentativa: com colunas de volta
    const q1 = await supabase
      .from('copa_oitavas')
      .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      .order('ordem', { ascending: true })

    let data: any[] | null = q1.data as any
    let error = q1.error

    // se não existir *_volta no schema, tentar sem
    if (error && mentionsVolta(error.message)) {
      setSupportsVolta(false)
      const q2 = await supabase
        .from('copa_oitavas')
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        .order('ordem', { ascending: true })
      data = q2.data as any
      error = q2.error
    }

    if (error) {
      console.error('Erro ao buscar Oitavas:', error)
      toast.error('Erro ao buscar jogos das Oitavas')
      setJogos([])
      setLoading(false)
      return
    }

    const arr = (data || []) as JogoOitavas[]
    setJogos(arr)

    // carregar logos dos times envolvidos
    const ids = Array.from(new Set(arr.flatMap(j => [j.id_time1, j.id_time2])))
    if (ids.length) {
      const { data: times } = await supabase
        .from('times')
        .select('id, logo_url')
        .in('id', ids)
      const map: Record<string, string | null> = {}
      ;(times || []).forEach(t => { map[t.id] = t.logo_url ?? null })
      setLogosById(map)
    } else {
      setLogosById({})
    }

    setLoading(false)
  }

  /** ====== Abrir Sorteio (POTES FORÇADOS) ====== */
  async function abrirSorteio() {
    if (!isAdmin) { toast.error('Apenas admin pode abrir o sorteio.'); return }
    try {
      const { count, error: cErr } = await supabase
        .from('copa_oitavas')
        .select('id', { head: true, count: 'exact' })
      if (cErr) throw cErr
      if ((count ?? 0) > 0) {
        toast.error('Já existem confrontos. Apague antes de sortear.')
        return
      }

      const a = await montarPotePorLista(POTE_A_KEYS)
      const b = await montarPotePorLista(POTE_B_KEYS)
      if (a.length !== 8 || b.length !== 8) {
        toast.error('Faltou encontrar algum time dos potes. Ajuste os aliases.')
        return
      }

      const shuffledB = shuffle(b)
      setPoteA(a); setPoteB(b)
      setFilaA([...a])
      setFilaB(shuffledB)
      setParAtual({ A: null, B: null })
      setPares([])
      setSorteioAberto(true)
      setAnimA(null); setAnimB(null)

      // broadcast deltas
      broadcast({
        sorteioAberto: true,
        poteA: a, poteB: b,
        filaA: [...a],
        filaB: shuffledB,
        parAtual: { A: null, B: null },
        pares: [],
        animA: null,
        animB: null,
      })
    } catch (e: any) {
      console.error(e)
      toast.error('Falha ao abrir sorteio')
    }
  }

  /** ====== Apagar sorteio (reset) ====== */
  async function apagarSorteio() {
    if (!isAdmin) { toast.error('Apenas admin pode apagar o sorteio.'); return }
    const ok = confirm('Apagar TODOS os confrontos das Oitavas e resetar o sorteio?')
    if (!ok) return
    try {
      const { error } = await supabase.from('copa_oitavas').delete().neq('id', 0)
      if (error) throw error
      toast.success('Sorteio apagado!')
      // reset local + broadcast
      setPares([])
      setParAtual({ A: null, B: null })
      setFilaA([]); setFilaB([])
      setPoteA([]); setPoteB([])
      setSorteioAberto(false)
      setAnimA(null); setAnimB(null)
      broadcast({
        sorteioAberto: false,
        filaA: [], filaB: [],
        parAtual: { A: null, B: null },
        pares: [], animA: null, animB: null,
        poteA: [], poteB: [],
      })
      await buscarJogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao apagar sorteio: ${e?.message || e}`)
    }
  }

  /** ====== Controles de sorteio ====== */
  const sortearDoPoteA = useCallback(() => {
    if (!isAdmin) { toast.error('Apenas admin pode sortear.'); return }
    if (parAtual.A || filaA.length === 0) { toast('Pote A vazio ou confronto atual já tem A.'); return }
    const idx = Math.floor(Math.random() * filaA.length)
    const escolhido = filaA[idx]
    const nova = [...filaA]; nova.splice(idx, 1)
    setFilaA(nova)
    setAnimA(escolhido)
    broadcast({ animA: escolhido, filaA: nova })

    setTimeout(() => {
      setParAtual(prev => {
        const next = { ...prev, A: escolhido }
        broadcast({ parAtual: next, animA: null })
        return next
      })
      setTimeout(() => setAnimA(null), 20)
      toast.success(`Sorteado do Pote A: ${escolhido.nome}`)
    }, 250)
  }, [isAdmin, filaA, parAtual.A, broadcast])

  const sortearDoPoteB = useCallback(() => {
    if (!isAdmin) { toast.error('Apenas admin pode sortear.'); return }
    if (!parAtual.A || parAtual.B || filaB.length === 0) { toast('Sorteie primeiro do Pote A ou Pote B vazio.'); return }
    const escolhido = filaB[0]
    const nova = filaB.slice(1)
    setFilaB(nova)
    setAnimB(escolhido)
    broadcast({ animB: escolhido, filaB: nova })

    setTimeout(() => {
      setParAtual(prev => {
        const next = { ...prev, B: escolhido }
        broadcast({ parAtual: next, animB: null })
        return next
      })
      setTimeout(() => setAnimB(null), 20)
      toast.success(`Sorteado do Pote B: ${escolhido.nome}`)
    }, 250)
  }, [isAdmin, filaB, parAtual.A, parAtual.B, broadcast])

  function confirmarConfronto() {
    if (!isAdmin) { toast.error('Apenas admin pode confirmar.'); return }
    if (!parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A, parAtual.B] as [TimeRow, TimeRow]]
    setPares(novos)
    const cleared = { A: null, B: null }
    setParAtual(cleared)
    broadcast({ pares: novos, parAtual: cleared })
  }

  /** ====== Gravar confrontos ====== */
  async function gravarConfrontos() {
    if (!isAdmin) { toast.error('Apenas admin pode gravar.'); return }
    if (pares.length !== 8) { toast.error('Finalize os 8 confrontos.'); return }

    try {
      setConfirming(true)
      // limpa
      const { error: delErr } = await supabase
        .from('copa_oitavas')
        .delete()
        .neq('id', 0)
      if (delErr) throw delErr

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

      // tenta inserir com volta; se não tiver coluna, cai pro sem volta
      const ins1 = await supabase.from('copa_oitavas')
        .insert(base.map(p => ({ ...p, gols_time1_volta: null, gols_time2_volta: null })))
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')

      if (ins1.error && mentionsVolta(ins1.error.message)) {
        setSupportsVolta(false)
        const ins2 = await supabase.from('copa_oitavas')
          .insert(base)
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        if (ins2.error) throw ins2.error
        setJogos((ins2.data || []) as JogoOitavas[])
      } else if (ins1.error) {
        throw ins1.error
      } else {
        setSupportsVolta(true)
        setJogos((ins1.data || []) as JogoOitavas[])
      }

      toast.success('Oitavas sorteadas e gravadas!')
      setSorteioAberto(false)
      broadcast({ sorteioAberto: false })
      await buscarJogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao gravar confrontos: ${e?.message || e}`)
    } finally {
      setConfirming(false)
    }
  }

  /** ===== Premiação ao salvar placar ===== */
  async function salvarPlacar(jogo: JogoOitavas) {
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

    const before: unknown = beforeRaw

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

    // === Pagamentos ===
    try {
      const BID_TIPO = 'Premiação fase oitavas'
      const VITORIA = 25_000_000
      const GOL = 750_000

      // IDA: transição indefinido -> definido e não é empate
      const idaAntesDef = hasGolsIda(before) && before.gols_time1 != null && before.gols_time2 != null
      const idaAgoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
      if (!idaAntesDef && idaAgoraDef && jogo.gols_time1 !== jogo.gols_time2) {
        const vencedorId = (jogo.gols_time1 ?? 0) > (jogo.gols_time2 ?? 0) ? jogo.id_time1 : jogo.id_time2
        await supabase.rpc('atualizar_saldo', { id_time: vencedorId, valor: VITORIA })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Vitória (ida): ${jogo.time1} ${jogo.gols_time1 ?? 0} x ${jogo.gols_time2 ?? 0} ${jogo.time2}`,
          valor: VITORIA,
          id_time: vencedorId
        })
      }

      // VOLTA: mesma regra
      if (supportsVolta) {
        const volAntesDef = hasGolsVolta(before) &&
          (before.gols_time1_volta ?? null) != null &&
          (before.gols_time2_volta ?? null) != null

        const g1v = (jogo as any).gols_time1_volta as number | null
        const g2v = (jogo as any).gols_time2_volta as number | null
        const volAgoraDef = g1v != null && g2v != null

        if (!volAntesDef && volAgoraDef && g1v !== g2v) {
          const vencedorId = (g1v ?? 0) > (g2v ?? 0) ? jogo.id_time1 : jogo.id_time2
          await supabase.rpc('atualizar_saldo', { id_time: vencedorId, valor: VITORIA })
          await supabase.from('bid').insert({
            tipo_evento: BID_TIPO,
            descricao: `Vitória (volta): ${jogo.time2} ${g2v ?? 0} x ${g1v ?? 0} ${jogo.time1}`,
            valor: VITORIA,
            id_time: vencedorId
          })
        }
      }

      // GOLS — paga apenas o DELTA (ida + volta)
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
        const valor = delta1 * GOL
        await supabase.rpc('atualizar_saldo', { id_time: jogo.id_time1, valor })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Gols marcados (${delta1}) — ${jogo.time1}`,
          valor,
          id_time: jogo.id_time1
        })
      }
      if (delta2 > 0) {
        const valor = delta2 * GOL
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

  /** ===== Helper ===== */
  const oitavasCompletas = useMemo(() => {
    if (jogos.length !== 8) return false
    return jogos.every(j =>
      j.gols_time1 !== null &&
      j.gols_time2 !== null &&
      (!supportsVolta || ((j as any).gols_time1_volta !== null && (j as any).gols_time2_volta !== null))
    )
  }, [jogos, supportsVolta])

  /** ====== FINALIZAR OITAVAS (sequencial) ====== */
  async function finalizarOitavas() {
    const { data: dataJogos, error: errJ } = await supabase
      .from('copa_oitavas')
      .select('*')
      .order('ordem', { ascending: true })

    if (errJ || !dataJogos) {
      toast.error('Erro ao buscar confrontos das Oitavas')
      return
    }

    const jogosAtual = dataJogos as JogoOitavas[]
    const classificados: string[] = []

    for (const j of jogosAtual) {
      const ida1 = j.gols_time1 || 0
      const ida2 = j.gols_time2 || 0
      const vol1 = (supportsVolta ? (j as any).gols_time1_volta : 0) || 0
      const vol2 = (supportsVolta ? (j as any).gols_time2_volta : 0) || 0
      const total1 = ida1 + vol1
      const total2 = ida2 + vol2
      classificados.push(total1 >= total2 ? j.id_time1 : j.id_time2) // empate -> time1
    }

    if (classificados.length !== 8) {
      toast.error('Complete os 8 confrontos.')
      return
    }

    const { data: timesData } = await supabase
      .from('times').select('id, nome').in('id', classificados)
    const nomePorId = new Map<string, string>()
    ;(timesData || []).forEach(t => nomePorId.set(t.id, t.nome))

    const novos: any[] = []
    for (let i = 0; i < classificados.length; i += 2) {
      const id_time1 = classificados[i]
      const id_time2 = classificados[i + 1]
      novos.push({
        rodada: 1,
        ordem: (i / 2) + 1,
        id_time1,
        id_time2,
        time1: nomePorId.get(id_time1) ?? 'Time',
        time2: nomePorId.get(id_time2) ?? 'Time',
        gols_time1: null,
        gols_time2: null,
      })
    }

    try {
      await supabase.from('copa_quartas').delete().neq('id', 0).throwOnError()
      const ins1 = await supabase
        .from('copa_quartas')
        .insert(novos.map(n => ({ ...n, gols_time1_volta: null, gols_time2_volta: null })))
      if (ins1.error && mentionsVolta(ins1.error.message)) {
        const ins2 = await supabase.from('copa_quartas').insert(novos)
        if (ins2.error) throw ins2.error
      } else if (ins1.error) {
        throw ins1.error
      }
      toast.success('Classificados para as Quartas (ordem sequencial).')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao gerar Quartas')
    }
  }

  /** ====== Sortear Quartas com POTE ÚNICO ====== */
  async function sortearQuartasPoteUnico() {
    if (!isAdmin) { toast.error('Apenas admin pode sortear.'); return }

    let hasVolta = true
    let data: any[] | null = null
    {
      const q1 = await supabase
        .from('copa_oitavas')
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
        .order('ordem', { ascending: true })
      if (q1.error && mentionsVolta(q1.error.message)) {
        hasVolta = false
        const q2 = await supabase
          .from('copa_oitavas')
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
          .order('ordem', { ascending: true })
        if (q2.error) { toast.error('Erro ao ler Oitavas'); return }
        data = q2.data as any
      } else if (q1.error) {
        toast.error('Erro ao ler Oitavas')
        return
      } else {
        data = q1.data as any
      }
    }

    const jogosAtual = (data || []) as JogoOitavas[]
    if (jogosAtual.length !== 8) {
      toast.error('É preciso ter 8 confrontos nas Oitavas.')
      return
    }

    const incompletos = jogosAtual.some(j =>
      j.gols_time1 === null || j.gols_time2 === null ||
      (hasVolta && (((j as any).gols_time1_volta ?? null) === null || ((j as any).gols_time2_volta ?? null) === null))
    )
    if (incompletos) {
      toast.error('Preencha todos os placares das Oitavas (ida e volta, se houver).')
      return
    }

    const vencedoresIds: string[] = []
    for (const j of jogosAtual) {
      const ida1 = j.gols_time1 || 0
      const ida2 = j.gols_time2 || 0
      const vol1 = hasVolta ? ((j as any).gols_time1_volta || 0) : 0
      const vol2 = hasVolta ? ((j as any).gols_time2_volta || 0) : 0
      const total1 = ida1 + vol1
      const total2 = ida2 + vol2
      vencedoresIds.push(total1 >= total2 ? j.id_time1 : j.id_time2)
    }

    const { data: timesData, error: tErr } = await supabase
      .from('times')
      .select('id, nome')
      .in('id', vencedoresIds)
    if (tErr) { toast.error('Erro ao buscar nomes dos classificados.'); return }
    const nomePorId = new Map<string, string>()
    ;(timesData || []).forEach(t => nomePorId.set(t.id, t.nome))

    const poteUnico = shuffle([...vencedoresIds])

    const quartas: any[] = []
    for (let i = 0; i < 8; i += 2) {
      const id1 = poteUnico[i]
      const id2 = poteUnico[i + 1]
      quartas.push({
        rodada: 1,
        ordem: (i / 2) + 1,
        id_time1: id1,
        id_time2: id2,
        time1: nomePorId.get(id1) ?? 'Time',
        time2: nomePorId.get(id2) ?? 'Time',
        gols_time1: null,
        gols_time2: null,
      })
    }

    try {
      await supabase.from('copa_quartas').delete().neq('id', 0).throwOnError()
      const ins1 = await supabase
        .from('copa_quartas')
        .insert(quartas.map(q => ({ ...q, gols_time1_volta: null, gols_time2_volta: null })))
      if (ins1.error && mentionsVolta(ins1.error.message)) {
        const ins2 = await supabase.from('copa_quartas').insert(quartas)
        if (ins2.error) throw ins2.error
      } else if (ins1.error) {
        throw ins1.error
      }

      toast.success('Quartas sorteadas (pote único) e gravadas!')
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao sortear as Quartas: ${e?.message || e}`)
    }
  }

  /** ====== Derivados ====== */
  const podeGravar = useMemo(() => pares.length === 8 && !parAtual.A && !parAtual.B, [pares, parAtual])

  /** ====== Render ====== */
  if (loading) return <div className="p-4">🔄 Carregando...</div>

  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto">
      {/* brilhos suaves de fundo */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          Oitavas de Final
        </h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow" onClick={abrirSorteio}>
              🎥 Abrir sorteio
            </button>
            <button className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl shadow" onClick={apagarSorteio}>
              🗑️ Apagar sorteio
            </button>
          </div>
        )}
      </header>

      {/* Lista de jogos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {jogos.map((jogo, idx) => (
          <MatchCard
            key={jogo.id}
            jogo={{ ...jogo, ordem: jogo.ordem ?? (idx + 1) }}
            supportsVolta={supportsVolta}
            logosById={logosById}
            onChange={(next) => setJogos(prev => prev.map(j => j.id === jogo.id ? next : j))}
            onSave={(updated) => salvarPlacar(updated)}
          />
        ))}
      </div>

      {isAdmin && (
        <div className="mt-8 flex flex-wrap gap-3">
          <button className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl" onClick={finalizarOitavas}>
            🏁 Finalizar Oitavas (sequencial)
          </button>

          <button
            className={`px-4 py-2 rounded-xl ${oitavasCompletas ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600/50 text-white/70 cursor-not-allowed'}`}
            disabled={!oitavasCompletas}
            onClick={sortearQuartasPoteUnico}
            title={oitavasCompletas ? 'Sortear Quartas com pote único' : 'Preencha todos os placares das Oitavas para habilitar'}
          >
            🎲 Sortear Quartas (pote único)
          </button>
        </div>
      )}

      {/* ===== Overlay do Sorteio por Potes + Animação ===== */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio Oitavas — Show ao vivo</h3>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                onClick={() => { setSorteioAberto(false); if (isAdmin) broadcast({ sorteioAberto: false }) }}
              >
                Fechar
              </button>
            </div>

            {/* prévia dos potes (com logos) */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <PotePreview title="Pote A (forçado)" teams={poteA} />
              <PotePreview title="Pote B (forçado)" teams={poteB} />
            </div>

            {/* Palco */}
            <div className="grid grid-cols-9 gap-4 items-start">
              {/* Apresentadora A + Pote A */}
              <div className="col-span-3 flex flex-col items-center gap-3">
                <HostCard nome="Apresentadora A" lado="left" />
                <PoteGlass title="Pote A" teams={filaA} side="left" />
                <button
                  className={`px-3 py-2 rounded-lg ${!parAtual.A && filaA.length > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600/50 cursor-not-allowed'}`}
                  onClick={sortearDoPoteA}
                  disabled={!!parAtual.A || filaA.length === 0}
                >
                  🎲 Sortear do Pote A
                </button>
              </div>

              {/* Centro */}
              <div className="col-span-3 flex flex-col items-center">
                <div className="w-full">
                  <div className="text-center text-white/60 mb-2">Confronto atual</div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="grid grid-cols-3 items-center">
                      <div className="flex justify-center"><BallLogo team={parAtual.A} size={64} /></div>
                      <div className="text-center text-white/60">x</div>
                      <div className="flex justify-center"><BallLogo team={parAtual.B} size={64} /></div>
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        className={`px-3 py-2 rounded-lg ${parAtual.A && parAtual.B ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-emerald-600/50 cursor-not-allowed'}`}
                        onClick={confirmarConfronto}
                        disabled={!parAtual.A || !parAtual.B}
                      >
                        ✅ Confirmar confronto
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pares já formados */}
                <div className="w-full mt-4 max-h-56 overflow-auto space-y-2">
                  {pares.map(([a,b], i) => (
                    <div key={a.id + b.id + i} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><BallLogo team={a} size={28} /><span className="font-medium">{a.nome}</span></div>
                        <span className="text-white/60">x</span>
                        <div className="flex items-center gap-2"><span className="font-medium">{b.nome}</span><BallLogo team={b} size={28} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gravar */}
                <div className="w-full mt-4 flex justify-end">
                  <button
                    className={`px-4 py-2 rounded-lg ${podeGravar && !confirming ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600/50 cursor-not-allowed'}`}
                    disabled={!podeGravar || confirming}
                    onClick={gravarConfrontos}
                  >
                    {confirming ? 'Gravando…' : '✅ Gravar confrontos'}
                  </button>
                </div>
              </div>

              {/* Apresentadora B + Pote B */}
              <div className="col-span-3 flex flex-col items-center gap-3">
                <HostCard nome="Apresentadora B" lado="right" />
                <PoteGlass title="Pote B" teams={filaB} side="right" />
                <button
                  className={`px-3 py-2 rounded-lg ${parAtual.A && !parAtual.B && filaB.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-600/50 cursor-not-allowed'}`}
                  onClick={sortearDoPoteB}
                  disabled={!parAtual.A || !!parAtual.B || filaB.length === 0}
                >
                  🎲 Sortear do Pote B
                </button>
              </div>
            </div>

            {/* Bolinhas animadas */}
            <AnimatePresence>
              {animA && (
                <motion.div
                  initial={{ x: -260, y: 80, scale: 0.6, opacity: 0 }}
                  animate={{ x: 0, y: -10, scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.4 }}
                  className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <BallLogo team={animA} size={72} shiny />
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {animB && (
                <motion.div
                  initial={{ x: 260, y: 80, scale: 0.6, opacity: 0 }}
                  animate={{ x: 0, y: -10, scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.4 }}
                  className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <BallLogo team={animB} size={72} shiny />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      )}
    </div>
  )
}

/** ====== Cartão de Jogo ====== */
function MatchCard({
  jogo, supportsVolta, logosById, onChange, onSave
}:{
  jogo: JogoOitavas
  supportsVolta: boolean
  logosById: Record<string, string | null>
  onChange: (next: JogoOitavas) => void
  onSave: (j: JogoOitavas) => void
}) {
  const [ida1, setIda1] = useState<number | null>(jogo.gols_time1)
  const [ida2, setIda2] = useState<number | null>(jogo.gols_time2)
  const [vol1, setVol1] = useState<number | null>(jogo.gols_time1_volta ?? null)
  const [vol2, setVol2] = useState<number | null>(jogo.gols_time2_volta ?? null)

  useEffect(() => {
    setIda1(jogo.gols_time1)
    setIda2(jogo.gols_time2)
    setVol1(jogo.gols_time1_volta ?? null)
    setVol2(jogo.gols_time2_volta ?? null)
  }, [jogo.id, jogo.gols_time1, jogo.gols_time2, jogo.gols_time1_volta, jogo.gols_time2_volta])

  useEffect(() => {
    onChange({
      ...jogo,
      gols_time1: ida1,
      gols_time2: ida2,
      ...(supportsVolta ? { gols_time1_volta: vol1, gols_time2_volta: vol2 } : {})
    })
  }, [ida1, ida2, vol1, vol2]) // eslint-disable-line react-hooks/exhaustive-deps

  const agg1 = (ida1 ?? 0) + (supportsVolta ? (vol1 ?? 0) : 0)
  const agg2 = (ida2 ?? 0) + (supportsVolta ? (vol2 ?? 0) : 0)
  const lead: 'empate'|'t1'|'t2' = agg1 === agg2 ? 'empate' : (agg1 > agg2 ? 't1' : 't2')

  const buildNext = (): JogoOitavas => ({
    ...jogo,
    gols_time1: ida1,
    gols_time2: ida2,
    ...(supportsVolta ? { gols_time1_volta: vol1, gols_time2_volta: vol2 } : {})
  })

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl">
      <div className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-white/60">Jogo {jogo.ordem ?? '-' } · Oitavas</div>
        <div
          title={`Ida ${ida1 ?? 0}-${ida2 ?? 0}${supportsVolta ? ` · Volta ${vol1 ?? 0}-${vol2 ?? 0}` : ''}`}
          className={[
            "px-3 py-1 rounded-full text-xs font-medium backdrop-blur border",
            lead==='t1' ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
            : lead==='t2' ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/25"
            : "bg-white/10 text-white/70 border-white/10"
          ].join(" ")}
        >
          Agregado {agg1}–{agg2}
        </div>
      </div>

      {/* IDA */}
      <LegRow
        label="Ida"
        left={{ id:jogo.id_time1, name:jogo.time1, logo:logosById[jogo.id_time1], role:'Mandante' }}
        right={{ id:jogo.id_time2, name:jogo.time2, logo:logosById[jogo.id_time2], role:'Visitante' }}
        a={ida1}
        b={ida2}
        onA={v=>setIda1(v)}
        onB={v=>setIda2(v)}
      />

      {/* VOLTA */}
      {supportsVolta && (
        <div className="mt-3">
          <LegRow
            label="Volta"
            left={{ id:jogo.id_time2, name:jogo.time2, logo:logosById[jogo.id_time2], role:'Mandante' }}
            right={{ id:jogo.id_time1, name:jogo.time1, logo:logosById[jogo.id_time1], role:'Visitante' }}
            a={vol2}  // esquerda é do time2 (mandante na volta)
            b={vol1}  // direita é do time1
            onA={v=>setVol2(v)}
            onB={v=>setVol1(v)}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={()=>onSave(buildNext())}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow focus:outline-none focus:ring-2 focus:ring-emerald-400/50">
          Salvar
        </button>
      </div>
    </div>
  )
}

/** Linha de um jogo */
function LegRow({
  label,
  left, right,
  a, b,
  onA, onB,
}:{
  label: string
  left: { id: string, name: string, logo?: string | null, role: 'Mandante'|'Visitante' }
  right:{ id: string, name: string, logo?: string | null, role: 'Mandante'|'Visitante' }
  a: number | null | undefined
  b: number | null | undefined
  onA: (n: number | null)=>void
  onB: (n: number | null)=>void
}) {
  const norm = (val: string): number | null => val === '' ? null : Math.max(0, parseInt(val))
  return (
    <div className="grid grid-cols-12 items-center gap-x-4">
      <TeamSide name={left.name} logo={left.logo} align="right" role={left.role} />
      <div className="col-span-12 md:col-span-4">
        <div className="relative">
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
            {label}
          </span>
          <div className="w-full max-w-[360px] mx-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-center gap-3">
            <input
              type="number"
              className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
              value={a ?? ''} onChange={(e)=>onA(Number.isNaN(norm(e.target.value) as any) ? null : norm(e.target.value))}
            />
            <span className="text-white/60">x</span>
            <input
              type="number"
              className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
              value={b ?? ''} onChange={(e)=>onB(Number.isNaN(norm(e.target.value) as any) ? null : norm(e.target.value))}
            />
          </div>
        </div>
      </div>
      <TeamSide name={right.name} logo={right.logo} align="left" role={right.role} />
    </div>
  )
}

/** ====== Visuais ====== */
function HostCard({ nome, lado }:{ nome: string; lado: 'left'|'right' }) {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-500/70 to-blue-500/70 flex items-center justify-center text-white font-bold shadow-lg">
          {lado === 'left' ? 'A' : 'B'}
        </div>
        <div>
          <div className="text-xs text-white/60">Apresentadora</div>
          <div className="font-semibold">{nome}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-white/60">
        Retira as bolinhas do pote {lado === 'left' ? 'A' : 'B'} ao sinal do diretor.
      </div>
    </div>
  )
}

function PoteGlass({ title, teams }:{ title: string; teams: TimeRow[]; side: 'left'|'right' }) {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="mb-2 text-sm text-white/80">{title}</div>
      <div className="relative w-64 h-40">
        <div className="absolute inset-0 rounded-full [clip-path:ellipse(60%_50%_at_50%_60%)] bg-gradient-to-b from-white/10 to-white/0 border border-white/20 shadow-inner" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56 h-4 rounded-full bg-black/40 blur-sm" />
        <div className="absolute inset-0 flex flex-wrap items-end justify-center gap-2 p-6">
          {teams.map((t) => (
            <div key={t.id} className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 shadow-md overflow-hidden flex items-center justify-center">
              <TeamLogo url={t.logo_url} alt={t.nome} size={40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PotePreview({ title, teams }:{ title: string; teams: TimeRow[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm text-white/70 mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {teams.map(t => (
          <span key={t.id} className="px-2 py-1 rounded-full bg-white/10 text-sm flex items-center gap-2">
            <TeamLogo url={t.logo_url} alt={t.nome} size={16} />
            {t.nome}
          </span>
        ))}
      </div>
    </div>
  )
}

function TeamLogo({ url, alt, size=32 }:{ url?: string | null; alt: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} style={{ width: size, height: size }} className="object-cover" />
  ) : (
    <div className="rounded-full bg-white/10 text-white/80 flex items-center justify-center"
         style={{ width: size, height: size, fontSize: Math.max(10, size/3) }}>
      {alt.slice(0,3).toUpperCase()}
    </div>
  )
}

function BallLogo({ team, size=56, shiny=false }:{ team: TimeRow | null; size?: number; shiny?: boolean }) {
  if (!team) return (
    <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
      <span className="text-white/60">?</span>
    </div>
  )
  return (
    <div className={`rounded-full border ${shiny ? 'border-white/40 shadow-[inset_0_8px_16px_rgba(255,255,255,0.15),0_8px_16px_rgba(0,0,0,0.35)]' : 'border-slate-700 shadow'} bg-slate-900 overflow-hidden flex items-center justify-center`} style={{ width: size, height: size }}>
      <TeamLogo url={team.logo_url} alt={team.nome} size={size - 8} />
    </div>
  )
}

function TeamSide({
  name, logo, align, role
}:{ name: string, logo?: string | null, align: 'left'|'right', role: 'Mandante'|'Visitante' }) {
  return (
    <div className={`col-span-6 md:col-span-4 flex items-center ${align==='left'?'justify-start':'justify-end'} gap-3`}>
      {align==='left' && <TeamLogo url={logo || null} alt={name} size={40} />}
      <div className={`${align==='left'?'text-left':'text-right'}`}>
        <div className="font-semibold leading-5">{name}</div>
        <div className="text-[11px] text-white/60">{role}</div>
      </div>
      {align==='right' && <TeamLogo url={logo || null} alt={name} size={40} />}
    </div>
  )
}
