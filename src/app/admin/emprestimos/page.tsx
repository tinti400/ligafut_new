'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

type Emprestimo = {
  id: string
  id_time: string
  nome_time: string | null
  valor_total: number
  parcelas_totais: number
  parcelas_restantes: number
  valor_parcela: number
  juros: number
  status: 'ativo' | 'quitado' | 'cancelado'
  data_inicio: string | null
  jogador_garantia: { nome: string; posicao: string; valor: number } | null
}

type TimeInfo = {
  id: string
  nome: string
  saldo: number
  divisao: string | number | null
  logo_url: string | null
}

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateISO(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function EmprestimosAdminPage() {
  const { isAdmin } = useAdmin()

  const [loading, setLoading] = useState(true)
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeInfo>>({})
  const [statusFiltro, setStatusFiltro] = useState<'ativo' | 'quitado' | 'todos'>('ativo')
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<'data' | 'parcela' | 'parcelas_restantes'>('data')
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState<string | null>(null) // emprestimo.id em processamento

  useEffect(() => {
    if (!isAdmin) return
    carregar()
  }, [isAdmin, statusFiltro])

  async function carregar() {
    setLoading(true)
    setMensagem(null)
    try {
      // 1) Buscar empréstimos
      let query = supabase
        .from('emprestimos')
        .select(
          'id, id_time, nome_time, valor_total, parcelas_totais, parcelas_restantes, valor_parcela, juros, status, data_inicio, jogador_garantia'
        )

      if (statusFiltro !== 'todos') query = query.eq('status', statusFiltro)
      // Ordenação por padrão (mais recentes primeiro)
      const { data: emp, error: errEmp } = await query.order('data_inicio', { ascending: false })

      if (errEmp) throw new Error(`Erro ao buscar empréstimos: ${errEmp.message}`)

      const emprestimosData = (emp || []) as Emprestimo[]
      setEmprestimos(emprestimosData)

      // 2) Buscar times relacionados
      const ids = Array.from(new Set(emprestimosData.map((e) => e.id_time))).filter(Boolean)
      if (ids.length === 0) {
        setTimesMap({})
        setLoading(false)
        return
      }

      const { data: times, error: errTimes } = await supabase
        .from('times')
        .select('id, nome, saldo, divisao, logo_url')
        .in('id', ids)

      if (errTimes) throw new Error(`Erro ao buscar times: ${errTimes.message}`)

      const mapa: Record<string, TimeInfo> = {}
      ;(times || []).forEach((t: any) => {
        mapa[t.id] = {
          id: t.id,
          nome: t.nome,
          saldo: t.saldo ?? 0,
          divisao: t.divisao ?? null,
          logo_url: t.logo_url ?? null
        }
      })
      setTimesMap(mapa)
    } catch (e: any) {
      setMensagem(e.message || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    let base = emprestimos
    if (termo) {
      base = base.filter((e) => {
        const nomeA = (e.nome_time || '').toLowerCase()
        const nomeB = (timesMap[e.id_time]?.nome || '').toLowerCase()
        return nomeA.includes(termo) || nomeB.includes(termo)
      })
    }
    switch (ordenacao) {
      case 'parcela':
        return base.slice().sort((a, b) => b.valor_parcela - a.valor_parcela)
      case 'parcelas_restantes':
        return base.slice().sort((a, b) => b.parcelas_restantes - a.parcelas_restantes)
      default:
        // data
        return base.slice().sort((a, b) => {
          const da = a.data_inicio ? new Date(a.data_inicio).getTime() : 0
          const db = b.data_inicio ? new Date(b.data_inicio).getTime() : 0
          return db - da
        })
    }
  }, [emprestimos, busca, ordenacao, timesMap])

  async function cobrarParcela(emprestimo: Emprestimo) {
    setMensagem(null)
    setCobrando(emprestimo.id)

    const time = timesMap[emprestimo.id_time]
    if (!time) {
      setMensagem('Time não encontrado.')
      setCobrando(null)
      return
    }

    // Checagem rápida de saldo no client (ajuda UX; o RPC garantirá atomicamente no servidor)
    if ((time.saldo ?? 0) < emprestimo.valor_parcela) {
      setMensagem(`🚫 Saldo insuficiente no time "${time.nome}" para cobrar esta parcela.`)
      setCobrando(null)
      return
    }

    try {
      // 🔒 1) Tenta COBRAR de forma ATÔMICA via RPC (recomendado)
      const { error: rpcErr } = await supabase.rpc('cobrar_parcela_emprestimo', {
        p_emprestimo_id: emprestimo.id
      })

      if (!rpcErr) {
        // Sucesso (RPC)
        setMensagem(`✅ Parcela cobrada (time: ${time.nome}).`)
        await carregar()
        setCobrando(null)
        return
      }

      // 2) Fallback não-atômico (se RPC não existir)
      console.warn('RPC cobrar_parcela_emprestimo indisponível. Usando fallback não-atômico.', rpcErr)

      // 2a) Debita saldo do time (não atômico)
      const novoSaldo = (time.saldo ?? 0) - emprestimo.valor_parcela
      if (novoSaldo < 0) {
        setMensagem(`🚫 Saldo insuficiente no time "${time.nome}" para cobrar esta parcela.`)
        setCobrando(null)
        return
      }

      const { error: upSaldoErr } = await supabase
        .from('times')
        .update({ saldo: novoSaldo })
        .eq('id', time.id)

      if (upSaldoErr) throw new Error(`Erro ao debitar saldo: ${upSaldoErr.message}`)

      // 2b) Atualiza parcelas do empréstimo
      const novasRestantes = emprestimo.parcelas_restantes - 1
      const novoStatus = novasRestantes <= 0 ? 'quitado' : 'ativo'

      const { error: upEmpErr } = await supabase
        .from('emprestimos')
        .update({
          parcelas_restantes: novasRestantes,
          status: novoStatus
        })
        .eq('id', emprestimo.id)

      if (upEmpErr) throw new Error(`Erro ao atualizar empréstimo: ${upEmpErr.message}`)

      setMensagem(`✅ Parcela cobrada (time: ${time.nome}).`)
      await carregar()
    } catch (e: any) {
      setMensagem(e.message || 'Erro ao cobrar parcela.')
    } finally {
      setCobrando(null)
    }
  }

  if (!isAdmin) {
    return (
      <main
        style={{
          maxWidth: 960,
          margin: '40px auto',
          padding: 20,
          color: '#eee',
          backgroundColor: '#121212',
          borderRadius: 12,
          boxShadow: '0 0 10px #000',
          fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
        }}
      >
        <h1 style={{ textAlign: 'center' }}>🔒 Acesso restrito</h1>
        <p style={{ textAlign: 'center', marginTop: 12 }}>
          Você precisa ser administrador para visualizar esta página.
        </p>
      </main>
    )
  }

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: '40px auto',
        padding: 20,
        color: '#eee',
        backgroundColor: '#121212',
        borderRadius: 12,
        boxShadow: '0 0 10px #000',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: 8 }}>🏦 Empréstimos — Admin</h1>
      <p style={{ textAlign: 'center', marginBottom: 24, color: '#bbb' }}>
        Visualize e cobre parcelas dos empréstimos ativos dos clubes.
      </p>

      {/* Filtros */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 200px 140px',
          gap: 12,
          marginBottom: 16
        }}
      >
        <input
          placeholder="Buscar por time..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#1d1d1d',
            color: '#eee'
          }}
        />
        <select
          value={statusFiltro}
          onChange={(e) => setStatusFiltro(e.target.value as any)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#1d1d1d',
            color: '#eee'
          }}
        >
          <option value="ativo">Ativos</option>
          <option value="quitado">Quitados</option>
          <option value="todos">Todos</option>
        </select>

        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value as any)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: '#1d1d1d',
            color: '#eee'
          }}
        >
          <option value="data">Mais recentes</option>
          <option value="parcela">Maior parcela</option>
          <option value="parcelas_restantes">Mais parcelas restantes</option>
        </select>

        <button
          onClick={carregar}
          disabled={loading}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #333',
            background: loading ? '#333' : '#2e7d32',
            color: '#fff',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Atualizando...' : '↻ Atualizar'}
        </button>
      </div>

      {mensagem && (
        <div
          style={{
            background: '#1e2a1e',
            border: '1px solid #2e7d32',
            color: '#bde5bd',
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 16
          }}
        >
          {mensagem}
        </div>
      )}

      {/* Tabela */}
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid #222',
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#1a1a1a' }}>
              <th style={th}>Time</th>
              <th style={th}>Divisão</th>
              <th style={th}>Saldo Atual</th>
              <th style={th}>Parcela</th>
              <th style={th}>Parcelas (rest./tot.)</th>
              <th style={th}>Juros</th>
              <th style={th}>Garantia</th>
              <th style={th}>Início</th>
              <th style={thCenter}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...td, textAlign: 'center', padding: 24, color: '#bbb' }}>
                  Nenhum empréstimo encontrado.
                </td>
              </tr>
            )}

            {listaFiltrada.map((e) => {
              const t = timesMap[e.id_time]
              const nomeExibicao = e.nome_time || t?.nome || '—'
              const divisao = t?.divisao ?? '—'
              const saldo = t?.saldo ?? 0
              return (
                <tr key={e.id} style={{ borderTop: '1px solid #202020' }}>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {t?.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.logo_url}
                          alt={nomeExibicao}
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: '#333',
                            display: 'grid',
                            placeItems: 'center',
                            color: '#999',
                            fontSize: 12
                          }}
                        >
                          ?
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 700 }}>{nomeExibicao}</div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>#{t?.id ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>{String(divisao).toUpperCase()}</td>
                  <td style={{ ...td, fontWeight: 700, color: saldo < e.valor_parcela ? '#f44336' : '#c8e6c9' }}>
                    {formatBRL(saldo)}
                  </td>
                  <td style={td}>{formatBRL(e.valor_parcela)}</td>
                  <td style={td}>
                    <b>{e.parcelas_restantes}</b> / {e.parcelas_totais}
                  </td>
                  <td style={td}>{(e.juros * 100).toFixed(0)}%</td>
                  <td style={td}>
                    {e.jogador_garantia
                      ? `${e.jogador_garantia.nome} (${e.jogador_garantia.posicao})`
                      : '—'}
                  </td>
                  <td style={td}>{formatDateISO(e.data_inicio)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {e.status === 'ativo' && e.parcelas_restantes > 0 ? (
                      <button
                        onClick={() => cobrarParcela(e)}
                        disabled={cobrando === e.id}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: cobrando === e.id ? '#666' : '#1976d2',
                          color: '#fff',
                          fontWeight: 700,
                          cursor: cobrando === e.id ? 'not-allowed' : 'pointer',
                          boxShadow:
                            cobrando === e.id ? 'none' : '0 4px 10px rgba(25,118,210,0.45)'
                        }}
                      >
                        {cobrando === e.id ? 'Processando...' : '💸 Cobrar 1 parcela'}
                      </button>
                    ) : (
                      <span style={{ color: '#90caf9' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, color: '#aaa', fontSize: 13 }}>
        Dica: para **cobrança atômica** e segura, crie a função SQL abaixo (RPC). O painel já tenta usá-la.
      </p>
    </main>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 700,
  color: '#cfd8dc',
  borderBottom: '1px solid #222',
  whiteSpace: 'nowrap'
}
const thCenter: React.CSSProperties = { ...th, textAlign: 'center' }
const td: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: '#e0e0e0',
  verticalAlign: 'middle'
}
