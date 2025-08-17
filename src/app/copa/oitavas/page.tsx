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
interface TimeRow {
  id: string
  nome: string
  logo_url: string | null
}
type JogoOitavas = {
  id: number
  ordem: number
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  gols_time1_volta: number | null
  gols_time2_volta: number | null
}

/** ========= POTES FORÇADOS ========= */
const POTE_A_KEYS = [
  'Belgrano', 'Velez', 'Independiente', 'Boca',
  'Liverpool FC', 'Sporting CP', 'Manchester City', 'Fiorentina'
] as const

const POTE_B_KEYS = [
  'Santa Clara', 'Rio Ave', 'PSG', 'Parma',
  'SV Elversberg', 'Barcelona', 'Racing', 'Chelsea'
] as const

// Ajuste aqui se o nome no seu banco estiver ligeiramente diferente
const TEAM_ALIASES: Record<string, string[]> = {
  // Pote A
  'Belgrano': ['Belgrano'],
  'Velez': ['Vélez', 'Velez', 'Vélez Sarsfield', 'Velez Sarsfield'],
  'Independiente': ['Independiente'],
  'Boca': ['Boca Jrs', 'Boca Juniors', 'Boca'],
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

async function findTeamByAliases(aliases: string[]): Promise<TimeRow | null> {
  // 1) exato
  for (const alias of aliases) {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .eq('nome', alias)
      .limit(1)
      .maybeSingle()
    if (!error && data) return { id: data.id, nome: data.nome, logo_url: data.logo_url ?? null }
  }
  // 2) ilike
  for (const alias of aliases) {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .ilike('nome', `%${alias}%`)
      .limit(1)
      .maybeSingle()
    if (!error && data) return { id: data.id, nome: data.nome, logo_url: data.logo_url ?? null }
  }
  return null
}

async function montarPotePorLista(keys: readonly string[]): Promise<TimeRow[]> {
  const faltantes: string[] = []
  const encontrados: TimeRow[] = []

  for (const key of keys) {
    const aliases = TEAM_ALIASES[key] || [key]
    const t = await findTeamByAliases(aliases)
    if (t) encontrados.push(t)
    else faltantes.push(key)
  }

  if (faltantes.length) {
    toast.error(`Times não encontrados: ${faltantes.join(', ')}`)
  }
  return encontrados
}

/** ========= Componente ========= */
export default function OitavasPage() {
  const { isAdmin } = useAdmin()

  // dados
  const [jogos, setJogos] = useState<JogoOitavas[]>([])
  const [loading, setLoading] = useState(true)

  // potes / sorteio
  const [poteA, setPoteA] = useState<TimeRow[]>([])
  const [poteB, setPoteB] = useState<TimeRow[]>([])

  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [filaA, setFilaA] = useState<TimeRow[]>([])
  const [filaB, setFilaB] = useState<TimeRow[]>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([]) // [A,B]
  const [confirming, setConfirming] = useState(false)

  // animações
  const [animA, setAnimA] = useState<TimeRow | null>(null)
  const [animB, setAnimB] = useState<TimeRow | null>(null)

  // realtime simples
  const channelRef = useRef<any>(null)
  const stateRef = useRef({
    sorteioAberto, filaA, filaB, parAtual, pares, animA, animB,
  })
  useEffect(() => {
    stateRef.current = { sorteioAberto, filaA, filaB, parAtual, pares, animA, animB }
  }, [sorteioAberto, filaA, filaB, parAtual, pares, animA, animB])

  useEffect(() => {
    const ch = supabase.channel('oitavas-sorteio', { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('filaA' in p) setFilaA(p.filaA || [])
      if ('filaB' in p) setFilaB(p.filaB || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A: null, B: null })
      if ('pares' in p) setPares(p.pares || [])
      if ('animA' in p) setAnimA(p.animA || null)
      if ('animB' in p) setAnimB(p.animB || null)
    })
    ch.subscribe()
    channelRef.current = ch
    return () => { ch.unsubscribe() }
  }, [])

  function broadcast(partial: any) {
    const base = stateRef.current
    channelRef.current?.send({ type: 'broadcast', event: 'state', payload: { ...base, ...partial } })
  }

  useEffect(() => { buscarJogos() }, [])

  /** ===== Buscar jogos (ordem ASC) ===== */
  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_oitavas')
      .select('id, ordem, id_time1, id_time2, time1, time2, gols_time1, gols_time2, gols_time1_volta, gols_time2_volta')
      .order('ordem', { ascending: true })

    if (error) {
      console.error('buscarJogos error:', error)
      toast.error(`Erro ao buscar Oitavas: ${error.message || error}`)
      setJogos([])
    } else {
      setJogos((data || []) as JogoOitavas[])
    }
    setLoading(false)
  }

  /** ===== Abrir sorteio (potes forçados) ===== */
  async function abrirSorteio() {
    if (!isAdmin) return
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

      setPoteA(a)
      setPoteB(b)
      setFilaA([...a])
      setFilaB(shuffle(b))
      setParAtual({ A: null, B: null })
      setPares([])
      setSorteioAberto(true)
      setAnimA(null); setAnimB(null)

      broadcast({
        sorteioAberto: true,
        filaA: [...a],
        filaB: shuffle(b),
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

  /** ===== Sorteio ===== */
  function sortearDoPoteA() {
    if (!isAdmin || parAtual.A || filaA.length === 0) return
    const idx = Math.floor(Math.random() * filaA.length)
    const escolhido = filaA[idx]
    const nova = [...filaA]; nova.splice(idx, 1)
    setFilaA(nova)
    setAnimA(escolhido); broadcast({ animA: escolhido, filaA: nova })
    setTimeout(() => {
      setParAtual(prev => ({ ...prev, A: escolhido }))
      setTimeout(() => setAnimA(null), 400)
      broadcast({ parAtual: { ...stateRef.current.parAtual, A: escolhido }, animA: null })
    }, 900)
  }

  function sortearDoPoteB() {
    if (!isAdmin || !parAtual.A || parAtual.B || filaB.length === 0) return
    const escolhido = filaB[0]
    const nova = filaB.slice(1)
    setFilaB(nova)
    setAnimB(escolhido); broadcast({ animB: escolhido, filaB: nova })
    setTimeout(() => {
      setParAtual(prev => ({ ...prev, B: escolhido }))
      setTimeout(() => setAnimB(null), 400)
      broadcast({ parAtual: { ...stateRef.current.parAtual, B: escolhido }, animB: null })
    }, 900)
  }

  function confirmarConfronto() {
    if (!isAdmin || !parAtual.A || !parAtual.B) return
    const novos = [...pares, [parAtual.A!, parAtual.B!] as [TimeRow, TimeRow]]
    setPares(novos)
    setParAtual({ A: null, B: null })
    broadcast({ pares: novos, parAtual: { A: null, B: null } })
  }

  /** ===== Gravar confrontos (com rodada e ordem) ===== */
  async function gravarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) { toast.error('Finalize os 8 confrontos.'); return }

    try {
      setConfirming(true)

      // apaga tudo (funciona com id int ou uuid)
      const { error: delErr } = await supabase
        .from('copa_oitavas')
        .delete()
        .not('id', 'is', null)
      if (delErr) {
        console.error('delete oitavas error:', delErr)
        toast.error(`Erro ao limpar oitavas: ${delErr.message || delErr}`)
        return
      }

      // monta payload com rodada 1 e ordem 1..8
      const toDBId = (v: string) => (/^[0-9]+$/.test(v) ? Number(v) : v)
      const payload = pares.map(([A,B], idx) => ({
        rodada: 1,
        ordem: idx + 1,
        id_time1: toDBId(A.id),
        id_time2: toDBId(B.id),
        time1: A.nome,
        time2: B.nome,
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null
      }))

      const { data: inserted, error: insErr } = await supabase
        .from('copa_oitavas')
        .insert(payload)
        .select('id, ordem, id_time1, id_time2, time1, time2, gols_time1, gols_time2, gols_time1_volta, gols_time2_volta')

      if (insErr) {
        console.error('insert oitavas error:', insErr)
        toast.error(`Erro ao inserir confrontos: ${insErr.message || insErr}`)
        return
      }

      setJogos((inserted || []) as JogoOitavas[])
      toast.success(`Oitavas gravadas: ${inserted?.length ?? 0} confrontos`)
      setSorteioAberto(false)
      broadcast({ sorteioAberto: false })

      // garante que aparece também no Table Editor
      await buscarJogos()
    } catch (e: any) {
      console.error('gravarConfrontos catch:', e)
      toast.error(`Falha na gravação: ${e?.message || e}`)
    } finally {
      setConfirming(false)
    }
  }

  /** ===== Salvar placar ===== */
  async function salvarPlacar(jogo: JogoOitavas) {
    const { error } = await supabase
      .from('copa_oitavas')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
        gols_time1_volta: jogo.gols_time1_volta,
        gols_time2_volta: jogo.gols_time2_volta
      })
      .eq('id', jogo.id)

    if (error) toast.error('Erro ao salvar')
    else toast.success('Placar salvo!')
  }

  /** ===== Finalizar Oitavas -> Quartas (simples) ===== */
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

    for (const jogo of jogosAtual) {
      const gols1 = (jogo.gols_time1 || 0) + (jogo.gols_time1_volta || 0)
      const gols2 = (jogo.gols_time2 || 0) + (jogo.gols_time2_volta || 0)
      if (gols1 > gols2) classificados.push(jogo.id_time1)
      else if (gols2 > gols1) classificados.push(jogo.id_time2)
      else classificados.push(jogo.id_time1) // critério simples
    }

    if (classificados.length !== 8) {
      toast.error('Complete os 8 confrontos.')
      return
    }

    const { data: timesData } = await supabase
      .from('times')
      .select('id, nome')
      .in('id', classificados)

    const nomePorId = new Map<string, string>()
    ;(timesData || []).forEach(t => nomePorId.set(t.id, t.nome))

    const novos: any[] = []
    for (let i = 0; i < classificados.length; i += 2) {
      const id_time1 = classificados[i]
      const id_time2 = classificados[i + 1]
      novos.push({
        id_time1,
        id_time2,
        time1: nomePorId.get(id_time1) ?? 'Time',
        time2: nomePorId.get(id_time2) ?? 'Time',
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null
      })
    }

    try {
      for (const c of novos) {
        const { error } = await supabase.from('copa_quartas').insert(c)
        if (error) throw error
      }
      toast.success('Classificados para as Quartas!')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao gerar Quartas')
    }
  }

  /** ===== Derivados ===== */
  const podeGravar = useMemo(() => pares.length === 8 && !parAtual.A && !parAtual.B, [pares, parAtual])

  /** ===== Render ===== */
  if (loading) return <div className="p-4">🔄 Carregando...</div>

  return (
    <div className="p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🥇 Oitavas de Final</h1>
        {isAdmin && (
          <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded" onClick={abrirSorteio}>
            🎥 Abrir sorteio (Potes + Animação | Ao vivo)
          </button>
        )}
      </header>

      {/* Lista de jogos existentes */}
      <div className="space-y-4">
        {jogos.map((jogo) => (
          <div key={jogo.id} className="flex flex-col gap-2 border border-gray-300/30 p-3 rounded">
            <div className="font-semibold">{jogo.ordem}. {jogo.time1} x {jogo.time2}</div>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="number" className="w-14 border rounded px-1" value={jogo.gols_time1 ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value))
                  setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: Number.isNaN(v as any) ? null : v } : j))
                }} />
              <span>x</span>
              <input type="number" className="w-14 border rounded px-1" value={jogo.gols_time2 ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value))
                  setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: Number.isNaN(v as any) ? null : v } : j))
                }} />
              <span className="mx-2 text-sm opacity-70">– Volta –</span>
              <input type="number" className="w-14 border rounded px-1" value={jogo.gols_time1_volta ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value))
                  setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1_volta: Number.isNaN(v as any) ? null : v } : j))
                }} />
              <span>x</span>
              <input type="number" className="w-14 border rounded px-1" value={jogo.gols_time2_volta ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value))
                  setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2_volta: Number.isNaN(v as any) ? null : v } : j))
                }} />
              <button className="bg-green-600 text-white px-3 py-1 rounded ml-auto" onClick={() => salvarPlacar(jogo)}>Salvar</button>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-6">
          <button className="bg-blue-700 text-white px-4 py-2 rounded" onClick={finalizarOitavas}>
            🏁 Finalizar Oitavas
          </button>
        </div>
      )}

      {/* ===== Overlay do Sorteio por Potes + Animação ===== */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-gray-950 rounded-2xl border border-gray-800 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">🎥 Sorteio Oitavas — Show ao vivo</h3>
              <button
                className="text-sm px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700"
                onClick={() => {
                  setSorteioAberto(false)
                  if (isAdmin) broadcast({ sorteioAberto: false })
                }}
              >
                Fechar
              </button>
            </div>

            {/* Prévia dos potes forçados */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="rounded-xl border border-gray-800 p-3">
                <div className="text-sm text-gray-400 mb-2">Pote A (forçado)</div>
                <div className="flex flex-wrap gap-2">
                  {poteA.map(t => <span key={t.id} className="px-2 py-1 rounded bg-gray-800 text-sm">{t.nome}</span>)}
                </div>
              </div>
              <div className="rounded-xl border border-gray-800 p-3">
                <div className="text-sm text-gray-400 mb-2">Pote B (forçado)</div>
                <div className="flex flex-wrap gap-2">
                  {poteB.map(t => <span key={t.id} className="px-2 py-1 rounded bg-gray-800 text-sm">{t.nome}</span>)}
                </div>
              </div>
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
                  <div className="text-center text-gray-400 mb-2">Confronto atual</div>
                  <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
                    <div className="grid grid-cols-3 items-center">
                      <div className="flex justify-center"><BallLogo team={parAtual.A} size={64} /></div>
                      <div className="text-center text-gray-400">x</div>
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
                    <div key={a.id + b.id + i} className="rounded-xl border border-gray-800 bg-gray-900/50 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><BallLogo team={a} size={28} /><span className="font-medium">{a.nome}</span></div>
                        <span className="text-gray-400">x</span>
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

/** ====== Visuais ====== */
function HostCard({ nome, lado }: { nome: string; lado: 'left'|'right' }) {
  return (
    <div className="w-full rounded-2xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 p-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-500/70 to-blue-500/70 flex items-center justify-center text-white font-bold shadow-lg">
          {lado === 'left' ? 'A' : 'B'}
        </div>
        <div>
          <div className="text-sm text-gray-400">Apresentadora</div>
          <div className="font-semibold">{nome}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-400">
        Retira as bolinhas do pote {lado === 'left' ? 'A' : 'B'} ao sinal do diretor.
      </div>
    </div>
  )
}

function PoteGlass({ title, teams, side }: { title: string; teams: TimeRow[]; side: 'left'|'right' }) {
  return (
    <div className="w-full flex flex-col items-center">
      <div className="mb-2 text-sm text-gray-300">{title}</div>
      <div className="relative w-64 h-40">
        <div className="absolute inset-0 rounded-full [clip-path:ellipse(60%_50%_at_50%_60%)] bg-gradient-to-b from-white/10 to-white/0 border border-white/20 shadow-inner" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56 h-4 rounded-full bg-black/40 blur-sm" />
        <div className="absolute inset-0 flex flex-wrap items-end justify-center gap-2 p-6">
          {teams.map((t) => (
            <div key={t.id} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 shadow-md overflow-hidden flex items-center justify-center">
              <TeamLogo url={t.logo_url} alt={t.nome} size={40} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TeamLogo({ url, alt, size=32 }: { url?: string | null; alt: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} style={{ width: size, height: size }} className="object-cover" />
  ) : (
    <span className="text-[10px] text-gray-300">{alt.slice(0,3).toUpperCase()}</span>
  )
}

function BallLogo({ team, size=56, shiny=false }: { team: TimeRow | null; size?: number; shiny?: boolean }) {
  if (!team) return (
    <div className="w-14 h-14 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
      <span className="text-gray-400">?</span>
    </div>
  )
  return (
    <div className={`rounded-full border ${shiny ? 'border-white/40 shadow-[inset_0_8px_16px_rgba(255,255,255,0.15),0_8px_16px_rgba(0,0,0,0.35)]' : 'border-gray-700 shadow'} bg-gray-900 overflow-hidden flex items-center justify-center`} style={{ width: size, height: size }}>
      <TeamLogo url={team.logo_url} alt={team.nome} size={size - 8} />
    </div>
  )
}
