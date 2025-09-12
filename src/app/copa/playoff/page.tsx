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

/* ================== REGRAS DE PREMIAÇÃO ================== */
const PREMIO_VITORIA = 14_000_000
const PREMIO_POR_GOL = 500_000

/* ================== TIPOS ================== */
interface TimeRow {
  id: string
  nome: string
  logo_url: string | null
}
interface Jogo {
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

interface LinhaClassificacao {
  id_time: string
  pontos: number
  vitorias: number
  gols_pro: number
  gols_contra: number
  saldo: number
  jogos: number
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

/* ================== UTILS ================== */
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
function sameGame(a: Jogo, b: Jogo) {
  if (a.id != null && b.id != null) return String(a.id) === String(b.id)
  return (
    a.rodada === b.rodada &&
    a.ordem === b.ordem &&
    a.id_time1 === b.id_time1 &&
    a.id_time2 === b.id_time2
  )
}

/* ================== INTEGRAÇÃO FINANCEIRA ================== */
async function creditarSaldo(id_time: string, valor: number): Promise<boolean> {
  if (!valor) return true
  const { error: e1 } = await supabase.rpc('atualizar_saldo', { id_time, valor })
  if (!e1) return true
  const { error: e2 } = await supabase.rpc('incrementar_saldo', { p_id_time: id_time, p_valor: valor })
  if (!e2) return true
  console.error('Falha ao creditar saldo:', { id_time, valor, e1, e2 })
  return false
}
async function marcarBidPremiacao(id_time: string, valor: number) {
  try {
    await supabase.from('bid').insert({
      tipo_evento: 'premiacao_copa',
      descricao: 'Premiação fase playoff',
      id_time1: id_time,
      valor,
      data_evento: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Falha ao registrar no BID:', e)
  }
}

/* ================== COMPONENTE ================== */
export default function PlayoffPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()

  // dados
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [loading, setLoading] = useState(true)
  const [timesMap, setTimesMap] = useState<Record<string, TimeRow>>({})

  // UI
  const [activeTab, setActiveTab] = useState<1 | 2>(1)
  const [savingId, setSavingId] = useState<string | number | null>(null)

  // sorteio ao vivo
  const [sorteioAberto, setSorteioAberto] = useState(false)
  const [sorteioAtivo, setSorteioAtivo] = useState(false)
  const [fila, setFila] = useState<TimeRow[]>([])
  const [pares, setPares] = useState<Array<[TimeRow, TimeRow]>>([])
  const [parAtual, setParAtual] = useState<{A: TimeRow | null; B: TimeRow | null}>({A:null, B:null})
  const [flipA, setFlipA] = useState(false)
  const [flipB, setFlipB] = useState(false)
  const [confirmavel, setConfirmavel] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // realtime
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stateRef = useRef({
    sorteioAberto, sorteioAtivo, fila, pares, parAtual, flipA, flipB, confirmavel
  })
  useEffect(() => {
    stateRef.current = { sorteioAberto, sorteioAtivo, fila, pares, parAtual, flipA, flipB, confirmavel }
  }, [sorteioAberto, sorteioAtivo, fila, pares, parAtual, flipA, flipB, confirmavel])

  useEffect(() => {
    carregarJogosELogos()

    const ch = supabase.channel('playoff-sorteio', { config: { broadcast: { self: true } } })
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload || {}
      if ('sorteioAberto' in p) setSorteioAberto(!!p.sorteioAberto)
      if ('sorteioAtivo' in p) setSorteioAtivo(!!p.sorteioAtivo)
      if ('fila' in p) setFila(p.fila || [])
      if ('pares' in p) setPares(p.pares || [])
      if ('parAtual' in p) setParAtual(p.parAtual || { A:null, B:null })
      if ('flipA' in p) setFlipA(!!p.flipA)
      if ('flipB' in p) setFlipB(!!p.flipB)
      if ('confirmavel' in p) setConfirmavel(!!p.confirmavel)
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
  async function carregarJogosELogos() {
    try {
      setLoading(true)
      const { data: jogosData, error } = await supabase
        .from('copa_playoff')
        .select('*')
        .order('rodada', { ascending: true })
        .order('ordem', { ascending: true })
      if (error) throw error

      const js = (jogosData || []) as Jogo[]
      setJogos(js)

      const ids = Array.from(new Set(js.flatMap(j => [j.id_time1, j.id_time2]).filter(Boolean)))
      if (ids.length) {
        const { data: timesData, error: tErr } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', ids)
        if (tErr) throw tErr
        const mapa: Record<string, TimeRow> = {}
        for (const t of (timesData || []) as TimeRow[]) mapa[t.id] = t
        setTimesMap(mapa)
      } else {
        setTimesMap({})
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar jogos ou logos')
    } finally {
      setLoading(false)
    }
  }

  /* ================== CLASSIFICAÇÃO (para sortear 9–24) ================== */
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
  async function pegarClassificados9a24(): Promise<TimeRow[]> {
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
      base[id] = {
        id_time: id, pontos: 0, vitorias: 0, gols_pro: 0, gols_contra: 0, saldo: 0, jogos: 0
      }
    }

    for (const j of jogos) {
      if (j.gols_time1 == null || j.gols_time2 == null) continue
      const id1 = resolverIdDoTime(j, 1, mapaTimes)
      const id2 = resolverIdDoTime(j, 2, mapaTimes)
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

    const fatia = ordenada.slice(8, 24)
    return fatia.map((l) => ({
      id: l.id_time, nome: mapaTimes[l.id_time]?.nome ?? 'Time', logo_url: mapaTimes[l.id_time]?.logo_url ?? null
    }))
  }

  /* ================== AÇÕES: APAGAR & SORTEIO ================== */
  async function apagarConfrontos() {
    if (!isAdmin) return
    const temPlacar = jogos.some(j => j.gols_time1 != null || j.gols_time2 != null)
    const msg = (temPlacar ? '⚠️ Existem jogos com placar lançado.\n\n' : '') + 'Tem certeza que deseja APAGAR todos os confrontos?'
    if (!confirm(msg)) return

    const { error } = await supabase.from('copa_playoff').delete().gte('ordem', 0)
    if (error) {
      toast.error('Erro ao apagar confrontos')
      return
    }
    toast.success('Confrontos apagados!')
    await carregarJogosELogos()
  }

  async function iniciarSorteio() {
    if (!isAdmin) return
    const { count, error: cErr } = await supabase
      .from('copa_playoff')
      .select('*', { count: 'exact', head: true })
    if (cErr) { toast.error('Erro ao checar confrontos'); return }
    if ((count ?? 0) > 0) {
      toast.error('Apague os confrontos antes de sortear.')
      return
    }

    try {
      const classificados924 = await pegarClassificados9a24()
      if (classificados924.length !== 16) {
        toast.error('Precisamos de 16 times (9º–24º). Verifique a classificação.')
        return
      }
      const lista = shuffle(classificados924)

      setSorteioAberto(true)
      setSorteioAtivo(true)
      setFila(lista)
      setPares([])
      setParAtual({ A:null, B:null })
      setFlipA(false); setFlipB(false)
      setConfirmavel(false)

      broadcast({
        sorteioAtivo: true,
        fila: lista,
        pares: [],
        parAtual: {A:null, B:null},
        flipA: false, flipB: false,
        confirmavel: false
      })
    } catch (e) {
      console.error(e)
      toast.error('Falha ao carregar a classificação para o sorteio.')
    }
  }

  /* ================== SORTEIO MANUAL ================== */
  function sortearTime1() {
    if (!isAdmin) return
    if (parAtual.A) return
    if (fila.length === 0) return
    const idx = Math.floor(Math.random() * fila.length)
    const escolhido = fila[idx]
    const novaFila = [...fila]
    novaFila.splice(idx, 1)
    const novoPar = { A: escolhido, B: parAtual.B }
    setFila(novaFila); setParAtual(novoPar); setFlipA(true)
    broadcast({ fila: novaFila, parAtual: novoPar, flipA: true })
  }
  function sortearTime2() {
    if (!isAdmin) return
    if (!parAtual.A || parAtual.B || fila.length === 0) return
    const idx = Math.floor(Math.random() * fila.length)
    const escolhido = fila[idx]
    const novaFila = [...fila]
    novaFila.splice(idx, 1)
    const novoPar = { A: parAtual.A, B: escolhido }
    setFila(novaFila); setParAtual(novoPar); setFlipB(true)
    broadcast({ fila: novaFila, parAtual: novoPar, flipB: true })
  }
  function confirmarPar() {
    if (!isAdmin) return
    if (!parAtual.A || !parAtual.B) return
    const novosPares = [...pares, [parAtual.A, parAtual.B] as [TimeRow, TimeRow]]
    setPares(novosPares); setParAtual({ A:null, B:null }); setFlipA(false); setFlipB(false)
    const terminou = novosPares.length === 8
    setSorteioAtivo(!terminou); setConfirmavel(terminou)
    broadcast({
      pares: novosPares,
      parAtual: { A:null, B:null },
      flipA: false, flipB: false,
      sorteioAtivo: !terminou,
      confirmavel: terminou
    })
  }

  async function confirmarConfrontos() {
    if (!isAdmin) return
    if (pares.length !== 8) { toast.error('Sorteio incompleto.'); return }
    try {
      setConfirming(true)
      const novos: Jogo[] = []
      let ordem = 1
      for (const [A, B] of pares) {
        novos.push({
          rodada: 1, ordem: ordem++,
          id_time1: A.id, id_time2: B.id, time1: A.nome, time2: B.nome,
          gols_time1: null, gols_time2: null
        })
        novos.push({
          rodada: 2, ordem: ordem++,
          id_time1: B.id, id_time2: A.id, time1: B.nome, time2: A.nome,
          gols_time1: null, gols_time2: null
        })
      }
      const { error: delErr } = await supabase.from('copa_playoff').delete().gte('ordem', 0)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('copa_playoff').insert(novos)
      if (insErr) throw insErr

      toast.success('Confrontos confirmados!')
      setSorteioAberto(false)
      channelRef.current?.send({
        type: 'broadcast',
        event: 'state',
        payload: { ...stateRef.current, sorteioAberto: false }
      })
      await carregarJogosELogos()
    } catch (e: any) {
      console.error(e)
      toast.error('Erro ao confirmar confrontos')
    } finally {
      setConfirming(false)
    }
  }

  /* ================== SALVAR PLACAR (+ premiações & BID) ================== */
  async function salvarPlacar(jogo: Jogo) {
    if (!isAdmin) return
    if (jogo.gols_time1 == null || jogo.gols_time2 == null) {
      toast.error('Preencha os dois placares antes de salvar.')
      return
    }
    try {
      const key = jogo.id ?? `${jogo.rodada}-${jogo.ordem}-${jogo.id_time1}-${jogo.id_time2}`
      setSavingId(key)

      // Garantir ID da linha
      let rowId: string | number | null = null
      if (jogo.id != null) {
        const { data, error } = await supabase
          .from('copa_playoff')
          .select('id,gols_time1,gols_time2')
          .eq('id', jogo.id as any)
          .maybeSingle()
        if (!error && data?.id != null) rowId = data.id as any
      }
      if (rowId == null) {
        const { data, error } = await supabase
          .from('copa_playoff')
          .select('id,gols_time1,gols_time2')
          .match({ rodada: jogo.rodada, ordem: jogo.ordem, id_time1: jogo.id_time1, id_time2: jogo.id_time2 })
          .maybeSingle()
        if (error) throw error
        rowId = (data?.id ?? null) as any
      }
      if (rowId == null) {
        toast.error('Não encontrei o registro deste jogo no banco.')
        setSavingId(null)
        return
      }

      // Placar anterior
      const { data: antes, error: bErr } = await supabase
        .from('copa_playoff')
        .select('gols_time1,gols_time2')
        .eq('id', rowId as any)
        .single()
      if (bErr) throw bErr
      const antesDef = antes?.gols_time1 != null && antes?.gols_time2 != null

      // Atualiza placar
      const { error: uErr } = await supabase
        .from('copa_playoff')
        .update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 })
        .eq('id', rowId as any)
      if (uErr) throw uErr

      // Premiações (apenas primeiro lançamento)
      const agoraDef = jogo.gols_time1 != null && jogo.gols_time2 != null
      if (!antesDef && agoraDef) {
        const parts: string[] = []

        // Vitória (14M)
        if (jogo.gols_time1 !== jogo.gols_time2) {
          const vencedorId = jogo.gols_time1! > jogo.gols_time2! ? jogo.id_time1 : jogo.id_time2
          const ok = await creditarSaldo(vencedorId, PREMIO_VITORIA)
          await marcarBidPremiacao(vencedorId, PREMIO_VITORIA)
          parts.push(ok ? 'bônus de vitória (R$ 14.000.000)' : 'falha no bônus de vitória')
          if (!ok) toast.error('Falha ao pagar bônus de vitória')
        }

        // Gols (R$ 500k por gol) para AMBOS
        const premioMandante = (jogo.gols_time1 || 0) * PREMIO_POR_GOL
        const premioVisitante = (jogo.gols_time2 || 0) * PREMIO_POR_GOL

        if (premioMandante > 0) {
          const ok = await creditarSaldo(jogo.id_time1, premioMandante)
          await marcarBidPremiacao(jogo.id_time1, premioMandante)
          parts.push(ok
            ? `mandante +R$ ${premioMandante.toLocaleString('pt-BR')}`
            : 'falha no bônus por gol do mandante')
          if (!ok) toast.error('Falha ao pagar bônus por gol (mandante)')
        }
        if (premioVisitante > 0) {
          const ok = await creditarSaldo(jogo.id_time2, premioVisitante)
          await marcarBidPremiacao(jogo.id_time2, premioVisitante)
          parts.push(ok
            ? `visitante +R$ ${premioVisitante.toLocaleString('pt-BR')}`
            : 'falha no bônus por gol do visitante')
          if (!ok) toast.error('Falha ao pagar bônus por gol (visitante)')
        }

        if (parts.length) toast.success('Premiações: ' + parts.join(' • '))
      }

      toast.success('Placar salvo!')
      await carregarJogosELogos()
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao salvar placar`)
    } finally {
      setSavingId(null)
    }
  }

  /* ================== DERIVADOS / MÉTRICAS ================== */
  const jogosPorRodada = useMemo(() => {
    const g = { 1: [] as Jogo[], 2: [] as Jogo[] }
    for (const j of jogos) (j.rodada === 1 ? g[1] : g[2]).push(j)
    return g
  }, [jogos])

  const totalJogos = jogos.length
  const comPlacar = jogos.filter(j => j.gols_time1 != null && j.gols_time2 != null).length
  const pendentes = totalJogos - comPlacar

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
                  Playoff — Champions
                </span>
              </h1>
              <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                <Badge tone="emerald">Premiação vitória: R$ 14M</Badge>
                <Badge tone="sky">Por gol: R$ 500k</Badge>
                <Badge>Ida e volta</Badge>
              </div>
            </div>

            {!loadingAdmin && isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={apagarConfrontos}
                  className="btn ghost danger"
                  title="Remove todos os confrontos"
                >
                  🗑️ Apagar confrontos
                </button>
                <button
                  onClick={iniciarSorteio}
                  disabled={jogos.length > 0}
                  title={jogos.length > 0 ? 'Apague os confrontos antes de sortear' : 'Abrir sala de sorteio ao vivo'}
                  className={`btn primary ${jogos.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  🎥 Abrir sorteio (9º–24º)
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

          {/* tabs */}
          <div className="mt-3 inline-flex p-1 rounded-xl bg-white/5 border border-white/10">
            <TabButton active={activeTab === 1} onClick={() => setActiveTab(1)}>Rodada 1 (ida)</TabButton>
            <TabButton active={activeTab === 2} onClick={() => setActiveTab(2)}>Rodada 2 (volta)</TabButton>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <SkeletonList />
        ) : (
          <>
            {[1,2].map((r) => (
              <section key={r} className={`${activeTab === r ? 'block' : 'hidden'}`}>
                { (jogosPorRodada as any)[r].length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {(jogosPorRodada as any)[r].map((j: Jogo) => (
                      <MatchCard
                        key={`${j.id ?? ''}-${j.rodada}-${j.ordem}-${j.id_time1}`}
                        j={j}
                        isAdmin={!!isAdmin}
                        timesMap={timesMap}
                        saving={savingId === (j.id ?? `${j.rodada}-${j.ordem}-${j.id_time1}-${j.id_time2}`)}
                        onChange={(g1, g2) => {
                          setJogos(prev => prev.map(x => sameGame(x, j) ? { ...x, gols_time1: g1, gols_time2: g2 } : x))
                        }}
                        onSave={() => salvarPlacar(j)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </div>

      {/* MODAL SORTEIO */}
      {sorteioAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-2xl border border-white/10 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-emerald-300">🎥 Sorteio ao vivo</h3>
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
                {sorteioAtivo ? 'Sorteio em andamento' : (confirmavel ? 'Pronto para gravar confrontos' : 'Aguardando')}
              </div>
              <div className="text-zinc-400">Restantes: {fila.length}</div>
            </div>

            <div className="grid grid-cols-3 items-center gap-2 mb-6">
              <FlipCard flipped={flipA} time={parAtual.A} />
              <div className="text-center text-zinc-400 font-semibold">x</div>
              <FlipCard flipped={flipB} time={parAtual.B} />
            </div>

            {!loadingAdmin && isAdmin && (
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  className={`btn ${!parAtual.A && fila.length > 0 ? 'primary' : 'disabled'}`}
                  onClick={sortearTime1} disabled={!!parAtual.A || fila.length === 0}
                >
                  🎲 Sortear time 1
                </button>
                <button
                  className={`btn ${parAtual.A && !parAtual.B && fila.length > 0 ? 'indigo' : 'disabled'}`}
                  onClick={sortearTime2} disabled={!parAtual.A || !!parAtual.B || fila.length === 0}
                >
                  🎲 Sortear time 2
                </button>
                <button
                  className={`btn ${parAtual.A && parAtual.B ? 'success' : 'disabled'}`}
                  onClick={confirmarPar} disabled={!parAtual.A || !parAtual.B}
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
                  className={`btn ${pares.length === 8 && !confirming ? 'success' : 'disabled'}`}
                  disabled={pares.length !== 8 || confirming}
                  onClick={confirmarConfrontos}
                  title={pares.length !== 8 ? 'Finalize os 8 confrontos' : ''}
                >
                  {confirming ? 'Gravando…' : '✅ Gravar confrontos'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STYLES HELPERS */}
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

/* ================== SUBCOMPONENTES UI ================== */
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
      <div className="text-sm text-zinc-400">Quando os confrontos forem criados, eles aparecem nesta aba.</div>
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
  j, isAdmin, timesMap, saving, onChange, onSave
}: {
  j: Jogo
  isAdmin: boolean
  timesMap: Record<string, TimeRow>
  saving: boolean
  onChange: (g1: number|null, g2: number|null) => void
  onSave: () => void
}) {
  const n1 = timesMap[j.id_time1]?.nome || j.time1
  const n2 = timesMap[j.id_time2]?.nome || j.time2

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/70 to-black/70 p-4 shadow hover:shadow-lg hover:border-white/20 transition">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-3">
        <span className="inline-flex items-center gap-2">
          <Badge tone="emerald">Rodada {j.rodada}</Badge>
          <span>Ordem #{j.ordem}</span>
        </span>
        <span className="text-zinc-500">ID {String(j.id ?? '—')}</span>
      </div>

      <div className="flex items-center gap-3">
        <Escudo url={timesMap[j.id_time1]?.logo_url} alt={n1} />
        <div className="flex-1">
          <div className="font-semibold">{n1}</div>
          <div className="text-[11px] text-zinc-400">Mandante</div>
        </div>

        <div className="flex items-center gap-3">
          <ScoreInput
            value={j.gols_time1}
            onChange={(v) => onChange(v, j.gols_time2)}
            disabled={!isAdmin || saving}
          />
          <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
          <ScoreInput
            value={j.gols_time2}
            onChange={(v) => onChange(j.gols_time1, v)}
            disabled={!isAdmin || saving}
          />
        </div>

        <div className="flex-1 text-right">
          <div className="font-semibold">{n2}</div>
          <div className="text-[11px] text-zinc-400">Visitante</div>
        </div>
        <Escudo url={timesMap[j.id_time2]?.logo_url} alt={n2} />
      </div>

      {isAdmin && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className={`btn ${saving ? 'disabled' : 'success'}`}
            onClick={onSave}
            disabled={saving}
            title="Salvar placar e aplicar premiações"
          >
            {saving ? 'Salvando…' : '💾 Salvar placar'}
          </button>
        </div>
      )}
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
