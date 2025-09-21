'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import confetti from 'canvas-confetti'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UUID = string

interface JogoFinal {
  id: UUID
  id_time1: UUID
  id_time2: UUID
  gols_time1: number | null
  gols_time2: number | null
  created_at?: string | null
  nome_time1?: string
  nome_time2?: string
  logo_time1?: string | null
  logo_time2?: string | null
}
interface TimeRow {
  id: UUID
  nome: string
  logo_url?: string | null
}

/** ========= Config ========= */
const TEMPORADA_PADRAO = 1
const DIVISAO_PADRAO = 1

/** ========= Prêmios da FINAL ========= */
const CAMPEAO_PREMIO = 320_000_000
const VICE_PREMIO = 100_000_000
const GOL_PREMIO = 1_500_000
const BID_TIPO = 'Premiação final'

/** ========= Utils ========= */
const normInt = (val: string): number | null => {
  if (val === '') return null
  const n = parseInt(val, 10)
  if (Number.isNaN(n) || n < 0) return null
  return n
}
const mentionsVolta = (msg?: string) => {
  const s = String(msg || '').toLowerCase()
  return s.includes('gols_time1_volta') || s.includes('gols_time2_volta') || s.includes('_volta')
}

/** ========= UI helpers ========= */
function TeamLogo({ url, alt, size=40 }:{ url?: string | null; alt: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} style={{ width: size, height: size }} className="object-cover rounded-full" />
  ) : (
    <div className="rounded-full bg-white/10 text-white/80 grid place-items-center"
         style={{ width: size, height: size, fontSize: Math.max(10, size/3) }}>
      {alt.slice(0,3).toUpperCase()}
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

/** ===== Helpers: ler Semis (igual às Quartas) e decidir vencedores ===== */
async function carregarSemis() {
  // tenta com *_volta
  const q1 = await supabase
    .from('copa_semis') // <<< usa tabela no plural, igual ao teu código das Quartas
    .select('ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
    .order('ordem', { ascending: true })

  if (q1.error && mentionsVolta(q1.error.message)) {
    const q2 = await supabase
      .from('copa_semis')
      .select('ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
      .order('ordem', { ascending: true })
    if (q2.error) throw q2.error
    return { jogos: (q2.data || []).slice(0, 2), temVolta: false }
  }
  if (q1.error) throw q1.error
  return { jogos: (q1.data || []).slice(0, 2), temVolta: true }
}
function semiCompleta(j: any, temVolta: boolean) {
  const idaOk = j.gols_time1 != null && j.gols_time2 != null
  const voltaOk = !temVolta || (j.gols_time1_volta != null && j.gols_time2_volta != null)
  return idaOk && voltaOk
}
function vencedorDaChave(j: any, temVolta: boolean) {
  const ida1 = j.gols_time1 ?? 0
  const ida2 = j.gols_time2 ?? 0
  const vol1 = temVolta ? (j.gols_time1_volta ?? 0) : 0
  const vol2 = temVolta ? (j.gols_time2_volta ?? 0) : 0
  const tot1 = ida1 + vol1
  const tot2 = ida2 + vol2
  if (tot1 > tot2) return j.id_time1
  if (tot2 > tot1) return j.id_time2
  // empate -> time1 (igual às Quartas)
  return j.id_time1
}

/** ========= Página ========= */
export default function FinalPage() {
  const { isAdmin } = useAdmin()

  const [jogo, setJogo] = useState<JogoFinal | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [campeao, setCampeao] = useState<TimeRow | null>(null)

  // inputs controlados
  const [g1, setG1] = useState<number | null>(null)
  const [g2, setG2] = useState<number | null>(null)

  const [semisCompletas, setSemisCompletas] = useState(false)

  const podeSalvar = (g1 != null && g2 != null) && semisCompletas

  useEffect(() => {
    buscarTudo()
    const onFocus = () => buscarTudo()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (campeao) {
      confetti({ particleCount: 240, spread: 120, angle: 75, origin: { y: 0.6 } })
      setTimeout(() => confetti({ particleCount: 200, spread: 110, angle: 105, origin: { y: 0.55 } }), 350)
      setTimeout(() => confetti({ particleCount: 180, spread: 100, origin: { y: 0.38 } }), 700)
    }
  }, [campeao])

  /** Checa se as semis estão completas (ida e volta, se houver) */
  async function checarSemisCompletas(): Promise<boolean> {
    try {
      const { jogos, temVolta } = await carregarSemis()
      if (jogos.length !== 2) return false
      return jogos.every(j => semiCompleta(j, temVolta))
    } catch {
      return false
    }
  }

  async function buscarTudo() {
    setLoading(true)

    // 1) primeiro valida as Semis
    const completas = await checarSemisCompletas()
    setSemisCompletas(completas)

    // 2) só carrega/exibe a Final se as Semis estiverem completas
    if (completas) {
      await buscarFinal()
    } else {
      setJogo(null)
      setCampeao(null)
      setG1(null); setG2(null)
    }

    setLoading(false)
  }

  async function buscarFinal() {
    const { data: finalRow, error } = await supabase
      .from('copa_final')
      .select('id, id_time1, id_time2, gols_time1, gols_time2, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !finalRow) {
      setJogo(null)
      setCampeao(null)
      setG1(null); setG2(null)
      return
    }

    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .in('id', [finalRow.id_time1, finalRow.id_time2])

    if (errTimes || !times) {
      setJogo({ ...finalRow })
      setG1(finalRow.gols_time1 ?? null)
      setG2(finalRow.gols_time2 ?? null)
      return
    }

    const mapa = new Map(times.map(t => [t.id, t]))
    const jogoComNomes: JogoFinal = {
      ...finalRow,
      nome_time1: mapa.get(finalRow.id_time1)?.nome ?? 'Time 1',
      nome_time2: mapa.get(finalRow.id_time2)?.nome ?? 'Time 2',
      logo_time1: mapa.get(finalRow.id_time1)?.logo_url ?? null,
      logo_time2: mapa.get(finalRow.id_time2)?.logo_url ?? null
    }

    setJogo(jogoComNomes)
    setG1(finalRow.gols_time1 ?? null)
    setG2(finalRow.gols_time2 ?? null)

    if (finalRow.gols_time1 != null && finalRow.gols_time2 != null) {
      const vencedorId =
        finalRow.gols_time1 > finalRow.gols_time2
          ? finalRow.id_time1
          : finalRow.gols_time2 > finalRow.gols_time1
            ? finalRow.id_time2
            : finalRow.id_time1 // empate -> time1 (igual às Quartas)
      const vencedor = mapa.get(vencedorId)
      setCampeao(vencedor ? { id: vencedor.id, nome: vencedor.nome, logo_url: vencedor.logo_url ?? null } : null)
    } else {
      setCampeao(null)
    }
  }

  /** ========= Premiação + salvar ========= */
  async function salvarPlacar() {
    if (!jogo) return
    if (!semisCompletas) {
      toast.error('Aguarde a definição da Semifinal.')
      return
    }
    if (!podeSalvar) {
      toast.error('Preencha os dois placares antes de salvar.')
      return
    }

    // Lê placar anterior
    const { data: beforeRaw, error: readErr } = await supabase
      .from('copa_final')
      .select('gols_time1,gols_time2')
      .eq('id', jogo.id)
      .maybeSingle()
    if (readErr) {
      toast.error('Erro ao ler placar anterior')
      return
    }

    try {
      setSalvando(true)

      // Atualiza placar
      const { error: upErr } = await supabase
        .from('copa_final')
        .update({ gols_time1: g1, gols_time2: g2 })
        .eq('id', jogo.id)
      if (upErr) throw upErr

      // ===== Bonificações =====
      const before1 = beforeRaw?.gols_time1 ?? 0
      const before2 = beforeRaw?.gols_time2 ?? 0
      const beforeDefined = (beforeRaw?.gols_time1 ?? null) != null && (beforeRaw?.gols_time2 ?? null) != null
      const nowDefined = (g1 ?? null) != null && (g2 ?? null) != null

      // Gols: delta
      const delta1 = Math.max(0, (g1 ?? 0) - before1)
      const delta2 = Math.max(0, (g2 ?? 0) - before2)

      if (delta1 > 0) {
        const valor = delta1 * GOL_PREMIO
        await supabase.rpc('atualizar_saldo', { id_time: jogo.id_time1, valor })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Gols marcados (${delta1}) — ${jogo.nome_time1}`,
          valor,
          id_time: jogo.id_time1
        })
      }
      if (delta2 > 0) {
        const valor = delta2 * GOL_PREMIO
        await supabase.rpc('atualizar_saldo', { id_time: jogo.id_time2, valor })
        await supabase.from('bid').insert({
          tipo_evento: BID_TIPO,
          descricao: `Gols marcados (${delta2}) — ${jogo.nome_time2}`,
          valor,
          id_time: jogo.id_time2
        })
      }

      // Campeão/Vice: só na primeira definição
      if (!beforeDefined && nowDefined) {
        const placarStr = `${jogo.nome_time1} ${g1 ?? 0} x ${g2 ?? 0} ${jogo.nome_time2}`
        const champId = (g1 ?? 0) >= (g2 ?? 0) ? jogo.id_time1 : jogo.id_time2
        const viceId  = champId === jogo.id_time1 ? jogo.id_time2 : jogo.id_time1

        const { count: jaPagouCampeao } = await supabase
          .from('bid')
          .select('id', { head: true, count: 'exact' })
          .eq('tipo_evento', BID_TIPO)
          .ilike('descricao', 'Campeão - Final:%')
          .eq('id_time', champId)

        if (!jaPagouCampeao) {
          await supabase.rpc('atualizar_saldo', { id_time: champId, valor: CAMPEAO_PREMIO })
          await supabase.from('bid').insert({
            tipo_evento: BID_TIPO,
            descricao: `Campeão - Final: ${placarStr}`,
            valor: CAMPEAO_PREMIO,
            id_time: champId
          })

          await supabase.rpc('atualizar_saldo', { id_time: viceId, valor: VICE_PREMIO })
          await supabase.from('bid').insert({
            tipo_evento: BID_TIPO,
            descricao: `Vice-campeão - Final: ${placarStr}`,
            valor: VICE_PREMIO,
            id_time: viceId
          })

          // histórico opcional (se tiver a tabela)
          try {
            await supabase
              .from('copa_historico_campeoes')
              .upsert(
                [{
                  temporada: TEMPORADA_PADRAO,
                  divisao: DIVISAO_PADRAO,
                  id_final: jogo.id,
                  id_campeao: champId,
                  id_vice: viceId,
                  placar: placarStr,
                }],
                { onConflict: 'temporada,divisao' }
              )
          } catch {}
        }
      }

      toast.success('Placar salvo! Premiação aplicada.')
      await buscarFinal()
    } catch (e: any) {
      console.error(e)
      toast.error('Erro ao salvar/bonificar: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setSalvando(false)
    }
  }

  /** ====== Gera/atualiza a Final direto do resultado das Semis (sem API) ====== */
  async function sincronizarComSemi() {
    if (!semisCompletas) {
      toast.error('Finalize a Semifinal para liberar a Final.')
      return
    }
    try {
      // 1) Lê semis e valida placares (igual às Quartas)
      const { jogos, temVolta } = await carregarSemis()
      if (jogos.length !== 2) {
        toast.error('Semifinal incompleta (é preciso 2 confrontos).')
        return
      }
      if (!jogos.every(j => semiCompleta(j, temVolta))) {
        toast.error('Preencha todos os placares da Semifinal.')
        return
      }

      // 2) Decide os finalistas (agregado; empate -> time1)
      const finalista1 = vencedorDaChave(jogos[0], temVolta)
      const finalista2 = vencedorDaChave(jogos[1], temVolta)

      // 3) Atualiza a Final mais recente OU insere nova
      const { data: finalRow } = await supabase
        .from('copa_final')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (finalRow?.id) {
        const { error: upErr } = await supabase
          .from('copa_final')
          .update({
            id_time1: finalista1,
            id_time2: finalista2,
            gols_time1: null,
            gols_time2: null,
            temporada: TEMPORADA_PADRAO,
            divisao: DIVISAO_PADRAO
          })
          .eq('id', finalRow.id)
        if (upErr) throw upErr
      } else {
        const { error: insErr } = await supabase.from('copa_final').insert([{
          id_time1: finalista1,
          id_time2: finalista2,
          gols_time1: null,
          gols_time2: null,
          temporada: TEMPORADA_PADRAO,
          divisao: DIVISAO_PADRAO
        }])
        if (insErr) throw insErr
      }

      toast.success('Final atualizada com os vencedores da Semi!')
      await buscarTudo()
    } catch (e:any) {
      console.error(e)
      toast.error(e?.message || 'Erro ao sincronizar com a Semi')
    }
  }

  const desempateTexto = useMemo(() => {
    // igual às Quartas: em caso de empate, vale o time1
    return '*Em caso de empate, campeão = Time 1 (critério padrão)'
  }, [])

  return (
    <div className="relative p-4 sm:p-6 max-w-5xl mx-auto">
      {/* brilhos suaves */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
          Final da Copa
        </h1>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              className={`${semisCompletas ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600/50 text-white/70 cursor-not-allowed'} px-4 py-2 rounded-xl shadow`}
              onClick={sincronizarComSemi}
              disabled={!semisCompletas}
              title={semisCompletas ? 'Forçar atualização da Final a partir dos vencedores da Semi' : 'Finalize a Semifinal para liberar'}
            >
              🔁 Sincronizar com a Semi
            </button>
            <button
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl shadow"
              onClick={buscarTudo}
              title="Recarregar"
            >
              🔄 Recarregar
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="p-4">🔄 Carregando final...</div>
      ) : !semisCompletas ? (
        <div className="p-4 text-center text-white/70">
          ⚠️ Aguardando definição da <span className="font-semibold">Semifinal</span>.  
          Assim que os dois confrontos forem concluídos, a Final será liberada.
        </div>
      ) : !jogo ? (
        <p className="text-center text-white/70">Final ainda não foi gerada. Use “Sincronizar com a Semi”.</p>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 md:p-6 shadow-xl">
          <div className="pointer-events-none absolute -top-20 -right-16 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

          {/* cabeçalho do card */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-[13px] text-white/60">Jogo único · Final</div>
            <div className="text-xs text-white/60">
              {new Date(jogo.created_at ?? Date.now()).toLocaleString()}
            </div>
          </div>

          {/* Linha: times + placar */}
          <div className="grid grid-cols-12 items-center gap-x-4">
            <TeamSide name={jogo.nome_time1 ?? 'Time 1'} logo={jogo.logo_time1} align="right" role="Mandante" />
            <ScoreRail label="Placar" a={g1} b={g2} onA={setG1} onB={setG2} />
            <TeamSide name={jogo.nome_time2 ?? 'Time 2'} logo={jogo.logo_time2} align="left" role="Visitante" />
          </div>

          {/* Ações */}
          <div className="mt-6 flex flex-col items-center gap-2">
            {isAdmin && (
              <button
                onClick={salvarPlacar}
                disabled={!podeSalvar || salvando}
                className={`px-4 py-2 rounded-xl ${podeSalvar && !salvando ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600/50 text-white/70 cursor-not-allowed'} shadow focus:outline-none focus:ring-2 focus:ring-emerald-400/50`}
              >
                {salvando ? 'Salvando…' : '💾 Salvar placar'}
              </button>
            )}
            <span className="text-xs text-white/50">{desempateTexto}</span>
          </div>

          {/* Campeão */}
          {campeao && (
            <div className="relative mt-10 grid place-items-center">
              {/* fogos CSS */}
              <div className="fireworks fireworks-1" />
              <div className="fireworks fireworks-2" />
              <div className="fireworks fireworks-3" />

              <div className="champion-badge">
                <div className="pulse-ring" />
                <div className="trophy">🏆</div>
              </div>

              <h2 className="mt-4 text-center text-3xl md:text-4xl font-extrabold champion-text">
                {campeao.nome} é o grande campeão!
              </h2>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`🏆 ${campeao.nome} é o grande campeão da LigaFut!\n\nParabéns ao time que brilhou na final e levantou a taça! 🥇⚽`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold shadow hover:bg-emerald-700"
              >
                📤 Compartilhar no WhatsApp
              </a>
            </div>
          )}

          {/* ====== Estilos locais ====== */}
          <style jsx>{`
            .champion-badge {
              position: relative;
              width: 110px;
              height: 110px;
              border-radius: 9999px;
              background: radial-gradient(60% 60% at 50% 40%, #ffd54a, #c28e00 70%, #543a00 100%);
              box-shadow: 0 10px 30px rgba(255, 214, 74, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.15);
              display: grid;
              place-items: center;
              animation: float 4.5s ease-in-out infinite;
            }
            .trophy {
              font-size: 46px;
              transform-origin: bottom center;
              animation: bounce 1.8s ease-in-out infinite;
              filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.25));
            }
            .pulse-ring {
              position: absolute;
              inset: -10px;
              border-radius: 9999px;
              background: conic-gradient(from 0deg, rgba(255, 215, 0, 0.12), transparent 55%);
              animation: spin 8s linear infinite;
              filter: blur(2px);
            }
            .champion-text {
              background: linear-gradient(90deg, #ffd54a, #ffffff, #ffd54a);
              background-size: 200% 100%;
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              animation: shine 2.2s linear infinite;
              text-shadow: 0 2px 18px rgba(255, 215, 64, 0.15);
            }
            .fireworks {
              position: absolute;
              width: 6px;
              height: 6px;
              background: radial-gradient(circle, #fff, rgba(255, 255, 255, 0) 60%);
              border-radius: 50%;
              opacity: 0.9;
              animation: explode 1.7s ease-out infinite;
              filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.6));
            }
            .fireworks-1 { top: -10px; left: 12%; animation-delay: 0.1s; }
            .fireworks-2 { top: 5px; right: 14%; animation-delay: 0.5s; }
            .fireworks-3 { top: -6px; left: 50%; transform: translateX(-50%); animation-delay: 0.9s; }

            @keyframes explode { 0% { transform: scale(0.3); opacity: 0.8; } 50% { transform: scale(1.8); opacity: 1; } 100% { transform: scale(0.2) translateY(12px); opacity: 0; } }
            @keyframes shine { 0% { background-position: 0% 0; } 100% { background-position: 200% 0; } }
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-6px); } }
            @keyframes bounce { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.02); } }
          `}</style>
        </div>
      )}
    </div>
  )
}

