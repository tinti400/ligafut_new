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
}

interface Time {
  id: UUID
  nome: string
  logo_url?: string | null
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
      confetti({ particleCount: 220, spread: 120, origin: { y: 0.6 } })
      setTimeout(() => confetti({ particleCount: 180, spread: 100, origin: { y: 0.4 } }), 400)
    }
  }, [campeao])

  async function buscarFinal() {
    setLoading(true)

    // Busca a final mais recente (garanta created_at na tabela)
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

    // Busca nomes dos dois times
    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, nome, logo_url')
      .in('id', [finalRow.id_time1, finalRow.id_time2])

    if (errTimes || !times) {
      toast.error('Erro ao buscar nomes dos times')
      setLoading(false)
      setJogo({ ...finalRow })
      return
    }

    const mapa = new Map(times.map(t => [t.id, t]))
    const jogoComNomes: JogoFinal = {
      ...finalRow,
      nome_time1: mapa.get(finalRow.id_time1)?.nome ?? 'Time 1',
      nome_time2: mapa.get(finalRow.id_time2)?.nome ?? 'Time 2'
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
            : finalRow.id_time1 // critério de desempate (melhor campanha: time1)

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

  if (loading) return <div className="p-4 text-white">🔄 Carregando...</div>

  const titulo = jogo ? `${jogo.nome_time1 ?? 'Time 1'} vs ${jogo.nome_time2 ?? 'Time 2'}` : ''

  return (
    <div className="p-4 text-white">
      <h1 className="text-2xl font-bold mb-4 text-center">🏅 Final da Copa</h1>

      {jogo ? (
        <div className="max-w-xl mx-auto bg-gray-900 p-6 rounded-xl shadow text-center space-y-5">
          <div className="text-lg font-semibold">{titulo}</div>

          <div className="flex justify-center gap-4 items-center text-xl">
            <input
              type="number"
              min={0}
              className="w-16 text-center rounded bg-gray-800 border border-gray-600 p-1 focus:outline-none focus:ring-2 focus:ring-green-500"
              value={jogo.gols_time1 ?? ''}
              onChange={(e) => handleInput(e, 'gols_time1')}
            />
            <span className="opacity-80">x</span>
            <input
              type="number"
              min={0}
              className="w-16 text-center rounded bg-gray-800 border border-gray-600 p-1 focus:outline-none focus:ring-2 focus:ring-green-500"
              value={jogo.gols_time2 ?? ''}
              onChange={(e) => handleInput(e, 'gols_time2')}
            />
          </div>

          {isAdmin && (
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow disabled:opacity-60"
              onClick={salvarPlacar}
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : '💾 Salvar Placar'}
            </button>
          )}

          {campeao && (
            <div className="mt-6">
              <div className="inline-flex items-center gap-2 mb-2 animate-pop">
                <span className="text-3xl">🏆</span>
                <h2 className="text-2xl font-extrabold text-green-400">
                  <span className="shine">
                    {campeao.nome} é o grande campeão!
                  </span>
                </h2>
              </div>

              <p className="text-sm opacity-80 mb-3">Parabéns ao time que levantou a taça! 🥇⚽</p>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(`🏆 ${campeao.nome} é o grande campeão da LigaFut!\n\nParabéns ao time que brilhou na final e levantou a taça! 🥇⚽`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                📤 Compartilhar no WhatsApp
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-red-400">⚠️ Jogo da final ainda não foi definido.</p>
      )}

      {/* Animações CSS locais */}
      <style jsx>{`
        .shine {
          background: linear-gradient(90deg, #22c55e, #ffffff, #22c55e);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shine 2.4s linear infinite;
        }
        @keyframes shine {
          0% { background-position: 0% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-pop {
          animation: pop 650ms ease-out both;
        }
        @keyframes pop {
          0% { transform: scale(0.8); filter: drop-shadow(0 0 0px #22c55e); }
          60% { transform: scale(1.06); filter: drop-shadow(0 0 12px #22c55e80); }
          100% { transform: scale(1); filter: drop-shadow(0 0 0px transparent); }
        }
      `}</style>
    </div>
  )
}
