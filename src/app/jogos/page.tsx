'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'
import { registrarMovimentacao } from '@/utils/registrarMovimentacao'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Jogo = {
  mandante: string
  visitante: string
  gols_mandante?: number
  gols_visitante?: number
  renda?: number
  publico?: number
}

type Rodada = {
  id: string
  numero: number
  temporada: number
  divisao: number
  jogos: Jogo[]
}

type Time = {
  id: string
  nome: string
  logo_url: string
}

type HistoricoJogo = {
  gols_pro: number
  gols_contra: number
  resultado: 'vitoria' | 'empate' | 'derrota'
}

type TimeDados = {
  id: string
  divisao: number
  historico: HistoricoJogo[]
}

function calcularPremiacao(time: TimeDados): number {
  const { divisao, historico } = time
  const ultimaPartida = historico[historico.length - 1]

  const regras = {
  1: { vitoria: 13_000_000, empate: 8_000_000, derrota: 3_000_000, gol: 500_000, gol_sofrido: 80_000 },
  2: { vitoria: 8_500_000, empate: 4_000_000, derrota: 1_750_000, gol: 375_000, gol_sofrido: 60_000 },
  3: { vitoria: 5_000_000, empate: 2_500_000, derrota: 1_000_000, gol: 250_000, gol_sofrido: 40_000 },
}


  const { vitoria, gol, gol_sofrido } = regras[divisao as 1 | 2 | 3] || { vitoria: 0, gol: 0, gol_sofrido: 0 }

  let premiacao = 0

  if (ultimaPartida.resultado === 'vitoria') premiacao += vitoria
  premiacao += ultimaPartida.gols_pro * gol
  premiacao -= ultimaPartida.gols_contra * gol_sofrido

  const ultimos5 = historico.slice(-5)
  const venceuTodas = ultimos5.length === 5 && ultimos5.every((j) => j.resultado === 'vitoria')
  if (venceuTodas) premiacao += 5_000_000

  return premiacao
}

async function descontarSalariosDosTimes(mandanteId: string, visitanteId: string) {
  const ids = [mandanteId, visitanteId]

  for (const timeId of ids) {
    console.log(`🔎 Iniciando desconto de salários para time: ${timeId}`)

    const { data: elenco, error: errorElenco } = await supabase
      .from('elenco')
      .select('salario')
      .eq('id_time', timeId)

    if (errorElenco) {
      console.error(`❌ Erro ao buscar elenco do time ${timeId}:`, errorElenco)
      continue
    }

    if (!elenco || elenco.length === 0) {
      console.warn(`⚠️ Elenco vazio para o time ${timeId}`)
      continue
    }

    const totalSalarios = elenco.reduce((acc, jogador) => acc + (jogador.salario || 0), 0)

    const { data: time, error: erroSaldo } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', timeId)
      .single()

    if (erroSaldo || !time) {
      console.error(`❌ Erro ao buscar saldo do time ${timeId}:`, erroSaldo)
      continue
    }

    const novoSaldo = time.saldo - totalSalarios

    const { error: erroUpdate } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', timeId)

    if (erroUpdate) {
      console.error(`❌ Erro ao atualizar saldo do time ${timeId}:`, erroUpdate)
      continue
    }

    const dataAgora = new Date().toISOString()

    const { error: erroMov } = await supabase.from('movimentacoes').insert({
      id_time: timeId,
      tipo: 'salario',
      valor: totalSalarios,
      descricao: 'Desconto de salários após partida',
      data: dataAgora,
    })

    if (erroMov) {
      console.error(`❌ Erro ao registrar movimentação do time ${timeId}:`, erroMov)
    }

    const { error: erroBid } = await supabase.from('bid').insert({
      tipo_evento: 'salario',
      descricao: 'Desconto de salários após a partida',
      id_time1: timeId,
      valor: -totalSalarios,
      data_evento: dataAgora,
    })

    if (erroBid) {
      console.error(`❌ Erro ao registrar no BID do time ${timeId}:`, erroBid)
    }

    console.log(`✅ Salários descontados para o time ${timeId}: R$ ${totalSalarios.toLocaleString()}`)
  }
}

