'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Confetti from 'react-confetti'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function FinalPage() {
  const { isAdmin } = useAdmin()
  const [jogo, setJogo] = useState<any | null>(null)
  const [campeao, setCampeao] = useState<any | null>(null)
  const [width, setWidth] = useState<number>(0)
  const [height, setHeight] = useState<number>(0)

  useEffect(() => {
    buscarJogo()
    setWidth(window.innerWidth)
    setHeight(window.innerHeight)
  }, [])

  async function buscarJogo() {
    const { data, error } = await supabase
      .from('copa_final')
      .select('*')
      .single()

    if (error || !data) {
      toast.error('Erro ao buscar final')
      return
    }

    setJogo(data)

    if (data.gols_time1 !== null && data.gols_time2 !== null) {
      if (data.gols_time1 > data.gols_time2) {
        setCampeao({ nome: data.time1, logo_url: data.logo1 })
      } else if (data.gols_time2 > data.gols_time1) {
        setCampeao({ nome: data.time2, logo_url: data.logo2 })
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
      toast.success('Placar salvo com sucesso')
      buscarJogo()
    }
  }

  if (!jogo) return <div className="p-4">🔄 Carregando final...</div>

  return (
    <div className="p-4 text-center">
      <h1 className="text-2xl font-bold mb-4">🏅 Final da Copa</h1>

      <div className="flex justify-center items-center gap-2 mb-4">
        <div className="flex flex-col items-center">
          <p>{jogo.time1}</p>
          <input
            type="number"
            value={jogo.gols_time1 || ''}
            className="w-12 text-center border rounded px-1"
            onChange={(e) => setJogo({ ...jogo, gols_time1: parseInt(e.target.value) })}
          />
        </div>
        <span className="text-xl font-bold">x</span>
        <div className="flex flex-col items-center">
          <p>{jogo.time2}</p>
          <input
            type="number"
            value={jogo.gols_time2 || ''}
            className="w-12 text-center border rounded px-1"
            onChange={(e) => setJogo({ ...jogo, gols_time2: parseInt(e.target.value) })}
          />
        </div>
      </div>

      {isAdmin && (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={salvarPlacar}
        >
          Salvar Placar
        </button>
      )}

      {campeao && (
        <>
          <Confetti width={width} height={height} />
          <div className="mt-10 text-center">
            <h2 className="text-3xl font-bold text-yellow-500">🏆 CAMPEÃO!</h2>
            {campeao.logo_url && (
              <img
                src={campeao.logo_url}
                alt={campeao.nome}
                className="w-20 h-20 mx-auto mt-2 rounded-full border-4 border-yellow-400"
              />
            )}
            <p className="text-xl mt-2 font-semibold">{campeao.nome}</p>
          </div>
        </>
      )}
    </div>
  )
}

