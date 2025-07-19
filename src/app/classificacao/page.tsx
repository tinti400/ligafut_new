'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Time = {
  id: string
  nome: string
  logo_url: string
}

type ClassificacaoItem = {
  id: string
  id_time: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo_gols?: number
  divisao: number
  temporada: number
  times: Time
}

export default function ClassificacaoPage() {
  const { isAdmin, loading } = useAdmin()
  const [classificacao, setClassificacao] = useState<ClassificacaoItem[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [temporada, setTemporada] = useState(1)
  const [divisao, setDivisao] = useState(1)

  const temporadasDisponiveis = [1, 2]
  const divisoesDisponiveis = [1, 2, 3]

  useEffect(() => {
    async function carregarDados() {
      const { data: times } = await supabase.from('times').select('id, nome, logo_url')
      const map: Record<string, Time> = {}
      times?.forEach((t) => {
        map[t.id] = { ...t, logo_url: t.logo_url || '' }
      })
      setTimesMap(map)

      const { data: classificacao, error } = await supabase
        .from('classificacao')
        .select('*')
        .eq('temporada', temporada)
        .eq('divisao', divisao)
        .order('pontos', { ascending: false })

      if (error) {
        console.error('Erro ao buscar classificação:', error.message)
        return
      }

      setClassificacao((classificacao || []).map((item) => ({
        ...item,
        saldo_gols: item.gols_pro - item.gols_contra
      })))
    }

    carregarDados()
  }, [temporada, divisao])

  if (loading) return <p className="text-center text-white">🔄 Verificando permissões...</p>

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">🏆 Classificação da LigaFut</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporada(temp)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              temporada === temp ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisao(div)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              divisao === div ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Divisão {div}
          </button>
        ))}
      </div>

      <div className="bg-zinc-800 rounded-xl p-4 mb-6 shadow-md text-white">
        <div className="grid grid-cols-9 font-semibold border-b border-gray-500 pb-2 mb-2">
          <div>#</div>
          <div className="col-span-2">Time</div>
          <div>Pts</div>
          <div>VIT</div>
          <div>E</div>
          <div>DER</div>
          <div>GP</div>
          <div>SG</div>
        </div>

        {classificacao.map((item, index) => {
          const time = timesMap[item.id_time]
          return (
            <div
              key={item.id}
              className="grid grid-cols-9 items-center py-1 border-b border-gray-700 hover:bg-zinc-700"
            >
              <div>{index + 1}º</div>
              <div className="col-span-2 flex items-center gap-2">
                {time?.logo_url && (
                  <img src={time.logo_url} alt="logo" className="h-5 w-5 rounded-full" />
                )}
                <span>{time?.nome || '???'}</span>
              </div>
              <div>{item.pontos}</div>
              <div>{item.vitorias}</div>
              <div>{item.empates}</div>
              <div>{item.derrotas}</div>
              <div>{item.gols_pro}</div>
              <div>{item.saldo_gols}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
