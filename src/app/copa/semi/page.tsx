'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ========= Tipos ========= */
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
  // opcionais (caso existam)
  temporada?: number | null
  divisao?: number | null
}
type Classificacao = { id_time: string; pontos: number }

/** ========= Utils ========= */
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const mentionsTableMissing = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('relation') && s.includes('does not exist')
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

/** ========= Página ========= */
export default function SemiPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<JogoSemi[]>([])
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [classificacao, setClassificacao] = useState<Classificacao[]>([])
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [semiTable, setSemiTable] = useState<'copa_semi' | 'copa_semifinal'>('copa_semi')

  // Ajuste se usar multi-temporada/divisão
  const [temporadaSelecionada] = useState<number>(1)
  const [divisaoSelecionada] = useState<number>(1)

  useEffect(() => {
    Promise.all([buscarJogos(), buscarClassificacao()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buscarJogos() {
    setLoading(true)

    const buildSelect = (includeVolta: boolean) =>
      [
        'id',
        'ordem',
        'id_time1',
        'id_time2',
        'time1',
        'time2',
        'gols_time1',
        'gols_time2',
        includeVolta ? 'gols_time1_volta' : null,
        includeVolta ? 'gols_time2_volta' : null,
        'temporada',
        'divisao',
      ].filter(Boolean).join(',')

    async function query(table: 'copa_semi' | 'copa_semifinal', includeVolta: boolean) {
      return supabase
        .from(table)
        .select(buildSelect(includeVolta))
        .eq('temporada', temporadaSelecionada)      // remova se não tiver essas colunas
        .eq('divisao', divisaoSelecionada)          // remova se não tiver essas colunas
        .order('ordem', { ascending: true })
    }

    let tableInUse: 'copa_semi' | 'copa_semifinal' = 'copa_semi'
    let includeVolta = true

    // 1) tenta copa_semi com *_volta
    let { data, error } = await query('copa_semi', includeVolta)

    // 2) se erro por coluna *_volta, tenta sem volta
    if (error && mentionsVolta(error.message)) {
      setSupportsVolta(false)
      includeVolta = false
      ;({ data, error } = await query('copa_semi', includeVolta))
    }

    // 3) se ainda deu erro (tabela não existe), tenta copa_semifinal
    if (error && mentionsTableMissing(error.message)) {
      tableInUse = 'copa_semifinal'
      includeVolta = true
      ;({ data, error } = await query('copa_semifinal', includeVolta))

      if (error && mentionsVolta(error.message)) {
        setSupportsVolta(false)
        includeVolta = false
        ;({ data, error } = await query('copa_semifinal', includeVolta))
      }
    }

    if (error) {
      toast.error('Erro ao buscar jogos: ' + error.message)
      setJogos([])
      setLogosById({})
      setLoading(false)
      return
    }

    const arr = (data || []) as JogoSemi[]
    setJogos(arr)
    setSemiTable(tableInUse)

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
    // ajuste o filtro se sua tabela tiver temporada/divisão
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos, temporada, divisao')
      .eq('temporada', temporadaSelecionada)
      .eq('divisao', divisaoSelecionada)

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
      .from(semiTable) // atualiza na tabela correta
      .update(update)
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar: ' + error.message)
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

  async function finalizarSemi() {
    if (!semiCompleta) {
      toast.error('Preencha todos os placares (ida e volta, se houver) antes de finalizar.')
      return
    }

    // (Opcional) validação local: aponta empates no agregado
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

      // parse robusto (mesmo se vier HTML)
      const raw = await res.text()
      let payload: any = {}
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = { erro: raw } }

      if (!res.ok) {
        const step = payload?.step ? `[${payload.step}] ` : ''
        const msg  = payload?.erro || res.statusText || 'Falha ao definir Final'
        throw new Error(step + msg)
      }

      toast.success('Semifinal finalizada e Final definida!')
      window.location.href = '/copa/final'
    } catch (e: any) {
      console.error('definir-final:', e)
      toast.error(e?.message || 'Erro ao definir a Final')
    }
  }

  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto">
      {/* brilhos suaves */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <div className="space-y-0.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
            Semifinal
          </h1>
          <p className="text-xs text-white/60">
            Tabela: <code className="opacity-80">{semiTable}</code>{' '}
            · Volta: <code className="opacity-80">{supportsVolta ? 'sim' : 'não'}</code>
          </p>
        </div>

        {isAdmin && (
          <button
            className={`px-4 py-2 rounded-xl ${semiCompleta ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-700/50 text-white/70 cursor-not-allowed'}`}
            disabled={!semiCompleta}
            onClick={finalizarSemi}
            title={semiCompleta ? 'Definir Final' : 'Preencha todos os placares para habilitar'}
          >
            🏁 Finalizar Semifinal (definir Final)
          </button>
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
