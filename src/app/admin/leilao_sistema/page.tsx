'use client'

import { useEffect, useState, useRef } from 'react'
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
  const [podeDarLance, setPodeDarLance] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
      .limit(3)

    if (!error) {
      // Som se perder liderança
      data?.forEach((leilao) => {
        if (leilao.nome_time_vencedor !== nome_time && leilao.anterior === nome_time) {
          audioRef.current?.play()
        }
      })
      setLeiloes(data || [])
    } else console.error('Erro ao buscar leilões:', error)

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

  const darLance = async (leilaoId: string, valorAtual: number, incremento: number, tempoRestante: number) => {
    if (!id_time || !nome_time || !podeDarLance) return

    const novoValor = Number(valorAtual) + incremento
    if (saldo !== null && novoValor > saldo) {
      alert('❌ Você não tem saldo suficiente.')
      return
    }

    setPodeDarLance(false)

    try {
      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: id_time,
        p_nome_time_vencedor: nome_time,
        p_estender: tempoRestante < 15
      })

      if (error) throw error

      setTimeout(() => setPodeDarLance(true), 1000)
      setTimeout(() => router.refresh(), 3000)
    } catch (err: any) {
      alert('Erro ao dar lance: ' + err.message)
      setPodeDarLance(true)
    }
  }

  const finalizarLeilaoAgora = async (leilaoId: string) => {
    if (!confirm('Deseja finalizar esse leilão agora?')) return

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'leiloado' })
      .eq('id', leilaoId)

    if (error) {
      alert('Erro ao finalizar leilão: ' + error.message)
    } else {
      alert('Leilão finalizado!')
      router.refresh()
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = (segundos % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  if (carregando) return <div className="p-6 text-white">⏳ Carregando...</div>
  if (!leiloes.length) return <div className="p-6 text-white">⚠️ Nenhum leilão ativo no momento.</div>

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      <div className="mb-6 text-lg font-semibold text-green-400">
        💳 Saldo atual do seu time: R$ {saldo !== null ? saldo.toLocaleString() : '...'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        {leiloes.map((leilao, index) => {
          const tempoFinal = new Date(leilao.fim).getTime()
          const agora = Date.now()
          let tempoRestante = Math.floor((tempoFinal - agora) / 1000)
          if (tempoRestante < 0) tempoRestante = 0

          const isVencendo = leilao.nome_time_vencedor === nome_time
          const borderClass = isVencendo ? 'border-2 border-green-400' : ''

          return (
            <div key={leilao.id} className={`bg-gray-800 rounded-xl shadow-2xl p-6 text-center ${borderClass}`}>
              <h1 className="text-xl font-bold mb-4 text-green-400">⚔️ Leilão #{index + 1}</h1>

              {leilao.imagem_url && (
                <img
                  src={leilao.imagem_url}
                  alt={leilao.nome}
                  className="w-24 h-24 object-cover rounded-full mx-auto mb-2 border-2 border-green-400"
                />
              )}

              <h2 className="text-xl font-bold mb-1">
                {leilao.nome} <span className="text-sm">({leilao.posicao})</span>
              </h2>
              <p className="mb-1">⭐ Overall: <strong>{leilao.overall}</strong></p>
              <p className="mb-1">🌍 Nacionalidade: <strong>{leilao.nacionalidade}</strong></p>
              <p className="mb-2 text-green-400 text-lg font-bold">
                💰 R$ {Number(leilao.valor_atual).toLocaleString()}
              </p>

              {leilao.nome_time_vencedor && (
                <p className="mb-3 text-sm text-gray-300">
                  👑 Último lance: <strong>{leilao.nome_time_vencedor}</strong>
                </p>
              )}

              <div className="text-lg font-mono bg-black text-white inline-block px-4 py-1 rounded-lg mb-3 shadow">
                ⏱️ {formatarTempo(tempoRestante)}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[4000000, 6000000, 8000000, 10000000, 15000000, 20000000].map((incremento) => {
                  const disabled =
                    tempoRestante === 0 ||
                    (saldo !== null && Number(leilao.valor_atual) + incremento > saldo) ||
                    !podeDarLance

                  return (
                    <button
                      key={incremento}
                      onClick={() => darLance(leilao.id, leilao.valor_atual, incremento, tempoRestante)}
                      disabled={disabled}
                      className="bg-green-600 hover:bg-green-700 text-white py-1 rounded text-xs font-bold transition disabled:opacity-50"
                    >
                      + R$ {(incremento / 1000000).toLocaleString()} mi
                    </button>
                  )
                })}
              </div>

              {leilao.link_sofifa && (
                <a
                  href={leilao.link_sofifa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline text-sm hover:text-blue-300 transition"
                >
                  🔗 Ver no Sofifa
                </a>
              )}

              {tempoRestante === 0 && (
                <button
                  onClick={() => finalizarLeilaoAgora(leilao.id)}
                  className="mt-3 bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded text-sm"
                >
                  Finalizar Leilão
                </button>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
