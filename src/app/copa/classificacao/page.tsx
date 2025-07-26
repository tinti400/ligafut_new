'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import classNames from 'classnames'

// Hook de autenticação do usuário
import { useUser } from '@/hooks/useUser' // ajuste o caminho se necessário

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface LinhaClassificacao {
  time: string
  pontos: number
  vitorias: number
  empates: number
  derrotas: number
  gols_pro: number
  gols_contra: number
  saldo: number
  jogos: number
}

interface TimeInfo {
  logo_url?: string
  logo?: string
}

export default function ClassificacaoCopaPage() {
  const { user, loading: loadingUser } = useUser()
  const [classificacao, setClassificacao] = useState<LinhaClassificacao[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeInfo>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      buscarClassificacao()
      buscarTimes()
    }
  }, [user])

  async function buscarClassificacao() {
    const { data } = await supabase.from('classificacao_copa').select('*')
    if (data) setClassificacao(data)
    setLoading(false)
  }

  async function buscarTimes() {
    const { data } = await supabase.from('times').select('nome, logo_url, logo')
    if (data) {
      const map: Record<string, TimeInfo> = {}
      data.forEach((t) => {
        map[t.nome] = {
          logo_url: t.logo_url,
          logo: t.logo
        }
      })
      setTimesMap(map)
    }
  }

  const classificacaoOrdenada = [...classificacao].sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.saldo !== a.saldo) return b.saldo - a.saldo
    if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
    return b.vitorias - a.vitorias
  })

  if (!user && !loadingUser) {
    return (
      <div className="bg-zinc-900 text-white min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-red-400 text-lg">⛔ Acesso restrito! Faça login para ver a classificação.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 text-white min-h-screen p-4 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-center text-yellow-400 mb-6">🏆 Classificação – Fase Liga</h1>

      {loading ? (
        <p className="text-center text-gray-300">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg shadow">
          <table className="w-full text-sm text-left border border-zinc-700">
            <thead className="bg-zinc-800 text-gray-300">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2 text-center">J</th>
                <th className="px-3 py-2 text-center">Pts</th>
                <th className="px-3 py-2 text-center">V</th>
                <th className="px-3 py-2 text-center">E</th>
                <th className="px-3 py-2 text-center">D</th>
                <th className="px-3 py-2 text-center">GP</th>
                <th className="px-3 py-2 text-center">GC</th>
                <th className="px-3 py-2 text-center">SG</th>
              </tr>
            </thead>
            <tbody>
              {classificacaoOrdenada.map((linha, index) => {
                const posicao = index + 1
                const timeData = timesMap[linha.time]
                const escudo = timeData?.logo_url || timeData?.logo

                const bgClass = classNames({
                  'bg-green-900': posicao <= 16,
                  'bg-yellow-900': posicao > 16 && posicao <= 24,
                  'bg-red-900': posicao > 24,
                  'bg-zinc-900': true,
                })

                return (
                  <tr key={linha.time} className={`${bgClass} border-b border-zinc-700`}>
                    <td className="px-3 py-2 text-gray-300 font-bold">{posicao}</td>
                    <td className="px-3 py-2 flex items-center gap-2">
                      {escudo && (
                        <img
                          src={escudo}
                          alt={linha.time}
                          width={28}
                          height={28}
                          className="rounded-full border object-cover bg-white"
                        />
                      )}
                      {linha.time}
                    </td>
                    <td className="px-3 py-2 text-center">{linha.jogos}</td>
                    <td className="px-3 py-2 text-center font-bold text-white">{linha.pontos}</td>
                    <td className="px-3 py-2 text-center">{linha.vitorias}</td>
                    <td className="px-3 py-2 text-center">{linha.empates}</td>
                    <td className="px-3 py-2 text-center">{linha.derrotas}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_pro}</td>
                    <td className="px-3 py-2 text-center">{linha.gols_contra}</td>
                    <td className="px-3 py-2 text-center">{linha.saldo}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
