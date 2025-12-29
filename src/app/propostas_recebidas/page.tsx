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
    obj.id ?? obj.jogador_id ?? obj.player_id ?? obj.elenco_id ?? obj.jogadorId ?? obj.playerId ?? null
  if (cand == null) return null
  const s = String(cand).trim()
  return s || null
}

const extractOfferedIds = (raw: any): string[] => {
  const arr: any[] = Array.isArray(raw) ? raw : []
  const ids = arr
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (isObj(item)) return pickAnyId(item)
      return String(item || '').trim()
    })
    .filter(Boolean) as string[]

  const unique = Array.from(new Set(ids.map((s) => s.trim())))
  return unique.filter((s) => isUUID(s))
}

// ====== UI micro-components ======
function Badge({ children, className = '' }: { children: any; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  )
}

function Pill({ status }: { status: 'pendente' | 'aceita' | 'recusada' }) {
  if (status === 'pendente') return <Badge className="bg-amber-500/10 text-amber-300 ring-amber-500/30">⏳ Pendente</Badge>
  if (status === 'aceita') return <Badge className="bg-emerald-500/10 text-emerald-300 ring-emerald-500/30">✅ Aceita</Badge>
  return <Badge className="bg-rose-500/10 text-rose-300 ring-rose-500/30">❌ Recusada</Badge>
}

function TipoBadge({ tipo }: { tipo: string }) {
  const t = String(tipo || '').replaceAll('_', ' ')
  const map: Record<string, string> = {
    dinheiro: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
    troca: 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30',
    'troca simples': 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30',
    'troca composta': 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30',
    percentual: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
    'comprar percentual': 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  }
  const style = map[t.toLowerCase()] || 'bg-slate-500/10 text-slate-300 ring-slate-500/30'
  return <Badge className={style}>🏷️ {t}</Badge>
}

