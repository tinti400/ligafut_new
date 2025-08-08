'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import classNames from 'classnames'

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
  const [tremores, setTremores] = useState<Record<string, boolean>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
  const nome_time = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : null

  const buscarSaldo = async () => {
    if (!id_time || id_time === 'null') return
    const { data, error } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', id_time)
      .single()
    if (!error && data) {
      console.log('✅ Saldo carregado:', data.saldo)
      setSaldo(data.saldo)
    } else {
      console.error('❌ Erro ao buscar saldo:', error)
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
      data?.forEach((leilao) => {
        if (leilao.nome_time_vencedor !== nome_time && leilao.anterior === nome_time) {
          audioRef.current?.play()
        }
      })
      console.log('📦 Leilões carregados:', data)
      setLeiloes(data || [])
    } else {
      console.error('❌ Erro ao buscar leilões:', error)
    }

    setCarregando(false)
  }

  useEffect(() => {
    console.log('🔁 useEffect inicial')
    console.log('🆔 id_time:', id_time)
    console.log('📛 nome_time:', nome_time)
    buscarLeiloesAtivos()
    buscarSaldo()
    const intervalo = setInterval(() => {
      buscarLeiloesAtivos()
      buscarSaldo()
    }, 1000)
    return () => clearInterval(intervalo)
  }, [])

  const darLance = async (leilaoId: string, valorAtual: number, incremento: number, tempoRestante: number) => {
    console.log('🟢 Clique detectado no botão de lance')
    console.log({ leilaoId, valorAtual, incremento, tempoRestante, saldo, podeDarLance, id_time, nome_time })

    if (
      !id_time || id_time === 'null' ||
      !nome_time || nome_time === 'null' ||
      !podeDarLance
    ) {
      console.warn('🚫 Lance bloqueado por falta de dados válidos:', { id_time, nome_time, podeDarLance })
      return
    }

    const novoValor = Number(valorAtual) + incremento
    console.log('💰 Novo valor do lance:', novoValor)

    if (saldo !== null && novoValor > saldo) {
      console.warn('💸 Saldo insuficiente:', saldo)
      alert('❌ Você não tem saldo suficiente.')
      return
    }

    setPodeDarLance(false)
    setTremores((prev) => ({ ...prev, [leilaoId]: true }))

    try {
      console.log('📡 Enviando RPC para dar lance...')
      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: id_time,
        p_nome_time_vencedor: nome_time,
        p_estender: tempoRestante < 15
      })

      if (error) {
        console.error('❌ Erro na RPC:', error)
        throw error
      }

      console.log('✅ Lance registrado com sucesso!')
      setTimeout(() => setPodeDarLance(true), 1000)
      setTimeout(() => router.refresh(), 3000)
    } catch (err: any) {
      console.error('❌ Erro ao dar lance:', err.message)
      alert('Erro ao dar lance: ' + err.message)
      setPodeDarLance(true)
    } finally {
      setTimeout(() => setTremores((prev) => ({ ...prev, [leilaoId]: false })), 300)
    }
  }

  const finalizarLeilaoAgora = async (leilaoId: string) => {
    if (!confirm('Deseja finalizar esse leilão agora?')) return

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'leiloado' })
      .eq('id', leilaoId)

    if (error) alert('Erro ao finalizar leilão: ' + error.message)
    else {
      alert('Leilão finalizado!')
      router.refresh()
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = (segundos % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  const corBorda = (valor: number) => {
    if (valor >= 360_000_000) return 'border-red-500'
    if (valor >= 240_000_000) return 'border-purple-500'
    if (valor >= 120_000_000) return 'border-blue-500'
    return 'border-green-400'
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

          const tremorClass = tremores[leilao.id] ? 'animate-pulse scale-105' : ''
          const borderClass = classNames('border-2 rounded-xl', corBorda(leilao.valor_atual))

          return (
            <div
              key={leilao.id}
              className={`bg-gray-800 ${borderClass} shadow-2xl p-6 text-center transition-transform duration-300 ${tremorClass}`}
            >
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
                      onClick={() => {
                        console.log(`🧪 Clique no botão de +R$${incremento}`)
                        darLance(leilao.id, leilao.valor_atual, incremento, tempoRestante)
                      }}
                      disabled={disabled}
                      title={
                        tempoRestante === 0
                          ? '⏱️ Leilão encerrado'
                          : saldo !== null && Number(leilao.valor_atual) + incremento > saldo
                          ? '💸 Saldo insuficiente'
                          : !podeDarLance
                          ? '⏳ Aguarde para dar novo lance'
                          : ''
                      }
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
