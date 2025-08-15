'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ===== Helpers =====
const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v)
const isUUID = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)

const toBRL = (n: number | null | undefined) =>
  n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR')}`

// pega id de várias formas e normaliza (trim / uuid)
const pickAnyId = (obj: any): string | null => {
  if (!isObj(obj)) return null
  const cand =
    obj.id ??
    obj.jogador_id ??
    obj.player_id ??
    obj.elenco_id ??
    obj.jogadorId ??
    obj.playerId ??
    null
  if (cand == null) return null
  const s = String(cand).trim()
  return s || null
}

const extractOfferedIds = (raw: any): string[] => {
  // aceita array de strings, array de objetos, misto etc.
  const arr: any[] = Array.isArray(raw) ? raw : []
  const ids = arr
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (isObj(item)) return pickAnyId(item)
      return String(item || '').trim()
    })
    .filter(Boolean) as string[]

  // normaliza e filtra por uuid válido
  const unique = Array.from(new Set(ids.map((s) => s.trim())))
  return unique.filter((s) => isUUID(s))
}

// ===================

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

      // Jogadores oferecidos (para mostrar nomes)
      const idsOferecidos = [
        ...(pendentesData?.flatMap((p) => extractOfferedIds(p.jogadores_oferecidos)) || []),
        ...(concluidasData?.flatMap((p) => extractOfferedIds(p.jogadores_oferecidos)) || []),
      ]
      const unicos = Array.from(new Set(idsOferecidos))
      if (unicos.length > 0) await buscarJogadoresOferecidos(unicos)
    }

    const buscarJogadores = async (ids: string[]) => {
      const { data } = await supabase
        .from('elenco')
        .select('id, nome, imagem_url, posicao, valor')
        .in('id', ids)
      if (data) setJogadores(Object.fromEntries(data.map((j) => [j.id, j])))
    }

    const buscarJogadoresOferecidos = async (ids: string[]) => {
      const { data } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', ids)
      if (data) setJogadoresOferecidosData((prev: any) => ({
        ...prev,
        ...Object.fromEntries(data.map((j) => [j.id, j.nome]))
      }))
    }

    buscarPropostas()
  }, [])

  const aceitarProposta = async (proposta: any) => {
    // Dados do alvo
    const { data: jogadorData, error: errorJogador } = await supabase
      .from('elenco')
      .select('id, nome, jogos, id_time, valor, salario, imagem_url, posicao')
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

    if (!window.confirm(`Aceitar proposta por ${jogadorData.nome}?`)) return
    if (loadingPropostaId === proposta.id) return
    setLoadingPropostaId(proposta.id)

    // Tipo e valores
    const tipo = String(proposta.tipo_proposta || '').trim().toLowerCase()
    const dinheiroOferecido: number | null =
      proposta.valor_oferecido == null ? null : Number(proposta.valor_oferecido)

    const isTrocaSimples  = tipo === 'troca_simples'
    const isTrocaComposta = tipo === 'troca_composta'
    const isDinheiro      = tipo === 'dinheiro'
    const isPercentual    = tipo === 'comprar_percentual' || tipo === 'percentual' // compat

    let valorTransacao = 0
    if (isDinheiro) {
      valorTransacao = Math.max(0, Number(dinheiroOferecido ?? 0))
    } else if (isTrocaComposta) {
      valorTransacao = dinheiroOferecido && dinheiroOferecido > 0 ? Number(dinheiroOferecido) : 0
    } else if (isPercentual) {
      const perc = Number(proposta.percentual_desejado || proposta.percentual || 0)
      valorTransacao = Math.round(Number(jogadorData.valor || 0) * (perc / 100))
    }

    // ——— (NOVO) nomes dos oferecidos para descrever no BID ———
    const offeredIdsForBid: string[] = extractOfferedIds(proposta.jogadores_oferecidos)
    let offeredNamesForBid: string[] = []
    if (offeredIdsForBid.length) {
      const { data: offeredRows } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', offeredIdsForBid)
      offeredNamesForBid = (offeredRows || []).map(r => r.nome).filter(Boolean)
    }

    try {
      // 1) Status
      const { error: eStatus } = await supabase
        .from('propostas_app')
        .update({ status: 'aceita', aceita_em: new Date().toISOString() })
        .eq('id', proposta.id)
      if (eStatus) throw eStatus

      // 2) Saldos / BID
      let comprador: any = null
      let vendedor: any  = null
      if (valorTransacao > 0) {
        const r1 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_origem).single()
        const r2 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_alvo).single()
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        comprador = r1.data
        vendedor  = r2.data

        const saldoCompradorAntes = Number(comprador.saldo || 0)
        const saldoVendedorAntes  = Number(vendedor.saldo || 0)
        const saldoCompradorDepois = saldoCompradorAntes - valorTransacao
        const saldoVendedorDepois  = saldoVendedorAntes + valorTransacao

        const eDeb = await supabase.from('times').update({ saldo: saldoCompradorDepois }).eq('id', proposta.id_time_origem)
        if (eDeb.error) throw eDeb.error
        const eCred = await supabase.from('times').update({ saldo: saldoVendedorDepois }).eq('id', proposta.id_time_alvo)
        if (eCred.error) throw eCred.error

        await registrarMovimentacao({
          id_time: proposta.id_time_origem,
          tipo: 'saida',
          valor: valorTransacao,
          descricao: `Compra de ${jogadorData.nome} via proposta`,
        })
        await registrarMovimentacao({
          id_time: proposta.id_time_alvo,
          tipo: 'entrada',
          valor: valorTransacao,
          descricao: `Venda de ${jogadorData.nome} via proposta`,
        })

        // ——— BID (compra/venda com valor) com nomes dos oferecidos quando for TROCA COMPOSTA ———
        const extraTroca = (isTrocaComposta && offeredNamesForBid.length)
          ? ` + ${offeredNamesForBid.join(', ')}`
          : ''
        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `O ${vendedor.nome} vendeu ${jogadorData.nome} ao ${comprador.nome} por ${toBRL(valorTransacao)}${extraTroca}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: valorTransacao,
          data_evento: new Date().toISOString(),
        })

        toast.success(`💰 Caixa do ${vendedor.nome}: ${toBRL(saldoVendedorAntes)} → ${toBRL(saldoVendedorDepois)}`)
        toast(`💸 Caixa do ${comprador.nome}: ${toBRL(saldoCompradorAntes)} → ${toBRL(saldoCompradorDepois)}`, { icon: '🏦' })
      } else {
        const r1 = await supabase.from('times').select('nome').eq('id', proposta.id_time_origem).single()
        const r2 = await supabase.from('times').select('nome').eq('id', proposta.id_time_alvo).single()
        comprador = r1.data
        vendedor  = r2.data

        const listaTroca = offeredNamesForBid.length ? ` + ${offeredNamesForBid.join(', ')}` : ''
        await supabase.from('bid').insert({
          tipo_evento: 'transferencia',
          descricao: `Troca: ${vendedor?.nome || 'time A'} ↔ ${comprador?.nome || 'time B'} envolvendo ${jogadorData.nome}${listaTroca}.`,
          id_time1: proposta.id_time_alvo,
          id_time2: proposta.id_time_origem,
          valor: 0,
          data_evento: new Date().toISOString(),
        })

        toast('🔁 Troca realizada sem movimentação de caixa.', { icon: '🤝' })
      }

      // 3) Alvo → vai para o comprador
      const updatesAlvo: any = { id_time: proposta.id_time_origem, jogos: 0 }
      if (isDinheiro || (isTrocaComposta && valorTransacao > 0)) {
        updatesAlvo.valor   = valorTransacao
        updatesAlvo.salario = Math.round(valorTransacao * 0.007)
      }
      const eAlvo = await supabase.from('elenco').update(updatesAlvo).eq('id', proposta.jogador_id)
      if (eAlvo.error) throw eAlvo.error

      // 4) Oferecidos → vão para o vendedor (time ALVO)
      if (isTrocaSimples || isTrocaComposta) {
        const oferecidosIds = extractOfferedIds(proposta.jogadores_oferecidos)

        if (oferecidosIds.length) {
          // update em lote + returning pra conferir quem moveu
          const { data: moved, error: eOf } = await supabase
            .from('elenco')
            .update({ id_time: proposta.id_time_alvo, jogos: 0 })
            .in('id', oferecidosIds)
            .select('id') // <= retorna os ids atualizados
          if (eOf) throw eOf

          const movedSet = new Set((moved || []).map((r) => r.id))
          const notMoved = oferecidosIds.filter((id) => !movedSet.has(id))

          if (notMoved.length) {
            // tenta descobrir nomes para o aviso
            const nomes = notMoved.map((id) => jogadoresOferecidosData[id] || id)
            toast.error(`⚠️ Alguns oferecidos não foram transferidos: ${nomes.join(', ')}`)
            console.warn('Ids não movidos (oferecidos):', notMoved)
          }
        }
      }

      // 5) Notificação
      await supabase.from('notificacoes').insert({
        id_time: proposta.id_time_origem,
        titulo: '✅ Proposta aceita!',
        mensagem: `Sua proposta pelo jogador ${jogadorData.nome} foi aceita.`,
      })

      // 6) Estado local
      setPendentes((prev) => prev.filter((p) => p.id !== proposta.id))
      setConcluidas((prev) => [{ ...proposta, status: 'aceita' }, ...prev].slice(0, 5))
    } catch (err) {
      console.error(err)
      toast.error('Erro ao processar a proposta.')
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
      toast('Proposta recusada.', { icon: '❌' })
    }
  }

  const renderCard = (p: any) => {
    const jog = jogadores[p.jogador_id]
    const valorLabel = toBRL(p.valor_oferecido == null ? null : Number(p.valor_oferecido))

    // nomes dos oferecidos para exibir
    const offeredIds = extractOfferedIds(p.jogadores_oferecidos)
    const oferecidosNomes = offeredIds.map((id) => jogadoresOferecidosData[id] || id).join(', ') || null

    return (
      <div
        key={p.id}
        className="border border-gray-700 rounded-lg p-3 w-[260px] flex flex-col items-center bg-gray-800 shadow-sm"
      >
        <img
          src={jog?.imagem_url || '/jogador_padrao.png'}
          alt={jog?.nome || 'Jogador'}
          className="w-16 h-16 rounded-full object-cover mb-2 ring-2 ring-gray-700"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/jogador_padrao.png' }}
        />
        <div className="text-center text-sm font-semibold text-white">{jog?.nome || 'Jogador'}</div>
        <div className="text-xs text-gray-300">
          {jog?.posicao || '—'} • De: <span className="text-gray-200">{p.nome_time_origem}</span>
        </div>

        <div className="text-xs text-gray-300 mt-1">
          Tipo: <span className="capitalize text-gray-100">{String(p.tipo_proposta).replace('_', ' ')}</span><br />
          Status:{' '}
          {p.status === 'pendente' ? <span className="text-yellow-400">⏳</span> :
           p.status === 'aceita'   ? <span className="text-emerald-400">✅</span> :
                                     <span className="text-red-400">❌</span>}
        </div>

        <div className="text-sm font-bold mt-2 text-emerald-400">{valorLabel}</div>

        {['comprar_percentual', 'percentual'].includes(String(p.tipo_proposta).toLowerCase()) && (
          <div className="text-xs mt-1 text-gray-300">📊 Percentual: {p.percentual_desejado}%</div>
        )}

        {oferecidosNomes && (
          <div className="text-xs mt-2 text-center text-gray-300">
            🧩 Oferecidos:<br />
            <span className="text-gray-100">{oferecidosNomes}</span>
          </div>
        )}

        {p.status === 'pendente' && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => aceitarProposta(p)}
              className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50"
              disabled={loadingPropostaId === p.id}
            >
              {loadingPropostaId === p.id ? '⏳' : '✅ Aceitar'}
            </button>
            <button
              onClick={() => recusarProposta(p.id)}
              className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded"
            >
              ❌ Recusar
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-xl font-bold mb-4">📥 Propostas Recebidas</h1>

      <h2 className="text-md font-semibold mb-2">⏳ Pendentes (últimas 10)</h2>
      {pendentes.length === 0 && <p className="text-gray-400">Nenhuma proposta pendente.</p>}
      <div className="flex flex-wrap gap-4">{pendentes.map(renderCard)}</div>

      <h2 className="text-md font-semibold my-4">📜 Concluídas (últimas 5)</h2>
      {concluidas.length === 0 && <p className="text-gray-400">Nenhuma proposta concluída.</p>}
      <div className="flex flex-wrap gap-4">{concluidas.map(renderCard)}</div>
    </div>
  )
}

