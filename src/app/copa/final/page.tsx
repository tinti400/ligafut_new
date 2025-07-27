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

export default function FinalPage() {
  const { isAdmin } = useAdmin()
  const [jogo, setJogo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [campeao, setCampeao] = useState<any>(null)

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
    const { data, error } = await supabase.from('copa_final').select('*').single()
    if (error) {
      toast.error('Erro ao buscar a final')
      setLoading(false)
      return
    }
    setJogo(data)
    setLoading(false)
    if (data.gols_time1 !== null && data.gols_time2 !== null) {
      const vencedorId =
        data.gols_time1 > data.gols_time2 ? data.id_time1 :
        data.gols_time2 > data.gols_time1 ? data.id_time2 : null

      if (vencedorId) {
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
  }

  async function salvarPlacar() {
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
      toast.success('Placar salvo!')
      buscarFinal()
    }
  }

  if (loading) return <div className="p-4">🔄 Carregando...</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🏅 Final</h1>

      {jogo ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <span className="font-semibold">{jogo.time1} vs {jogo.time2}</span>
            <input
              type="number"
              className="w-12 border rounded px-1"
              value={jogo.gols_time1 || ''}
              onChange={(e) => setJogo({ ...jogo, gols_time1: parseInt(e.target.value) })}
            />
            <span>x</span>
            <input
              type="number"
              className="w-12 border rounded px-1"
              value={jogo.gols_time2 || ''}
              onChange={(e) => setJogo({ ...jogo, gols_time2: parseInt(e.target.value) })}
            />
            {isAdmin && (
              <button
                className="bg-green-500 text-white px-2 py-1 rounded"
                onClick={salvarPlacar}
              >
                Salvar
              </button>
            )}
          </div>

          {campeao && (
            <div className="mt-6 text-center">
              <h2 className="text-2xl font-bold text-green-600">
                🏆 {campeao.nome} é o grande campeão!
              </h2>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`🏆 O ${campeao.nome} é o grande campeão da LigaFut!\n\nParabéns ao time que brilhou na final e levantou a taça! 🥇⚽`)}`}
                target="_blank"
                rel="noopener noreferrer"
                class
