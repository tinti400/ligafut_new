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
  const [timesMap, setTimesMap] = useState<Record<string, { logo_url: string }>>({})
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  useEffect(() => {
    if (isAdmin) {
      buscarJogos()
      buscarLogos()
    }
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

  async function buscarLogos() {
    const { data, error } = await supabase.from('times').select('nome, logo_url')
    if (data) {
      const map: Record<string, { logo_url: string }> = {}
      data.forEach((t) => {
        map[t.nome] = { logo_url: t.logo_url }
      })
      setTimesMap(map)
    }
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
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-6 text-center text-yellow-400">🏆 Administração – Fase Liga</h1>

      {loading ? (
        <div className="text-center text-white">🔄 Carregando jogos...</div>
      ) : (
        <div className="space-y-4">
          {jogos.map((jogo) => (
            <div
              key={jogo.id}
              className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 bg-white p-4 rounded-lg shadow border"
            >
              {/* Time 1 */}
              <div className="flex items-center gap-2 w-40">
                <img
                  src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                  alt={jogo.time1}
                  className="w-8 h-8 rounded-full border object-cover"
                />
                <span className="font-semibold">{jogo.time1}</span>
              </div>

              {/* Placar */}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-14 border rounded text-center"
                  placeholder="0"
                  value={jogo.gols_time1 ?? ''}
                  onChange={(e) => {
                    const valor = parseInt(e.target.value || '0')
                    setJogos((prev) =>
                      prev.map((j) => j.id === jogo.id ? { ...j, gols_time1: valor } : j)
                    )
                  }}
                />
                <span className="font-bold text-gray-700">x</span>
                <input
                  type="number"
                  className="w-14 border rounded text-center"
                  placeholder="0"
                  value={jogo.gols_time2 ?? ''}
                  onChange={(e) => {
                    const valor = parseInt(e.target.value || '0')
                    setJogos((prev) =>
                      prev.map((j) => j.id === jogo.id ? { ...j, gols_time2: valor } : j)
                    )
                  }}
                />
              </div>

              {/* Time 2 */}
              <div className="flex items-center gap-2 w-40 justify-end">
                <span className="font-semibold">{jogo.time2}</span>
                <img
                  src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                  alt={jogo.time2}
                  className="w-8 h-8 rounded-full border object-cover"
                />
              </div>

              {/* Botão */}
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
