'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ElencoPage() {
  const [elenco, setElenco] = useState<any[]>([])
  const [saldo, setSaldo] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [nomeTime, setNomeTime] = useState('')

  // Função para buscar elenco e saldo
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

  // Função para vender jogador com logs extras para debug
  const venderJogador = async (jogador: any) => {
    const confirmar = confirm(
      `💸 Deseja vender ${jogador.nome} por R$ ${Number(jogador.valor).toLocaleString('pt-BR')}?\nO clube receberá 70% deste valor.`
    )
    if (!confirmar) return

    try {
      console.log('Tentando vender jogador:', jogador)

      // Inserir no mercado_transferencias
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

      console.log('ID do jogador para deletar:', jogador.id)

      // Deletar jogador do elenco com select para retorno e log
      const { data: dataDelete, error: errorDelete } = await supabase
        .from('elenco')
        .delete()
        .eq('id', jogador.id)
        .select()

      console.log('Resultado do delete:', dataDelete, errorDelete)

      if (errorDelete) {
        alert('❌ Erro ao remover o jogador do elenco: ' + errorDelete.message)
        return
      }

      if (!dataDelete || dataDelete.length === 0) {
        alert('⚠️ Jogador não encontrado no elenco para exclusão.')
        return
      }

      // Atualizar saldo do time
      const valorRecebido = Math.round(jogador.valor * 0.7)
      const { error: errorSaldo } = await supabase
        .from('times')
        .update({ saldo: saldo + valorRecebido })
        .eq('id', jogador.id_time)

      if (errorSaldo) {
        alert('❌ Erro ao atualizar o saldo do time: ' + errorSaldo.message)
        return
      }

      // Atualizar elenco na UI
      await fetchElenco()

      alert(`✅ Jogador vendido! R$ ${valorRecebido.toLocaleString('pt-BR')} creditado.`)
    } catch (error) {
      alert('❌ Ocorreu um erro inesperado: ' + error)
      console.error('Erro inesperado:', error)
    }
  }

  if (loading) return <p>Carregando elenco...</p>

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>
        Elenco do <strong>{nomeTime}</strong> — Saldo: <strong>R$ {saldo.toLocaleString('pt-BR')}</strong>
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        {elenco.map((jogador) => (
          <div
            key={jogador.id}
            style={{
              border: '1px solid #444',
              borderRadius: '10px',
              padding: '15px',
              width: '200px',
              backgroundColor: '#222',
              color: '#fff',
              boxShadow: '0 0 10px rgba(0,0,0,0.7)',
            }}
          >
            <img
              src={jogador.imagem_url || '/default-player.png'}
              alt={jogador.nome}
              style={{ width: '100%', borderRadius: '10px', marginBottom: '10px' }}
              onError={(e) => (e.currentTarget.src = '/default-player.png')}
            />
            <p style={{ fontWeight: 'bold', fontSize: '16px', margin: '5px 0' }}>{jogador.nome}</p>
            <p>Posição: {jogador.posicao}</p>
            <p>Overall: {jogador.overall ?? 'N/A'}</p>
            <p>Valor: R$ {Number(jogador.valor).toLocaleString('pt-BR')}</p>
            <button
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
              onClick={() => venderJogador(jogador)}
            >
              Vender
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
