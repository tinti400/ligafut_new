'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const POSICOES = ['GL', 'LD', 'ZAG', 'LE', 'VOL', 'MC', 'MD', 'MEI', 'ME', 'PD', 'PE', 'SA', 'CA']

// salário padrão (1% do valor)
const calcularSalario = (valor: number | null | undefined) =>
  Math.round(Number(valor || 0) * 0.01)

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

type TimeRow = { id: string; nome: string }

export default function LeiloesFinalizadosPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [motivoBloqueio, setMotivoBloqueio] = useState<string | null>(null)

  const [leiloes, setLeiloes] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroPosicao, setFiltroPosicao] = useState('')
  const [filtroTime, setFiltroTime] = useState('')

  const [emailManual, setEmailManual] = useState('')

  // bloqueio de duplo clique por leilão
  const [processando, setProcessando] = useState<Record<string, boolean>>({})

  // ====== NOVO: times e seleção de destino por leilão ======
  const [times, setTimes] = useState<TimeRow[]>([])
  const [destinos, setDestinos] = useState<Record<string, string>>({}) // leilaoId -> timeId

  const normaliza = (s?: string | null) => (s || '').trim().toLowerCase()

  // ---------------- Verificação de admin ----------------
  useEffect(() => {
    verificarAdmin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verificarAdmin() {
    try {
      setCarregando(true)
      setMotivoBloqueio(null)

      const { data: authData } = await supabase.auth.getUser()
      const emailAuth = authData?.user?.email || null
      const emailLS = localStorage.getItem('email')
      const emailLS2 = localStorage.getItem('Email')
      let emailObj = ''
      try {
        const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
        if (raw) {
          const obj = JSON.parse(raw)
          emailObj = obj?.email || obj?.Email || obj?.e_mail || ''
        }
      } catch {}
      const emailURL = new URLSearchParams(window.location.search).get('email')

      const emailUsuario =
        normaliza(emailAuth) ||
        normaliza(emailLS) ||
        normaliza(emailLS2) ||
        normaliza(emailObj) ||
        normaliza(emailURL)

      if (!emailUsuario) {
        setIsAdmin(false)
        setMotivoBloqueio('Sem e-mail para validar. Informe abaixo e confirmaremos na lista de admins.')
        setCarregando(false)
        return
      }

      localStorage.setItem('email', emailUsuario)

      const { data, error, status } = await supabase
        .from('admins')
        .select('email')
        .ilike('email', emailUsuario)
        .maybeSingle()

      if (error) {
        setIsAdmin(false)
        setMotivoBloqueio(`Erro consultando admins (status ${status}): ${error.message}`)
        setCarregando(false)
        return
      }

      setIsAdmin(!!data)
      if (!data) setMotivoBloqueio(`E-mail "${emailUsuario}" não consta na tabela admins.`)
    } catch (e: any) {
      console.error('Falha geral na verificação de admin:', e)
      setIsAdmin(false)
      setMotivoBloqueio(e?.message || 'Falha ao verificar admin.')
    } finally {
      setCarregando(false)
    }
  }

  // ---------------- Dados ----------------
  useEffect(() => {
    if (isAdmin) {
      buscarLeiloesFinalizados()
      carregarTimes()
    }
  }, [isAdmin])

  const carregarTimes = async () => {
    const { data, error } = await supabase.from('times').select('id, nome').order('nome', { ascending: true })
    if (!error && data) setTimes(data as TimeRow[])
  }

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

        // Pré-seleciona o time vencedor (se existir) como destino default
        const map: Record<string, string> = {}
        ;(data || []).forEach((l: any) => {
          if (l.id && l.id_time_vencedor) map[l.id] = l.id_time_vencedor
        })
        setDestinos((prev) => ({ ...map, ...prev }))
      }
    } finally {
      setCarregando(false)
    }
  }

  // ---- helper: checar se já existe no elenco (usa sofifa quando possível) ----
  const existeNoElenco = async ({
    id_time,
    link_sofifa,
    nome,
  }: {
    id_time: string
    link_sofifa?: string | null
    nome: string
  }) => {
    if (link_sofifa) {
      const { data, error } = await supabase
        .from('elenco')
        .select('id')
        .eq('id_time', id_time)
        .eq('link_sofifa', link_sofifa)
        .maybeSingle()
      if (!error && data) return true
    }
    const { data: data2, error: error2 } = await supabase
      .from('elenco')
      .select('id')
      .eq('id_time', id_time)
      .ilike('nome', nome)
      .maybeSingle()
    return !error2 && !!data2
  }

  const getDestino = (leilao: any) => destinos[leilao.id] || leilao.id_time_vencedor || ''

  // ====== Enviar para um time (com débito + BID), independente de ter vencedor ======
  const enviarParaTime = async (leilao: any) => {
    const destinoId = getDestino(leilao)
    if (!destinoId) {
      alert('Selecione um time destino no dropdown antes de enviar.')
      return
    }
    if (processando[leilao.id]) return
    setProcessando((p) => ({ ...p, [leilao.id]: true }))

    try {
      // 0) proteção: já existe no elenco do destino?
      const jaExiste = await existeNoElenco({
        id_time: destinoId,
        link_sofifa: leilao.link_sofifa,
        nome: leilao.nome,
      })
      if (jaExiste) {
        await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)
        setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))
        alert('⚠️ Jogador já estava no elenco do time destino. Leilão marcado como concluído.')
        return
      }

      const valor = Number(leilao.valor_atual || 0)
      const salario = Math.round(valor * 0.007)

      // 1) Insere no elenco do destino
      const { error: erroInsert } = await supabase.from('elenco').insert({
        id_time: destinoId,
        nome: leilao.nome,
        posicao: leilao.posicao,
        overall: leilao.overall,
        valor,
        salario,
        imagem_url: leilao.imagem_url || '',
        link_sofifa: leilao.link_sofifa || null,
        nacionalidade: leilao.nacionalidade || '',
        jogos: 0,
      })
      if (erroInsert) {
        console.error('❌ Erro ao enviar para elenco:', erroInsert)
        alert(`❌ Erro ao enviar para elenco:\n${erroInsert.message}`)
        return
      }

      // 2) Debita saldo do time destino
      const { data: timeData, error: errorBusca } = await supabase
        .from('times')
        .select('saldo')
        .eq('id', destinoId)
        .single()
      if (errorBusca || !timeData) {
        console.error('❌ Erro ao buscar saldo:', errorBusca)
        alert('Erro ao buscar saldo do time destino.')
        return
      }
      const novoSaldo = Number(timeData.saldo || 0) - valor
      await supabase.from('times').update({ saldo: novoSaldo }).eq('id', destinoId)

      // 3) Movimentação + BID
      await registrarMovimentacao({
        id_time: destinoId,
        tipo: 'saida',
        valor,
        descricao: `Compra de ${leilao.nome} via leilão (admin)`,
      })

      await registrarNoBID({
        tipo_evento: 'compra',
        descricao: `Time comprou o jogador ${leilao.nome} no leilão por R$${valor.toLocaleString('pt-BR')}`,
        id_time1: destinoId,
        valor,
      })

      // 4) Concluir leilão
      await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)
      setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))

      alert('✅ Jogador enviado ao time selecionado e saldo debitado!')
    } finally {
      setProcessando((p) => ({ ...p, [leilao.id]: false }))
    }
  }

  // === Enviar jogador (sem vencedor) direto ao mercado ===
  const enviarParaMercado = async (leilao: any) => {
    if (leilao.id_time_vencedor) {
      alert('Este leilão tem vencedor. Use "Enviar p/ Time".')
      return
    }
    if (processando[leilao.id]) return
    setProcessando((p) => ({ ...p, [leilao.id]: true }))

    try {
      // Evitar duplicidade: se já existir anúncio do mesmo SoFIFA disponível
      if (leilao.link_sofifa) {
        const { data: jaAnunciado } = await supabase
          .from('mercado_transferencias')
          .select('id')
          .eq('link_sofifa', leilao.link_sofifa)
          .eq('status', 'disponivel')
          .maybeSingle()
        if (jaAnunciado) {
          await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)
          setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))
          alert('⚠️ Já havia um anúncio disponível deste jogador. Leilão marcado como concluído.')
          return
        }
      }

      const valor = Number(leilao.valor_atual || 0)
      const salario = calcularSalario(valor)

      // ATENÇÃO: se sua tabela mercado_transferencias exige jogador_id NOT NULL,
      // mude a coluna para permitir NULL ou crie um "time do sistema" e um registro em elenco.
      const { error: errIns } = await supabase.from('mercado_transferencias').insert({
        jogador_id: null, // deixe null se a coluna permitir; senão, crie previamente no elenco de um time "Sistema"
        nome: leilao.nome,
        posicao: leilao.posicao,
        overall: leilao.overall,
        valor,
        imagem_url: leilao.imagem_url || '',
        salario,
        link_sofifa: leilao.link_sofifa || null,
        id_time_origem: null,
        status: 'disponivel',
        percentual: 100,
        created_at: new Date().toISOString(),
        nacionalidade: leilao.nacionalidade || null
      })
      if (errIns) {
        console.error('❌ Falha ao anunciar no mercado:', errIns)
        alert(`❌ Erro ao anunciar no mercado:\n${errIns.message}`)
        return
      }

      await supabase.from('leiloes_sistema').update({ status: 'concluido' }).eq('id', leilao.id)
      setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))

      alert('✅ Anunciado no mercado de transferências!')
    } finally {
      setProcessando((p) => ({ ...p, [leilao.id]: false }))
    }
  }

  const excluirLeilao = async (leilao: any) => {
    if (!confirm('❗ Tem certeza que deseja excluir este leilão?')) return
    await supabase.from('leiloes_sistema').delete().eq('id', leilao.id)
    setLeiloes((prev) => prev.filter((l) => l.id !== leilao.id))
    alert('✅ Leilão excluído com sucesso!')
  }

  const leiloesFiltrados = useMemo(() => {
    return leiloes.filter((leilao) => {
      const matchPosicao = filtroPosicao ? leilao.posicao === filtroPosicao : true
      const matchTime = filtroTime
        ? (leilao.nome_time_vencedor || '').toLowerCase().includes(filtroTime.toLowerCase())
        : true
      return matchPosicao && matchTime
    })
  }, [leiloes, filtroPosicao, filtroTime])

  // ---------------- UI ----------------
  if (isAdmin === null || carregando) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-pulse text-gray-300">Verificando permissão…</div>
      </main>
    )
  }

  if (isAdmin === false) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="text-red-400 text-xl font-semibold">
          🚫 Você não tem permissão para acessar esta página.
        </div>
        {motivoBloqueio && (
          <div className="text-sm text-red-300 max-w-xl">Detalhe: {motivoBloqueio}</div>
        )}
        <div className="bg-gray-900/70 border border-gray-800 rounded-2xl p-5 text-white w-full max-w-md shadow-lg">
          <div className="text-sm mb-2">Informe seu e-mail para validar com a lista de admins:</div>
          <div className="flex gap-2">
            <input
              className="flex-1 p-2 rounded bg-white/90 text-black outline-none"
              placeholder="seuemail@dominio.com"
              value={emailManual}
              onChange={(e) => setEmailManual(e.target.value)}
            />
            <button
              onClick={async () => {
                const e = emailManual.trim().toLowerCase()
                if (!e) return
                localStorage.setItem('email', e)
                await verificarAdmin()
              }}
              className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition"
            >
              Validar
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-emerald-400">📜 Leilões Finalizados</h1>
            <p className="text-gray-400 text-sm">
              Itens com status <span className="font-semibold text-gray-200">leiloado</span> aguardando envio ao elenco, escolha do time destino ou anúncio no mercado.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="px-2 py-1 rounded-lg border border-gray-800 bg-gray-900">
              Total: <b>{leiloes.length}</b>
            </span>
            <span className="px-2 py-1 rounded-lg border border-gray-800 bg-gray-900">
              Filtrados: <b>{leiloesFiltrados.length}</b>
            </span>
          </div>
        </header>

        {/* Filtros */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-wrap gap-1">
            {POSICOES.map((pos) => {
              const active = filtroPosicao === pos
              return (
                <button
                  key={pos}
                  onClick={() => setFiltroPosicao(active ? '' : pos)}
                  className={classNames(
                    'px-3 py-1 rounded-lg text-sm border transition',
                    active
                      ? 'border-emerald-700 bg-emerald-900/50 text-emerald-200'
                      : 'border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800'
                  )}
                >
                  {pos}
                </button>
              )
            })}
          </div>

          <input
            type="text"
            placeholder="🔍 Buscar por Time Vencedor"
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="p-2 rounded-lg bg-gray-900 text-white border border-gray-800 outline-none focus:ring-2 focus:ring-emerald-600"
          />

          <button
            onClick={() => {
              setFiltroPosicao('')
              setFiltroTime('')
            }}
            className="px-4 py-2 rounded-lg border border-gray-800 bg-gray-900 hover:bg-gray-800 transition"
          >
            ❌ Limpar Filtros
          </button>
        </div>

        {/* Lista */}
        {leiloesFiltrados.length === 0 ? (
          <div className="text-center text-gray-400 italic border border-dashed border-gray-800 rounded-2xl p-10">
            Nenhum leilão encontrado com os filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leiloesFiltrados.map((leilao) => {
              const valorBRL = Number(leilao.valor_atual || 0).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                maximumFractionDigits: 0,
              })
              const processing = !!processando[leilao.id]
              const temVencedor = !!leilao.id_time_vencedor
              const destinoId = getDestino(leilao)

              return (
                <article
                  key={leilao.id}
                  className="rounded-2xl overflow-hidden border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-950 shadow hover:shadow-emerald-900/20 transition"
                >
                  {leilao.imagem_url && (
                    <div className="relative">
                      <img
                        src={leilao.imagem_url}
                        alt={leilao.nome}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                      />
                      <div className="absolute top-2 right-2 rounded-lg bg-black/50 px-2 py-1 text-xs">
                        🕒 {new Date(leilao.fim).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  )}

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold leading-5 line-clamp-2">
                        {leilao.nome}
                      </h3>
                      <span className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs">
                        {valorBRL}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <span className="rounded-md border border-gray-800 bg-gray-900 px-2 py-0.5">
                        {leilao.posicao}
                      </span>
                      <span className="rounded-md border border-gray-800 bg-gray-900 px-2 py-0.5">
                        ⭐ OVR {leilao.overall}
                      </span>
                      {leilao.nacionalidade && (
                        <span className="rounded-md border border-gray-800 bg-gray-900 px-2 py-0.5">
                          🌍 {leilao.nacionalidade}
                        </span>
                      )}
                      <span className="rounded-md border border-gray-800 bg-gray-900 px-2 py-0.5">
                        🏆 {leilao.nome_time_vencedor || '— Sem Vencedor'}
                      </span>
                    </div>

                    {leilao.link_sofifa && (
                      <a
                        href={leilao.link_sofifa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-emerald-300 text-xs underline hover:text-emerald-200"
                      >
                        🔗 Ver no Sofifa
                      </a>
                    )}

                    {/* ====== NOVO: seletor de time destino ====== */}
                    <div className="mt-2">
                      <label className="block text-xs text-gray-400 mb-1">
                        🎯 Time destino
                      </label>
                      <select
                        value={destinoId}
                        onChange={(e) =>
                          setDestinos((prev) => ({ ...prev, [leilao.id]: e.target.value }))
                        }
                        className="w-full rounded-lg bg-gray-900 border border-gray-800 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="">{temVencedor ? '— (usar vencedor) —' : '— selecione —'}</option>
                        {times.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                      {temVencedor && !destinoId && (
                        <div className="mt-1 text-[11px] text-gray-500">
                          Sem escolher, o envio vai para o vencedor.
                        </div>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {/* Enviar p/ Time: funciona tanto com ou sem vencedor (usa o destino escolhido ou o vencedor) */}
                      <button
                        onClick={() => enviarParaTime(leilao)}
                        disabled={processing}
                        className={classNames(
                          'w-full rounded-lg py-2 font-semibold transition',
                          processing
                            ? 'bg-emerald-700/50 text-white cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        )}
                        title="Insere no elenco do time destino e debita o valor"
                      >
                        {processing ? 'Processando…' : '➕ Enviar p/ Time'}
                      </button>

                      {/* Mercado só aparece se não houve vencedor */}
                      {!temVencedor && (
                        <button
                          onClick={() => enviarParaMercado(leilao)}
                          disabled={processing}
                          className={classNames(
                            'w-full rounded-lg py-2 font-semibold transition',
                            processing
                              ? 'bg-sky-700/50 text-white cursor-not-allowed'
                              : 'bg-sky-600 hover:bg-sky-500 text-white'
                          )}
                          title="Anuncia no mercado como disponível (100%)"
                        >
                          {processing ? 'Processando…' : '📣 Mercado'}
                        </button>
                      )}

                      {/* manter botão excluir ocupando a 2ª coluna quando tem vencedor */}
                      {temVencedor && (
                        <span className="hidden sm:block" />
                      )}

                      <button
                        onClick={() => excluirLeilao(leilao)}
                        disabled={processing}
                        className={classNames(
                          'w-full rounded-lg py-2 font-semibold transition',
                          processing
                            ? 'bg-red-700/50 text-white cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        )}
                      >
                        🗑️ Excluir Leilão
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