async function premiarPorJogo(timeId: string, gols_pro: number, gols_contra: number) {
  if (gols_pro === undefined || gols_contra === undefined) return

  const { data: timeData, error: errorTime } = await supabase
    .from('times')
    .select('divisao')
    .eq('id', timeId)
    .single()

  if (errorTime || !timeData) return

  const divisao = timeData.divisao

  const { data: partidas } = await supabase
    .from('rodadas')
    .select('jogos')
    .contains('jogos', [{ mandante: timeId }, { visitante: timeId }])

  let historico: HistoricoJogo[] = []

  partidas?.forEach((rodada) => {
    rodada.jogos.forEach((jogo: any) => {
      if (
        (jogo.mandante === timeId || jogo.visitante === timeId) &&
        jogo.gols_mandante !== undefined &&
        jogo.gols_visitante !== undefined
      ) {
        const isMandante = jogo.mandante === timeId
        const g_pro = isMandante ? jogo.gols_mandante : jogo.gols_visitante
        const g_contra = isMandante ? jogo.gols_visitante : jogo.gols_mandante

        let resultado: 'vitoria' | 'empate' | 'derrota' = 'empate'
        if (g_pro > g_contra) resultado = 'vitoria'
        if (g_pro < g_contra) resultado = 'derrota'

        historico.push({ gols_pro: g_pro, gols_contra: g_contra, resultado })
      }
    })
  })

  const resultadoAtual =
    gols_pro > gols_contra ? 'vitoria' : gols_pro < gols_contra ? 'derrota' : 'empate'
  historico.push({ gols_pro, gols_contra, resultado: resultadoAtual })

  const time: TimeDados = { id: timeId, divisao, historico }
  const valor = calcularPremiacao(time)
  if (valor <= 0) return

  await supabase.rpc('atualizar_saldo', {
    id_time: timeId,
    valor,
  })

  await supabase.from('movimentacoes').insert({
    id_time: timeId,
    tipo: 'premiacao',
    valor,
    descricao: 'Premiação por desempenho na rodada',
    data: new Date().toISOString(),
  })

  // ✅ REGISTRO NO BID
  await supabase.from('bid').insert({
    tipo_evento: 'bonus',
    descricao: 'Bônus por desempenho na rodada',
    id_time1: timeId,
    valor,
    data_evento: new Date().toISOString(),
  })

}

