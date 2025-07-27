'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PlayoffPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sorteado, setSorteado] = useState(false)

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
    setSorteado(data.length > 0)
    setLoading(false)
  }

  async function salvarPlacar(jogo: any) {
    const { error } = await supabase
      .from('copa_playoff')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Placar salvo!')
    }
  }

  async function sortearPlayoff() {
    const { data: classificacao, error } = await supabase
      .from('classificacao')
      .select('id_time, times ( nome )')
      .eq('temporada', 1)
      .order('pontos', { ascending: false })

    if (error || !classificacao) {
      toast.error('Erro ao buscar classificacao')
      return
    }

    const classificados = classificacao.slice(16, 24)
    const embaralhados = classificados.sort(() => Math.random() - 0.5)
    const novosJogos: any[] = []
    let ordem = 1

    for (let i = 0; i < embaralhados.length; i += 2) {
      const time1 = embaralhados[i]
      const time2 = embaralhados[i + 1]

      // Ida
      novosJogos.push({
        rodada: 1,
        ordem: ordem++,
        id_time1: time1.id_time,
        id_time2: time2.id_time,
        time1: time1.times[0].nome,
        time2: time2.times[0].nome,
        gols_time1: null,
        gols_time2: null
      })

      // Volta
      novosJogos.push({
        rodada: 2,
        ordem: ordem++,
        id_time1: time2.id_time,
        id_time2: time1.id_time,
        time1: time2.times[0].nome,
        time2: time1.times[0].nome,
        gols_time1: null,
        gols_time2: null
      })
    }

    const { error: insertError } = await supabase.from('copa_playoff').insert(novosJogos)

    if (insertError) {
      toast.error('Erro ao sortear jogos')
    } else {
      toast.success('Jogos sorteados com sucesso!')
      buscarJogos()
    }
  }

  if (!isAdmin) return <div className="p-4">⛔ Acesso restrito!</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🎯 Playoff – Administração</h1>

      {!sorteado && (
        <button
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded"
          onClick={sortearPlayoff}
        >
          Sortear confrontos
        </button>
      )}

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
                value={jogo.gols_time1 ?? ''}
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
                value={jogo.gols_time2 ?? ''}
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
