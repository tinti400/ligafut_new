'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { FaMoneyBillWave, FaChartLine, FaArrowDown, FaArrowUp, FaPlus } from 'react-icons/fa'
import { motion } from 'framer-motion'

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
  const [loading, setLoading] = useState(true)

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
    async function carregarDados() {
      setLoading(true)
      const [bidRes, timesRes] = await Promise.all([
        supabase.from('bid').select('*').order('data_evento', { ascending: false }).limit(10),
        supabase.from('times').select('*')
      ])

      if (!bidRes.error) setEventosBID(bidRes.data || [])
      if (!timesRes.error) setTimes(timesRes.data || [])
      setLoading(false)
    }

    carregarDados()
  }, [])

  useEffect(() => {
    const intervalo = setInterval(() => {
      setIndexAtual((prev) => (prev + 1) % (eventosBID.length || 1))
    }, 3000)
    return () => clearInterval(intervalo)
  }, [eventosBID])

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const getTopTimes = (campo: string, ordem: 'asc' | 'desc') =>
    [...times].sort((a, b) => (ordem === 'asc' ? a[campo] - b[campo] : b[campo] - a[campo])).slice(0, 3)

  const CardRanking = ({
    titulo,
    campo,
    ordem,
    cor,
    Icone
  }: {
    titulo: string,
    campo: string,
    ordem: 'asc' | 'desc',
    cor: string,
    Icone: any
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-black/60 p-4 rounded shadow-md"
    >
      <h3 className={`text-xl font-bold ${cor} mb-2 flex items-center gap-2`}>
        <Icone /> {titulo}
      </h3>
      {getTopTimes(campo, ordem).map((time, index) => (
        <p key={time.id} className={time.nome === nomeTime ? 'text-yellow-400 font-semibold' : ''}>
          {index + 1}. {time.nome} — {formatarValor(time[campo])}
        </p>
      ))}
    </motion.div>
  )

  return (
    <main className="relative min-h-screen text-white bg-cover bg-center" style={{ backgroundImage: `url('/campo-futebol-dark.jpg')` }}>
      <div className="absolute inset-0 bg-black bg-opacity-80 z-0" />
      <div className="relative z-10 flex flex-col items-center justify-start p-6">

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-4 text-center"
        >
          <h1 className="text-4xl font-bold text-green-500 flex items-center justify-center gap-2">
            🏟️ LigaFut
          </h1>
          <p className="text-sm text-gray-300 italic">
            Simule campeonatos, gerencie seu time e conquiste títulos!
          </p>
        </motion.div>

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

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-black/60 rounded p-4 w-full max-w-xl text-center mb-6"
        >
          <h2 className="text-2xl font-semibold mb-2">📰 Últimos Eventos do BID</h2>
          {loading ? (
            <p className="text-gray-400 animate-pulse">Carregando eventos...</p>
          ) : eventosBID.length > 0 ? (
            <div className="h-24 flex items-center justify-center transition-all duration-500">
              <p className="text-yellow-300 text-lg font-medium italic">{eventosBID[indexAtual]?.descricao}</p>
            </div>
          ) : (
            <p className="text-gray-400">Nenhum evento encontrado.</p>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
          <CardRanking
            titulo="Top 3 Mais Saldo"
            campo="saldo"
            ordem="desc"
            cor="text-green-400"
            Icone={FaMoneyBillWave}
          />
          <CardRanking
            titulo="Top 3 Menos Saldo"
            campo="saldo"
            ordem="asc"
            cor="text-red-400"
            Icone={FaArrowDown}
          />
          <CardRanking
            titulo="Top 3 Maiores Salários"
            campo="total_salarios"
            ordem="desc"
            cor="text-yellow-300"
            Icone={FaChartLine}
          />
          <CardRanking
            titulo="Top 3 Menores Salários"
            campo="total_salarios"
            ordem="asc"
            cor="text-blue-400"
            Icone={FaArrowUp}
          />
        </div>

        {logado && (
          <button
            onClick={() => router.push('/admin')}
            className="fixed bottom-6 right-6 p-4 bg-green-600 rounded-full text-white shadow-lg hover:bg-green-700"
            title="Administração"
          >
            <FaPlus size={20} />
          </button>
        )}
      </div>
    </main>
  )
}
