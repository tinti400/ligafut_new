'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LeilaoSistemaPage() {
  const router = useRouter()
  const [leilao, setLeilao] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [tempoRestante, setTempoRestante] = useState<number | null>(null)

  const id_time = localStorage.getItem('id_time')
  const nome_time = localStorage.getItem('nome_time')

  useEffect(() => {
    const buscarLeilaoAtivo = async () => {
      const { data, error } = await supabase
        .from('leiloes_sistema')
        .select('*')
        .eq('status', 'ativo')
        .order('criado_em', { ascending: true })
        .limit(1)

      if (error) {
        console.error('Erro ao buscar leilão:', error)
      } else {
        setLeilao(data?.[0] || null)
      }

      setCarregando(false)
    }

    buscarLeilaoAtivo()
    const intervalo = setInterval(buscarLeilaoAtivo, 5000)
    return () => clearInterval(intervalo)
  }, [])

  useEffect(() => {
    if (!leilao || !leilao.fim) return

    const atualizarTempo = () => {
      const agora = new Date().getTime()
      const fim = new Date(leilao.fim).getTime()
      const restante = Math.floor((fim - agora) / 1000)

      if (restante <= 0) {
        finalizarLeilao()
        setTempoRestante(0)
      } else {
        setTempoRestante(restante)
      }
    }

    atualizarTempo()
    const intervalo = setInterval(atualizarTempo, 1000)
    return () => clearInterval(intervalo)
  }, [leilao])

  const finalizarLeilao = async () => {
    if (!leilao || !leilao.id_time_vencedor) return

    const vencedor_id = leilao.id_time_vencedor
    const vencedor_nome = leilao.nome_time_vencedor

    const jogador = {
      id: uuidv4(),
      nome: leilao.nome,
      posicao: leilao.posicao,
      overall: leilao.overall,
      valor: leilao.valor_atual,
      imagem_url: leilao.imagem_url || '',
      link_sofifa: leilao.link_sofifa || '',
      nacionalidade: leilao.nacionalidade || '',
      id_time: vencedor_id
    }

    await supabase.from('elencos').insert(jogador)

    await supabase.rpc('executar_sql', {
      sql: `
        UPDATE times
        SET saldo = saldo - ${leilao.valor_atual}
        WHERE id = '${vencedor_id}'
      `
    })

    await supabase.from('movimentacoes_financeiras').insert({
      id: uuidv4(),
      id_time: vencedor_id,
      tipo: 'saida',
      descricao: `Compra em leilão: ${leilao.nome}`,
      valor: leilao.valor_atual
    })

    await supabase.from('leiloes_sistema')
      .update({ status: 'leiloado' })
      .eq('id', leilao.id)

    setLeilao(null)
    setTempoRestante(0)
    router.refresh()
  }

  const darLance = async (incremento: number) => {
    if (!leilao || !id_time || !nome_time || tempoRestante === 0) return

    const novoValor = Number(leilao.valor_atual) + incremento

    const agora = new Date().getTime()
    const fimAtual = new Date(leilao.fim).getTime()
    const tempoRestanteSegundos = Math.floor((fimAtual - agora) / 1000)

    let novaDataFim = leilao.fim
    if (tempoRestanteSegundos <= 15) {
      novaDataFim = new Date(agora + 15 * 1000).toISOString()
    }

    const { error } = await supabase
      .from('leiloes_sistema')
      .update({
        valor_atual: novoValor,
        id_time_vencedor: id_time,
        nome_time_vencedor: nome_time,
        fim: novaDataFim
      })
      .eq('id', leilao.id)

    if (error) {
      alert('Erro ao dar lance.')
    } else {
      router.refresh()
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = (segundos % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  if (carregando) return <div className="p-6">⏳ Carregando...</div>
  if (!leilao) return <div className="p-6">⚠️ Nenhum leilão ativo no momento.</div>

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-xl p-6 text-center">
        <h1 className="text-3xl font-bold mb-4">⚔️ Leilão Ativo</h1>

        {leilao.imagem_url && (
          <img
            src={leilao.imagem_url}
            alt={leilao.nome}
            className="w-48 h-48 object-cover rounded-full mx-auto mb-4"
          />
        )}

        <h2 className="text-2xl font-semibold mb-2">{leilao.nome} ({leilao.posicao})</h2>
        <p className="mb-1">⭐ Overall: {leilao.overall}</p>
        <p className="mb-1">🌍 Nacionalidade: {leilao.nacionalidade}</p>
        <p className="mb-2 font-bold text-lg">💰 Lance atual: R$ {Number(leilao.valor_atual).toLocaleString()}</p>

        {leilao.nome_time_vencedor && (
          <p className="mb-4 text-sm text-gray-600">
            👑 Último lance por: <strong>{leilao.nome_time_vencedor}</strong>
          </p>
        )}

        {tempoRestante !== null && (
          <div className="text-2xl font-mono bg-black text-white inline-block px-4 py-2 rounded-lg mb-4">
            ⏱️ {formatarTempo(tempoRestante)}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-4">
          {[...Array(5)].map((_, i) => {
            const incremento = 2000000 * Math.pow(2, i)
            return (
              <button
                key={i}
                onClick={() => darLance(incremento)}
                disabled={tempoRestante === 0}
                className="bg-green-600 hover:bg-green-700 text-white py-2 px-2 rounded text-sm font-bold"
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
            className="text-blue-600 underline text-sm"
          >
            🔗 Ver no Sofifa
          </a>
        )}
      </div>
    </main>
  )
}
