'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PropostasRecebidasPage() {
  const [pendentes, setPendentes] = useState<any[]>([])
  const [concluidas, setConcluidas] = useState<any[]>([])
  const [jogadores, setJogadores] = useState<any>({})
  const [jogadoresOferecidosData, setJogadoresOferecidosData] = useState<any>({})
  const [idTime, setIdTime] = useState<string>('')

  useEffect(() => {
    const id_time = localStorage.getItem('id_time') || ''
    setIdTime(id_time)

    if (!id_time) return

    const buscarPropostas = async () => {
      const { data: pendentesData } = await supabase
        .from('propostas_app')
        .select('*')
        .eq('id_time_alvo', id_time)
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })
        .limit(10)

      const { data: concluidasData } = await supabase
        .from('propostas_app')
        .select('*')
        .eq('id_time_alvo', id_time)
        .not('status', 'eq', 'pendente')
        .order('created_at', { ascending: false })
        .limit(5)

      if (pendentesData) setPendentes(pendentesData)
      if (concluidasData) setConcluidas(concluidasData)

      const idsJogadores = [
        ...(pendentesData?.map((p) => p.jogador_id) || []),
        ...(concluidasData?.map((p) => p.jogador_id) || []),
      ]

      if (idsJogadores.length > 0) buscarJogadores(idsJogadores)

      const idsOferecidos = [
        ...(pendentesData?.flatMap((p) => p.jogadores_oferecidos) || []),
        ...(concluidasData?.flatMap((p) => p.jogadores_oferecidos) || []),
      ].filter((v, i, a) => a.indexOf(v) === i)

      if (idsOferecidos.length > 0) buscarJogadoresOferecidos(idsOferecidos)
    }

    const buscarJogadores = async (ids: string[]) => {
      const { data } = await supabase
        .from('elenco')
        .select('id, nome, imagem_url, posicao')
        .in('id', ids)

      if (data) {
        const dict = Object.fromEntries(data.map((j) => [j.id, j]))
        setJogadores(dict)
      }
    }

    const buscarJogadoresOferecidos = async (ids: string[]) => {
      if (!ids.length) return
      const { data } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', ids)

      if (data) {
        const dict = Object.fromEntries(data.map((j) => [j.id, j.nome]))
        setJogadoresOferecidosData((prev: any) => ({ ...prev, ...dict }))
      }
    }

    buscarPropostas()
  }, [])

  const aceitarProposta = async (proposta: any) => {
    try {
      await supabase.from('propostas_app').update({ status: 'aceita' }).eq('id', proposta.id)

      const { data: comprador } = await supabase
        .from('times')
        .select('saldo, nome')
        .eq('id', proposta.id_time_origem)
        .single()

      const { data: vendedor } = await supabase
        .from('times')
        .select('saldo, nome')
        .eq('id', proposta.id_time_alvo)
        .single()

      if (!comprador || !vendedor) return

      await supabase
        .from('times')
        .update({ saldo: comprador.saldo - proposta.valor_oferecido })
        .eq('id', proposta.id_time_origem)

      await supabase
        .from('times')
        .update({ saldo: vendedor.saldo + proposta.valor_oferecido })
        .eq('id', proposta.id_time_alvo)

      await supabase
        .from('elenco')
        .update({ id_time: proposta.id_time_origem })
        .eq('id', proposta.jogador_id)

      if (proposta.tipo_proposta === 'dinheiro') {
        await supabase
          .from('elenco')
          .update({ valor: proposta.valor_oferecido })
          .eq('id', proposta.jogador_id)
      }

      const jogador = jogadores[proposta.jogador_id]

      await supabase.from('notificacoes').insert({
        id_time: proposta.id_time_origem,
        titulo: '✅ Proposta aceita!',
        mensagem: `Sua proposta pelo jogador ${jogador?.nome || 'Desconhecido'} foi aceita.`,
      })

      await supabase.from('bid').insert({
        tipo_evento: 'transferencia',
        descricao: `O ${vendedor.nome} vendeu ${jogador?.nome || 'Jogador'} para o ${comprador.nome} por R$ ${proposta.valor_oferecido.toLocaleString('pt-BR')}.`,
        id_time1: proposta.id_time_alvo,
        id_time2: proposta.id_time_origem,
        valor: proposta.valor_oferecido,
        data_evento: new Date().toISOString(),
      })

      setPendentes((prev) => prev.filter((p) => p.id !== proposta.id))
      setConcluidas((prev) => [{ ...proposta, status: 'aceita' }, ...prev].slice(0, 5))
    } catch (err) {
      console.error('❌ Erro ao aceitar proposta:', err)
    }
  }

  const recusarProposta = async (id: string) => {
    await supabase.from('propostas_app').update({ status: 'recusada' }).eq('id', id)
    const recusada = pendentes.find((p) => p.id === id)

    if (recusada) {
      const jogador = jogadores[recusada.jogador_id]

      await supabase.from('notificacoes').insert({
        id_time: recusada.id_time_origem,
        titulo: '❌ Proposta recusada',
        mensagem: `Sua proposta pelo jogador ${jogador?.nome || 'Desconhecido'} foi recusada.`,
      })

      const { data: vendedor } = await supabase
        .from('times')
        .select('nome')
        .eq('id', recusada.id_time_alvo)
        .single()

      const { data: comprador } = await supabase
        .from('times')
        .select('nome')
        .eq('id', recusada.id_time_origem)
        .single()

      if (vendedor && comprador) {
        await supabase.from('bid').insert({
          tipo_evento: 'proposta_recusada',
          descricao: `O ${vendedor.nome} recusou a proposta do ${comprador.nome} pelo jogador ${jogador?.nome || 'Jogador'}.`,
          id_time1: recusada.id_time_alvo,
          id_time2: recusada.id_time_origem,
          valor: recusada.valor_oferecido,
          data_evento: new Date().toISOString(),
        })
      }

      setPendentes((prev) => prev.filter((p) => p.id !== id))
      setConcluidas((prev) => [{ ...recusada, status: 'recusada' }, ...prev].slice(0, 5))
    }
  }

  const renderCard = (p: any) => {
    const jogador = jogadores[p.jogador_id]
    return (
      <div key={p.id} className="border rounded shadow p-2 w-[220px] flex flex-col items-center">
        <img
          src={jogador?.imagem_url || '/jogador_padrao.png'}
          alt={jogador?.nome || 'Jogador'}
          className="w-16 h-16 rounded-full object-cover mb-2"
        />
        <div className="text-center text-sm font-semibold">
          {jogador?.nome || 'Jogador não encontrado'}
        </div>
        <div className="text-xs">{jogador?.posicao || '-'} • De: {p.nome_time_origem}</div>

        <div className="text-xs text-gray-700 mt-1">
          Tipo: {p.tipo_proposta} <br />
          Status:{' '}
          {p.status === 'pendente'
            ? '⏳ Pendente'
            : p.status === 'aceita'
            ? '✅ Aceita'
            : '❌ Recusada'}
        </div>

        <div className="text-sm text-blue-700 font-bold mt-1">
          R$ {Number(p.valor_oferecido).toLocaleString('pt-BR')}
        </div>

        {p.jogadores_oferecidos.length > 0 && (
          <div className="text-xs mt-1 text-center">
            🧩 Jogadores Oferecidos:
            <br />
            {p.jogadores_oferecidos
              .map((id: string) => jogadoresOferecidosData[id] || id)
              .join(', ')}
          </div>
        )}

        {p.status === 'pendente' && (
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            <button
              onClick={() => aceitarProposta(p)}
              className="bg-green-600 text-white text-xs px-2 py-1 rounded"
            >
              ✅ Aceitar
            </button>
            <button
              onClick={() => recusarProposta(p.id)}
              className="bg-red-600 text-white text-xs px-2 py-1 rounded"
            >
              ❌ Recusar
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">📥 Propostas Recebidas</h1>

      <h2 className="text-md font-semibold mb-2">⏳ Pendentes (últimas 10)</h2>
      {pendentes.length === 0 && <p className="text-gray-500">Nenhuma proposta pendente.</p>}
      <div className="flex flex-wrap gap-4">{pendentes.map(renderCard)}</div>

      <h2 className="text-md font-semibold my-4">📜 Concluídas (últimas 5)</h2>
      {concluidas.length === 0 && <p className="text-gray-500">Nenhuma proposta concluída.</p>}
      <div className="flex flex-wrap gap-4">{concluidas.map(renderCard)}</div>
    </div>
  )
}
