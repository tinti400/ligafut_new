'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const DURACAO_INICIAL = 120 // 2 minutos
const TEMPO_REINICIO = 15   // 15 segundos para reiniciar o cronômetro

export default function LeilaoSistemaPage() {
  const router = useRouter()
  const [leilao, setLeilao] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [tempoRestante, setTempoRestante] = useState<number | null>(null)
  const [saldo, setSaldo] = useState<number | null>(null)

  const [podeDarLance, setPodeDarLance] = useState(true) // Bloqueio de 1s entre lances

  const id_time = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
  const nome_time = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : null

  // Busca saldo do time
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

  // Busca leilão ativo
  const buscarLeilaoAtivo = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('criado_em', { ascending: true })
      .limit(1)

    if (!error) setLeilao(data?.[0] || null)
    else console.error('Erro ao buscar leilão:', error)

    setCarregando(false)
  }

  useEffect(() => {
    buscarLeilaoAtivo()
    buscarSaldo()
    const intervalo = setInterval(() => {
      buscarLeilaoAtivo()
      buscarSaldo()
    }, 2000)
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    if (!leilao) return

    const atualizarTempo = () => {
      const agora = Date.now()
      const fim = new Date(leilao.fim).getTime()
      let restante = Math.floor((fim - agora) / 1000)
      if (restante < 0) restante = 0
      setTempoRestante(restante)
    }

    atualizarTempo()
    const intervalo = setInterval(atualizarTempo, 1000)
    return () => clearInterval(intervalo)
  }, [leilao])

  const darLance = async (incremento: number) => {
    if (!leilao || !id_time || !nome_time || tempoRestante === 0 || !podeDarLance) return

    setPodeDarLance(false) // Bloqueia lance imediatamente para evitar spams

    const novoValor = Number(leilao.valor_atual) + incremento

    if (saldo !== null && novoValor > saldo) {
      alert('❌ Você não tem saldo suficiente para esse lance.')
      setPodeDarLance(true)
      return
    }

    try {
      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilao.id,
        p_valor_novo: novoValor,
        p_id_time_vencedor: id_time,
        p_nome_time_vencedor: nome_time,
      })

      if (error) throw error

      setLeilao({
        ...leilao,
        valor_atual: novoValor,
        id_time_vencedor: id_time,
        nome_time_vencedor: nome_time,
      })

      setTimeout(() => {
        setPodeDarLance(true)  // Libera após 1 segundo
      }, 1000)

      setTimeout(() => router.refresh(), 5000)
    } catch (err: any) {
      console.error('Erro ao dar lance:', err)
      alert('Erro ao dar lance: ' + err.message)
      setPodeDarLance(true) // Libera em caso de erro também
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = (segundos % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  if (carregando) return <div className="p-6 text-white">⏳ Carregando...</div>
  if (!leilao) return <div className="p-6 text-white">⚠️ Nenhum leilão ativo no momento.</div>

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center justify-center">
      <div className="mb-6 text-lg font-semibold text-green-400">
        💳 Saldo atual do seu time: R$ {saldo !== null ? saldo.toLocaleString() : '...'}
      </div>

      <div className="w-full max-w-2xl bg-gray-800 rounded-xl shadow-2xl p-6 text-center">
        <h1 className="text-3xl font-bold mb-6 text-green-400">⚔️ Leilão Ativo</h1>

        {leilao.imagem_url && (
          <img
            src={leilao.imagem_url}
            alt={leilao.nome}
            className="w-40 h-40 object-cover rounded-full mx-auto mb-4 border-2 border-green-400"
          />
        )}

        <h2 className="text-2xl font-bold mb-2">
          {leilao.nome} <span className="text-sm">({leilao.posicao})</span>
        </h2>
        <p className="mb-1">
          ⭐ Overall: <span className="font-semibold">{leilao.overall}</span>
        </p>
        <p className="mb-1">
          🌍 Nacionalidade: <span className="font-semibold">{leilao.nacionalidade}</span>
        </p>
        <p className="mb-2 text-green-400 text-xl font-bold">
          💰 R$ {Number(leilao.valor_atual).toLocaleString()}
        </p>

        {leilao.nome_time_vencedor && (
          <p className="mb-4 text-sm text-gray-300">
            👑 Último lance por: <strong>{leilao.nome_time_vencedor}</strong>
          </p>
        )}

        {tempoRestante !== null && (
          <div className="text-2xl font-mono bg-black text-white inline-block px-5 py-2 rounded-lg mb-6 shadow">
            ⏱️ {formatarTempo(tempoRestante)}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[...Array(5)].map((_, i) => {
            const incremento = 2000000 * Math.pow(2, i)
            const disabled =
              tempoRestante === 0 ||
              (saldo !== null && Number(leilao.valor_atual) + incremento > saldo) ||
              !podeDarLance

            return (
              <button
                key={i}
                onClick={() => darLance(incremento)}
                disabled={disabled}
                className="bg-green-600 hover:bg-green-700 text-white py-2 rounded text-xs font-bold transition disabled:opacity-50"
                title={disabled ? 'Saldo insuficiente, leilão finalizado ou aguarde 1s entre lances' : ''}
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
      </div>
    </main>
  )
}

