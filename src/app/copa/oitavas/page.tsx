'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

/* ================== SUPABASE ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

/* ================== UTILS ================== */
const TIMES_EXCLUIDOS = ['palmeiras', 'sociedade esportiva palmeiras']
const norm = (s?: string | null) => (s || '').toLowerCase().trim()
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const toDBId = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : v)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ================== PÁGINA ================== */
export default function OitavasPage() {
  const { isAdmin } = useAdmin()

  // jogos/estado base
  const [jogos, setJogos] = useState<JogoOitavas[]>([])
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  // sorteio 2 potes
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [poteA, setPoteA] = useState<TimeRow[]>([])
  const [poteB, setPoteB] = useState<TimeRow[]>([])
  const [filaA, setFilaA] = useState<TimeRow[]>([])
  const [filaB, setFilaB] = useState<TimeRow[]>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [animA, setAnimA] = useState<TimeRow | null>(null)
  const [animB, setAnimB] = useState<TimeRow | null>(null)
  const [confirming, setConfirming] = useState(false)

  // realtime
  const channelRef = useRef<any>(null)
  const stateRef = useRef({ sorteioAberto, poteA, poteB, filaA, filaB, parAtual, pares, animA, animB })
  useEffect(() => {
    stateRef.current = { sorteioAberto, poteA, poteB, filaA, filaB, parAtual, pares, animA, animB }
  }, [sorteioAberto, poteA, poteB, filaA, filaB, parAtual, pares, animA, animB])

  useEffect(() => {
    const ch = supabase.channel('oitavas-sorteio', { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('poteA' in p) setPoteA(p.poteA || [])
      if ('poteB' in p) setPoteB(p.poteB || [])
      if ('filaA' in p) setFilaA(p.filaA || [])
      if ('filaB' in p) setFilaB(p.filaB || [])
      if ('parAtual' in p) setParAtual(p.parAtual || {A:null, B:null})
      if ('pares' in p) setPares(p.pares || [])
      if ('animA' in p) setAnimA(p.animA || null)
      if ('animB' in p) setAnimB(p.animB || null)
    })
    ch.subscribe()
    channelRef.current = ch
    return () => { ch.unsubscribe() }
  }, [])
  const broadcast = (partial: any) => {
    const base = stateRef.current
    channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { ...base, ...partial } })
  }

  /* ================== LOAD OITAVAS ================== */
  useEffect(() => { buscarJogos() }, [])

  async function buscarJogos() {
    setLoading(true)
    // tenta com colunas de volta
    const q1 = await supabase
      .from('copa_oitavas')
      .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      .order('ordem', { ascending: true })

    let data: any[] | null = q1.data as any
    let error = q1.error

    // fallback sem volta
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
      toast.error('Erro ao buscar Oitavas')
      setJogos([]); setLogosById({}); setLoading(false)
      return
    }

    const arr = (data || []) as JogoOitavas[]
    setJogos(arr)

    const ids = Array.from(new Set(arr.flatMap(j => [j.id_time1, j.id_time2])))
    if (ids.length) {
      const { data: times } = await supabase.from('times').select('id, logo_url').in('id', ids)
      const map: Record<string, string | null> = {}
      ;(times || []).forEach(t => { map[t.id] = t.logo_url ?? null })
      setLogosById(map)
    } else {
      setLogosById({})
    }
    setLoading(false)
  }

  /* ================== POTE A = TOP 8 FASE LIGA ================== */
  type JogoLiga = {
    id_time1?: string | null; id_time2?: string | null
    time1?: string | null; time2?: string | null
    gols_time1: number | null; gols_time2: number | null
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
      .not('gols_time1','is',null)
      .not('gols_time2','is',null)
    if (!ea && a && a.length) return a as JogoLiga[]
    const { data: b } = await supabase
      .from('fase_liga')
      .select('*')
      .not('gols_time1','is',null)
      .not('gols_time2','is',null)
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
      .from('times').select('id,nome,logo_url')
    if (errTimes) throw errTimes

    const mapaTimes: Record<string, { id: string; nome: string; logo_url: string | null }> = {}
    for (const t of (times || [])) {
      if (TIMES_EXCLUIDOS.includes(norm(t.nome))) continue
      mapaTimes[t.id] = { id: t.id, nome: t.nome, logo_url: t.logo_url ?? null }
    }

    const jogos = await carregarJogosFaseLiga()
    const base: Record<string, LinhaClassificacao> = {}
    for (const id of Object.keys(mapaTimes)) {
      base[id] = { id_time:id, pontos:0, vitorias:0, gols_pro:0, gols_contra:0, saldo:0, jogos:0 }
    }
    for (const j of jogos) {
      if (j.gols_time1 == null || j.gols_time2 == null) continue
      const id1 = resolverIdDoTime(j, 1, mapaTimes as any)
      const id2 = resolverIdDoTime(j, 2, mapaTimes as any)
      if (!id1 || !id2) continue
      if (!base[id1] || !base[id2]) continue
      const g1 = Number(j.gols_time1), g2 = Number(j.gols_time2)
      base[id1].gols_pro += g1; base[id1].gols_contra += g2; base[id1].jogos += 1
      base[id2].gols_pro += g2; base[id2].gols_contra += g1; base[id2].jogos += 1
      if (g1 > g2) { base[id1].vitorias += 1; base[id1].pontos += 3 }
      else if (g2 > g1) { base[id2].vitorias += 1; base[id2].pontos += 3 }
      else { base[id1].pontos += 1; base[id2].pontos += 1 }
      base[id1].saldo = base[id1].gols_pro - base[id1].gols_contra
      base[id2].saldo = base[id2].gols_pro - base[id2].gols_contra
    }
    const ordenada = Object.values(base).sort((a,b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      const sA = a.gols_pro - a.gols_contra, sB = b.gols_pro - b.gols_contra
      if (sB !== sA) return sB - sA
      if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
      return b.vitorias - a.vitorias
    })
    const top8 = ordenada.slice(0,8)
    return top8.map(l => ({ id:l.id_time, nome: (mapaTimes[l.id_time]?.nome ?? 'Time'), logo_url: mapaTimes[l.id_time]?.logo_url ?? null }))
  }

  /* ================== POTE B = VENCEDORES DO PLAYOFF ================== */
  type RowPlayoff = {
    rodada: 1|2
    id_time1: string
    id_time2: string
    gols_time1: number | null
    gols_time2: number | null
  }
  async function pegarVencedoresPlayoff(): Promise<TimeRow[]> {
    const { data, error } = await supabase
      .from('copa_playoff')
      .select('rodada,id_time1,id_time2,gols_time1,gols_time2')
    if (error) throw error

    const linhas = (data || []) as RowPlayoff[]
    const jogados = linhas.filter(r => r.gols_time1 != null && r.gols_time2 != null)

    type Tr = {
      a: string; b: string
      firstId1: string; // id_time1 do primeiro jogo do confronto (para desempate)
      golsA: number; golsB: number
      jogos: number
    }
    const mapa = new Map<string, Tr>()
    for (const r of jogados) {
      const [a,b] = [r.id_time1, r.id_time2].sort()
      const key = `${a}|${b}`
      if (!mapa.has(key)) {
        mapa.set(key, { a, b, firstId1: r.id_time1, golsA:0, golsB:0, jogos:0 })
      }
      const ref = mapa.get(key)!
      if (r.id_time1 === a) { ref.golsA += (r.gols_time1 || 0); ref.golsB += (r.gols_time2 || 0) }
      else { ref.golsA += (r.gols_time2 || 0); ref.golsB += (r.gols_time1 || 0) }
      ref.jogos += 1
    }

    const chaves = Array.from(mapa.values())
    if (chaves.some(tr => tr.jogos < 2)) throw new Error('Existem confrontos do playoff sem os dois jogos.')
    const vencedoresIds: string[] = []
    for (const tr of chaves) {
      if (tr.golsA > tr.golsB) vencedoresIds.push(tr.a)
      else if (tr.golsB > tr.golsA) vencedoresIds.push(tr.b)
      else vencedoresIds.push(tr.firstId1) // empate -> id_time1 do 1º jogo
    }
    if (vencedoresIds.length !== 8) throw new Error('Precisamos de exatamente 8 vencedores do playoff.')

    const { data: times, error: terr } = await supabase
      .from('times').select('id,nome,logo_url').in('id', vencedoresIds)
    if (terr) throw terr
    const map = new Map<string, TimeRow>()
    ;(times||[]).forEach(t => map.set(t.id, { id:t.id, nome:t.nome, logo_url: t.logo_url ?? null }))
    return vencedoresIds.map(id => map.get(id)!).filter(Boolean)
  }

  /* ================== AÇÕES: SORTEIO/GRAVAÇÃO/APAGAR ================== */
  async function abrirSorteio() {
    if (!isAdmin) return

    // bloqueia se já existir oitavas
    const { count, error: cErr } = await supabase
      .from('copa_oitavas').select('id', { head:true, count:'exact' })
    if (cErr) { toast.error('Falha ao checar Oitavas.'); return }
    if ((count ?? 0) > 0) {
      toast.error('Já existem confrontos das Oitavas. Apague antes de sortear.')
      return
    }

    try {
      const [a, b] = await Promise.all([pegarTop8FaseLiga(), pegarVencedoresPlayoff()])
      if (a.length !== 8 || b.length !== 8) {
        toast.error('Precisamos de 8 times no Pote A e 8 no Pote B.')
        return
      }
      const filaB = shuffle([...b]) // embaralha B como nas quartas
      setPoteA(a); setPoteB(b)
      setFilaA([...a]); setFilaB(filaB)
      setParAtual({ A:null, B:null })
      setPares([])
      setSorteioAberto(true)
      setAnimA(null); setAnimB(null)
      broadcast({
        sorteioAberto: true,
        poteA: a, poteB: b,
        filaA: [...a], filaB,
        parAtual: { A:null, B:null },
        pares: [], animA: null, animB: null
      })
    } catch (e:any) {
      console.error(e)
      toast.error(e?.message || 'Falha ao montar potes das Oitavas.')
    }
  }

  async function apagarOitavas() {
    if (!isAdmin) return
    const ok = confirm('Apagar TODOS os confrontos das Oitavas?')
    if (!ok) return
    const { error } = await supabase.from('copa_oitavas').delete().neq('id', 0)
    if (error) { toast.error('Erro ao apagar Oitavas'); return }
    toast.success('Oitavas apagadas!')
    setPares([]); setParAtual({A:null,B:null})
    setFilaA([]); setFilaB([])
    setPoteA([]); setPoteB([])
    setSorteioAberto(false)
    setAnimA(null); setAnimB(null)
    broadcast({ sorteioAberto:false, filaA:[], filaB:[], pares:[], parAtual:{A:null,B:null}, animA:null, animB:null })
    await buscarJogos()
  }

  function sortearDoPoteA() {
    if (!isAdmin || parAtual.A || filaA.length === 0) return
    const idx = Math.floor(Math.random() * filaA.length)
    const escolhido = filaA[idx]
    const nova = [...filaA]; nova.splice(idx, 1)
    setFilaA(nova); setAnimA(escolhido); broadcast({ animA: escolhido, filaA: nova })
    setTimeout(() => {
      setParAtual(prev => ({ ...prev, A: escolhido }))
      setTimeout(() => setAnimA(null), 350)
      broadcast({ parAtual: { ...stateRef.current.parAtual, A: escolhido }, animA: null })
    }, 800)
  }
  function sortearDoPoteB() {
    if (!isAdmin || !parAtual.A || parAtual.B || filaB.length === 0) return
    const idx = Math.floor(Math.random() * filaB.length)
    const escolhido = filaB[idx]
    const nova = [...filaB]; nova.splice(idx, 1)
    setFilaB(nova); setAnimB(escolhido); broadcast({ animB: escolhido, filaB: nova })
    setTimeout(() => {
      setParAtual(prev => ({ ...prev, B: escolhido }))
      setTimeout(() => setAnimB(null), 350)
      broadcast({ parAtual: { ...stateRef.current.parAtual, B: escolhido }, animB: null })
    }, 800)
  }
  function confirmarConfronto() {
    if (!isAdmin || !parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A!, parAtual.B!] as [TimeRow, TimeRow]]
    setPares(novos); setParAtual({A:null, B:null})
    broadcast({ pares: novos, parAtual: { A:null, B:null } })
  }

  async function gravarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8 || parAtual.A || parAtual.B) {
      toast.error('Finalize os 8 confrontos antes de gravar.')
      return
    }
    try {
      setConfirming(true)
      // limpa
      await supabase.from('copa_oitavas').delete().not('id','is',null).throwOnError()

      const base = pares.map(([A,B], idx) => ({
        rodada: 1,
        ordem: idx + 1,
        id_time1: toDBId(A.id),
        id_time2: toDBId(B.id),
        time1: A.nome,
        time2: B.nome,
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null,
      }))

      // tenta inserir com colunas de volta, senão sem
      let ins = await supabase.from('copa_oitavas').insert(base as any)
      if (ins.error && mentionsVolta(ins.error.message)) {
        const semVolta = base.map(({ gols_time1_volta, gols_time2_volta, ...rest }) => rest)
        ins = await supabase.from('copa_oitavas').insert(semVolta as any)
      }
      if (ins.error) throw ins.error

      toast.success('Oitavas sorteadas e gravadas!')
      setSorteioAberto(false); broadcast({ sorteioAberto:false })
      await buscarJogos()
    } catch (e:any) {
      console.error(e)
      toast.error(`Erro ao gravar confrontos: ${e?.message || e}`)
    } finally {
      setConfirming(false)
    }
  }

  /* ============ DERIVADOS/UI ============ */
  const podeGravar = useMemo(() => pares.length === 8 && !parAtual.A && !parAtual.B, [pares, parAtual])

  /* ============ RENDER ============ */
  if (loading) return <div className="p-4">🔄 Carregando…</div>

  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          Oitavas de Final
        </h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl shadow" onClick={abrirSorteio}>
              🎥 Abrir sorteio (Top 8 × Playoff)
            </button>
            <button className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl shadow" onClick={apagarOitavas}>
              🗑️ Apagar Oitavas
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
            onSave={async (updated) => {
              const update: any = { gols_time1: updated.gols_time1, gols_time2: updated.gols_time2 }
              if (supportsVolta) {
                update.gols_time1_volta = updated.gols_time1_volta ?? null
                update.gols_time2_volta = updated.gols_time2_volta ?? null
              }
              const { error } = await supabase.from('copa_oitavas').update(update).eq('id', updated.id)
              if (error) toast.error('Erro ao salvar'); else toast.success('Placar salvo!')
            }}
          />
        ))}
      </div>

      {/* Overlay do Sorteio por Potes */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio Oitavas — Pote A (Top 8) × Pote B (Playoff)</h3>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                onClick={() => { setSorteioAberto(false); broadcast({ sorteioAberto:false }) }}
              >
                Fechar
              </button>
            </div>

            {/* prévias */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <PotePreview title="Pote A — Top 8" teams={poteA} />
              <PotePreview title="Pote B — Vencedores do Playoff" teams={poteB} />
            </div>

            {/* Palco */}
            <div className="grid grid-cols-9 gap-4 items-start">
              {/* Pote A */}
              <div className="col-span-3 flex flex-col items-center gap-3">
                <PoteGlass title="Pote A" teams={filaA} />
                <button
                  className={`px-3 py-2 rounded-lg ${!parAtual.A && filaA.length > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-600/50 cursor-not-allowed'}`}
                  onClick={sortearDoPoteA}
                  disabled={!!parAtual.A || filaA.length === 0}
                >
                  🎲 Sortear do Pote A
                </button>
              </div>

              {/* Centro */}
              <div className="col-span-3">
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

                {/* pares formados */}
                <div className="w-full mt-4 space-y-2 max-h-56 overflow-auto">
                  {pares.map(([a,b], i) => (
                    <div key={a.id + b.id + i} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><TeamLogo url={a.logo_url} alt={a.nome} size={28} /><span className="font-medium">{a.nome}</span></div>
                        <span className="text-white/60">x</span>
                        <div className="flex items-center gap-2"><span className="font-medium">{b.nome}</span><TeamLogo url={b.logo_url} alt={b.nome} size={28} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* gravar */}
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

              {/* Pote B */}
              <div className="col-span-3 flex flex-col items-center gap-3">
                <PoteGlass title="Pote B" teams={filaB} />
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
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.9 }}
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
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.9 }}
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

