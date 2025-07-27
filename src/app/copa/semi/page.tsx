'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SemiPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<any[]>([])
  const [classificacao, setClassificacao] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    buscarJogos()
    buscarClassificacao()
  }, [])

  async function buscarJogos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('copa_semi')
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

  async function buscarClassificacao() {
    const { data, error } = await supabase.from('classificacao').select('*')
    if (!error && data) setClassificacao(data)
  }

  async function salvarPlacar(jogo: any) {
    const { error } = await supabase
      .from('copa_semi')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2,
        gols_time1_volta: jogo.gols_time1_volta,
        gols_time2_volta: jogo.gols_time2_volta,
      })
      .eq('id', jogo.id)

    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Placar salvo!')
    }
  }

  async function finalizarSemi() {
    for (const jogo of jogos) {
      const gols1 = (jogo.gols_time1 || 0) + (jogo.gols_time1_volta || 0)
      const gols2 = (jogo.gols_time2 || 0) + (jogo.gols_time2_volta || 0)

      let vencedorId = null

      if (gols1 > gols2) vencedorId = jogo.id_time1
      else if (gols2 > gols1) vencedorId = jogo.id_time2
      else {
        const campanha1 = classificacao.find((t) => t.id_time === jogo.id_time1)
        const campanha2 = classificacao.find((t) => t.id_time === jogo.id_time2)

        if ((campanha1?.pontos || 0) >= (campanha2?.pontos || 0)) {
          vencedorId = jogo.id_time1
        } else {
          vencedorId = jogo.id_time2
        }
      }

      const timeVencedor = vencedorId === jogo.id_time1 ? jogo.time1 : jogo.time2

      await supabase.from('copa_final').insert({
        id_time: vencedorId,
        time: timeVencedor
      })
    }

    toast.success('Semifinal finalizada e final definida!')
    buscarJogos()
  }

  if (!isAdmin) return <div className="p-4">⛔ Acesso restrito!</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🥉 Semifinal</h1>
      {loading ? (
        <div>🔄 Carregando jogos...</div>
      ) : (
        <div className="space-y-2">
          {jogos.map((jogo) => (
            <div key={jogo.id} className="flex flex-col gap-1 border p-2 rounded">
              <div className="font-semibold">{jogo.time1} x {jogo.time2}</div>
              <div className="flex gap-2 items-center">
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
                <span>Volta:</span>
                <input
                  type="number"
                  className="w-12 border rounded px-1"
                  value={jogo.gols_time1_volta || ''}
                  onChange={(e) => {
                    const gols = parseInt(e.target.value)
                    setJogos((prev) =>
                      prev.map((j) => j.id === jogo.id ? { ...j, gols_time1_volta: gols } : j)
                    )
                  }}
                />
                <span>x</span>
                <input
                  type="number"
                  className="w-12 border rounded px-1"
                  value={jogo.gols_time2_volta || ''}
                  onChange={(e) => {
                    const gols = parseInt(e.target.value)
                    setJogos((prev) =>
                      prev.map((j) => j.id === jogo.id ? { ...j, gols_time2_volta: gols } : j)
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
            </div>
          ))}
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
            onClick={finalizarSemi}
          >
            Finalizar Semifinal
          </button>
        </div>
      )}
    </div>
  )
}