function ActionButton({
  onClick,
  variant = 'primary',
  disabled,
  children,
  title,
}: {
  onClick?: () => void
  variant?: 'primary' | 'danger'
  disabled?: boolean
  children: any
  title?: string
}) {
  const base = 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:opacity-50'
  const styles =
    variant === 'primary'
      ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_6px_20px_-8px_rgba(16,185,129,0.7)] hover:brightness-110 active:scale-[0.98] focus-visible:ring-emerald-400'
      : 'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_6px_20px_-8px_rgba(244,63,94,0.7)] hover:brightness-110 active:scale-[0.98] focus-visible:ring-rose-400'
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`} title={title}>
      {children}
    </button>
  )
}

// ===================

export default function PropostasRecebidasPage() {
  const [pendentes, setPendentes] = useState<any[]>([])
  const [concluidas, setConcluidas] = useState<any[]>([])
  const [jogadores, setJogadores] = useState<any>({})
  const [jogadoresOferecidosData, setJogadoresOferecidosData] = useState<any>({})
  const [idTime, setIdTime] = useState<string>('')
  const [loadingPropostaId, setLoadingPropostaId] = useState<string | null>(null)
  const [deletingPropostaId, setDeletingPropostaId] = useState<string | null>(null)

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
      ].filter(Boolean)
      if (idsJogadores.length > 0) await buscarJogadores(idsJogadores)

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
      if (data)
        setJogadoresOferecidosData((prev: any) => ({
          ...prev,
          ...Object.fromEntries(data.map((j) => [j.id, j.nome]))
        }))
    }

    buscarPropostas()
  }, [])

  const aceitarProposta = async (proposta: any) => {
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

    const tipo = String(proposta.tipo_proposta || '').trim().toLowerCase()
    const dinheiroOferecido: number | null = proposta.valor_oferecido == null ? null : Number(proposta.valor_oferecido)

    const isTrocaSimples = tipo === 'troca_simples'
    const isTrocaComposta = tipo === 'troca_composta'
    const isDinheiro = tipo === 'dinheiro'
    const isPercentual = tipo === 'comprar_percentual' || tipo === 'percentual'

    let valorTransacao = 0
    if (isDinheiro) {
      valorTransacao = Math.max(0, Number(dinheiroOferecido ?? 0))
    } else if (isTrocaComposta) {
      valorTransacao = dinheiroOferecido && dinheiroOferecido > 0 ? Number(dinheiroOferecido) : 0
    } else if (isPercentual) {
      const perc = Number(proposta.percentual_desejado || proposta.percentual || 0)
      valorTransacao = Math.round(Number(jogadorData.valor || 0) * (perc / 100))
    }

    const offeredIdsForBid: string[] = extractOfferedIds(proposta.jogadores_oferecidos)
    let offeredNamesForBid: string[] = []
    if (offeredIdsForBid.length) {
      const { data: offeredRows } = await supabase
        .from('elenco')
        .select('id, nome')
        .in('id', offeredIdsForBid)
      offeredNamesForBid = (offeredRows || []).map((r) => r.nome).filter(Boolean)
    }

    try {
      const { error: eStatus } = await supabase
        .from('propostas_app')
        .update({ status: 'aceita', aceita_em: new Date().toISOString() })
        .eq('id', proposta.id)
      if (eStatus) throw eStatus

      let comprador: any = null
      let vendedor: any = null
      if (valorTransacao > 0) {
        const r1 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_origem).single()
        const r2 = await supabase.from('times').select('saldo, nome').eq('id', proposta.id_time_alvo).single()
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        comprador = r1.data
        vendedor = r2.data

        const saldoCompradorAntes = Number(comprador.saldo || 0)
        const saldoVendedorAntes = Number(vendedor.saldo || 0)
        const saldoCompradorDepois = saldoCompradorAntes - valorTransacao
        const saldoVendedorDepois = saldoVendedorAntes + valorTransacao

        const eDeb = await supabase.from('times').update({ saldo: saldoCompradorDepois }).eq('id', proposta.id_time_origem)
        if (eDeb.error) throw eDeb.error
        const eCred = await supabase.from('times').update({ saldo: saldoVendedorDepois }).eq('id', proposta.id_time_alvo)
        if (eCred.error) throw eCred.error

        await registrarMovimentacao({ id_time: proposta.id_time_origem, tipo: 'saida', valor: valorTransacao, descricao: `Compra de ${jogadorData.nome} via proposta` })
        await registrarMovimentacao({ id_time: proposta.id_time_alvo, tipo: 'entrada', valor: valorTransacao, descricao: `Venda de ${jogadorData.nome} via proposta` })

        const extraTroca = isTrocaComposta && offeredNamesForBid.length ? ` + ${offeredNamesForBid.join(', ')}` : ''
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
        vendedor = r2.data

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

      const updatesAlvo: any = {
  id_time: proposta.id_time_origem,
  jogos: 0
}

// ✅ SOMENTE compra direta altera valor e salário
if (isDinheiro) {
  updatesAlvo.valor = valorTransacao
  updatesAlvo.salario = Math.round(valorTransacao * 0.0075)
}

      const eAlvo = await supabase.from('elenco').update(updatesAlvo).eq('id', proposta.jogador_id)
      if (eAlvo.error) throw eAlvo.error

      if (isTrocaSimples || isTrocaComposta) {
        const oferecidosIds = extractOfferedIds(proposta.jogadores_oferecidos)
        if (oferecidosIds.length) {
          const { data: moved, error: eOf } = await supabase
            .from('elenco')
            .update({ id_time: proposta.id_time_alvo, jogos: 0 })
            .in('id', oferecidosIds)
            .select('id')
          if (eOf) throw eOf

          const movedSet = new Set((moved || []).map((r) => r.id))
          const notMoved = oferecidosIds.filter((id) => !movedSet.has(id))
          if (notMoved.length) {
            const nomes = notMoved.map((id) => jogadoresOferecidosData[id] || id)
            toast.error(`⚠️ Alguns oferecidos não foram transferidos: ${nomes.join(', ')}`)
            console.warn('Ids não movidos (oferecidos):', notMoved)
          }
        }
      }

      await supabase.from('notificacoes').insert({
        id_time: proposta.id_time_origem,
        titulo: '✅ Proposta aceita!',
        mensagem: `Sua proposta pelo jogador ${jogadorData.nome} foi aceita.`,
      })

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

  const excluirProposta = async (p: any) => {
    const textoAviso = p.status === 'aceita'
      ? 'Excluir esta proposta do histórico? Isso NÃO desfaz a transferência.'
      : 'Excluir esta proposta?'
    if (!window.confirm(textoAviso)) return
    if (deletingPropostaId === p.id) return
    setDeletingPropostaId(p.id)
    try {
      const { error } = await supabase.from('propostas_app').delete().eq('id', p.id)
      if (error) throw error
      setPendentes((prev) => prev.filter((x) => x.id !== p.id))
      setConcluidas((prev) => prev.filter((x) => x.id !== p.id))
      toast.success('Proposta excluída.')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao excluir a proposta.')
    } finally {
      setDeletingPropostaId(null)
    }
  }

  const renderCard = (p: any) => {
    const jog = jogadores[p.jogador_id]
    const valorLabel = toBRL(p.valor_oferecido == null ? null : Number(p.valor_oferecido))
    const offeredIds = extractOfferedIds(p.jogadores_oferecidos)
    const oferecidosNomes = offeredIds.map((id) => jogadoresOferecidosData[id] || id).join(', ') || null

    return (
      <div key={p.id} className="group relative w-full min-w-[260px] overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-start gap-3">
          <img
            src={jog?.imagem_url || '/jogador_padrao.png'}
            alt={jog?.nome || 'Jogador'}
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/10"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/jogador_padrao.png' }}
          />

          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white/90">{jog?.nome || 'Jogador'}</h3>
              <TipoBadge tipo={String(p.tipo_proposta)} />
              <Pill status={p.status as any} />
            </div>
            <p className="mt-0.5 text-xs text-slate-300/90">
              {jog?.posicao || '—'} • De: <span className="text-slate-100/90">{p.nome_time_origem}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-base font-bold tracking-tight text-emerald-400">{valorLabel}</div>
          {['comprar_percentual', 'percentual'].includes(String(p.tipo_proposta).toLowerCase()) && (
            <div className="text-xs text-slate-300">📊 {p.percentual_desejado}%</div>
          )}
        </div>

        {oferecidosNomes && (
          <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-slate-200 ring-1 ring-white/10">
            🧩 <span className="font-medium text-slate-50">Oferecidos:</span> {oferecidosNomes}
          </div>
        )}

        {p.status === 'pendente' ? (
          <div className="mt-4 flex gap-2">
            <ActionButton onClick={() => aceitarProposta(p)} variant="primary" disabled={loadingPropostaId === p.id} title="Aceitar proposta">
              {loadingPropostaId === p.id ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Processando
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">✅ Aceitar</span>
              )}
            </ActionButton>

            <ActionButton onClick={() => recusarProposta(p.id)} variant="danger" title="Recusar proposta">
              ❌ Recusar
            </ActionButton>

            <ActionButton onClick={() => excluirProposta(p)} variant="danger" disabled={deletingPropostaId === p.id} title="Excluir proposta">
              {deletingPropostaId === p.id ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Excluindo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">🗑️ Excluir</span>
              )}
            </ActionButton>
          </div>
        ) : (
          <div className="mt-4 flex justify-end">
            <ActionButton onClick={() => excluirProposta(p)} variant="danger" disabled={deletingPropostaId === p.id} title="Excluir proposta">
              {deletingPropostaId === p.id ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Excluindo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">🗑️ Excluir</span>
              )}
            </ActionButton>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-white/10 bg-slate-950/80 px-4 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-end justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">📥 Propostas Recebidas</h1>
              <p className="mt-1 text-xs text-slate-300/80">Gerencie ofertas do mercado: aceite, recuse, exclua e acompanhe trocas.</p>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-200 ring-emerald-500/30">{pendentes.length} pendentes</Badge>
              <Badge className="bg-slate-500/10 text-slate-200 ring-slate-500/30">{concluidas.length} concluídas</Badge>
            </div>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white/90">⏳ Pendentes (últimas 10)</h2>
          </div>
          {pendentes.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Nenhuma proposta pendente.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {pendentes.map(renderCard)}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white/90">📜 Concluídas (últimas 5)</h2>
          {concluidas.length === 0 ? (
            <p className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-slate-300">Nenhuma proposta concluída.</p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {concluidas.map(renderCard)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
