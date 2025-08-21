'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Tipos ========= */
type TimeRow = { id: string; nome: string; logo_url: string | null }

type JogoSemi = {
  id: number
  ordem?: number | null
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  // opcionais (schema pode não ter)
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

type JogoQuartasMin = {
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

type Classificacao = { id_time: string; pontos: number }

/** ========= Utils ========= */
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const mentionsOrdem = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('ordem') && (s.includes('does not exist') || s.includes('column') || s.includes('unknown'))
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
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const toDBId = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : v)

/** ========= Página ========= */
export default function SemiPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<JogoSemi[]>([])
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [classificacao, setClassificacao] = useState<Classificacao[]>([])
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)

  // ===== sorteio ao vivo (pote único) =====
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [pote, setPote] = useState<TimeRow[]>([])
  const [fila, setFila] = useState<TimeRow[]>([])
  const [parAtual, setParAtual] = useState<{ A: TimeRow | null; B: TimeRow | null }>({ A: null, B: null })
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [anim, setAnim] = useState<TimeRow | null>(null)
  const [confirming, setConfirming] = useState(false)

  // realtime
  const channelRef = useRef<any>(null)
  const stateRef = useRef({ sorteioAberto, pote, fila, parAtual, pares, anim })
  useEffect(() => { stateRef.current = { sorteioAberto, pote, fila, parAtual, pares, anim } },
    [sorteioAberto, pote, fila, parAtual, pares, anim])

  useEffect(() => {
    const ch = supabase.channel('semi-sorteio', { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'semi-state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('pote' in p) setPote(p.pote || [])
      if ('fila' in p) setFila(p.fila || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A: null, B: null })
      if ('pares' in p) setPares(p.pares || [])
      if ('anim' in p) setAnim(p.anim || null)
    })
    ch.subscribe()
    channelRef.current = ch
    return () => { ch.unsubscribe() }
  }, [])
  const broadcast = (partial: any) => {
    const base = stateRef.current
    channelRef.current?.send({ type: 'broadcast', event: 'semi-state', payload: { ...base, ...partial } })
  }

  useEffect(() => {
    Promise.all([buscarJogos(), buscarClassificacao()]).finally(() => setLoading(false))
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

  async function salvarPlacar(jogo: JogoSemi) {
    if (!isPlacarPreenchido(jogo, supportsVolta)) {
      toast.error('Preencha os dois campos da Ida e os dois da Volta antes de salvar.')
      return
    }

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
    } else {
      toast.success('Placar salvo!')
      setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, ...update } : j)))
    }
  }

  const pontosCampanha = (id: string) =>
    classificacao.find(c => c.id_time === id)?.pontos ?? 0

  const semiCompleta = useMemo(
    () => jogos.length > 0 && jogos.every(j => isPlacarPreenchido(j, supportsVolta)),
    [jogos, supportsVolta]
  )

  /** ====== SORTEIO AO VIVO (pote único) ====== */
  async function abrirSorteio() {
    if (!isAdmin) return

    // bloqueia caso já exista semi gravada
    const { count, error: cErr } = await supabase
      .from('copa_semi')
      .select('id', { head: true, count: 'exact' })
    if (cErr) {
      toast.error('Falha ao checar semifinais existentes.')
      return
    }
    if ((count ?? 0) > 0) {
      toast.error('Já existem confrontos da Semifinal. Apague antes de sortear.')
      return
    }

    // buscar quartas (com/sem volta)
    let hasVolta = true
    let data: any[] | null = null
    {
      const q1 = await supabase
        .from('copa_quartas')
        .select('id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      if (q1.error && mentionsVolta(q1.error.message)) {
        hasVolta = false
        const q2 = await supabase
          .from('copa_quartas')
          .select('id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        if (q2.error) { toast.error('Erro ao ler Quartas'); return }
        data = q2.data as any
      } else if (q1.error) {
        toast.error('Erro ao ler Quartas')
        return
      } else {
        data = q1.data as any
      }
    }

    const jogosQ = (data || []) as JogoQuartasMin[]
    if (jogosQ.length !== 4) {
      toast.error('É preciso ter 4 confrontos nas Quartas.')
      return
    }
    // validar completos
    const incompletos = jogosQ.some(j =>
      j.gols_time1 === null || j.gols_time2 === null ||
      (hasVolta && ((j.gols_time1_volta ?? null) === null || (j.gols_time2_volta ?? null) === null))
    )
    if (incompletos) {
      toast.error('Preencha todos os placares das Quartas (ida e volta, se houver).')
      return
    }

    // vencedores (desempate: melhor campanha)
    const vencedoresIds: string[] = []
    for (const j of jogosQ) {
      const ida1 = j.gols_time1 || 0
      const ida2 = j.gols_time2 || 0
      const vol1 = hasVolta ? (j.gols_time1_volta || 0) : 0
      const vol2 = hasVolta ? (j.gols_time2_volta || 0) : 0
      const t1 = ida1 + vol1
      const t2 = ida2 + vol2
      if (t1 > t2) vencedoresIds.push(j.id_time1)
      else if (t2 > t1) vencedoresIds.push(j.id_time2)
      else vencedoresIds.push((pontosCampanha(j.id_time1) >= pontosCampanha(j.id_time2)) ? j.id_time1 : j.id_time2)
    }

    // busca nomes/logos
    const { data: timesData, error: tErr } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .in('id', vencedoresIds)
    if (tErr) { toast.error('Erro ao buscar times classificados.'); return }

    const pot: TimeRow[] = (timesData || []).map(t => ({
      id: t.id, nome: t.nome, logo_url: t.logo_url ?? null
    }))
    if (pot.length !== 4) {
      toast.error('Não consegui montar o pote com 4 times.')
      return
    }

    const fila = shuffle(pot)
    setPote(pot); setFila(fila)
    setParAtual({ A: null, B: null })
    setPares([])
    setSorteioAberto(true)
    setAnim(null)
    broadcast({ sorteioAberto: true, pote: pot, fila, parAtual: { A: null, B: null }, pares: [], anim: null })
  }

  async function apagarSemi() {
    if (!isAdmin) return
    const ok = confirm('Apagar TODOS os confrontos da Semifinal?')
    if (!ok) return
    try {
      const { error } = await supabase.from('copa_semi').delete().neq('id', 0)
      if (error) throw error
      toast.success('Semifinais apagadas!')
      setPares([]); setParAtual({ A: null, B: null }); setFila([]); setPote([]); setSorteioAberto(false); setAnim(null)
      broadcast({ pares: [], parAtual: { A: null, B: null }, fila: [], pote: [], sorteioAberto: false, anim: null })
      await buscarJogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao apagar semifinal: ${e?.message || e}`)
    }
  }

  function sortearBola() {
    if (!isAdmin) return
    if (fila.length === 0) return
    const escolhido = fila[0]
    const nova = fila.slice(1)
    setFila(nova)
    setAnim(escolhido)
    broadcast({ anim: escolhido, fila: nova })

    setTimeout(() => {
      setParAtual(prev => {
        if (!prev.A) return { A: escolhido, B: null }
        if (!prev.B) return { ...prev, B: escolhido }
        return prev
      })
      setTimeout(() => setAnim(null), 350)
      const next = stateRef.current.parAtual
      const nextA = !next.A ? escolhido : next.A
      const nextB = next.A && !next.B ? escolhido : next.B
      broadcast({ parAtual: { A: nextA, B: nextB }, anim: null })
    }, 800)
  }

  function confirmarConfronto() {
    if (!isAdmin || !parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A!, parAtual.B!] as [TimeRow, TimeRow]]
    setPares(novos)
    setParAtual({ A: null, B: null })
    broadcast({ pares: novos, parAtual: { A: null, B: null } })
  }

  async function gravarSemis() {
    if (!isAdmin) return
    if (pares.length !== 2 || parAtual.A || parAtual.B) {
      toast.error('Forme os 2 confrontos antes de gravar.')
      return
    }

    try {
      setConfirming(true)
      // limpar
      await supabase.from('copa_semi').delete().not('id', 'is', null).throwOnError()

      const base = pares.map(([a, b], idx) => ({
        rodada: 1,
        ordem: idx + 1,
        id_time1: toDBId(a.id),
        id_time2: toDBId(b.id),
        time1: a.nome,
        time2: b.nome,
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null,
      }))

      // 1) tenta com *_volta + ordem
      let ins = await supabase.from('copa_semi').insert(base as any)
      // 2) sem *_volta
      if (ins.error && mentionsVolta(ins.error.message)) {
        const semVolta = base.map(({ gols_time1_volta, gols_time2_volta, ...rest }) => rest)
        ins = await supabase.from('copa_semi').insert(semVolta as any)
      }
      // 3) se faltar 'ordem'
      if (ins.error && mentionsOrdem(ins.error.message)) {
        const semOrdem = base.map(({ ordem, ...rest }) => rest)
        const ins2 = await supabase.from('copa_semi').insert(semOrdem as any)
        if (ins2.error) throw ins2.error
      } else if (ins.error) {
        throw ins.error
      }

      toast.success('Semifinais gravadas!')
      setSorteioAberto(false); broadcast({ sorteioAberto: false })
      await buscarJogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao gravar semifinais: ${e?.message || e}`)
    } finally {
      setConfirming(false)
    }
  }

  async function finalizarSemi() {
    if (!semiCompleta) {
      toast.error('Preencha todos os placares (ida e volta, se houver) antes de finalizar.')
      return
    }

    // recomputa vencedores para popular a Final (modo silencioso, igual já enviamos antes)
    const vencedores: Array<{ id: string; nome: string }> = []
    for (const jogo of jogos) {
      const gols1 = (jogo.gols_time1 || 0) + (supportsVolta ? (jogo.gols_time1_volta || 0) : 0)
      const gols2 = (jogo.gols_time2 || 0) + (supportsVolta ? (jogo.gols_time2_volta || 0) : 0)

      let vencedorId = ''
      let vencedorNome = ''
      if (gols1 > gols2) {
        vencedorId = jogo.id_time1
        vencedorNome = jogo.time1
      } else if (gols2 > gols1) {
        vencedorId = jogo.id_time2
        vencedorNome = jogo.time2
      } else {
        const p1 = pontosCampanha(jogo.id_time1)
        const p2 = pontosCampanha(jogo.id_time2)
        if (p1 >= p2) { vencedorId = jogo.id_time1; vencedorNome = jogo.time1 }
        else { vencedorId = jogo.id_time2; vencedorNome = jogo.time2 }
      }
      vencedores.push({ id: vencedorId, nome: vencedorNome })
    }

    if (vencedores.length < 2) {
      toast.error('É necessário ter 2 vencedores para formar a Final.')
      return
    }

    try {
      await supabase.from('copa_final').delete().not('id', 'is', null)

      let tryList = await supabase.from('copa_final').insert(
        vencedores.map(v => ({ id_time: v.id, time: v.nome })) as any
      )

      if (tryList.error) {
        const baseRow: any = {
          id_time1: vencedores[0].id,
          id_time2: vencedores[1].id,
          time1: vencedores[0].nome,
          time2: vencedores[1].nome,
          gols_time1: null,
          gols_time2: null,
          gols_time1_volta: null,
          gols_time2_volta: null,
        }
        let tryMatch = await supabase.from('copa_final').insert(baseRow)
        if (tryMatch.error && mentionsVolta(tryMatch.error.message)) {
          const { gols_time1_volta, gols_time2_volta, ...semVolta } = baseRow
          tryMatch = await supabase.from('copa_final').insert(semVolta)
        }
        if (tryMatch.error) throw tryMatch.error
      }

      toast.success('Semifinal finalizada e Final definida!')
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao definir a Final: ${e?.message || e}`)
    }
  }

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
            <button className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white" onClick={abrirSorteio}>
              🎥 Abrir sorteio (pote único)
            </button>
            <button className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white" onClick={apagarSemi}>
              🗑️ Apagar semifinal
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

      {/* ===== Overlay do Sorteio por POTE ÚNICO ===== */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio Semifinal — Pote Único</h3>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
                onClick={() => { setSorteioAberto(false); broadcast({ sorteioAberto: false }) }}
              >
                Fechar
              </button>
            </div>

            {/* prévia do pote (com logos) */}
            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-sm text-white/70 mb-2">Pote</div>
              <div className="flex flex-wrap gap-2">
                {pote.map(t => (
                  <span key={t.id} className="px-2 py-1 rounded-full bg-white/10 text-sm flex items-center gap-2">
                    <TeamLogo url={t.logo_url} alt={t.nome} size={16} />
                    {t.nome}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 items-start">
              {/* Pote de bolas */}
              <div className="col-span-1 flex flex-col items-center">
                <PoteGlass title="Pote único" teams={fila} />
                <button
                  className={`mt-3 px-3 py-2 rounded-lg ${fila.length > 0 ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-600/50 cursor-not-allowed'}`}
                  onClick={sortearBola}
                  disabled={fila.length === 0}
                >
                  🎲 Sortear bola
                </button>
              </div>

              {/* Centro: confronto atual */}
              <div className="col-span-1">
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

                {/* confrontos formados */}
                <div className="w-full mt-4 space-y-2">
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

                <div className="w-full mt-4 flex justify-end">
                  <button
                    className={`px-4 py-2 rounded-lg ${(pares.length === 2 && !parAtual.A && !parAtual.B && !confirming) ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600/50 cursor-not-allowed'}`}
                    disabled={!(pares.length === 2 && !parAtual.A && !parAtual.B) || confirming}
                    onClick={gravarSemis}
                  >
                    {confirming ? 'Gravando…' : '✅ Gravar semifinais'}
                  </button>
                </div>
              </div>

              {/* Lado vazio para balancear layout */}
              <div className="col-span-1" />
            </div>

            {/* Bolinha animada */}
            <AnimatePresence>
              {anim && (
                <motion.div
                  initial={{ y: 60, scale: 0.6, opacity: 0 }}
                  animate={{ y: -10, scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, duration: 0.9 }}
                  className="pointer-events-none fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <BallLogo team={anim} size={80} shiny />
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
