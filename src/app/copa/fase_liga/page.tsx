'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import {
  FiRotateCcw, FiSave, FiTrash2, FiTarget,
  FiMinus, FiPlus, FiChevronDown, FiChevronUp
} from 'react-icons/fi'

/* ================= SUPABASE & CONFIG ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || '2025-26'

/* ================= TYPES ================= */
type Jogo = {
  id: number
  rodada: number
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
  temporada?: string | null
}
type TimeMini = { nome: string; logo_url: string }
type TimeFull = {
  id: string; nome: string; logo_url: string
  pote?: number | null; overall?: number | null; valor?: number | null; associacao?: string | null
}

/* ================= REGRAS FINANCEIRAS ================= */
const TAXA_POR_JOGO = 10_000_000
const BONUS_VITORIA = 15_000_000
const BONUS_EMPATE = 7_500_000
const BONUS_DERROTA = 5_000_000
const PREMIO_GOL_MARCADO = 800_000
const PENALIDADE_GOL_SOFRIDO = 160_000

/* ================= SWISS CONFIG ================= */
const ROUNDS = 8
const ADVERSARIOS_POR_POTE = 2
const CASA_MAX = 4
const FORA_MAX = 4

/* ================= HELPERS ================= */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))
const keyPair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

async function safeSelectTimes(minimal = false) {
  const tries = minimal
    ? ['id,nome,logo_url', '*']
    : ['id,nome,logo_url,pote,overall,valor,associacao', 'id,nome,logo_url,pote,overall,valor', 'id,nome,logo_url', '*']
  for (const s of tries) {
    const { data, error } = await supabase.from('times').select(s)
    if (!error) return data as any[]
  }
  return [] as any[]
}

function atribuirPotes(times: TimeFull[]): Record<string, number> {
  const temPote = times.some(t => (t.pote ?? 0) >= 1 && (t.pote ?? 0) <= 4)
  if (temPote) {
    const out: Record<string, number> = {}
    times.forEach(t => { out[t.id] = Math.max(1, Math.min(4, Math.floor(t.pote || 1))) })
    return out
  }
  const ord = [...times].sort((a, b) => {
    const oa = a.overall ?? 0, ob = b.overall ?? 0
    if (ob !== oa) return ob - oa
    const va = a.valor ?? 0, vb = b.valor ?? 0
    return vb - va
  })
  const n = ord.length
  const q = Math.max(1, Math.floor(n / 4))
  const out: Record<string, number> = {}
  ord.forEach((t, i) => { out[t.id] = Math.min(4, Math.floor(i / q) + 1) })
  return out
}

