'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PlayoffAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAdmin) buscarJogos()
  }, [isAdmin])

  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_playoff')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
      setLoading(false)
      return
    }
    setJogos(data || [])
    setLoading(false)
  }

  async function salvarPlacar(jogo: any) {
    const { error } = await supabase
      .from('copa_playoff')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Placar salvo!')
    }
  }

  if (!isAdmin) return <div className="p-4">⛔ Acesso restrito!</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🎯 Administração – Playoff</h1>
      {loading ? (
        <div>🔄 Carregando jogos...</div>
      ) : (
        <div className="space-y-2">
          {jogos.map((jogo) => (
            <div key={jogo.id} className="flex gap-2 items-center">
              <span>{jogo.time1} vs {jogo.time2}</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time1 || ''}
                onChange={(e) => {
                  const gols = parseInt(e.target.value)
                  setJogos((prev) =>
                    prev.map((j) => j.id === jogo.id ? { ...j, gols_time1: gols } : j)
                  )
                }}
              />
              <span>x</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time2 || ''}
                onChange={(e) => {
                  const gols = parseInt(e.target.value)
                  setJogos((prev) =>
                    prev.map((j) => j.id === jogo.id ? { ...j, gols_time2: gols } : j)
                  )
                }}
              />
              <button
                className="bg-green-500 text-white px-2 py-1 rounded"
                onClick={() => salvarPlacar(jogo)}
              >
                Salvar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
