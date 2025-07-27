'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function OitavasPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [classificacao, setClassificacao] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buscarJogos()
    buscarClassificacao()
  }, [])

  async function buscarJogos() {
    const { data, error } = await supabase
      .from('copa_oitavas')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
      return
    }
    setJogos(data || [])
    setLoading(false)
  }

  async function buscarClassificacao() {
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos')

    if (!error && data) {
      const mapa: Record<string, number> = {}
      data.forEach((item) => {
        mapa[item.id_time] = item.pontos
      })
      setClassificacao(mapa)
    }
  }

  async function salvarPlacar(jogo: any) {
    const { error } = await supabase
      .from('copa_oitavas')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
        gols_time1_volta: jogo.gols_time1_volta,
        gols_time2_volta: jogo.gols_time2_volta
      })
      .eq('id', jogo.id)

    if (error) toast.error('Erro ao salvar')
    else toast.success('Placar salvo!')
  }

  async function finalizarOitavas() {
    const classificados: any[] = []

    for (const jogo of jogos) {
      const gols1 = (jogo.gols_time1 || 0) + (jogo.gols_time1_volta || 0)
      const gols2 = (jogo.gols_time2 || 0) + (jogo.gols_time2_volta || 0)

      if (gols1 > gols2) classificados.push(jogo.id_time1)
      else if (gols2 > gols1) classificados.push(jogo.id_time2)
      else {
        const pontos1 = classificacao[jogo.id_time1] || 0
        const pontos2 = classificacao[jogo.id_time2] || 0
        classificados.push(pontos1 >= pontos2 ? jogo.id_time1 : jogo.id_time2)
      }
    }

    const novosConfrontos = []
    for (let i = 0; i < classificados.length; i += 2) {
      const id_time1 = classificados[i]
      const id_time2 = classificados[i + 1]

      const time1 = jogos.find(j => j.id_time1 === id_time1 || j.id_time2 === id_time1)
      const time2 = jogos.find(j => j.id_time1 === id_time2 || j.id_time2 === id_time2)

      novosConfrontos.push({
        id_time1,
        id_time2,
        time1: time1?.id_time1 === id_time1 ? time1.time1 : time1?.time2,
        time2: time2?.id_time1 === id_time2 ? time2.time1 : time2?.time2,
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null
      })
    }

    for (const confronto of novosConfrontos) {
      await supabase.from('copa_quartas').insert(confronto)
    }

    toast.success('Classificados para as Quartas!')
  }

  if (loading) return <div className="p-4">🔄 Carregando...</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🥇 Oitavas de Final</h1>

      <div className="space-y-4">
        {jogos.map((jogo) => (
          <div key={jogo.id} className="flex flex-col gap-2 border p-2 rounded">
            <div className="font-semibold">{jogo.time1} x {jogo.time2}</div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time1 || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setJogos((prev) => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: v } : j))
                }}
              />
              <span>x</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time2 || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setJogos((prev) => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: v } : j))
                }}
              />
              <span>– Volta –</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time1_volta || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setJogos((prev) => prev.map(j => j.id === jogo.id ? { ...j, gols_time1_volta: v } : j))
                }}
              />
              <span>x</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time2_volta || ''}
                onChange={(e) => {
                  const v = parseInt(e.target.value)
                  setJogos((prev) => prev.map(j => j.id === jogo.id ? { ...j, gols_time2_volta: v } : j))
                }}
              />
              <button
                className="bg-green-600 text-white px-3 py-1 rounded"
                onClick={() => salvarPlacar(jogo)}
              >Salvar</button>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="mt-6">
          <button
            className="bg-blue-700 text-white px-4 py-2 rounded"
            onClick={finalizarOitavas}
          >🏁 Finalizar Oitavas</button>
        </div>
      )}
    </div>
  )
}