/* ===== Swiss generator (mantido, sem mudança de regra) ===== */
type CalendarioItem = { rodada: number; casa: string; fora: string }
function gerarChampionsSwiss(participantes: TimeFull[], evitarMesmoPais = true): CalendarioItem[] {
  const ids = participantes.map(t => t.id)
  if (ids.length < 2 || ids.length % 2 === 1) return []
  const byId: Record<string, TimeFull> = {}; participantes.forEach(t => { byId[t.id] = t })
  const potes = atribuirPotes(participantes)
  const needPot: Record<string, Record<number, number>> = {}
  const homeCnt: Record<string, number> = {}
  const awayCnt: Record<string, number> = {}
  const playedPairs = new Set<string>()
  const jogosRestantes: Record<string, number> = {}
  ids.forEach(id => { needPot[id] = {1:2,2:2,3:2,4:2}; homeCnt[id]=0; awayCnt[id]=0; jogosRestantes[id]=ROUNDS })

  const calendario: CalendarioItem[] = []
  for (let rodada = 1; rodada <= ROUNDS; rodada++) {
    const livres = new Set(ids)
    const scoreTeam = (id: string) => {
      const np = needPot[id]; const needScore = np[1]+np[2]+np[3]+np[4]
      const mandoScore = (CASA_MAX-homeCnt[id])+(FORA_MAX-awayCnt[id])
      return jogosRestantes[id]*10 + needScore*2 + mandoScore
    }

    while (livres.size >= 2) {
      const arr = Array.from(livres).sort((a,b)=>scoreTeam(b)-scoreTeam(a))
      const a = arr[0]
      let cand = arr.slice(1).filter(b => !playedPairs.has(keyPair(a,b)))
      const potA = potes[a] ?? 4
      let L = cand.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0 && (needPot[b][potA] ?? 0) > 0)
      if (evitarMesmoPais && byId[a]?.associacao) {
        const alt = L.filter(b => byId[b]?.associacao !== byId[a].associacao)
        if (alt.length) L = alt
      }
      if (!L.length) {
        L = cand.filter(b => (needPot[a][potes[b] ?? 4] ?? 0) > 0)
        if (evitarMesmoPais && byId[a]?.associacao) {
          const alt = L.filter(b => byId[b]?.associacao !== byId[a].associacao)
          if (alt.length) L = alt
        }
      }
      if (!L.length) L = cand
      L.sort((b1,b2)=>{
        const sAH = CASA_MAX-homeCnt[a], sAA = FORA_MAX-awayCnt[a]
        const s1H = CASA_MAX-homeCnt[b1], s1A = FORA_MAX-awayCnt[b1]
        const s2H = CASA_MAX-homeCnt[b2], s2A = FORA_MAX-awayCnt[b2]
        const mando1 = (sAH>0&&s1A>0)||(sAA>0&&s1H>0)?1:0
        const mando2 = (sAH>0&&s2A>0)||(sAA>0&&s2H>0)?1:0
        const need1 = (needPot[a][potes[b1]??4]??0)+(needPot[b1][potA]??0)
        const need2 = (needPot[a][potes[b2]??4]??0)+(needPot[b2][potA]??0)
        return (mando2-mando1)||(need2-need1)
      })
      const b = L[0]; if (!b) { livres.delete(a); continue }
      let casa=a, fora=b
      if (homeCnt[a]>=CASA_MAX && awayCnt[a]<FORA_MAX) { casa=b; fora=a }
      else if (homeCnt[b]>=CASA_MAX && awayCnt[b]<FORA_MAX) { casa=a; fora=b }
      else {
        const sAH = CASA_MAX-homeCnt[a], sAA = FORA_MAX-awayCnt[a]
        const sBH = CASA_MAX-homeCnt[b], sBA = FORA_MAX-awayCnt[b]
        if (sBH>sAH && sAA>0) { casa=b; fora=a }
      }
      calendario.push({ rodada, casa, fora })
      playedPairs.add(keyPair(a,b))
      livres.delete(a); livres.delete(b)
      homeCnt[casa]++; awayCnt[fora]++; jogosRestantes[a]--; jogosRestantes[b]--
      const pa = potes[a]??4, pb = potes[b]??4
      needPot[a][pb]=Math.max(0,needPot[a][pb]-1)
      needPot[b][pa]=Math.max(0,needPot[b][pa]-1)
    }
  }
  return calendario
}