export default function Jogos() {
  const { isAdmin, loading } = useAdmin()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [temporada, setTemporada] = useState(1)
  const [divisao, setDivisao] = useState(1)
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  const [editandoRodada, setEditandoRodada] = useState<string | null>(null)
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null)
  const [golsMandante, setGolsMandante] = useState<number>(0)
  const [golsVisitante, setGolsVisitante] = useState<number>(0)
  const [isSalvando, setIsSalvando] = useState(false)

  const temporadasDisponiveis = [1, 2]
  const divisoesDisponiveis = [1, 2, 3]

  const carregarDados = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url')
    const map: Record<string, Time> = {}
    times?.forEach((t) => {
      map[t.id] = { ...t, logo_url: t.logo_url || '' }
    })
    setTimesMap(map)

    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true })

    setRodadas((rodadasData || []) as Rodada[])
  }

  useEffect(() => {
    carregarDados()
  }, [temporada, divisao])

  const salvarResultado = async () => {
  if (isSalvando || editandoRodada === null || editandoIndex === null) return

  const confirmar = confirm('Deseja salvar o resultado e calcular a renda?')
  if (!confirmar) return

  setIsSalvando(true)

  const rodada = rodadas.find((r) => r.id === editandoRodada)
  if (!rodada) return

  const novaLista = [...rodada.jogos]
  const jogo = novaLista[editandoIndex]

  // Proteção contra bônus duplicado
  if (jogo.bonus_pago === true) {
    toast.error('❌ Bônus já foi pago para esse jogo!')
    setIsSalvando(false)
    return
  }

  const publico = Math.floor(Math.random() * 30000) + 10000
  const precoMedio = 80
  const renda = publico * precoMedio

  const mandanteId = jogo.mandante
  const visitanteId = jogo.visitante

  // 💰 Atualiza saldo dos clubes com base na renda
  await supabase.rpc('atualizar_saldo', {
    id_time: mandanteId,
    valor: renda * 0.95
  })
  await supabase.rpc('atualizar_saldo', {
    id_time: visitanteId,
    valor: renda * 0.05
  })

  // 💸 Descontar salários
  await descontarSalariosDosTimes(mandanteId, visitanteId)

  // 🏆 Premiar por desempenho da rodada (com proteção)
  await premiarPorJogo(mandanteId, golsMandante, golsVisitante)
  await premiarPorJogo(visitanteId, golsVisitante, golsMandante)

  // ✅ Atualiza o número de jogos
  const atualizarJogosElenco = async (timeId: string) => {
    const { data: jogadores, error } = await supabase
      .from('elenco')
      .select('id, jogos')
      .eq('id_time', timeId)

    if (error || !jogadores) return

    const updates = jogadores.map((jogador) =>
      supabase
        .from('elenco')
        .update({ jogos: (jogador.jogos || 0) + 1 })
        .eq('id', jogador.id)
    )

    await Promise.all(updates)
  }

  await atualizarJogosElenco(mandanteId)
  await atualizarJogosElenco(visitanteId)

  // Atualiza o jogo
  novaLista[editandoIndex] = {
    ...jogo,
    gols_mandante: golsMandante,
    gols_visitante: golsVisitante,
    renda,
    publico,
    bonus_pago: true  // ✅ Marca como pago
  }

  await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodada.id)
  await fetch(`/api/classificacao?temporada=${temporada}`)
  await fetch('/api/atualizar-moral')
  await carregarDados()

  const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
  const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

  toast.success(
    `🎟️ Público: ${publico.toLocaleString()} | 💰 Renda: R$ ${renda.toLocaleString()}
💵 ${mandanteNome}: R$ ${(renda * 0.95).toLocaleString()}
💵 ${visitanteNome}: R$ ${(renda * 0.05).toLocaleString()}`,
    { duration: 8000 }
  )

  setEditandoRodada(null)
  setEditandoIndex(null)
  setIsSalvando(false)
}

  const excluirResultado = async (rodadaId: string, index: number) => {
    if (!confirm('Deseja excluir o resultado deste jogo?')) return

    const rodada = rodadas.find((r) => r.id === rodadaId)
    if (!rodada) return

    const novaLista = [...rodada.jogos]
    novaLista[index] = {
      ...novaLista[index],
      gols_mandante: undefined,
      gols_visitante: undefined,
      renda: undefined,
      publico: undefined
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    await fetch(`/api/classificacao?temporada=${temporada}`)

    await carregarDados()
  }

  const rodadasFiltradas = !timeSelecionado
    ? rodadas
    : rodadas
        .map((rodada) => ({
          ...rodada,
          jogos: rodada.jogos.filter(
            (jogo) => jogo.mandante === timeSelecionado || jogo.visitante === timeSelecionado
          )
        }))
        .filter((rodada) => rodada.jogos.length > 0)

  if (loading) return <p className="text-center text-white">🔄 Verificando permissões...</p>

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-white">📅 Jogos da LigaFut</h1>

      <div className="flex gap-2 mb-4">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporada(temp)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              temporada === temp ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisao(div)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              divisao === div ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Divisão {div}
          </button>
        ))}
      </div>

      <select
        className="mb-6 p-2 bg-zinc-800 text-white rounded-lg"
        onChange={(e) => setTimeSelecionado(e.target.value)}
        value={timeSelecionado}
      >
        <option value="">Todos os times</option>
        {Object.values(timesMap).map((time) => (
          <option key={time.id} value={time.id}>
            {time.nome}
          </option>
        ))}
      </select>

      {rodadasFiltradas.map((rodada) => (
        <div key={rodada.id} className="bg-zinc-800 rounded-xl p-4 mb-6 shadow-md">
          <h2 className="text-xl font-semibold text-white mb-3">🏁 Rodada {rodada.numero}</h2>

          <div className="space-y-2">
            {rodada.jogos.map((jogo, index) => {
              const mandante = timesMap[jogo.mandante]
              const visitante = timesMap[jogo.visitante]
              const estaEditando = editandoRodada === rodada.id && editandoIndex === index

              return (
                <div key={index} className="bg-zinc-700 text-white px-4 py-2 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center w-1/3 justify-end gap-2">
                      {mandante?.logo_url && (
                        <img src={mandante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                      )}
                      <span className="font-medium text-right">{mandante?.nome || '???'}</span>
                    </div>

                    <div className="w-1/3 text-center text-zinc-300 font-bold">
                      {estaEditando ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={golsMandante}
                            onChange={(e) => setGolsMandante(Number(e.target.value))}
                            className="w-10 text-black text-center rounded"
                          />
                          <span>x</span>
                          <input
                            type="number"
                            value={golsVisitante}
                            onChange={(e) => setGolsVisitante(Number(e.target.value))}
                            className="w-10 text-black text-center rounded"
                          />
                        </div>
                      ) : jogo.gols_mandante !== undefined && jogo.gols_visitante !== undefined ? (
                        <>{jogo.gols_mandante} x {jogo.gols_visitante}</>
                      ) : (
                        '🆚'
                      )}
                    </div>

                    <div className="flex items-center w-1/3 justify-start gap-2">
                      <span className="font-medium text-left">{visitante?.nome || '???'}</span>
                      {visitante?.logo_url && (
                        <img src={visitante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                      )}

                      {isAdmin && !estaEditando && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              setEditandoRodada(rodada.id)
                              setEditandoIndex(index)
                              setGolsMandante(jogo.gols_mandante ?? 0)
                              setGolsVisitante(jogo.gols_visitante ?? 0)
                            }}
                            className="text-sm text-yellow-300"
                          >
                            📝
                          </button>
                          {jogo.gols_mandante !== undefined && jogo.gols_visitante !== undefined && (
                            <button
                              onClick={() => excluirResultado(rodada.id, index)}
                              className="text-sm text-red-400"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )}

                      {isAdmin && estaEditando && (
                        <div className="flex gap-2">
                          <button
                            onClick={salvarResultado}
                            disabled={isSalvando}
                            className="text-sm text-green-400 font-semibold"
                          >
                            💾
                          </button>
                          <button
                            onClick={() => {
                              setEditandoRodada(null)
                              setEditandoIndex(null)
                            }}
                            className="text-sm text-red-400 font-semibold"
                          >
                            ❌
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {jogo.renda && jogo.publico && (
                    <div className="text-sm text-zinc-400 text-right mt-1 mr-10">
                      🎟️ Público: {jogo.publico.toLocaleString()} | 💰 Renda: R$ {jogo.renda.toLocaleString()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
