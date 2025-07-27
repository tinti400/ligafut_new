'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function embaralhar<T>(array: T[]): T[] {
  return array
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item)
}

export default function PlayoffAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function buscarJogos() {
    setLoading(true)
    const { data } = await supabase
      .from('copa_playoff')
      .select('*')
      .order('ordem', { ascending: true })
    setJogos(data || [])
    setLoading(false)
  }

  async function sortearPlayoff() {
    const { data: classificacao, error } = await supabase
      .from('classificacao')
      .select('id_time, times ( nome )')
      .eq('temporada', 1)
      .order('pontos', { ascending: false })

    if (error || !classificacao) {
      toast.error('Erro ao buscar classificação')
      return
    }

    const classificados = classificacao.slice(16, 24) // 17º a 24º
    if (classificados.length < 8) {
      toast.error('Classificação insuficiente')
      return
    }

    const sorteados = embaralhar(classificados)

    const novosJogos = []
    let ordem = 1

    for (let i = 0; i < sorteados.length; i += 2) {
      const time1 = sorteados[i]
      const time2 = sorteados[i + 1]

      // Ida
      novosJogos.push({
        rodada: 1,
        ordem: ordem++,
        id_time1: time1.id_time,
        id_time2: time2.id_time,
        time1: time1.times.nome,
        time2: time2.times.nome,
        gols_time1: null,
        gols_time2: null
      })

      // Volta
      novosJogos.push({
        rodada: 2,
        ordem: ordem++,
        id_time1: time2.id_time,
        id_time2: time1.id_time,
        time1: time2.times.nome,
        time2: time1.times.nome,
        gols_time1: null,
        gols_time2: null
      })
    }

    await supabase.from('copa_playoff').delete().neq('id', 0)

    const { error: insertError } = await supabase
      .from('copa_playoff')
      .insert(novosJogos)

    if (insertError) {
      toast.error('Erro ao salvar confrontos')
      return
    }

    toast.success('Playoff sorteado com sucesso!')
    buscarJogos()
  }

  useEffect(() => {
    if (isAdmin) buscarJogos()
  }, [isAdmin])

  if (!isAdmin) return <div className="p-4">⛔ Acesso restrito!</div>

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">🎯 Administração – Sorteio do Playoff</h1>

      <button
        onClick={sortearPlayoff}
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-semibold mb-6"
      >
        🎲 Sortear Playoff
      </button>

      {loading ? (
        <p>🔄 Carregando jogos...</p>
      ) : (
        <div className="space-y-3">
          {jogos.map((jogo) => (
            <div
              key={jogo.id}
              className="bg-zinc-800 p-3 rounded flex justify-between items-center"
            >
              <div>
                <strong>Rodada {jogo.rodada}:</strong> {jogo.time1} x {jogo.time2}
              </div>
              <div>
                {jogo.gols_time1 ?? '-'} x {jogo.gols_time2 ?? '-'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
