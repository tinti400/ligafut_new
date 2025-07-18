'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function HomePage() {
  const router = useRouter()
  const [nomeTime, setNomeTime] = useState('')
  const [logado, setLogado] = useState(false)
  const [eventosBID, setEventosBID] = useState<any[]>([])
  const [indexAtual, setIndexAtual] = useState(0)
  const [times, setTimes] = useState<any[]>([])

  useEffect(() => {
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    if (userStr) {
      try {
        const userData = JSON.parse(userStr)
        setNomeTime(userData.nome_time || userData.nome || '')
        setLogado(true)
      } catch {
        setNomeTime('')
        setLogado(false)
      }
    }
  }, [])

  useEffect(() => {
    const buscarBID = async () => {
      const { data, error } = await supabase
        .from('bid')
        .select('*')
        .order('data_evento', { ascending: false })
        .limit(10)

      if (!error) setEventosBID(data || [])
    }

    buscarBID()
  }, [])

  useEffect(() => {
    const buscarTimes = async () => {
      const { data, error } = await supabase
        .from('times')
        .select('*')

      if (!error) setTimes(data || [])
    }

    buscarTimes()
  }, [])

  useEffect(() => {
    const intervalo = setInterval(() => {
      setIndexAtual((prev) => (prev + 1) % (eventosBID.length || 1))
    }, 3000)
    return () => clearInterval(intervalo)
  }, [eventosBID])

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const getTopTimes = (campo: string, ordem: 'asc' | 'desc') => {
    return [...times]
      .sort((a, b) => (ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo]))
      .slice(0, 3)
  }

  return (
    <main className="flex flex-col items-center justify-start min-h-screen text-white bg-gray-900 p-4">
      <h1 className="text-4xl font-bold mb-4">🏠 Bem-vindo ao LigaFut</h1>

      {logado ? (
        <p className="text-lg mb-6">✅ Logado como <span className="text-green-400">{nomeTime}</span></p>
      ) : (
        <div className="mb-6 text-center">
          <p className="text-lg">❌ Você não está logado</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded mt-2"
          >
            🔑 Ir para Login
          </button>
        </div>
      )}

      <div className="bg-gray-800 rounded p-4 w-full max-w-xl text-center mb-6">
        <h2 className="text-2xl font-semibold mb-2">📰 Últimos Eventos do BID</h2>
        {eventosBID.length > 0 ? (
          <div className="h-24 flex items-center justify-center transition-all duration-500">
            <p className="text-yellow-300 text-lg">
              {eventosBID[indexAtual]?.descricao || ''}
            </p>
          </div>
        ) : (
          <p className="text-gray-400">Nenhum evento encontrado.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-4xl">
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-xl font-bold text-green-400 mb-2">💰 Top 3 Mais Saldo</h3>
          {getTopTimes('saldo', 'desc').map((time, index) => (
            <p key={time.id}>
              {index + 1}. {time.nome} — <span className="text-green-300">{formatarValor(time.saldo)}</span>
            </p>
          ))}
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-xl font-bold text-red-400 mb-2">💸 Top 3 Menos Saldo</h3>
          {getTopTimes('saldo', 'asc').map((time, index) => (
            <p key={time.id}>
              {index + 1}. {time.nome} — <span className="text-red-300">{formatarValor(time.saldo)}</span>
            </p>
          ))}
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-xl font-bold text-yellow-400 mb-2">🧩 Top 3 Maiores Salários</h3>
          {getTopTimes('total_salarios', 'desc').map((time, index) => (
            <p key={time.id}>
              {index + 1}. {time.nome} — <span className="text-yellow-300">{formatarValor(time.total_salarios)}</span>
            </p>
          ))}
        </div>

        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-xl font-bold text-blue-400 mb-2">📝 Top 3 Menores Salários</h3>
          {getTopTimes('total_salarios', 'asc').map((time, index) => (
            <p key={time.id}>
              {index + 1}. {time.nome} — <span className="text-blue-300">{formatarValor(time.total_salarios)}</span>
            </p>
          ))}
        </div>
      </div>
    </main>
  )
}
