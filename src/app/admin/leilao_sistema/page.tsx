'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LeilaoSistemaPage() {
  const router = useRouter()
  const [leiloes, setLeiloes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [saldo, setSaldo] = useState<number | null>(null)

  const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
  const nome_time = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : null

  const buscarSaldo = async () => {
    if (!id_time) return
    const { data, error } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', id_time)
      .single()
    if (!error && data) setSaldo(data.saldo)
    else {
      console.error('Erro ao buscar saldo:', error)
      setSaldo(null)
    }
  }

  const buscarLeiloesAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('criado_em', { ascending: true })
    if (!error) setLeiloes(data || [])
    else console.error('Erro ao buscar leilões:', error)
    setCarregando(false)
  }

  useEffect(() => {
    buscarLeiloesAtivos()
    buscarSaldo()
    const intervalo = setInterval(() => {
      buscarLeiloesAtivos()
      buscarSaldo()
    }, 2000)
    return () => clearInterval(intervalo)
  }, [])

  if (carregando) return <div className="p-6 text-white">⏳ Carregando...</div>
  if (leiloes.length === 0) return <div className="p-6 text-white">⚠️ Nenhum leilão ativo no momento.</div>

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-wrap justify-center gap-8">
      {leiloes.map((leilao) => (
        <LeilaoCard
          key={leilao.id}
          leilao={leilao}
          saldo={saldo}
          id_time={id_time}
          nome_time={nome_time}
          router={router}
        />
      ))}
    </main>
  )
}

function LeilaoCard({ leilao, saldo, id_time, nome_time, router }: any) {
  const [tempoRestante, setTempoRestante] = useState<number>(0)
  const [leilaoLocal, setLeilaoLocal] = useState(leilao)

  useEffect(() => {
    const atualizarTempo = () => {
      const agora = Date.now()
      const fim = new Date(leilaoLocal.fim).getTime()
      const restante = Math.floor((fim - agora) / 1000)
      setTempoRestante(restante > 0 ? restante : 0)
    }

    atualizarTempo()
    const intervalo = setInterval(atualizarTempo, 1000)
    return () => clearInterval(intervalo)
  }, [leilaoLocal])

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = (segundos % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  const finalizarLeilao = async () => {
    await supabase.from('leiloes_sistema').update({ status: 'leiloado' }).eq('id', leilaoLocal.id)
    setLeilaoLocal({ ...leilaoLocal, status: 'leiloado' })
    setTempoRestante(0)
  }

  useEffect(() => {
    if (tempoRestante === 0 && leilaoLocal.status === 'ativo') {
      finalizarLeilao()
    }
  }, [tempoRestante, leilaoLocal.status])

  const darLance = async (incremento: number) => {
    if (!id_time || !nome_time || tempoRestante === 0) return

    const novoValor = Number(leilaoLocal.valor_atual) + incremento

    if (saldo !== null && novoValor > saldo) {
      alert('❌ Você não tem saldo suficiente para esse lance.')
      return
    }

    const agora = Date.now()
    const fimAtual = new Date(leilaoLocal.fim).getTime()
    const restante = Math.floor((fimAtual - agora) / 1000)
    let novaDataFim = leilaoLocal.fim

    if (restante <= 15) novaDataFim = new Date(agora + 15000).toISOString()

    const { error } = await supabase.from('leiloes_sistema').update({
      valor_atual: novoValor,
      id_time_vencedor: id_time,
      nome_time_vencedor: nome_time,
      fim: novaDataFim
    }).eq('id', leilaoLocal.id)

    if (!error) {
      setLeilaoLocal({
        ...leilaoLocal,
        valor_atual: novoValor,
        id_time_vencedor: id_time,
        nome_time_vencedor: nome_time,
        fim: novaDataFim
      })
      // Retirei router.refresh para evitar sumiço inesperado
    } else {
      console.error('❌ Erro ao dar lance:', error)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg max-w-sm w-full">
      {leilaoLocal.imagem_url && (
        <img
          src={leilaoLocal.imagem_url}
          alt={leilaoLocal.nome}
          className="w-36 h-36 object-cover rounded-full mx-auto mb-4 border-4 border-green-400"
        />
      )}

      <h2 className="text-2xl font-bold mb-2 text-center">
        {leilaoLocal.nome} <span className="text-sm">({leilaoLocal.posicao})</span>
      </h2>

      <p className="text-center mb-1">⭐ Overall: {leilaoLocal.overall}</p>
      <p className="text-center mb-1">🌍 Nacionalidade: {leilaoLocal.nacionalidade}</p>

      <p className="text-center text-green-400 text-xl font-bold mb-2">
        💰 R$ {Number(leilaoLocal.valor_atual).toLocaleString()}
      </p>

      {leilaoLocal.nome_time_vencedor && (
        <p className="text-center mb-4 text-sm text-gray-300">
          👑 Último lance por: <strong>{leilaoLocal.nome_time_vencedor}</strong>
        </p>
      )}

      <p className="text-center mb-4 text-lg">
        💳 Saldo atual: <strong>R$ {saldo !== null ? saldo.toLocaleString() : '...'}</strong>
      </p>

      <div className="text-center text-2xl font-mono bg-black text-white inline-block px-6 py-2 rounded-lg mb-6 shadow">
        ⏱️ {formatarTempo(tempoRestante)}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => {
          const incremento = 2000000 * Math.pow(2, i)
          const novoValor = (leilaoLocal.valor_atual || 0) + incremento
          const disabled = tempoRestante === 0 || (saldo !== null && novoValor > saldo)

          return (
            <button
              key={i}
              onClick={() => darLance(incremento)}
              disabled={disabled}
              className={`bg-green-600 hover:bg-green-700 text-white py-2 rounded text-xs font-bold transition disabled:opacity-50`}
              title={disabled ? 'Saldo insuficiente ou leilão finalizado' : ''}
            >
              + R$ {(incremento / 1000000).toLocaleString()} mi
            </button>
          )
        })}
      </div>
    </div>
  )
}
