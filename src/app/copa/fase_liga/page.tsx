'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'
import { FiRefreshCw, FiRotateCcw, FiSave, FiTrash2, FiShuffle } from 'react-icons/fi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===== Tipos ===== */
type Jogo = {
  id: number
  rodada: number
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  bonus_pago?: boolean | null
}
type TimeMini = { nome: string; logo_url: string }

/** ===== Utils ===== */
const clampInt = (n: number) => (Number.isNaN(n) || n < 0 ? 0 : n > 99 ? 99 : Math.floor(n))
const BYE = '__BYE__'

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Gera tabela round-robin (círculo) */
function gerarRoundRobin(ids: string[], doubleRound: boolean) {
  const teams = [...ids]
  if (teams.length < 2) return []

  if (teams.length % 2 === 1) teams.push(BYE) // adiciona bye se ímpar
  const n = teams.length
  const rounds = n - 1
  const half = n / 2

  let arr = [...teams]
  const calendario: { rodada: number; casa: string; fora: string }[] = []

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a === BYE || b === BYE) continue

      // alterna mando para balancear
      const par = (r + i) % 2 === 0
      const casa = par ? a : b
      const fora = par ? b : a

      calendario.push({ rodada: r + 1, casa, fora })
    }

    // rotação do método círculo (fixa posição 0)
    const fixo = arr[0]
    const resto = arr.slice(1)
    resto.unshift(resto.pop() as string)
    arr = [fixo, ...resto]
  }

  if (!doubleRound) return calendario

  // returno: inverte mandos e continua numerando as rodadas
  const returno = calendario.map((j) => ({
    rodada: j.rodada + rounds,
    casa: j.fora,
    fora: j.casa
  }))
  return [...calendario, ...returno]
}

