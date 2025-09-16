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

type JogoSemi = {
  id: number
  ordem?: number | null
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  gols_time1_volta?: number | null // opcionais (schema pode não ter)
  gols_time2_volta?: number | null
}
type Classificacao = { id_time: string; pontos: number }

/** ========= Utils ========= */
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const normInt = (val: string): number | null => {
  if (val === '') return null
  const n = parseInt(val, 10)
  if (Number.isNaN(n) || n < 0) return null
  return n
}
const isPlacarPreenchido = (j: JogoSemi, supportsVolta: boolean) => {
  const idaOk = j.gols_time1 != null && j.gols_time2 != null
  const voltaOk = !supportsVolta || (j.gols_time1_volta != null && j.gols_time2_volta != null)
  return idaOk && voltaOk
}
const toDBId = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : v)

/** ========= Página ========= */
export default function SemiPage() {
  const { isAdmin } = useAdmin()

  // dados
  const [jogos, setJogos] = useState<JogoSemi[]>([])
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [classificacao, setClassificacao] = useState<Classificacao[]>([])
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  // pote único / sorteio
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [poteUnico, setPoteUnico] = useState<TimeRow[]>([]) // fila de 4 times
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([]) // 2 confrontos
  const [confirming, setConfirming] = useState(false)
  const [anim, setAnim] = useState<TimeRow | null>(null)

  // realtime
  const channelRef = useRef<any>(null)
  const readyRef = useRef(false)

  // Ajuste se usar multi-temporada/divisão
  const [temporadaSelecionada] = useState<number>(1)
  const [divisaoSelecionada] = useState<number>(1)

  useEffect(() => {
    const ch = supabase.channel('semi-sorteio', { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('poteUnico' in p) setPoteUnico(p.poteUnico || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A: null, B: null })
      if ('pares' in p) setPares(p.pares || [])
      if ('anim' in p) setAnim(p.anim || null)
      if ('logosById' in p) setLogosById(p.logosById || {})
    })
    ch.subscribe(status => { if (status === 'SUBSCRIBED') readyRef.current = true })
    channelRef.current = ch
    return () => { ch.unsubscribe(); readyRef.current = false }
  }, [])

  const broadcast = useCallback((partial: any) => {
    if (!channelRef.current || !readyRef.current) return
    channelRef.current.send({ type: 'broadcast', event: 'state', payload: partial })
  }, [])

  useEffect(() => {
    Promise.all([buscarJogos(), buscarClassificacao()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buscarJogos() {
    setLoading(true)
    // tenta ler com colunas *_volta
    const q1 = await supabase
      .from('copa_semi')
      .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      .order('ordem', { ascending: true })

    let data: any[] | null = q1.data as any
    let error = q1.error

    if (error && mentionsVolta(error.message)) {
      setSupportsVolta(false)
      const q2 = await supabase
        .from('copa_semi')
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        .order('ordem', { ascending: true })
      data = q2.data as any
      error = q2.error
    }

    if (error) {
      toast.error('Erro ao buscar jogos')
      setJogos([])
      setLoading(false)
      return
    }

    const arr = (data || []) as JogoSemi[]
    setJogos(arr)

    // logos
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

  async function buscarClassificacao() {
    const { data, error } = await supabase.from('classificacao').select('id_time, pontos')
    if (!error && data) setClassificacao(data as any)
    else setClassificacao([])
  }

  /** ====== Abrir Sorteio (POTE ÚNICO – 4 vencedores das quartas) ====== */
  async function abrirSorteioPoteUnico() {
    if (!isAdmin) { toast.error('Apenas admin pode abrir o sorteio.'); return }
    try {
      const { count, error: cErr } = await supabase
        .from('copa_semi')
        .select('id', { head: true, count: 'exact' })
      if (cErr) throw cErr
      if ((count ?? 0) > 0) {
        toast.error('Já existem confrontos na Semifinal. Apague antes de sortear.')
        return
      }

      // Ler Quartas e checar completude
      let hasVolta = true
      let data: any[] | null = null
      {
        const q1 = await supabase
          .from('copa_quartas')
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
          .order('ordem', { ascending: true })
        if (q1.error && mentionsVolta(q1.error.message)) {
          hasVolta = false
          const q2 = await supabase
            .from('copa_quartas')
            .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
            .order('ordem', { ascending: true })
          if (q2.error) throw q2.error
          data = q2.data as any
        } else if (q1.error) {
          throw q1.error
        } else {
          data = q1.data as any
        }
      }

      const jogosQuartas = (data || []) as {
        id_time1: string, id_time2: string,
        time1: string, time2: string,
        gols_time1: number | null, gols_time2: number | null,
        gols_time1_volta?: number | null, gols_time2_volta?: number | null
      }[]

      if (jogosQuartas.length !== 4) {
        toast.error('É preciso ter 4 confrontos completos nas Quartas.')
        return
      }

      const incompletos = jogosQuartas.some(j =>
        j.gols_time1 === null || j.gols_time2 === null ||
        (hasVolta && (((j.gols_time1_volta ?? null) === null) || ((j.gols_time2_volta ?? null) === null)))
      )
      if (incompletos) {
        toast.error('Preencha todos os placares das Quartas (ida e volta, se houver) antes de sortear as Semis.')
        return
      }

      // Classificados das Quartas
      const vencedoresIds: string[] = []
      for (const j of jogosQuartas) {
        const ida1 = j.gols_time1 || 0
        const ida2 = j.gols_time2 || 0
        const vol1 = hasVolta ? ((j.gols_time1_volta ?? 0)) : 0
        const vol2 = hasVolta ? ((j.gols_time2_volta ?? 0)) : 0
        const total1 = ida1 + vol1
        const total2 = ida2 + vol2
        vencedoresIds.push(total1 >= total2 ? j.id_time1 : j.id_time2) // empate -> time1
      }

      const { data: timesData, error: tErr } = await supabase
        .from('times')
        .select('id,nome,logo_url')
        .in('id', vencedoresIds)
      if (tErr) throw tErr

      const pot: TimeRow[] = (timesData || []).map(t => ({
        id: t.id, nome: t.nome, logo_url: t.logo_url ?? null
      }))

      if (pot.length !== 4) {
        toast.error('Não foi possível montar o pote único com 4 times.')
        return
      }

      const shuffle = <T,>(arr: T[]) => {
        const a = [...arr]
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[a[i], a[j]] = [a[j], a[i]]
        }
        return a
      }

      const fila = shuffle(pot)
      setPoteUnico(fila)
      setParAtual({ A: null, B: null })
      setPares([])
      setSorteioAberto(true)
      setAnim(null)

      broadcast({
        sorteioAberto: true,
        poteUnico: fila,
        parAtual: { A: null, B: null },
        pares: [],
        anim: null
      })
    } catch (e: any) {
      console.error(e)
      toast.error('Falha ao abrir sorteio da Semifinal (pote único)')
    }
  }

  /** ====== Apagar sorteio (reset) ====== */
  async function apagarSorteio() {
    if (!isAdmin) { toast.error('Apenas admin pode apagar o sorteio.'); return }
    const ok = confirm('Apagar TODOS os confrontos da Semifinal e resetar o sorteio?')
    if (!ok) return
    try {
      const { error } = await supabase.from('copa_semi').delete().neq('id', 0)
      if (error) throw error
      toast.success('Sorteio apagado!')
      setPares([])
      setParAtual({ A: null, B: null })
      setPoteUnico([])
      setSorteioAberto(false)
      setAnim(null)
      broadcast({
        sorteioAberto: false,
        poteUnico: [],
        parAtual: { A: null, B: null },
        pares: [],
        anim: null
      })
      await buscarJogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao apagar sorteio: ${e?.message || e}`)
    }
  }

  /** ====== Sorteio do pote único ====== */
  const sortearDoPote = useCallback(() => {
    if (!isAdmin) { toast.error('Apenas admin pode sortear.'); return }
    if (poteUnico.length === 0) { toast('Pote vazio.'); return }

    const idx = Math.floor(Math.random() * poteUnico.length)
    const escolhido = poteUnico[idx]
    const novaFila = [...poteUnico]; novaFila.splice(idx, 1)

    setPoteUnico(novaFila)
    setAnim(escolhido)
    broadcast({ poteUnico: novaFila, anim: escolhido })

    setTimeout(() => {
      setParAtual(prev => {
        const next = !prev.A ? { A: escolhido, B: prev.B } : { A: prev.A, B: escolhido }
        broadcast({ parAtual: next, anim: null })
        return next
      })
      setTimeout(() => setAnim(null), 20)
      toast.success(`Sorteado: ${escolhido.nome}`)
    }, 250)
  }, [isAdmin, poteUnico, broadcast])

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
    if (pares.length !== 2) { toast.error('Finalize os 2 confrontos da Semi.'); return }

    try {
      setConfirming(true)
      // limpa
      const { error: delErr } = await supabase
        .from('copa_semi')
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
      const ins1 = await supabase.from('copa_semi')
        .insert(base.map(p => ({ ...p, gols_time1_volta: null, gols_time2_volta: null })))
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')

      if (ins1.error && mentionsVolta(ins1.error.message)) {
        setSupportsVolta(false)
        const ins2 = await supabase.from('copa_semi')
          .insert(base)
          .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        if (ins2.error) throw ins2.error
        setJogos((ins2.data || []) as JogoSemi[])
      } else if (ins1.error) {
        throw ins1.error
      } else {
        setSupportsVolta(true)
        setJogos((ins1.data || []) as JogoSemi[])
      }

      toast.success('Semifinal sorteada (pote único) e gravada!')
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

  /** ====== Salvar placar + premiação (mesma lógica das fases anteriores) ====== */
  async function salvarPlacar(jogo: JogoSemi) {
    if (!isPlacarPreenchido(jogo, supportsVolta)) {
      toast.error('Preencha os dois campos da Ida e os dois da Volta antes de salvar.')
      return
    }

    // ler placar anterior
    const cols = supportsVolta
      ? 'gols_time1,gols_time2,gols_time1_volta,gols_time2_volta'
      : 'gols_time1,gols_time2'
    const { data: beforeRaw, error: readErr } = await supabase
      .from('copa_semi')
      .select(cols)
      .eq('id', jogo.id)
      .maybeSingle()
    if (readErr) {
      toast.error('Erro ao ler placar anterior'); return
    }
    const before: unknown = beforeRaw

    const update: any = {
      gols_time1: jogo.gols_time1 ?? null,
      gols_time2: jogo.gols_time2 ?? null,
    }
    if (supportsVolta) {
      update.gols_time1_volta = jogo.gols_time1_volta ?? null
      update.gols_time2_volta = jogo.gols_time2_volta ?? null
    }

    const { error } = await supabase
      .from('copa_semi')
      .update(update)
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar')
      return
    }

    // === Premiação ===
    try {
      const BID_TIPO = 'Premiação fase semi'
      const VITORIA = 125_000_000
      const GOL = 1_250_000

      const hasGolsIda = (o: any) => o && o.gols_time1 != null && o.gols_time2 != null
      const hasGolsVolta = (o: any) => o && ('gols_time1_volta' in o || 'gols_time2_volta' in o)

      // vitória na ida (transição indefinido->definido e não empate)
      const idaAntesDef = hasGolsIda(before)
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

      // vitória na volta
      if (supportsVolta) {
        const volAntesDef = hasGolsVolta(before) &&
          ((before as any).gols_time1_volta ?? null) != null &&
          ((before as any).gols_time2_volta ?? null) != null

        const g1v = jogo.gols_time1_volta as number | null
        const g2v = jogo.gols_time2_volta as number | null
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

      // Gols — paga apenas o DELTA (ida + volta)
      const beforeIda1 = (before as any)?.gols_time1 ?? 0
      const beforeIda2 = (before as any)?.gols_time2 ?? 0
      const beforeVol1 = supportsVolta ? (((before as any)?.gols_time1_volta ?? 0)) : 0
      const beforeVol2 = supportsVolta ? (((before as any)?.gols_time2_volta ?? 0)) : 0

      const nowIda1 = (jogo.gols_time1 ?? 0)
      const nowIda2 = (jogo.gols_time2 ?? 0)
      const nowVol1 = supportsVolta ? ((jogo.gols_time1_volta ?? 0)) : 0
      const nowVol2 = supportsVolta ? ((jogo.gols_time2_volta ?? 0)) : 0

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
    setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, ...update } : j)))
  }

  const pontosCampanha = (id: string) =>
    classificacao.find(c => c.id_time === id)?.pontos ?? 0

  const semiCompleta = useMemo(
    () => jogos.length > 0 && jogos.every(j => isPlacarPreenchido(j, supportsVolta)),
    [jogos, supportsVolta]
  )

  async function finalizarSemi() {
    if (!semiCompleta) {
      toast.error('Preencha todos os placares (ida e volta, se houver) antes de finalizar.')
      return
    }

    // (Opcional) valida empates no agregado
    const empates: number[] = []
    jogos.forEach((j, i) => {
      const g1 = (j.gols_time1 || 0) + (supportsVolta ? (j.gols_time1_volta || 0) : 0)
      const g2 = (j.gols_time2 || 0) + (supportsVolta ? (j.gols_time2_volta || 0) : 0)
      if (g1 === g2) empates.push(i + 1)
    })
    if (empates.length) {
      console.warn('Semis empatadas no agregado:', empates)
    }

    try {
      const res = await fetch('/api/copa/definir-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporada: temporadaSelecionada, divisao: divisaoSelecionada })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.erro || 'Falha ao definir Final')

      toast.success('Semifinal finalizada e Final definida!')
      window.location.href = '/copa/final'
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao definir a Final')
    }
  }

  /** ====== Derivados ====== */
  const podeGravar = useMemo(() => pares.length === 2 && !parAtual.A && !parAtual.B, [pares, parAtual])

  /** ====== Render ====== */
  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto">
      {/* brilhos suaves */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          Semifinal
        </h1>

        {isAdmin && (
          <div className="flex gap-2">
            <button
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow"
              onClick={abrirSorteioPoteUnico}
            >
              🎥 Abrir sorteio (Pote Único)
            </button>
            <button
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl shadow"
              onClick={apagarSorteio}
            >
              🗑️ Apagar sorteio
            </button>
            <button
              className={`px-4 py-2 rounded-xl ${semiCompleta ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-700/50 text-white/70 cursor-not-allowed'}`}
              disabled={!semiCompleta}
              onClick={finalizarSemi}
              title={semiCompleta ? 'Definir Final' : 'Preencha todos os placares para habilitar'}
            >
              🏁 Finalizar Semifinal (definir Final)
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="p-4">🔄 Carregando jogos...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {jogos.map((jogo, idx) => (
            <MatchCard
              key={jogo.id}
              faseLabel="Semifinal"
              jogo={{ ...jogo, ordem: jogo.ordem ?? (idx + 1) }}
              supportsVolta={supportsVolta}
              logosById={logosById}
              onChange={(next) => setJogos(prev => prev.map(j => j.id === jogo.id ? next : j))}
              onSave={(updated) => salvarPlacar(updated)}
            />
          ))}
        </div>
      )}

      {/* ===== Overlay do Sorteio — Pote Único ===== */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio Semifinal — Pote Único</h3>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                onClick={() => { setSorteioAberto(false); if (isAdmin) broadcast({ sorteioAberto: false }) }}
              >
                Fechar
              </button>
            </div>

            {/* prévia do pote único */}
            <PotePreview title="Pote Único (4 classificados das Quartas)" teams={poteUnico} />

            {/* Palco */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mt-4">
              <div className="md:col-span-1 flex flex-col items-center gap-3">
                <PoteGlassUnique teams={poteUnico} />
                <button
                  className={`px-3 py-2 rounded-lg ${poteUnico.length > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600/50 cursor-not-allowed'}`}
                  onClick={sortearDoPote}
                  disabled={poteUnico.length === 0}
                >
                  🎲 Sortear próxima bola
                </button>
              </div>

              <div className="md:col-span-2">
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
            </div>

            {/* Bolinha animada */}
            <AnimatePresence>
              {anim && (
                <motion.div
                  initial={{ y: 40, scale: 0.6, opacity: 0 }}
                  animate={{ y: -10, scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.4 }}
                  className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <BallLogo team={anim} size={72} shiny />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  )
}

/** ====== Cartão de Jogo (Ida e Volta) ====== */
function MatchCard({
  jogo, supportsVolta, logosById, onChange, onSave, faseLabel = 'Semifinal'
}:{
  jogo: JogoSemi
  supportsVolta: boolean
  logosById: Record<string, string | null>
  onChange: (next: JogoSemi) => void
  onSave: (j: JogoSemi) => void
  faseLabel?: string
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ida1, ida2, vol1, vol2])

  const agg1 = (ida1 ?? 0) + (supportsVolta ? (vol1 ?? 0) : 0)
  const agg2 = (ida2 ?? 0) + (supportsVolta ? (vol2 ?? 0) : 0)
  const lead: 'empate'|'t1'|'t2' = agg1 === agg2 ? 'empate' : (agg1 > agg2 ? 't1' : 't2')

  const podeSalvar = isPlacarPreenchido({
    ...jogo,
    gols_time1: ida1,
    gols_time2: ida2,
    ...(supportsVolta ? { gols_time1_volta: vol1, gols_time2_volta: vol2 } : {})
  }, supportsVolta)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl">
      <div className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-white/60">Jogo {jogo.ordem ?? '-'} · {faseLabel}</div>
        <div
          title={`Agregado ${agg1}-${agg2}`}
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

      <LegRow
        label="Ida"
        left={{ name:jogo.time1, logo:logosById[jogo.id_time1], role:'Mandante', align:'right' }}
        right={{ name:jogo.time2, logo:logosById[jogo.id_time2], role:'Visitante', align:'left' }}
        a={ida1}
        b={ida2}
        onA={(v)=>setIda1(v)}
        onB={(v)=>setIda2(v)}
      />

      {supportsVolta && (
        <div className="mt-3">
          <LegRow
            label="Volta"
            left={{ name:jogo.time2, logo:logosById[jogo.id_time2], role:'Mandante', align:'right' }}
            right={{ name:jogo.time1, logo:logosById[jogo.id_time1], role:'Visitante', align:'left' }}
            a={vol2}
            b={vol1}
            onA={(v)=>setVol2(v)}
            onB={(v)=>setVol1(v)}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={()=>onSave({
            ...jogo,
            gols_time1: ida1,
            gols_time2: ida2,
            ...(supportsVolta ? { gols_time1_volta: vol1, gols_time2_volta: vol2 } : {})
          })}
          disabled={!podeSalvar}
          className={`px-4 py-2 rounded-xl ${podeSalvar ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600/50 text-white/70 cursor-not-allowed'} shadow focus:outline-none focus:ring-2 focus:ring-emerald-400/50`}>
          Salvar
        </button>
      </div>
    </div>
  )
}

function LegRow({
  label,
  left, right,
  a, b,
  onA, onB,
}:{
  label: string
  left: { name: string, logo?: string | null, role: 'Mandante'|'Visitante', align: 'left'|'right' }
  right:{ name: string, logo?: string | null, role: 'Mandante'|'Visitante', align: 'left'|'right' }
  a: number | null | undefined
  b: number | null | undefined
  onA: (n: number | null)=>void
  onB: (n: number | null)=>void
}) {
  const showWarnA = a == null
  const showWarnB = b == null
  return (
    <div className="grid grid-cols-12 items-center gap-x-4">
      <TeamSide name={left.name} logo={left.logo} align={left.align} role={left.role} />
      <ScoreRail
        label={label}
        a={a} b={b} onA={onA} onB={onB}
        className={`col-span-12 md:col-span-4 ${showWarnA || showWarnB ? 'ring-1 ring-rose-400/40 rounded-2xl' : ''}`}
      />
      <TeamSide name={right.name} logo={right.logo} align={right.align} role={right.role} />
    </div>
  )
}

function ScoreRail({
  label, a, b, onA, onB, className=''
}:{ label: string, a: number | null | undefined, b: number | null | undefined, onA: (n: number | null)=>void, onB: (n: number | null)=>void, className?: string }) {
  return (
    <div className={`col-span-12 md:col-span-4 ${className}`}>
      <div className="relative">
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
          {label}
        </span>

        <div className="w-full max-w-[360px] mx-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-center gap-3">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
            value={a ?? ''}
            onChange={(e)=>onA(normInt(e.target.value))}
            placeholder="0"
          />
          <span className="text-white/60">x</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
            value={b ?? ''}
            onChange={(e)=>onB(normInt(e.target.value))}
            placeholder="0"
          />
        </div>
      </div>
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

function PoteGlassUnique({ teams }:{ teams: TimeRow[] }) {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="mb-2 text-sm text-white/80">Pote Único</div>
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
