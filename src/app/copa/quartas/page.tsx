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
type JogoQuartas = {
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

/** ========= Utils ========= */
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '')
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}
const normInt = (val: string): number | null => {
  if (val === '') return null
  const n = parseInt(val, 10)
  if (Number.isNaN(n) || n < 0) return null
  return n
}
const isPlacarPreenchido = (j: JogoQuartas, supportsVolta: boolean) => {
  const idaOk = j.gols_time1 != null && j.gols_time2 != null
  const voltaOk = !supportsVolta || (j.gols_time1_volta != null && j.gols_time2_volta != null)
  return idaOk && voltaOk
}

/** ========= Página ========= */
export default function QuartasPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<JogoQuartas[]>([])
  const [supportsVolta, setSupportsVolta] = useState(true)
  const [logosById, setLogosById] = useState<Record<string, string | null>>({})
  const [classificacao, setClassificacao] = useState<Array<{ id_time: string; pontos: number }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([buscarJogos(), buscarClassificacao()]).finally(() => setLoading(false))
  }, [])

  async function buscarJogos() {
    setLoading(true)

    // tenta ler com colunas de VOLTA
    const q1 = await supabase
      .from('copa_quartas')
      .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
      .order('ordem', { ascending: true })

    let data: any[] | null = q1.data as any
    let error = q1.error

    // se não tiver *_volta no schema, faz fallback
    if (error && mentionsVolta(error.message)) {
      setSupportsVolta(false)
      const q2 = await supabase
        .from('copa_quartas')
        .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
        .order('ordem', { ascending: true })
      data = q2.data as any
      error = q2.error
    }

    if (error) {
      console.error(error)
      toast.error('Erro ao buscar jogos das Quartas')
      setJogos([])
      setLoading(false)
      return
    }

    const arr = (data || []) as JogoQuartas[]
    setJogos(arr)

    // carrega logos dos times envolvidos
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
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos')

    if (!error && data) setClassificacao(data)
    else setClassificacao([])
  }

  /** ====== Salvar placar do card ====== */
  async function salvarPlacar(jogo: JogoQuartas) {
    // validação: exigir ida e volta (se houver volta)
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
      .from('copa_quartas')
      .update(update)
      .eq('id', jogo.id)

    if (error) toast.error('Erro ao salvar')
    else {
      toast.success('Placar salvo!')
      setJogos(prev => prev.map(j => (j.id === jogo.id ? { ...j, ...update } : j)))
    }
  }

  /** ====== Critério de desempate: melhor campanha (pontos) ====== */
  const pontosCampanha = (id: string) =>
    classificacao.find(c => c.id_time === id)?.pontos ?? 0

  /** ====== Agregado preenchido? ====== */
  const quartasCompletas = useMemo(() =>
    jogos.length > 0 && jogos.every(j => isPlacarPreenchido(j, supportsVolta)),
    [jogos, supportsVolta]
  )

  /** ====== Finalizar Quartas -> gerar Semifinal ====== */
  async function finalizarQuartas() {
    if (!quartasCompletas) {
      toast.error('Preencha todos os placares (ida e volta, se houver) antes de finalizar.')
      return
    }

    // buscar novamente para garantir consistência
    let hasVolta = supportsVolta
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
        if (q2.error) { toast.error('Erro ao ler Quartas'); return }
        data = q2.data as any
      } else if (q1.error) {
        toast.error('Erro ao ler Quartas')
        return
      } else {
        data = q1.data as any
      }
    }

    const jogosAtual = (data || []) as JogoQuartas[]
    if (!jogosAtual.length) {
      toast.error('Sem confrontos nas Quartas.')
      return
    }

    // vencedores com desempate por campanha
    const vencedores: Array<{ id: string; nome: string }> = []
    for (const j of jogosAtual) {
      const ida1 = j.gols_time1 || 0
      const ida2 = j.gols_time2 || 0
      const vol1 = hasVolta ? ((j as any).gols_time1_volta || 0) : 0
      const vol2 = hasVolta ? ((j as any).gols_time2_volta || 0) : 0
      const total1 = ida1 + vol1
      const total2 = ida2 + vol2

      let vencedorId = ''
      let vencedorNome = ''
      if (total1 > total2) {
        vencedorId = j.id_time1
        vencedorNome = j.time1
      } else if (total2 > total1) {
        vencedorId = j.id_time2
        vencedorNome = j.time2
      } else {
        // empate no agregado -> melhor campanha
        const p1 = pontosCampanha(j.id_time1)
        const p2 = pontosCampanha(j.id_time2)
        if (p1 >= p2) { vencedorId = j.id_time1; vencedorNome = j.time1 }
        else { vencedorId = j.id_time2; vencedorNome = j.time2 }
      }
      vencedores.push({ id: vencedorId, nome: vencedorNome })
    }

    // montar semifinais (1x2, 3x4, …)
    const semi: any[] = []
    for (let i = 0; i < vencedores.length; i += 2) {
      if (vencedores[i + 1]) {
        semi.push({
          rodada: 1,
          ordem: (i / 2) + 1,
          id_time1: vencedores[i].id,
          id_time2: vencedores[i + 1].id,
          time1: vencedores[i].nome,
          time2: vencedores[i + 1].nome,
          gols_time1: null,
          gols_time2: null,
          // se sua semifinal for só jogo único, pode remover as colunas *_volta
          gols_time1_volta: null,
          gols_time2_volta: null,
        })
      }
    }

    try {
      await supabase.from('copa_semi').delete().neq('id', 0).throwOnError()
      // tenta com VOLTA; se falhar, insere sem
      const ins1 = await supabase
        .from('copa_semi')
        .insert(semi)
      if (ins1.error && mentionsVolta(ins1.error.message)) {
        const ins2 = await supabase.from('copa_semi').insert(
          semi.map(s => ({ ...s, gols_time1_volta: undefined, gols_time2_volta: undefined }))
        )
        if (ins2.error) throw ins2.error
      } else if (ins1.error) {
        throw ins1.error
      }
      toast.success('Classificados enviados para a Semifinal!')
    } catch (e: any) {
      console.error(e)
      toast.error(`Erro ao gerar Semifinal: ${e?.message || e}`)
    }
  }

  if (loading) return <div className="p-4">🔄 Carregando...</div>

  return (
    <div className="relative p-4 sm:p-6 max-w-7xl mx-auto">
      {/* brilhos suaves de fundo */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          Quartas de Final
        </h1>

        {isAdmin && (
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-xl ${quartasCompletas ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-700/50 text-white/70 cursor-not-allowed'}`}
              disabled={!quartasCompletas}
              onClick={finalizarQuartas}
              title={quartasCompletas ? 'Gerar Semifinal' : 'Preencha todos os placares para habilitar'}
            >
              🏁 Finalizar Quartas
            </button>
          </div>
        )}
      </header>

      {/* Lista de jogos com o card de Ida/Volta */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {jogos.map((jogo, idx) => (
          <MatchCard
            key={jogo.id}
            faseLabel="Quartas"
            jogo={{ ...jogo, ordem: jogo.ordem ?? (idx + 1) }}
            supportsVolta={supportsVolta}
            logosById={logosById}
            onChange={(next) => setJogos(prev => prev.map(j => j.id === jogo.id ? next : j))}
            onSave={(updated) => salvarPlacar(updated)}
          />
        ))}
      </div>
    </div>
  )
}

/** ====== Cartão de Jogo (Ida e Volta) ====== */
function MatchCard({
  jogo, supportsVolta, logosById, onChange, onSave, faseLabel = 'Quartas'
}:{
  jogo: JogoQuartas
  supportsVolta: boolean
  logosById: Record<string, string | null>
  onChange: (next: JogoQuartas) => void
  onSave: (j: JogoQuartas) => void
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

  const buildNext = (): JogoQuartas => ({
    ...jogo,
    gols_time1: ida1,
    gols_time2: ida2,
    ...(supportsVolta ? { gols_time1_volta: vol1, gols_time2_volta: vol2 } : {})
  })

  const podeSalvar = isPlacarPreenchido(buildNext(), supportsVolta)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 shadow-xl">
      {/* glow decorativo */}
      <div className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

      {/* cabeçalho */}
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

      {/* IDA — time1 (mandante) x time2 (visitante) */}
      <LegRow
        label="Ida"
        left={{ name:jogo.time1, logo:logosById[jogo.id_time1], role:'Mandante', align:'right' }}
        right={{ name:jogo.time2, logo:logosById[jogo.id_time2], role:'Visitante', align:'left' }}
        a={ida1}
        b={ida2}
        onA={(v)=>setIda1(v)}
        onB={(v)=>setIda2(v)}
      />

      {/* VOLTA — invertido */}
      {supportsVolta && (
        <div className="mt-3">
          <LegRow
            label="Volta"
            left={{ name:jogo.time2, logo:logosById[jogo.id_time2], role:'Mandante', align:'right' }}
            right={{ name:jogo.time1, logo:logosById[jogo.id_time1], role:'Visitante', align:'left' }}
            a={vol2}   // esquerda (mandante na volta) -> gols_time2_volta
            b={vol1}   // direita -> gols_time1_volta
            onA={(v)=>setVol2(v)}
            onB={(v)=>setVol1(v)}
          />
        </div>
      )}

      {/* ação */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={()=>onSave(buildNext())}
          disabled={!podeSalvar}
          className={`px-4 py-2 rounded-xl ${podeSalvar ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600/50 text-white/70 cursor-not-allowed'} shadow focus:outline-none focus:ring-2 focus:ring-emerald-400/50`}>
          Salvar
        </button>
      </div>
    </div>
  )
}

/** Linha de um jogo (lado-esquerdo mandante, lado-direito visitante) */
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

/** Trilho de placar central com selo flutuante */
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

/** Lado do time (logo + nome + papel) exatamente como no layout de Oitavas */
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