/* ================= PAGE ================= */
export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  const [abrirModalSwiss, setAbrirModalSwiss] = useState(false)
  const [evitarMesmoPais, setEvitarMesmoPais] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [temColunaTemporada, setTemColunaTemporada] = useState<boolean>(true)

  // UI
  const [rodadasAbertas, setRodadasAbertas] = useState<Record<number, boolean>>({})
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      await detectarColunaTemporada()
      await Promise.all([carregarTimesBase(), buscarJogos()])
      setLoading(false)
    })()
  }, [])

  async function detectarColunaTemporada() {
    const { error } = await supabase.from('copa_fase_liga').select('id,temporada').limit(1)
    setTemColunaTemporada(!error)
  }

  async function carregarTimesBase() {
    const rows = await safeSelectTimes(true)
    const novo: Record<string, TimeMini> = {}
    rows.forEach((t: any) => {
      const nome = t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id)
      const logo = t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png'
      novo[t.id] = { nome, logo_url: logo }
    })
    setTimesMap(novo)
  }

  async function buscarJogos() {
    let q = supabase.from('copa_fase_liga').select('*')
    if (temColunaTemporada) q = q.eq('temporada', TEMPORADA)
    const { data, error } = await q.order('rodada', { ascending: true }).order('id', { ascending: true })
    if (error) { toast.error('Erro ao buscar jogos'); return }
    setJogos((data || []) as Jogo[])
    // abre as duas primeiras rodadas por padrão
    const rds = new Set((data || []).map((j: any) => j.rodada))
    const obj: Record<number, boolean> = {}; Array.from(rds).slice(0,2).forEach((r:number)=>obj[r]=true)
    setRodadasAbertas(obj)
  }

  async function atualizarClassificacao() {
    const { error } = await supabase.rpc('atualizar_classificacao_copa')
    if (error) { console.error(error); toast.error('Erro ao atualizar classificação!') }
  }

  async function gerarSwiss() {
    if (!isAdmin) { toast.error('Apenas admin pode gerar a fase.'); return }
    setGerando(true)
    try {
      const rows = await safeSelectTimes(false)
      let participantes: TimeFull[] = rows.map((t:any)=>({
        id: t.id,
        nome: t.nome ?? t.name ?? t.team_name ?? t.time ?? t.apelido ?? String(t.id),
        logo_url: t.logo_url ?? t.logo ?? t.escudo ?? t.badge ?? t.image_url ?? '/default.png',
        pote: t.pote ?? t.pot ?? null,
        overall: t.overall ?? t.rating ?? null,
        valor: t.valor ?? t.value ?? null,
        associacao: t.associacao ?? t.pais ?? t.country ?? null,
      }))
      participantes = participantes.filter(t => !(t.nome || '').toLowerCase().includes('palmeiras'))
      if (participantes.length % 2 === 1) {
        const ord = [...participantes].sort((a,b)=>{
          const oa=(a.overall??0)-(b.overall??0); if (oa!==0) return oa
          return (a.valor??0)-(b.valor??0)
        })
        const removido = ord[0]
        participantes = participantes.filter(t=>t.id!==removido.id)
        toast('Participantes ímpares: removi 1 clube para manter paridade.', { icon: 'ℹ️' })
        await supabase.from('bid').insert([{ tipo_evento:'Sistema', descricao:`Ajuste de paridade: ${removido.nome} removido.`, valor:null }])
      }
      if (participantes.length < 2) { toast.error('Participantes insuficientes.'); return }

      const calendario = gerarChampionsSwiss(participantes, evitarMesmoPais)
      if (!calendario.length) { toast.error('Falha ao gerar calendário.'); return }

      if (temColunaTemporada) {
        const { error: delErr } = await supabase.from('copa_fase_liga').delete().eq('temporada', TEMPORADA)
        if (delErr) { toast.error('Erro ao limpar jogos da temporada.'); return }
      } else {
        const { error: delErr } = await supabase.from('copa_fase_liga').delete().neq('id', -1)
        if (delErr) { toast.error('Erro ao limpar tabela de jogos.'); return }
      }

      const rowsInsert = calendario.map(j => ({
        ...(temColunaTemporada ? { temporada: TEMPORADA } : {}),
        rodada: j.rodada, time1: j.casa, time2: j.fora,
        gols_time1: null, gols_time2: null, bonus_pago: false,
      }))
      const { error: insErr } = await supabase.from('copa_fase_liga').insert(rowsInsert)
      if (insErr) { console.error(insErr); toast.error('Erro ao inserir confrontos.'); return }

      await atualizarClassificacao()
      await buscarJogos()
      await supabase.from('bid').insert([{
        tipo_evento:'Sistema',
        descricao:`Fase Liga (modelo suíço) gerada ${temColunaTemporada?`para ${TEMPORADA}`:'(sem coluna de temporada)'}. Corte: 1–8 Oitavas, 9–24 Play-off. Palmeiras excluído.`,
        valor:null
      }])
      toast.success(`✅ Gerado com sucesso: ${rowsInsert.length} jogos em ${ROUNDS} rodadas!`)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally { setGerando(false) }
  }

  async function salvarPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)
    const { data: existente, error: erroVer } = await supabase.from('copa_fase_liga').select('bonus_pago').eq('id', jogo.id).single()
    if (erroVer) { toast.error('Erro ao verificar status do jogo'); setSalvandoId(null); return }
    if (existente?.bonus_pago) { toast.error('❌ Pagamento já efetuado para esse jogo!'); setSalvandoId(null); return }

    const { error: erroPlacar } = await supabase.from('copa_fase_liga').update({ gols_time1: jogo.gols_time1, gols_time2: jogo.gols_time2 }).eq('id', jogo.id)
    if (erroPlacar) { toast.error('Erro ao salvar placar!'); setSalvandoId(null); return }

    await atualizarClassificacao()
    const { error: erroPago } = await supabase.from('copa_fase_liga').update({ bonus_pago: true }).eq('id', jogo.id)
    if (erroPago) { toast.error('Erro ao travar pagamento!'); setSalvandoId(null); return }

    const time1Id = jogo.time1, time2Id = jogo.time2
    const g1 = jogo.gols_time1 ?? 0, g2 = jogo.gols_time2 ?? 0
    let bonus1 = BONUS_EMPATE, bonus2 = BONUS_EMPATE
    if (g1 > g2) { bonus1 = BONUS_VITORIA; bonus2 = BONUS_DERROTA }
    else if (g2 > g1) { bonus1 = BONUS_DERROTA; bonus2 = BONUS_VITORIA }
    const total1 = TAXA_POR_JOGO + bonus1 + (g1*PREMIO_GOL_MARCADO) - (g2*PENALIDADE_GOL_SOFRRIDO)
    const total2 = TAXA_POR_JOGO + bonus2 + (g2*PREMIO_GOL_MARCADO) - (g1*PENALIDADE_GOL_SOFRRIDO)

    // typo fix
    const PENALIDADE_GOL_SOFRRIDO = PENALIDADE_GOL_SOFRIDO

    await supabase.rpc('atualizar_saldo', { id_time: time1Id, valor: total1 })
    await supabase.rpc('atualizar_saldo', { id_time: time2Id, valor: total2 })
    await registrarMovimentacao({ id_time: time1Id, tipo: 'entrada', valor: total1, descricao: `Fase Liga (suíço): ${g1}x${g2}` })
    await registrarMovimentacao({ id_time: time2Id, tipo: 'entrada', valor: total2, descricao: `Fase Liga (suíço): ${g2}x${g1}` })

    const n1 = timesMap[time1Id]?.nome ?? 'Time 1'
    const n2 = timesMap[time2Id]?.nome ?? 'Time 2'
    let tag = '🤝 Empate'; if (g1>g2) tag=`🏆 Vitória de ${n1}`; else if (g2>g1) tag=`🏆 Vitória de ${n2}`
    await supabase.from('bid').insert([{ tipo_evento:'Jogo', descricao:`${n1} ${g1}x${g2} ${n2} — ${tag} • 💰 Taxa por jogo: R$ ${TAXA_POR_JOGO.toLocaleString('pt-BR')}.`, id_time1: time1Id, id_time2: time2Id, valor:null }])

    toast.success('✅ Placar salvo e pagamentos efetuados!')
    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)
    const { error } = await supabase.from('copa_fase_liga').update({ gols_time1: null, gols_time2: null, bonus_pago: false }).eq('id', jogo.id)
    if (error) toast.error('Erro ao excluir resultado!')
    else { await atualizarClassificacao(); toast.success('🗑️ Resultado excluído!'); await buscarJogos() }
    setSalvandoId(null)
  }

  /* ===== UI DERIVED ===== */
  const jogosFiltrados = useMemo(() =>
    jogos.filter(j =>
      filtroTime === 'Todos' ||
      timesMap[j.time1]?.nome === filtroTime ||
      timesMap[j.time2]?.nome === filtroTime
    ), [jogos, filtroTime, timesMap]
  )
  const jogosPorRodada: Record<number, Jogo[]> = useMemo(() => {
    const map: Record<number, Jogo[]> = {}
    jogosFiltrados.forEach(j => { if (!map[j.rodada]) map[j.rodada]=[]; map[j.rodada].push(j) })
    return map
  }, [jogosFiltrados])
  const listaRodadas = useMemo(()=>Object.keys(jogosPorRodada).map(Number).sort((a,b)=>a-b),[jogosPorRodada])
  const nomesDosTimes = useMemo(()=>Object.values(timesMap).map(t=>t.nome).sort(),[timesMap])

  /* ===== Small UI components ===== */
  const ScoreInput = ({ value, onChange, disabled }:{
    value: number | null; onChange: (v:number)=>void; disabled?: boolean
  }) => (
    <div className="flex items-center gap-1 rounded-full bg-zinc-950/70 border border-zinc-700 px-1">
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={()=>onChange(clampInt((value ?? 0)-1))}
        disabled={disabled}
        aria-label="Diminuir"
      >
        <FiMinus />
      </button>
      <input
        type="number"
        min={0}
        className="w-12 text-center bg-transparent outline-none font-bold"
        value={value ?? ''}
        onChange={(e)=>onChange(clampInt(parseInt(e.target.value||'0',10)))}
        disabled={disabled}
      />
      <button
        className="p-1 rounded-full hover:bg-zinc-800 disabled:opacity-40"
        onClick={()=>onChange(clampInt((value ?? 0)+1))}
        disabled={disabled}
        aria-label="Aumentar"
      >
        <FiPlus />
      </button>
    </div>
  )

  const RoundHeader = ({ r }: { r: number }) => {
    const open = !!rodadasAbertas[r]
    return (
      <button
        onClick={()=>setRodadasAbertas(s=>({ ...s, [r]: !open }))}
        className="group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 hover:border-zinc-700"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-400 text-xs font-semibold border border-emerald-700/30">
            Rodada
          </span>
          <span className="text-lg font-bold text-green-400">{r}</span>
        </div>
        <span className="text-zinc-400 group-hover:text-white">{open ? <FiChevronUp/> : <FiChevronDown/>}</span>
      </button>
    )
  }

  return (
    <div ref={topRef} className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black text-white">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/40 bg-black/60 border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-yellow-300 to-yellow-500 bg-clip-text text-transparent">
                UEFA Champions — Fase Liga (modelo suíço){temColunaTemporada ? ` • ${TEMPORADA}` : ''}
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Corte: <span className="text-green-400 font-semibold">1–8 Oitavas</span>, <span className="text-sky-400 font-semibold">9–24 Play-off</span>
            </p>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
                <input type="checkbox" checked={evitarMesmoPais} onChange={e=>setEvitarMesmoPais(e.target.checked)} />
                <FiTarget /> Evitar mesmo país
              </label>
              <button
                onClick={()=>setAbrirModalSwiss(true)}
                disabled={gerando}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-60"
                title="Gera 8 rodadas no modelo suíço"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Gerar Fase Champions (8 rodadas)'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Filtro & Navegação de Rodadas */}
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-300">Filtrar por time:</label>
            <select
              value={filtroTime}
              onChange={(e)=>setFiltroTime(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            >
              <option value="Todos">Todos</option>
              {nomesDosTimes.map(n=> <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {listaRodadas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Ir para:</span>
              {listaRodadas.map(r=>(
                <button
                  key={r}
                  onClick={()=>{
                    const el = document.getElementById(`rodada-${r}`)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs hover:border-zinc-600"
                >
                  {r}
                </button>
              ))}
              <span className="ml-auto" />
              <button
                onClick={()=>setRodadasAbertas(Object.fromEntries(listaRodadas.map(r=>[r,true])))}
                className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                expandir tudo
              </button>
              <button
                onClick={()=>setRodadasAbertas(Object.fromEntries(listaRodadas.map(r=>[r,false])))}
                className="text-xs text-zinc-300 underline underline-offset-2 hover:text-white"
              >
                recolher tudo
              </button>
            </div>
          )}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="grid gap-3">
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900/60 border border-zinc-800" />
            ))}
          </div>
        ) : listaRodadas.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-10 text-center text-zinc-300">
            Nenhum jogo para exibir. Clique em <span className="font-semibold text-white">Gerar Fase Champions (8 rodadas)</span>.
          </div>
        ) : (
          listaRodadas.map((r)=>(
            <section id={`rodada-${r}`} key={r} className="mb-6">
              <RoundHeader r={r} />
              {rodadasAbertas[r] && (
                <div className="mt-3 grid gap-3">
                  {jogosPorRodada[r].map((jogo)=>(
                    <div key={jogo.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow hover:border-zinc-700">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {/* Time 1 */}
                        <div className="flex min-w-[220px] items-center gap-3">
                          <img src={timesMap[jogo.time1]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                          <span className="max-w-[180px] truncate font-semibold">{timesMap[jogo.time1]?.nome || jogo.time1}</span>
                        </div>

                        {/* Placar */}
                        <div className="flex items-center gap-2">
                          <ScoreInput
                            value={jogo.gols_time1}
                            onChange={(v)=>setJogos(prev=>prev.map(j=>j.id===jogo.id?{...j,gols_time1:v}:j))}
                            disabled={!isAdmin}
                          />
                          <span className="px-2 text-lg font-extrabold text-zinc-300">x</span>
                          <ScoreInput
                            value={jogo.gols_time2}
                            onChange={(v)=>setJogos(prev=>prev.map(j=>j.id===jogo.id?{...j,gols_time2:v}:j))}
                            disabled={!isAdmin}
                          />
                        </div>

                        {/* Time 2 */}
                        <div className="flex min-w-[220px] items-center justify-end gap-3">
                          <span className="max-w-[180px] truncate font-semibold">{timesMap[jogo.time2]?.nome || jogo.time2}</span>
                          <img src={timesMap[jogo.time2]?.logo_url || '/default.png'} alt="" className="h-10 w-10 rounded-full border bg-white object-cover" />
                        </div>

                        {/* Ações */}
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={()=>salvarPlacar(jogo)}
                              disabled={salvandoId === jogo.id}
                              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                              title="Salvar placar e pagar bônus"
                            >
                              <FiSave />
                              {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button
                              onClick={()=>excluirPlacar(jogo)}
                              disabled={salvandoId === jogo.id}
                              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                              title="Zerar placar deste jogo"
                            >
                              <FiTrash2 />
                              {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>

      {/* Modal */}
      {abrirModalSwiss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="mb-2 text-xl font-bold text-yellow-400">Gerar Fase Champions (8 rodadas)?</h3>
            <p className="mb-6 text-zinc-200">
              Isso apaga os jogos {temColunaTemporada ? `da temporada "${TEMPORADA}"` : 'atuais'} e cria exatamente 8 rodadas
              (4 casa / 4 fora, 2 adversários por pote). Palmeiras será excluído do sorteio.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800" onClick={()=>setAbrirModalSwiss(false)}>
                Cancelar
              </button>
              <button
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
                onClick={()=>{ setAbrirModalSwiss(false); gerarSwiss() }}
              >
                {gerando ? 'Gerando...' : 'Sim, gerar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
