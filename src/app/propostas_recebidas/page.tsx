'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Helpers
const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
const getOferecidoId = (item: any): string => {
  if (typeof item === 'string') return item
  if (isObj(item) && typeof item.id === 'string') return item.id
  return String(item)
}
const toBRL = (n: number | null | undefined) =>
  n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR')}`

export default function PropostasRecebidasPage() {
  const [pendentes, setPendentes] = useState<any[]>([])
  const [concluidas, setConcluidas] = useState<any[]>([])
  const [jogadores, setJogadores] = useState<any>({})
  const [jogadoresOferecidosData, setJogadoresOferecidosData] = useState<any>({})
  const [idTime, setIdTime] = useState<string>('')
  const [loadingPropostaId, setLoadingPropostaId] = useState<string | null>(null)

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

      // Jogadores-alvo
      const idsJogadores = [
        ...(pendentesData?.map((p) => p.jogador_id) || []),
        ...(concluidasData?.map((p) => p.jogador_id) || []),
      ].filter(Boolean)

      if (idsJogadores.length > 0) await buscarJogadores(idsJogadores)

      // Jogadores oferecidos (suporta array de objetos ou ids)
      const idsOferecidos = [
        ...(pendentesData?.flatMap((p) => (p.jogadores_oferecidos || []).map(getOferecidoId)) || []),
        ...(concluidasData?.flatMap((p) => (p.jogadores_oferecidos || []).map(getOferecidoId)) || []),
      ].filter(Boolean)
      const idsOferecidosUnicos = Array.from(new Set(idsOferecidos))

      if (idsOferecidosUnicos.length > 0) await buscarJogadoresOferecidos(idsOferecidosUnicos)
    }

    const buscarJogadores = async (ids: string[]) => {
      const { data, error } = await supabase
        .from('elenco')
        .select('id, nome, imagem_url, posicao, valor')
        .in('id', ids)
      if (error) {
        console.error(error)
        return
      }
      if (data) {
        const dict = Object.fromEntries(data.map((j) => [j.id, j]))
        setJogadores(dict)
      }
    }

    const buscarJogadoresOferecidos = async (ids: string[]) => {
      const { data, error } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', ids)
      if (error) {
        console.error(error)
        return
      }
      if (data) {
        const dict = Object.fromEntries(data.map((j) => [j.id, j.nome]))
        setJogadoresOferecidosData((prev: any) => ({ ...prev, ...dict }))
      }
    }

    buscarPropostas()
  }, [])

  const aceitarProposta = async (proposta: any) => {
    // Busca dados atuais do jogador alvo
    const { data: jogadorData, error: errorJogador } = await supabase
      .from('elenco')
      .select('id, nome, jogos, id_time, valor, salario')
      .eq('id', proposta.jogador_id)
      .single()

    if (errorJogador || !jogadorData) {
      alert('Erro ao buscar dados do jogador.')
      return
    }
    if ((jogadorData.jogos ?? 0) < 3) {
      alert('❌ Este jogador ainda não pode ser negociado. Precisa ter ao menos 3 jogos.')
      return
    }

    const confirmar = window.confirm(`Aceitar proposta por ${jogadorData?.nome}?`)
    if (!confirmar) return
    if (loadingPropostaId === proposta.id) return
    setLoadingPropostaId(proposta.id)

    // Normaliza tipo e valores
    const tipo: string = proposta.tipo_proposta // 'dinheiro' | 'troca_simples' | 'troca_composta' | 'comprar_percentual'
    const dinheiroOferecido: number | null =
      proposta.valor_oferecido == null ? null : Number(proposta.valor_oferecido)

    const isTrocaSimples  = tipo === 'troca_simples'
    const isTrocaComposta = tipo === 'troca_composta'
    const isDinheiro      = tipo === 'dinheiro'
    const isPercentual    = tipo === 'comprar_percentual' || tipo === 'percentual' // compat

    // Valor para saldos/BID
    let valorTransacao = 0
    if (isDinheiro) {
      valorTransacao = Math.max(0, Number(dinheiroOferecido ?? 0))
    } else if (isTrocaComposta) {
      valorTransacao = dinheiroOferecido && dinheiroOferecido > 0 ? Number(dinheiroOferecido) : 0
    } else if (isPercentual) {
      const perc = Number(proposta.percentual_desejado || proposta.percentual || 0)
      valorTransacao = Math.round(Number(jogadorData.valor || 0) * (perc / 100))
    } // troca_simples => 0

    try {
      // 1) Marca como aceita
      const { error: eStatus } = await supabase
        .from('propostas_app')
        .update({ status: 'aceita', aceita_em: new Date().toISOString() })
        .eq('id', proposta.id)
      if (eStatus) throw eStatus

      // 2) Saldos e BID
      let comprador: any = null
      let vendedor: any  = null
      if (valorTransacao > 0) {
        const r1 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_origem).single()
        const r2 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_alvo).single()
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        comprador = r1.data
        vendedor  = r2.data

        // debita/credita
        const eDeb = await supabase
          .from('times')
          .update({ saldo: Number(comprador.saldo || 0) - valorTransacao })
          .eq('id', proposta.id_time_origem)
        if (eDeb.error) throw eDeb.error

        const eCred = await supabase
          .from('times')
          .update({ saldo: Number(vendedor.saldo || 0) + valorTransacao })
          .eq('id', proposta.id_time_alvo)
        if (eCred.error) throw eCred.error

        // movimentações
        await registrarMovimentacao({
          id_time: proposta.id_time_origem,
          tipo: 'saida',
          valor: valorTransacao,
          descricao: `Compra de ${jogadorData?.nome} via proposta`,
        })
        await registrarMovimentacao({
          id_time: proposta.id_time_alvo,
          tipo: 'entrada',
          valor: valorTransacao,
          descricao: `Venda de ${jogadorData?.nome} via proposta`,
        })

        // BID (compra/venda com valor)
        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `O ${vendedor.nome} vendeu ${jogadorData.nome} ao ${comprador.nome} por ${toBRL(valorTransacao)}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: valorTransacao,
          data_evento: new Date().toISOString(),
        })
      } else {
        // BID para trocas sem dinheiro
        const r1 = await supabase.from('times').select('nome').eq('id', proposta.id_time_origem).single()
        const r2 = await supabase.from('times').select('nome').eq('id', proposta.id_time_alvo).single()
        comprador = r1.data
        vendedor  = r2.data
        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `Troca: ${vendedor?.nome || 'time A'} ↔ ${comprador?.nome || 'time B'} envolvendo ${jogadorData.nome}${(proposta.jogadores_oferecidos || []).length ? ' e outros jogadores' : ''}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: 0,
          data_evento: new Date().toISOString(),
        })
      }

      // 3) Atualiza ELENCO do alvo
      // Vai para o comprador; zera jogos.
      // Só atualiza "valor" e "salario" quando há dinheiro > 0 (dinheiro / troca+dinheiro).
      const updatesAlvo: any = { id_time: proposta.id_time_origem, jogos: 0 }
      if (isDinheiro || (isTrocaComposta && valorTransacao > 0)) {
        updatesAlvo.valor   = valorTransacao
        updatesAlvo.salario = Math.round(valorTransacao * 0.007)
      }
      const eAlvo = await supabase.from('elenco').update(updatesAlvo).eq('id', proposta.jogador_id)
      if (eAlvo.error) throw eAlvo.error

      // 3.2) Oferecidos → vão para o vendedor; zera jogos; NÃO mexe no valor
      if (isTrocaSimples || isTrocaComposta) {
        const oferecidosIds: string[] = (proposta.jogadores_oferecidos || [])
          .map(getOferecidoId)
          .filter(Boolean)
        for (const idJ of oferecidosIds) {
          const eOf = await supabase
            .from('elenco')
            .update({ id_time: proposta.id_time_alvo, jogos: 0 })
            .eq('id', idJ)
          if (eOf.error) throw eOf.error
        }
      }

      // 4) Notificação
      await supabase.from('notificacoes').insert({
        id_time: proposta.id_time_origem,
        titulo: '✅ Proposta aceita!',
        mensagem: `Sua proposta pelo jogador ${jogadorData?.nome} foi aceita.`,
      })

      // 5) Atualiza estado local
      setPendentes((prev) => prev.filter((p) => p.id !== proposta.id))
      setConcluidas((prev) => [{ ...proposta, status: 'aceita' }, ...prev].slice(0, 5))
    } catch (err) {
      console.error(err)
      alert('Erro ao processar a proposta. Veja o console.')
    } finally {
      setLoadingPropostaId(null)
    }
  }

  const recusarProposta = async (id: string) => {
    await supabase.from('propostas_app').update({ status: 'recusada' }).eq('id', id)
    const recusada = pendentes.find((p) => p.id === id)

    if (recusada) {
      const jog = jogadores[recusada.jogador_id]
      await supabase.from('notificacoes').insert({
        id_time: recusada.id_time_origem,
        titulo: '❌ Proposta recusada',
        mensagem: `Sua proposta por ${jog?.nome || 'jogador'} foi recusada.`,
      })
      setPendentes((prev) => prev.filter((p) => p.id !== id))
      setConcluidas((prev) => [{ ...recusada, status: 'recusada' }, ...prev].slice(0, 5))
    }
  }

  const renderCard = (p: any) => {
    const jog = jogadores[p.jogador_id]
    const valorLabel = toBRL(p.valor_oferecido == null ? null : Number(p.valor_oferecido))
    const oferecidosNomes =
      (p.jogadores_oferecidos || [])
        .map(getOferecidoId)
        .map((id: string) => jogadoresOferecidosData[id] || id)
        .join(', ') || null

    return (
      <div key={p.id} className="border rounded shadow p-3 w-[240px] flex flex-col items-center bg-white">
        <img
          src={jog?.imagem_url || '/jogador_padrao.png'}
          className="w-16 h-16 rounded-full object-cover mb-2"
        />
        <div className="text-center text-sm font-semibold">{jog?.nome || 'Jogador'}</div>
        <div className="text-xs text-gray-700">{jog?.posicao} • De: {p.nome_time_origem}</div>
        <div className="text-xs text-gray-700 mt-1">
          Tipo: {p.tipo_proposta} <br />
          Status: {p.status === 'pendente' ? '⏳' : p.status === 'aceita' ? '✅' : '❌'}
        </div>

        <div className="text-sm text-blue-700 font-bold mt-1">{valorLabel}</div>

        {['comprar_percentual', 'percentual'].includes(p.tipo_proposta) && (
          <div className="text-xs mt-1">📊 Percentual: {p.percentual_desejado}%</div>
        )}

        {oferecidosNomes && (
          <div className="text-xs mt-2 text-center">
            🧩 Oferecidos:<br />
            {oferecidosNomes}
          </div>
        )}

        {p.status === 'pendente' && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => aceitarProposta(p)}
              className="bg-green-600 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
              disabled={loadingPropostaId === p.id}
            >
              {loadingPropostaId === p.id ? '⏳' : '✅ Aceitar'}
            </button>
            <button
              onClick={() => recusarProposta(p.id)}
              className="bg-red-600 text-white text-xs px-3 py-1 rounded"
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
