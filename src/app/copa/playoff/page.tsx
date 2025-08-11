'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Jogo = {
  id?: number
  rodada: 1 | 2
  ordem: number
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
}

export default function PlayoffPage() {
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
        gols_time2: jogo.gols_time2
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Placar salvo!')
    }
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function nomeDoTime(reg: any): string {
    const t = (reg?.times && (Array.isArray(reg.times) ? reg.times[0] : reg.times)) || null
    return t?.nome ?? 'Time'
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

    const classificados = classificacao.slice(8, 24) // 9º ao 24º

    if (classificados.length !== 16) {
      toast.error('São necessários exatamente 16 times (do 9º ao 24º).')
      return
    }

    const embaralhados = shuffle(classificados)
    const novosJogos: Jogo[] = []
    let ordem = 1

    for (let i = 0; i < embaralhados.length; i += 2) {
      const timeA = embaralhados[i]
      const timeB = embaralhados[i + 1]

      const idA = timeA.id_time
      const idB = timeB.id_time
      const nomeA = nomeDoTime(timeA)
      const nomeB = nomeDoTime(timeB)

      if (!idA || !idB) {
        toast.error('Registro de time inválido.')
        return
      }

      novosJogos.push({
        rodada: 1,
        ordem: ordem++,
        id_time1: idA,
        id_time2: idB,
        time1: nomeA,
        time2: nomeB,
        gols_time1: null,
        gols_time2: null
      })

      novosJogos.push({
        rodada: 2,
        ordem: ordem++,
        id_time1: idB,
        id_time2: idA,
        time1: nomeB,
        time2: nomeA,
        gols_time1: null,
        gols_time2: null
      })
    }

    // Apaga jogos existentes antes de inserir
    const { error: delError } = await supabase.from('copa_playoff').delete().neq('id', 0)
    if (delError) {
      toast.error('Erro ao limpar jogos antigos')
      return
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

      <button
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={sortearPlayoff}
      >
        Sortear confrontos (9º ao 24º)
      </button>

      {loading ? (
        <div>🔄 Carregando jogos...</div>
      ) : (
        <div className="space-y-2">
          {jogos.map((jogo) => (
            <div key={jogo.id} className="flex gap-2 items-center">
              <span className="min-w-[280px]">{jogo.time1} vs {jogo.time2}</span>
              <input
                type="number"
                className="w-12 border rounded px-1"
                value={jogo.gols_time1 ?? ''}
                onChange={(e) => {
                  const gols = Number.isNaN(parseInt(e.target.value)) ? null : parseInt(e.target.value)
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
                  const gols = Number.isNaN(parseInt(e.target.value)) ? null : parseInt(e.target.value)
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
