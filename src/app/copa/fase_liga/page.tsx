'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  useEffect(() => {
    if (isAdmin) buscarJogos()
  }, [isAdmin])

  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
    } else {
      setJogos(data || [])
    }

    setLoading(false)
  }

  async function salvarPlacar(jogo: any) {
    setSalvandoId(jogo.id)

    const { error } = await supabase
      .from('copa_fase_liga')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar placar!')
    } else {
      toast.success('✅ Placar salvo com sucesso!')
    }

    setSalvandoId(null)
  }

  if (!isAdmin) return <div className="p-4 text-red-600">⛔ Acesso restrito!</div>

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">🏆 Administração – Fase Liga</h1>

      {loading ? (
        <div className="text-center">🔄 Carregando jogos...</div>
      ) : (
        <div className="space-y-3">
          {jogos.map((jogo) => (
            <div
              key={jogo.id}
              className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-gray-100 p-3 rounded shadow"
            >
              <span className="font-medium w-32 text-right">{jogo.time1}</span>

              <input
                type="number"
                className="w-14 border rounded px-1 text-center"
                placeholder="0"
                value={jogo.gols_time1 ?? ''}
                onChange={(e) => {
                  const valor = parseInt(e.target.value || '0')
                  setJogos((prev) =>
                    prev.map((j) => j.id === jogo.id ? { ...j, gols_time1: valor } : j)
                  )
                }}
              />

              <span className="font-bold text-gray-600">x</span>

              <input
                type="number"
                className="w-14 border rounded px-1 text-center"
                placeholder="0"
                value={jogo.gols_time2 ?? ''}
                onChange={(e) => {
                  const valor = parseInt(e.target.value || '0')
                  setJogos((prev) =>
                    prev.map((j) => j.id === jogo.id ? { ...j, gols_time2: valor } : j)
                  )
                }}
              />

              <span className="font-medium w-32">{jogo.time2}</span>

              <button
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50"
                onClick={() => salvarPlacar(jogo)}
                disabled={salvandoId === jogo.id}
              >
                {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
