'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function QuartasPage() {
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
      .from('copa_quartas')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
    } else {
      setJogos(data || [])
    }
    setLoading(false)
  }

  async function buscarClassificacao() {
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos')

    if (!error && data) {
      setClassificacao(data)
    }
  }

  async function salvarPlacar(jogo: any) {
    const { error } = await supabase
      .from('copa_quartas')
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

  async function finalizarQuartas() {
    const classificados: any[] = []

    for (const jogo of jogos) {
      const gols1 = (jogo.gols_time1 || 0) + (jogo.gols_time1_volta || 0)
      const gols2 = (jogo.gols_time2 || 0) + (jogo.gols_time2_volta || 0)

      let vencedorId = ''
      let vencedorNome = ''

      if (gols1 > gols2) {
        vencedorId = jogo.id_time1
        vencedorNome = jogo.time1
      } else if (gols2 > gols1) {
        vencedorId = jogo.id_time2
        vencedorNome = jogo.time2
      } else {
        const campanha1 = classificacao.find(c => c.id_time === jogo.id_time1)?.pontos || 0
        const campanha2 = classificacao.find(c => c.id_time === jogo.id_time2)?.pontos || 0
        if (campanha1 >= campanha2) {
          vencedorId = jogo.id_time1
          vencedorNome = jogo.time1
        } else {
          vencedorId = jogo.id_time2
          vencedorNome = jogo.time2
        }
      }

      classificados.push({ id: vencedorId, nome: vencedorNome })
    }

    const novosJogos = []
    for (let i = 0; i < classificados.length; i += 2) {
      novosJogos.push({
        id_time1: classificados[i].id,
        id_time2: classificados[i + 1].id,
        time1: classificados[i].nome,
        time2: classificados[i + 1].nome,
        gols_time1: null,
        gols_time2: null,
        gols_time1_volta: null,
        gols_time2_volta: null,
      })
    }

    const { error } = await supabase.from('copa_semi').insert(novosJogos)
    if (error) {
      toast.error('Erro ao enviar classificados para a semifinal')
    } else {
      toast.success('Classificados enviados para a semifinal!')
    }
  }

  if (loading) return <div className="p-4">🔄 Carregando jogos...</div>

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">🥈 Quartas de Final</h1>

      {jogos.map((jogo) => (
        <div key={jogo.id} className="flex gap-2 items-center mb-2">
          <span className="w-32">{jogo.time1}</span>
          <input
            type="number"
            className="w-12 border rounded px-1"
            value={jogo.gols_time1 || ''}
            onChange={(e) => {
              const gols = parseInt(e.target.value)
              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1: gols } : j))
            }}
          />
          <span>x</span>
          <input
            type="number"
            className="w-12 border rounded px-1"
            value={jogo.gols_time2 || ''}
            onChange={(e) => {
              const gols = parseInt(e.target.value)
              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2: gols } : j))
            }}
          />
          <span className="w-32 text-right">{jogo.time2}</span>
        </div>
      ))}

      {jogos.map((jogo) => (
        <div key={jogo.id + '-volta'} className="flex gap-2 items-center mb-4">
          <span className="w-32">{jogo.time2}</span>
          <input
            type="number"
            className="w-12 border rounded px-1"
            value={jogo.gols_time2_volta || ''}
            onChange={(e) => {
              const gols = parseInt(e.target.value)
              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time2_volta: gols } : j))
            }}
          />
          <span>x</span>
          <input
            type="number"
            className="w-12 border rounded px-1"
            value={jogo.gols_time1_volta || ''}
            onChange={(e) => {
              const gols = parseInt(e.target.value)
              setJogos(prev => prev.map(j => j.id === jogo.id ? { ...j, gols_time1_volta: gols } : j))
            }}
          />
          <span className="w-32 text-right">{jogo.time1}</span>
          <button
            className="bg-green-500 text-white px-2 py-1 rounded ml-4"
            onClick={() => salvarPlacar(jogo)}
          >Salvar</button>
        </div>
      ))}

      {isAdmin && (
        <button
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
          onClick={finalizarQuartas}
        >✅ Finalizar Quartas</button>
      )}
    </div>
  )
}