/* ================== SUBCOMPONENTES ================== */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ida1, ida2, vol1, vol2])

  const agg1 = (ida1 ?? 0) + (supportsVolta ? (vol1 ?? 0) : 0)
  const agg2 = (ida2 ?? 0) + (supportsVolta ? (vol2 ?? 0) : 0)
  const lead: 'empate'|'t1'|'t2' = agg1 === agg2 ? 'empate' : (agg1 > agg2 ? 't1' : 't2')

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl">
      <div className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
      <div className="flex items-center justify-between mb-4">
        <div className="text-[13px] text-white/60">Jogo {jogo.ordem ?? '-'} · Oitavas</div>
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

      {/* Ida */}
      <LegRow
        label="Ida"
        left={{ name:jogo.time1, logo:logosById[jogo.id_time1], role:'Mandante', align:'right' }}
        right={{ name:jogo.time2, logo:logosById[jogo.id_time2], role:'Visitante', align:'left' }}
        a={ida1}
        b={ida2}
        onA={(v)=>setIda1(v)}
        onB={(v)=>setIda2(v)}
      />
      {/* Volta */}
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
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow focus:outline-none focus:ring-2 focus:ring-emerald-400/50">
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
  return (
    <div className="grid grid-cols-12 items-center gap-x-4">
      <TeamSide name={left.name} logo={left.logo} align={left.align} role={left.role} />
      <ScoreRail label={label} a={a} b={b} onA={onA} onB={onB} className="col-span-12 md:col-span-4" />
      <TeamSide name={right.name} logo={right.logo} align={right.align} role={right.role} />
    </div>
  )
}

function ScoreRail({
  label, a, b, onA, onB, className=''
}:{ label: string, a: number | null | undefined, b: number | null | undefined, onA: (n: number | null)=>void, onB: (n: number | null)=>void, className?: string }) {
  const normInt = (val: string): number | null => {
    if (val === '') return null
    const n = parseInt(val, 10)
    if (Number.isNaN(n) || n < 0) return null
    return n
  }
  return (
    <div className={`col-span-12 md:col-span-4 ${className}`}>
      <div className="relative">
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
          {label}
        </span>
        <div className="w-full max-w-[360px] mx-auto rounded-2xl border border-white/10 bg-white/5 px-3 py-2 flex items-center justify-center gap-3">
          <input
            type="number" min={0} inputMode="numeric"
            className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
            value={a ?? ''} onChange={(e)=>onA(normInt(e.target.value))}
            placeholder="0"
          />
          <span className="text-white/60">x</span>
          <input
            type="number" min={0} inputMode="numeric"
            className="w-16 md:w-20 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-white/20"
            value={b ?? ''} onChange={(e)=>onB(normInt(e.target.value))}
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

function PoteGlass({ title, teams }:{ title: string; teams: TimeRow[] }) {
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
