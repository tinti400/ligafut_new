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

interface Time {
  id: UUID
  nome: string
  logo_url?: string | null
}

/** ============ Helpers de UI ============ */
function TeamBadge({
  nome,
  logo
}: {
  nome: string
  logo?: string | null
}) {
  // fallback: bolinha com a primeira letra
  const abbr = useMemo(() => (nome?.trim()?.[0] || 'T').toUpperCase(), [nome])
  return (
    <div className="flex items-center gap-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={nome}
          className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
          onError={(e) => {
            const el = e.currentTarget
            el.onerror = null
            el.src =
              'data:image/svg+xml;utf8,' +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#111827"/><text x="50%" y="56%" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#9CA3AF" text-anchor="middle" dominant-baseline="middle">${abbr}</text></svg>`
              )
          }}
        />
      ) : (
        <div className="h-10 w-10 rounded-full grid place-items-center bg-gray-800 ring-2 ring-white/10">
          <span className="text-gray-300 font-semibold">{abbr}</span>
        </div>
      )}
      <span className="font-semibold">{nome}</span>
    </div>
  )
}

export default function FinalPage() {
  const { isAdmin } = useAdmin()
  const [jogo, setJogo] = useState<JogoFinal | null>(null)
  const [loading, setLoading] = useState(true)
  const [campeao, setCampeao] = useState<Time | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    buscarFinal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (campeao) {
      // Confetti + “repiques”
      confetti({ particleCount: 240, spread: 120, angle: 75, origin: { y: 0.6 } })
      setTimeout(() => confetti({ particleCount: 200, spread: 110, angle: 105, origin: { y: 0.55 } }), 350)
      setTimeout(() => confetti({ particleCount: 180, spread: 100, origin: { y: 0.38 } }), 700)
    }
  }, [campeao])

  async function buscarFinal() {
    setLoading(true)

    const { data: finalRow, error } = await supabase
      .from('copa_final')
      .select('id, id_time1, id_time2, gols_time1, gols_time2, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !finalRow) {
      toast.error('⚠️ Final não encontrada.')
      setJogo(null)
      setCampeao(null)
      setLoading(false)
      return
    }

    // Busca nomes + logos
    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .in('id', [finalRow.id_time1, finalRow.id_time2])

    if (errTimes || !times) {
      toast.error('Erro ao buscar times')
      setLoading(false)
      setJogo({ ...finalRow })
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
    setLoading(false)

    // Define campeão (se já houver placar)
    if (finalRow.gols_time1 !== null && finalRow.gols_time2 !== null) {
      const vencedorId =
        finalRow.gols_time1 > finalRow.gols_time2
          ? finalRow.id_time1
          : finalRow.gols_time2 > finalRow.gols_time1
            ? finalRow.id_time2
            : finalRow.id_time1 // desempate (melhor campanha = time1)

      const vencedor = mapa.get(vencedorId)
      if (vencedor) setCampeao(vencedor)
    } else {
      setCampeao(null)
    }
  }

  async function salvarPlacar() {
    if (!jogo) return

    try {
      setSalvando(true)
      const { error } = await supabase
        .from('copa_final')
        .update({
          gols_time1: jogo.gols_time1,
          gols_time2: jogo.gols_time2
        })
        .eq('id', jogo.id)

      if (error) throw new Error(error.message)

      toast.success('Placar salvo!')
      await buscarFinal()
    } catch (e: any) {
      toast.error('Erro ao salvar placar: ' + (e?.message ?? 'desconhecido'))
    } finally {
      setSalvando(false)
    }
  }

  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement>,
    campo: 'gols_time1' | 'gols_time2'
  ) => {
    const raw = e.target.value
    const valor = raw === '' ? null : Math.max(0, parseInt(raw))
    if (!jogo) return
    setJogo({ ...jogo, [campo]: Number.isNaN(valor as any) ? null : valor })
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-3xl">
          <div className="h-40 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse" />
        </div>
      </div>
    )
  }

  const titulo = jogo ? `${jogo.nome_time1 ?? 'Time 1'} vs ${jogo.nome_time2 ?? 'Time 2'}` : ''

  return (
    <div className="p-4 text-white">
      <h1 className="text-3xl font-extrabold mb-6 text-center">
        <span className="bg-gradient-to-r from-emerald-400 via-white to-emerald-400 bg-clip-text text-transparent">
          🏅 Final da Copa
        </span>
      </h1>

      {jogo ? (
        <div className="mx-auto max-w-3xl">
          {/* Card principal */}
          <div className="relative overflow-hidden rounded-2xl bg-[#0B1220] ring-1 ring-white/10 shadow-2xl">
            {/* brilho diagonal */}
            <div className="pointer-events-none absolute -inset-1 opacity-20 [mask-image:radial-gradient(60%_60%_at_50%_20%,black,transparent)]">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-sky-500 blur-3xl" />
            </div>

            <div className="relative p-6 md:p-8">
              <div className="mb-6 text-center text-sm uppercase tracking-widest text-white/60">
                {new Date(jogo.created_at ?? Date.now()).toLocaleString()}
              </div>

              {/* Placar */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-6">
                {/* Mandante */}
                <div className="justify-self-end md:justify-self-auto">
                  <TeamBadge nome={jogo.nome_time1 ?? 'Time 1'} logo={jogo.logo_time1} />
                </div>

                {/* Centro */}
                <div className="grid place-items-center gap-3">
                  <div className="text-xs tracking-widest text-white/50 uppercase">Placar</div>
                  <div className="flex items-center gap-4 text-4xl font-black">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="score-input"
                      value={jogo.gols_time1 ?? ''}
                      onChange={(e) => handleInput(e, 'gols_time1')}
                    />
                    <span className="text-white/70">x</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="score-input"
                      value={jogo.gols_time2 ?? ''}
                      onChange={(e) => handleInput(e, 'gols_time2')}
                    />
                  </div>
                </div>

                {/* Visitante */}
                <div className="justify-self-start md:justify-self-auto">
                  <TeamBadge nome={jogo.nome_time2 ?? 'Time 2'} logo={jogo.logo_time2} />
                </div>
              </div>

              {/* Ações */}
              <div className="mt-8 flex items-center justify-center gap-3">
                {isAdmin && (
                  <button
                    className="btn-primary"
                    onClick={salvarPlacar}
                    disabled={salvando}
                    title="Salvar placar"
                  >
                    {salvando ? 'Salvando…' : '💾 Salvar placar'}
                  </button>
                )}
                <span className="text-xs text-white/50">
                  *Em caso de empate, campeão = melhor campanha (Time 1)
                </span>
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
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-red-400">⚠️ Jogo da final ainda não foi definido.</p>
      )}

      {/* ====== Estilos locais ====== */}
      <style jsx>{`
        .score-input {
          width: 4.5rem;
          text-align: center;
          border-radius: 0.75rem;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.25rem 0.5rem;
          outline: none;
          font-weight: 800;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .score-input:focus {
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.35);
          border-color: rgba(16, 185, 129, 0.6);
        }
        .btn-primary {
          background: linear-gradient(180deg, #10b981, #059669);
          color: white;
          padding: 0.6rem 1rem;
          border-radius: 0.75rem;
          font-weight: 700;
          box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ====== Campeão: badge + animações ====== */
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

        /* Fogos de artifício simples (CSS only) */
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

        @keyframes explode {
          0% { transform: scale(0.3); opacity: 0.8; }
          50% { transform: scale(1.8); opacity: 1; }
          100% { transform: scale(0.2) translateY(12px); opacity: 0; }
        }
        @keyframes shine {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.02); }
        }
      `}</style>
    </div>
  )
}
