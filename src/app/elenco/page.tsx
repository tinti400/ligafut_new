'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImagemComFallback from '@/components/ImagemComFallback' // componente com fallback para imagens

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')

  const fetchElenco = async () => {
    setLoading(true)
    try {
      const id_time = localStorage.getItem('id_time')
      if (!id_time) {
        alert('ID do time não encontrado no localStorage.')
        setLoading(false)
        return
      }

      const { data: elencoData, error: errorElenco } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', id_time)

      if (errorElenco) {
        alert('Erro ao buscar elenco: ' + errorElenco.message)
        setLoading(false)
        return
      }

      const { data: timeData, error: errorTime } = await supabase
        .from('times')
        .select('nome, saldo')
        .eq('id', id_time)
        .single()

      if (errorTime) {
        alert('Erro ao buscar dados do time: ' + errorTime.message)
        setLoading(false)
        return
      }

      setElenco(elencoData || [])
      setSaldo(timeData?.saldo || 0)
      setNomeTime(timeData?.nome || '')
    } catch (error) {
      alert('Erro inesperado: ' + error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchElenco()
  }, [])

  const venderJogador = async (jogador: any) => {
    const confirmar = confirm(
      `💸 Deseja vender ${jogador.nome} por R$ ${Number(jogador.valor).toLocaleString('pt-BR')}?\nO clube receberá 70% deste valor.`
    )
    if (!confirmar) return

    try {
      // Inserir no mercado de transferências
      const { error: errorInsert } = await supabase.from('mercado_transferencias').insert({
        jogador_id: jogador.id,
        nome: jogador.nome,
        posicao: jogador.posicao,
        overall: jogador.overall,
        valor: jogador.valor,
        imagem_url: jogador.imagem_url || '',
        salario: jogador.salario || 0,
        link_sofifa: jogador.link_sofifa || '',
        id_time_origem: jogador.id_time,
        status: 'disponivel',
        created_at: new Date().toISOString(),
      })

      if (errorInsert) {
        alert('❌ Erro ao inserir o jogador no mercado: ' + errorInsert.message)
        return
      }

      // Remover jogador do elenco (filtrando também pelo time)
      const { error: errorDelete } = await supabase
        .from('elenco')
        .delete()
        .eq('id_time', jogador.id_time)
        .eq('id', jogador.id)

      if (errorDelete) {
        alert('❌ Erro ao remover o jogador do elenco: ' + errorDelete.message)
        return
      }

      // Atualizar saldo do time com 70% do valor do jogador
      const valorRecebido = Math.round(jogador.valor * 0.7)
      const { error: errorSaldo } = await supabase
        .from('times')
        .update({ saldo: saldo + valorRecebido })
        .eq('id', jogador.id_time)

      if (errorSaldo) {
        alert('❌ Erro ao atualizar o saldo do time: ' + errorSaldo.message)
        return
      }

      // Recarregar elenco atualizado
      await fetchElenco()
      alert(`✅ Jogador vendido! R$ ${valorRecebido.toLocaleString('pt-BR')} creditado.`)
    } catch (error) {
      alert('❌ Ocorreu um erro inesperado: ' + error)
      console.error('Erro inesperado:', error)
    }
  }

  if (loading) return <p className="text-center mt-10 text-white">⏳ Carregando elenco...</p>

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-green-400">
        👥 Elenco do {nomeTime} — Saldo: R$ {saldo.toLocaleString('pt-BR')}
      </h1>

      {elenco.length === 0 ? (
        <p className="text-center text-gray-400">Nenhum jogador no elenco.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {elenco.map((jogador) => (
            <div
              key={jogador.id}
              className="bg-gray-800 p-4 rounded-xl text-center border border-gray-700"
            >
              <ImagemComFallback
                src={jogador.imagem_url}
                alt={jogador.nome}
                width={80}
                height={80}
                className="rounded-full mb-2 mx-auto"
              />
              <h2 className="text-lg font-bold">{jogador.nome}</h2>
              <p className="text-gray-300 text-sm">
                {jogador.posicao} • Overall {jogador.overall ?? 'N/A'}
              </p>
              <p className="text-green-400 font-semibold">💰 R$ {jogador.valor.toLocaleString()}</p>
              <p className="text-gray-400 text-xs">Salário: R$ {(jogador.salario || 0).toLocaleString()}</p>

              <button
                onClick={() => venderJogador(jogador)}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-full text-sm w-full"
              >
                💸 Vender
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
