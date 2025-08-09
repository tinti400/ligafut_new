'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

async function registrarNoBID({
  tipo_evento,
  descricao,
  id_time1,
  id_time2 = null,
  valor = null,
}: {
  tipo_evento: string
  descricao: string
  id_time1: string
  id_time2?: string | null
  valor?: number | null
}) {
  const { error } = await supabase.from('bid').insert({
    tipo_evento,
    descricao,
    id_time1,
    id_time2,
    valor,
    data_evento: new Date(),
  })
  if (error) console.error('Erro ao registrar no BID:', error.message)
}

export default function LeiloesFinalizadosPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null)

  const [leiloes, setLeiloes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroTime, setFiltroTime] = useState('')

  // ---------------- Verificação de admin ----------------
  useEffect(() => {
    const verificarAdmin = async () => {
      try {
        setCarregando(true)
        setMotivoBloqueio(null)

        // 1) pega email via Auth; fallback para localStorage
        const { data: authData } = await supabase.auth.getUser()
        const emailAuth = authData?.user?.email || null
        const emailLS = (localStorage.getItem('email') || '').trim() || null

        const emailUsuario = (emailAuth || emailLS)?.toLowerCase().trim() || null
        if (!emailUsuario) {
          setIsAdmin(false)
          setMotivoBloqueio('Sem email para validar (não autenticado).')
          setCarregando(false)
          return
        }

        // 2) consulta admins sem quebrar quando não encontra (case-insensitive)
        const { data, error, status } = await supabase
          .from('admins')
          .select('email')
          .ilike('email', emailUsuario) // match exato ignorando caixa
          .maybeSingle()

        if (error) {
          // 401/403 → geralmente RLS/permissão
          setIsAdmin(false)
          setMotivoBloqueio(
            `Erro consultando admins (status ${status}): ${error.message}. Verifique RLS/policies.`
          )
          setCarregando(false)
          return
        }

        setIsAdmin(!!data)
        setCarregando(false)
      } catch (e: any) {
        console.error('Falha geral na verificação de admin:', e)
        setIsAdmin(false)
        setMotivoBloqueio(e?.message || 'Falha ao verificar admin.')
        setCarregando(false)
      }
    }

    verificarAdmin()
  }, [])

  // ---------------- Dados ----------------
  useEffect(() => {
    if (isAdmin) buscarLeiloesFinalizados()
  }, [isAdmin])

  const buscarLeiloesFinalizados = async () => {
    try {
      setCarregando(true)
      const { data, error } = await supabase
        .from('leiloes_sistema')
        .select('*')
        .eq('status', 'leiloado')
        .order('fim', { ascending: false })

      if (error) {
        console.error('Erro ao buscar leilões finalizados:', error)
        setLeiloes([])
      } else {
        setLeiloes(data || [])
      }
    } finally {
      setCarregando(false)
    }
  }

  const enviarParaElenco = async (leilao: any) => {
    if (!leilao.id_time_vencedor) {
      alert('❌ Este leilão não possui time vencedor.')
      return
    }

    const salario = Math.round(leilao.valor_atual * 0.007)

    const { error: erroInsert } = await supabase.from('elenco').insert({
      id_time: leilao.id_time_vencedor,
      nome: leilao.nome,
      posicao: leilao.posicao,
      overall: leilao.overall,
      valor: leilao.valor_atual,
      salario,
      imagem_url: leilao.imagem_url || '',
      link_sofifa: leilao.link_sofifa || '',
      nacionalidade: leilao.nacionalidade || '',
      jogos: 0,
    })
    if (erroInsert) {
      console.error('❌ Erro ao enviar para elenco:', erroInsert)
      alert(`❌ Erro ao enviar para elenco:\n${erroInsert.message}`)
      return
    }

    const { data: timeData, error: errorBusca } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', leilao.id_time_vencedor)
      .single()
    if (errorBusca || !timeData) {
      console.error('❌ Erro ao buscar saldo:', errorBusca)
      alert('Erro ao buscar saldo do time.')
      return
    }

    const novoSaldo = timeData.saldo - leilao.valor_atual
    await supabase.from('times').update({ saldo: novoSaldo }).eq('id', leilao.id_time_vencedor)

    await registrarMovimentacao({
      id_time: leilao.id_time_vencedor,
      tipo: 'saida',
      valor: leilao.valor_atual,
      descricao: `Compra de ${leilao.nome} via leilão`,
    })

    await registrarNoBID({
      tipo_evento: 'compra',
      descricao: `Time comprou o jogador ${leilao.nome} no leilão por R$${leilao.valor_atual.toLocaleString()}`,
      id_time1: leilao.id_time_vencedor,
      valor: leilao.valor_atual,
    })

    await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)

    alert('✅ Jogador enviado ao elenco e saldo debitado!')
    location.reload()
  }

  const excluirLeilao = async (leilao: any) => {
    if (!confirm('❗ Tem certeza que deseja excluir este leilão?')) return
    await supabase.from('leiloes_sistema').delete().eq('id', leilao.id)
    setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))
    alert('✅ Leilão excluído com sucesso!')
  }

  const leiloesFiltrados = leiloes.filter((leilao) => {
    const matchPosicao = filtroPosicao ? leilao.posicao === filtroPosicao : true
    const matchTime = filtroTime
      ? leilao.nome_time_vencedor?.toLowerCase().includes(filtroTime.toLowerCase())
      : true
    return matchPosicao && matchTime
  })

  // ---------------- UI ----------------
  if (isAdmin === null || carregando) {
    return <p className="text-center mt-10 text-white">Verificando permissão...</p>
  }

  if (isAdmin === false) {
    return (
      <main className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-2 text-red-500 text-center">
        <div className="text-xl font-semibold">🚫 Você não tem permissão para acessar esta página.</div>
        {motivoBloqueio && (
          <div className="text-sm text-red-300 max-w-xl px-4">Detalhe: {motivoBloqueio}</div>
        )}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto bg-gray-800 shadow-xl rounded-xl p-6">
        <h1 className="text-3xl font-bold text-center mb-6 text-green-400">📜 Leilões Finalizados</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <select
            className="p-2 border rounded text-black"
            value={filtroPosicao}
            onChange={(e) => setFiltroPosicao(e.target.value)}
          >
            <option value="">📌 Todas as Posições</option>
            {POSICOES.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="🔍 Buscar por Time Vencedor"
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="p-2 border rounded text-black"
          />
          <button
            onClick={() => {
              setFiltroPosicao('')
              setFiltroTime('')
            }}
            className="bg-gray-300 hover:bg-gray-400 text-black py-2 px-4 rounded"
          >
            ❌ Limpar Filtros
          </button>
        </div>

        {leiloesFiltrados.length === 0 ? (
          <p className="text-center text-gray-400 italic">Nenhum leilão encontrado com os filtros.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leiloesFiltrados.map((leilao) => (
              <div
                key={leilao.id}
                className="border rounded p-4 shadow bg-gray-700 hover:bg-gray-600 transition"
              >
                {leilao.imagem_url && (
                  <img
                    src={leilao.imagem_url}
                    alt={leilao.nome}
                    className="w-full h-48 object-cover rounded mb-2 border"
                  />
                )}
                <p className="font-bold text-lg">
                  {leilao.nome} ({leilao.posicao})
                </p>
                <p className="text-gray-300">⭐ Overall: {leilao.overall}</p>
                <p className="text-gray-300">🌍 {leilao.nacionalidade}</p>
                <p className="text-yellow-400">💰 R$ {Number(leilao.valor_atual).toLocaleString()}</p>
                <p className="text-gray-300">🏆 {leilao.nome_time_vencedor || '— Sem Vencedor'}</p>
                <p className="text-xs text-gray-400 mt-1">
                  🕒 {new Date(leilao.fim).toLocaleString('pt-BR')}
                </p>

                {leilao.link_sofifa && (
                  <a
                    href={leilao.link_sofifa}
                    target="_blank"
                    className="text-blue-400 text-sm mt-2 inline-block hover:underline"
                  >
                    🔗 Ver no Sofifa
                  </a>
                )}

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {leilao.id_time_vencedor && (
                    <button
                      onClick={() => enviarParaElenco(leilao)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
                    >
                      ➕ Enviar para Elenco
                    </button>
                  )}
                  <button
                    onClick={() => excluirLeilao(leilao)}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded"
                  >
                    🗑️ Excluir Leilão
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
