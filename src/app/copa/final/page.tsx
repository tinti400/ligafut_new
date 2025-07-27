'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import confetti from 'canvas-confetti'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface JogoFinal {
  id: string
  time1: string
  time2: string
  id_time1: string
  id_time2: string
  gols_time1: number | null
  gols_time2: number | null
}

interface Time {
  nome: string
}

export default function FinalPage() {
  const { isAdmin } = useAdmin()
  const [jogo, setJogo] = useState<JogoFinal | null>(null)
  const [loading, setLoading] = useState(true)
  const [campeao, setCampeao] = useState<Time | null>(null)

  useEffect(() => {
    buscarFinal()
  }, [])

  useEffect(() => {
    if (campeao) {
      confetti({
        particleCount: 200,
        spread: 120,
        origin: { y: 0.6 }
      })
    }
  }, [campeao])

  async function buscarFinal() {
    setLoading(true)

    const { data, error } = await supabase
      .from('copa_final')
      .select('*')
      .single()

    if (error || !data) {
      toast.error('Erro ao buscar a final')
      setLoading(false)
      return
    }

    setJogo(data)
    setLoading(false)

    if (data.gols_time1 !== null && data.gols_time2 !== null) {
      const vencedorId =
        data.gols_time1 > data.gols_time2 ? data.id_time1 :
        data.gols_time2 > data.gols_time1 ? data.id_time2 :
        data.id_time1 // critério de desempate: melhor campanha = time1

      const { data: time, error: errorTime } = await supabase
        .from('times')
        .select('nome')
        .eq('id', vencedorId)
        .single()

      if (!errorTime && time) {
        setCampeao(time)
      }
    }
  }

  async function salvarPlacar() {
    if (!jogo) return

    const { error } = await supabase
      .from('copa_final')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar placar')
    } else {
      toast.success('Placar salvo com sucesso!')
      buscarFinal()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>, campo: 'gols_time1' | 'gols_time2') => {
    const valor = e.target.value === '' ? null : parseInt(e.target.value)
    if (jogo) setJogo({ ...jogo, [campo]: isNaN(valor!) ? null : valor })
  }

  if (loading) return <div className="p-4 text-white">🔄 Carregando...</div>

  return (
    <div className="p-4 text-white">
      <h1 className="text-2xl font-bold mb-4 text-center">🏅 Final da Copa</h1>

      {jogo ? (
        <div className="max-w-xl mx-auto bg-gray-900 p-6 rounded-xl shadow text-center space-y-4">
          <div className="text-lg font-semibold mb-2">
            {jogo.time1} vs {jogo.time2}
          </div>

          <div className="flex justify-center gap-4 items-center text-xl">
            <input
              type="number"
              min={0}
              className="w-16 text-center rounded bg-gray-800 border border-gray-600 p-1"
              value={jogo.gols_time1 ?? ''}
              onChange={(e) => handleInput(e, 'gols_time1')}
            />
            <span>x</span>
            <input
              type="number"
              min={0}
              className="w-16 text-center rounded bg-gray-800 border border-gray-600 p-1"
              value={jogo.gols_time2 ?? ''}
              onChange={(e) => handleInput(e, 'gols_time2')}
            />
          </div>

          {isAdmin && (
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
              onClick={salvarPlacar}
            >
              💾 Salvar Placar
            </button>
          )}

          {campeao && (
            <div className="mt-6">
              <h2 className="text-2xl font-bold text-green-400 mb-2 animate-bounce">
                🏆 {campeao.nome} é o grande campeão!
              </h2>
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
    </div>
  )
}