/** ===== Modal simples ===== */
function ModalConfirm({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="mb-2 text-xl font-bold text-yellow-400">{title}</h3>
        <p className="mb-6 text-zinc-200">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FaseLigaAdminPage() {
  const { isAdmin } = useAdmin()
  const [jogos, setJogos] = useState<Jogo[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, TimeMini>>({})
  const [filtroTime, setFiltroTime] = useState<string>('Todos')
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState<number | null>(null)

  // reset/geração
  const [abrirModalReset, setAbrirModalReset] = useState(false)
  const [doubleRound, setDoubleRound] = useState(true)
  const [embaralhar, setEmbaralhar] = useState(true)
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    Promise.all([buscarTimes(), buscarJogos()]).finally(() => setLoading(false))
  }, [])

  async function buscarJogos() {
    const { data, error } = await supabase
      .from('copa_fase_liga')
      .select('*')
      .order('rodada', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar jogos')
      return
    }
    setJogos((data || []) as Jogo[])
  }

  async function buscarTimes() {
    const { data, error } = await supabase.from('times').select('id, nome, logo_url')
    if (error) {
      toast.error('Erro ao buscar times')
      return
    }
    const map: Record<string, TimeMini> = {}
    ;(data || []).forEach((t: any) => {
      map[t.id] = { nome: t.nome, logo_url: t.logo_url }
    })
    setTimesMap(map)
  }

  async function atualizarClassificacao() {
    await supabase.rpc('atualizar_classificacao_copa').catch(() => {})
  }

  /** ========= NOVO: Recomeçar temporada com NOVOS confrontos ========= */
  async function recomeçarTemporadaNovosConfrontos() {
    if (!isAdmin) {
      toast.error('Apenas admin pode reiniciar a temporada.')
      return
    }
    setGerando(true)
    try {
      // 1) Descobrir participantes atuais (a partir da tabela existente)
      const { data: dadosExistentes, error: erroExistentes } = await supabase
        .from('copa_fase_liga')
        .select('time1, time2')

      let participantes = new Set<string>()
      if (!erroExistentes && (dadosExistentes?.length || 0) > 0) {
        dadosExistentes!.forEach((j: any) => {
          if (j.time1) participantes.add(j.time1)
          if (j.time2) participantes.add(j.time2)
        })
      } else {
        // fallback: todos os times
        const { data: todosTimes, error: erroTimes } = await supabase.from('times').select('id')
        if (erroTimes) {
          toast.error('Não foi possível obter participantes.')
          setGerando(false)
          return
        }
        ;(todosTimes || []).forEach((t: any) => participantes.add(t.id))
      }

      let lista = Array.from(participantes)
      if (lista.length < 2) {
        toast.error('Participantes insuficientes para gerar confrontos.')
        setGerando(false)
        return
      }
      if (embaralhar) lista = shuffle(lista)

      // 2) Gerar tabela (round-robin, com/sem returno)
      const calendario = gerarRoundRobin(lista, doubleRound) // [{rodada,casa,fora},...]

      // 3) Apagar todos os jogos antigos
      const { error: erroDelete } = await supabase.from('copa_fase_liga').delete().neq('id', -1)
      if (erroDelete) {
        toast.error('Erro ao limpar tabela de jogos.')
        setGerando(false)
        return
      }

      // 4) Inserir novos jogos
      const rows = calendario.map((j) => ({
        rodada: j.rodada,
        time1: j.casa,
        time2: j.fora,
        gols_time1: null,
        gols_time2: null,
        bonus_pago: false
      }))

      if (rows.length > 0) {
        const BATCH = 1000
        for (let i = 0; i < rows.length; i += BATCH) {
          const pedaço = rows.slice(i, i + BATCH)
          const { error: erroInsert } = await supabase.from('copa_fase_liga').insert(pedaço)
          if (erroInsert) {
            toast.error('Erro ao inserir novos confrontos.')
            setGerando(false)
            return
          }
        }
      }

      // 5) Recalcular classificação zerada
      await atualizarClassificacao()

      // 6) Registrar no BID
      await supabase.from('bid').insert([
        {
          tipo_evento: 'Sistema',
          descricao: `Reinício da Fase Liga: confrontos regenerados (${doubleRound ? 'turno e returno' : 'apenas turno'}).`,
          valor: null
        }
      ])

      // 7) Atualiza UI
      await buscarJogos()
      toast.success('✅ Temporada reiniciada com NOVOS confrontos!')
    } finally {
      setGerando(false)
    }
  }

  /** ===== Salvar placar + premiação (mantém sua lógica e trava de bônus) ===== */
  async function salvarPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)

    const { data: existente, error: erroVer } = await supabase
      .from('copa_fase_liga')
      .select('bonus_pago')
      .eq('id', jogo.id)
      .single()

    if (erroVer) {
      toast.error('Erro ao verificar bônus já pago')
      setSalvandoId(null)
      return
    }
    if (existente?.bonus_pago) {
      toast.error('❌ Bônus já pago para esse jogo!')
      setSalvandoId(null)
      return
    }

    const { error: erroPlacar } = await supabase
      .from('copa_fase_liga')
      .update({
        gols_time1: jogo.gols_time1,
        gols_time2: jogo.gols_time2
      })
      .eq('id', jogo.id)

    if (erroPlacar) {
      toast.error('Erro ao salvar placar!')
      setSalvandoId(null)
      return
    }

    // Atualiza classificação
    await atualizarClassificacao()

    // Marca bônus como pago ANTES de pagar
    const { error: erroBonus } = await supabase
      .from('copa_fase_liga')
      .update({ bonus_pago: true })
      .eq('id', jogo.id)

    if (erroBonus) {
      toast.error('Erro ao marcar bônus como pago!')
      setSalvandoId(null)
      return
    }

    // ====== Cálculo da premiação (mesma regra que você já usa) ======
    const time1Id = jogo.time1
    const time2Id = jogo.time2
    const g1 = jogo.gols_time1 ?? 0
    const g2 = jogo.gols_time2 ?? 0

    const premioGol = 550_000
    const penalidadeGolSofrido = 100_000

    const premioGols1 = g1 * premioGol
    const premioGols2 = g2 * premioGol
    const descontoSofrido1 = g2 * penalidadeGolSofrido
    const descontoSofrido2 = g1 * penalidadeGolSofrido

    let bonus1 = 0
    let bonus2 = 0
    if (g1 > g2) {
      bonus1 = 8_000_000
      bonus2 = 2_000_000
    } else if (g2 > g1) {
      bonus1 = 2_000_000
      bonus2 = 8_000_000
    } else {
      bonus1 = 5_000_000
      bonus2 = 5_000_000
    }

    const total1 = bonus1 + premioGols1 - descontoSofrido1
    const total2 = bonus2 + premioGols2 - descontoSofrido2

    // Atualiza saldos (RPC)
    const { error: erroSaldo1 } = await supabase.rpc('atualizar_saldo', {
      id_time: time1Id,
      valor: total1
    })
    if (erroSaldo1) toast.error('Erro ao atualizar saldo do time 1')

    const { error: erroSaldo2 } = await supabase.rpc('atualizar_saldo', {
      id_time: time2Id,
      valor: total2
    })
    if (erroSaldo2) toast.error('Erro ao atualizar saldo do time 2')

    // Registra movimentações
    await registrarMovimentacao({
      id_time: time1Id,
      tipo: 'entrada',
      valor: total1,
      descricao: `Premiação por jogo: ${g1}x${g2}`
    })
    await registrarMovimentacao({
      id_time: time2Id,
      tipo: 'entrada',
      valor: total2,
      descricao: `Premiação por jogo: ${g2}x${g1}`
    })

    // BID
    const nome1 = timesMap[time1Id]?.nome ?? 'Time 1'
    const nome2 = timesMap[time2Id]?.nome ?? 'Time 2'
    let resultado = '🤝 Empate'
    if (g1 > g2) resultado = `🏆 Vitória de ${nome1}`
    else if (g2 > g1) resultado = `🏆 Vitória de ${nome2}`

    await supabase.from('bid').insert([
      {
        tipo_evento: 'Jogo',
        descricao: `${nome1} ${g1}x${g2} ${nome2} — ${resultado}
        💸 ${nome1}: ${total1.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        💸 ${nome2}: ${total2.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`.replace(/\s+/g, ' ').trim(),
        id_time1: time1Id,
        id_time2: time2Id,
        valor: null
      }
    ])

    toast.success('✅ Placar, premiação e BID salvos!')
    setSalvandoId(null)
  }

  async function excluirPlacar(jogo: Jogo) {
    setSalvandoId(jogo.id)
    const { error } = await supabase
      .from('copa_fase_liga')
      .update({ gols_time1: null, gols_time2: null, bonus_pago: false })
      .eq('id', jogo.id)

    if (error) toast.error('Erro ao excluir resultado!')
    else {
      await atualizarClassificacao()
      toast.success('🗑️ Resultado excluído!')
      await buscarJogos()
    }
    setSalvandoId(null)
  }

  // ====== Derivados ======
  const jogosFiltrados = useMemo(() => {
    return jogos.filter(
      (jogo) =>
        filtroTime === 'Todos' ||
        timesMap[jogo.time1]?.nome === filtroTime ||
        timesMap[jogo.time2]?.nome === filtroTime
    )
  }, [jogos, filtroTime, timesMap])

  const jogosPorRodada: Record<number, Jogo[]> = useMemo(() => {
    const map: Record<number, Jogo[]> = {}
    jogosFiltrados.forEach((j) => {
      if (!map[j.rodada]) map[j.rodada] = []
      map[j.rodada].push(j)
    })
    return map
  }, [jogosFiltrados])

  const nomesDosTimes = useMemo(
    () => Object.values(timesMap).map((t) => t.nome).sort(),
    [timesMap]
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl p-4">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <h1 className="text-center text-3xl font-extrabold tracking-tight text-yellow-400">
            🏆 Administração – Fase Liga
          </h1>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={doubleRound}
                  onChange={(e) => setDoubleRound(e.target.checked)}
                />
                Turno + Returno
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={embaralhar}
                  onChange={(e) => setEmbaralhar(e.target.checked)}
                />
                <FiShuffle /> Embaralhar
              </label>
              <button
                onClick={() => setAbrirModalReset(true)}
                disabled={gerando}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-60"
                title="Apaga todos os jogos e cria NOVOS confrontos"
              >
                <FiRotateCcw />
                {gerando ? 'Gerando...' : 'Recomeçar temporada (NOVOS confrontos)'}
              </button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <label className="text-sm text-zinc-300">Filtrar por time:</label>
          <select
            value={filtroTime}
            onChange={(e) => setFiltroTime(e.target.value)}
            className="rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white"
          >
            <option value="Todos">Todos</option>
            {nomesDosTimes.map((nome) => (
              <option key={nome} value={nome}>
                {nome}
              </option>
            ))}
          </select>
        </div>

        {/* Lista de Rodadas */}
        {loading ? (
          <div className="py-10 text-center text-zinc-300">🔄 Carregando jogos...</div>
        ) : (
          Object.entries(jogosPorRodada).map(([rodada, lista]) => (
            <div key={rodada} className="mb-8">
              <h2 className="mb-3 text-xl font-bold text-green-400">📅 Rodada {rodada}</h2>
              <div className="grid gap-3">
                {lista.map((jogo) => (
                  <div
                    key={jogo.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 shadow"
                  >
                    {/* Time 1 */}
                    <div className="flex min-w-[180px] items-center gap-2">
                      <img
                        src={timesMap[jogo.time1]?.logo_url || '/default.png'}
                        alt={timesMap[jogo.time1]?.nome || ''}
                        className="h-9 w-9 rounded-full border bg-white object-cover"
                      />
                      <span className="font-semibold">
                        {timesMap[jogo.time1]?.nome || jogo.time1}
                      </span>
                    </div>

                    {/* Placar */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="h-10 w-14 rounded-md border border-zinc-700 bg-zinc-950 text-center text-lg font-bold text-white"
                        placeholder="0"
                        value={jogo.gols_time1 ?? ''}
                        onChange={(e) => {
                          const valor = clampInt(parseInt(e.target.value || '0', 10))
                          setJogos((prev) =>
                            prev.map((j) => (j.id === jogo.id ? { ...j, gols_time1: valor } : j))
                          )
                        }}
                        disabled={!isAdmin}
                      />
                      <span className="px-2 text-xl font-extrabold">x</span>
                      <input
                        type="number"
                        className="h-10 w-14 rounded-md border border-zinc-700 bg-zinc-950 text-center text-lg font-bold text-white"
                        placeholder="0"
                        value={jogo.gols_time2 ?? ''}
                        onChange={(e) => {
                          const valor = clampInt(parseInt(e.target.value || '0', 10))
                          setJogos((prev) =>
                            prev.map((j) => (j.id === jogo.id ? { ...j, gols_time2: valor } : j))
                          )
                        }}
                        disabled={!isAdmin}
                      />
                    </div>

                    {/* Time 2 */}
                    <div className="flex min-w-[180px] items-center justify-end gap-2">
                      <span className="font-semibold">
                        {timesMap[jogo.time2]?.nome || jogo.time2}
                      </span>
                      <img
                        src={timesMap[jogo.time2]?.logo_url || '/default.png'}
                        alt={timesMap[jogo.time2]?.nome || ''}
                        className="h-9 w-9 rounded-full border bg-white object-cover"
                      />
                    </div>

                    {/* Ações */}
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          onClick={() => salvarPlacar(jogo)}
                          disabled={salvandoId === jogo.id}
                          title="Salvar placar e pagar bônus"
                        >
                          <FiSave />
                          {salvandoId === jogo.id ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          onClick={() => excluirPlacar(jogo)}
                          disabled={salvandoId === jogo.id}
                          title="Zerar placar deste jogo"
                        >
                          <FiTrash2 />
                          {salvandoId === jogo.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal reset */}
      <ModalConfirm
        open={abrirModalReset}
        danger
        title="Recomeçar temporada com NOVOS confrontos?"
        message={`Isso vai APAGAR todos os jogos atuais da Fase Liga e gerar uma nova tabela ${doubleRound ? '(turno e returno)' : '(apenas turno)'} com confrontos diferentes. Essa ação não pode ser desfeita.`}
        confirmText={gerando ? 'Gerando...' : 'Sim, recomeçar'}
        cancelText="Cancelar"
        onConfirm={recomeçarTemporadaNovosConfrontos}
        onClose={() => setAbrirModalReset(false)}
      />
    </div>
  )
}
