Substitua **`src/app/jogos/page.tsx`** pelo conteúdo abaixo (copie **somente** o que está dentro do bloco):

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/** ===================== Tipos ===================== */
type Jogo = {
  mandante: string
  visitante: string
  gols_mandante?: number
  gols_visitante?: number
  renda?: number
  publico?: number
  bonus_pago?: boolean

  // campos salvos para estorno
  receita_mandante?: number
  receita_visitante?: number
  salarios_mandante?: number
  salarios_visitante?: number
  premiacao_mandante?: number
  premiacao_visitante?: number
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

/** ===================== Regras de premiação ===================== */
const BONUS_MULTIPLIER = 1.5 // +50% em todos os bônus por partida

function calcularPremiacao(time: TimeDados): number {
  const { divisao, historico } = time
  const ultimaPartida = historico[historico.length - 1]
  const regras = {
    1: { vitoria: 13_000_000, empate: 8_000_000,  derrota: 3_000_000, gol: 500_000, gol_sofrido: 80_000 },
    2: { vitoria: 8_500_000,  empate: 4_000_000,  derrota: 1_750_000, gol: 375_000, gol_sofrido: 60_000 },
    3: { vitoria: 5_000_000,  empate: 2_500_000,  derrota: 1_000_000, gol: 250_000, gol_sofrido: 40_000 },
  } as const

  const regra = regras[divisao as 1|2|3]
  if (!regra) return 0

  let premiacao = 0
  premiacao += ultimaPartida.resultado === 'vitoria' ? regra.vitoria
            : ultimaPartida.resultado === 'empate'  ? regra.empate
            : regra.derrota

  premiacao += (ultimaPartida.gols_pro    ?? 0) * regra.gol
  premiacao -= (ultimaPartida.gols_contra ?? 0) * regra.gol_sofrido

  // bônus por 5 vitórias seguidas
  const ultimos5 = historico.slice(-5)
  const venceuTodas = ultimos5.length === 5 && ultimos5.every(j => j.resultado === 'vitoria')
  if (venceuTodas) premiacao += 5_000_000

  // aplica o +50%
  return Math.round(premiacao * BONUS_MULTIPLIER)
}

/** ===================== Helpers ===================== */
const isPlacarPreenchido = (j: Jogo) =>
  j.gols_mandante !== undefined && j.gols_visitante !== undefined

const contagemDaRodada = (rodada: Rodada) => {
  const total = rodada.jogos.length
  const feitos = rodada.jogos.filter(isPlacarPreenchido).length
  return { feitos, total }
}

const contagemGlobal = (rodadas: Rodada[], timeSelecionado?: string) => {
  const lista = !timeSelecionado ? rodadas : rodadas
    .map(r => ({...r, jogos: r.jogos.filter(j => j.mandante === timeSelecionado || j.visitante === timeSelecionado)}))
    .filter(r => r.jogos.length>0)

  const total = lista.reduce((acc, r) => acc + r.jogos.length, 0)
  const feitos = lista.reduce((acc, r) => acc + r.jogos.filter(isPlacarPreenchido).length, 0)
  return { feitos, total }
}

// soma salários sem registrar (fallback p/ estorno de jogos antigos)
async function somarSalarios(timeId: string): Promise<number> {
  const { data } = await supabase
    .from('elenco')
    .select('salario')
  .eq('id_time', timeId)
  if (!data) return 0
  return data.reduce((acc, j) => acc + (j.salario || 0), 0)
}

async function ajustarJogosElenco(timeId: string, delta: number) {
  const { data: jogadores } = await supabase
    .from('elenco')
    .select('id, jogos')
    .eq('id_time', timeId)
  if (!jogadores) return
  await Promise.all(
    jogadores.map(j =>
      supabase.from('elenco')
        .update({ jogos: Math.max(0, (j.jogos || 0) + delta) })
        .eq('id', j.id)
    )
  )
}

/** ===================== Salários (com registro) ===================== */
async function descontarSalariosComRegistro(timeId: string): Promise<number> {
  const { data: elenco } = await supabase
    .from('elenco')
    .select('salario')
    .eq('id_time', timeId)

  if (!elenco) return 0
  const totalSalarios = elenco.reduce((acc, j) => acc + (j.salario || 0), 0)

  await supabase.rpc('atualizar_saldo', { id_time: timeId, valor: -totalSalarios })

  const dataAgora = new Date().toISOString()
  await supabase.from('movimentacoes').insert({
    id_time: timeId, tipo: 'salario', valor: totalSalarios,
    descricao: 'Desconto de salários após partida', data: dataAgora,
  })
  await supabase.from('bid').insert({
    tipo_evento: 'despesas', descricao: 'Desconto de salários após a partida',
    id_time1: timeId, valor: -totalSalarios, data_evento: dataAgora,
  })
  return totalSalarios
}

/** ===================== Premiação por jogo ===================== */
async function premiarPorJogo(timeId: string, gols_pro: number, gols_contra: number): Promise<number> {
  if (gols_pro === undefined || gols_contra === undefined) return 0

  const { data: timeData, error: errorTime } = await supabase
    .from('times').select('divisao').eq('id', timeId).single()
  if (errorTime || !timeData) return 0

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

  const resultadoAtual: 'vitoria'|'empate'|'derrota' =
    gols_pro > gols_contra ? 'vitoria' : gols_pro < gols_contra ? 'derrota' : 'empate'
  historico.push({ gols_pro, gols_contra, resultado: resultadoAtual })

  const valor = calcularPremiacao({ id: timeId, divisao, historico })
  if (valor <= 0) return 0

  await supabase.rpc('atualizar_saldo', { id_time: timeId, valor })
  await supabase.from('movimentacoes').insert({
    id_time: timeId, tipo: 'premiacao', valor,
    descricao: 'Premiação por desempenho na rodada', data: new Date().toISOString(),
  })
  await supabase.from('bid').insert({
    tipo_evento: 'bonus', descricao: 'Bônus por desempenho na rodada',
    id_time1: timeId, valor, data_evento: new Date().toISOString(),
  })
  return valor
}

/** ===================== Página ===================== */
export default function Jogos() {
  const { isAdmin, loading } = useAdmin()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({})
  const [temporada, setTemporada] = useState(1)
  const [divisao, setDivisao] = useState(1)
  const [timeSelecionado, setTimeSelecionado] = useState<string>('')

  // estado de edição
  const [editandoRodada, setEditandoRodada] = useState<string | null>(null)
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null)
  const [golsMandante, setGolsMandante] = useState<number>(0)
  const [golsVisitante, setGolsVisitante] = useState<number>(0)
  const [isSalvando, setIsSalvando] = useState(false)

  // estado do botão "Gerar T3"
  const [gerando, setGerando] = useState(false)

  const temporadasDisponiveis = [1, 2, 3]
  const divisoesDisponiveis = [1, 2, 3]

  const carregarDados = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url')
    const map: Record<string, Time> = {}
    times?.forEach((t) => { map[t.id] = { ...t, logo_url: t.logo_url || '' } })
    setTimesMap(map)

    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true })

    setRodadas((rodadasData || []) as Rodada[])
  }

  useEffect(() => { carregarDados() }, [temporada, divisao])

  // gera T3 (todas as divisões, ida+volta)
  const gerarTemporada3 = async () => {
    if (!isAdmin) return
    if (!confirm('Gerar jogos da Temporada 3 para as Divisões 1, 2 e 3?')) return
    try {
      setGerando(true)
      toast.loading('Iniciando Temporada 3...', { id: 'gerar-t3' })

      const resA = await fetch('/api/iniciar-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporada: 3 })
      })
      const a = await resA.json()
      if (!resA.ok || !a?.ok) throw new Error(a?.erro || 'Falha ao iniciar temporada')

      toast.loading('Gerando rodadas/jogos da T3...', { id: 'gerar-t3' })
      const resB = await fetch('/api/gerar-jogos-temporada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporada: 3, divisoes: [1,2,3], duploTurno: true })
      })
      const b = await resB.json()
      if (!resB.ok || !b?.ok) throw new Error(b?.erro || 'Falha ao gerar jogos')

      toast.success('✅ Temporada 3 gerada com sucesso!', { id: 'gerar-t3' })

      setTemporada(3)
      await carregarDados()
    } catch (e: any) {
      toast.error(`❌ ${e.message || e}`, { id: 'gerar-t3' })
    } finally {
      setGerando(false)
    }
  }

  /** =============== SALVAR PRIMEIRO LANÇAMENTO (com finanças) =============== */
  const salvarPrimeiroLancamento = async (rodadaId: string, index: number, gm: number, gv: number) => {
    if (isSalvando) return
    setIsSalvando(true)

    const { data: rodadaDB, error: erroR } = await supabase
      .from('rodadas').select('jogos, numero').eq('id', rodadaId).single()
    if (erroR || !rodadaDB) {
      toast.error('Erro ao buscar rodada!')
      setIsSalvando(false); return
    }

    const jogoDB: Jogo = rodadaDB.jogos[index]
    if (jogoDB?.bonus_pago === true) {
      await salvarAjusteResultado(rodadaId, index, gm, gv, true)
      setIsSalvando(false); return
    }

    const novaLista = [...rodadaDB.jogos]
    const jogo = novaLista[index]
    if (!jogo) { setIsSalvando(false); return }

    const publico = Math.floor(Math.random() * 30000) + 10000
    const precoMedio = 80
    const renda = publico * precoMedio

    const mandanteId = jogo.mandante
    const visitanteId = jogo.visitante

    // receita: 95% mandante / 5% visitante
    const receitaMandante = renda * 0.95
    const receitaVisitante = renda * 0.05
    await supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: receitaMandante })
    await supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: receitaVisitante })

    // salários (com registro)
    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    // premiação por desempenho (+50% via calcularPremiacao)
    const premiacaoMandante = await premiarPorJogo(mandanteId, gm, gv)
    const premiacaoVisitante = await premiarPorJogo(visitanteId, gv, gm)

    // BID de receita (renda + bônus)
    await supabase.from('bid').insert([
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus)',
        id_time1: mandanteId,
        valor: receitaMandante + premiacaoMandante,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus)',
        id_time1: visitanteId,
        valor: receitaVisitante + premiacaoVisitante,
        data_evento: new Date().toISOString(),
      },
    ])

    // atualiza elenco (jogos +1)
    await ajustarJogosElenco(mandanteId, +1)
    await ajustarJogosElenco(visitanteId, +1)

    // grava o jogo na rodada com todos os valores para estorno
    const gmNum = Number.isFinite(gm) ? gm : 0
    const gvNum = Number.isFinite(gv) ? gv : 0
    novaLista[index] = {
      ...jogo,
      gols_mandante: gmNum,
      gols_visitante: gvNum,
      renda,
      publico,
      bonus_pago: true,
      receita_mandante: receitaMandante,
      receita_visitante: receitaVisitante,
      salarios_mandante: salariosMandante,
      salarios_visitante: salariosVisitante,
      premiacao_mandante: premiacaoMandante,
      premiacao_visitante: premiacaoVisitante,
    }
    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)

    // serviços auxiliares
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')

    // atualiza estado local
    setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: novaLista } : r))

    const { feitos, total } = contagemDaRodada({ ...(rodadas.find(r=>r.id===rodadaId) as Rodada), jogos: novaLista })
    const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
    const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

    toast.success(
      `✅ Placar salvo! ${feitos}/${total} jogos desta rodada com placar.
🎟️ Público: ${publico.toLocaleString()}  |  💰 Renda: R$ ${renda.toLocaleString()}
💵 ${mandanteNome}: R$ ${receitaMandante.toLocaleString()} + bônus
💵 ${visitanteNome}: R$ ${receitaVisitante.toLocaleString()} + bônus`,
      { duration: 8000 }
    )

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)
  }

  /** =============== AJUSTE DE RESULTADO (sem repetir finanças) =============== */
  const salvarAjusteResultado = async (rodadaId: string, index: number, gm: number, gv: number, silencioso = false) => {
    if (isSalvando) return
    setIsSalvando(true)

    const { data: rodadaDB, error: erroR } = await supabase
      .from('rodadas').select('jogos, numero').eq('id', rodadaId).single()
    if (erroR || !rodadaDB) {
      toast.error('Erro ao buscar rodada!')
      setIsSalvando(false); return
    }

    const novaLista = [...rodadaDB.jogos]
    const jogo = novaLista[index]
    if (!jogo) { setIsSalvando(false); return }

    // mantém renda/publico/bonus_pago, só ajusta placar
    const gmNum = Number.isFinite(gm) ? gm : 0
    const gvNum = Number.isFinite(gv) ? gv : 0
    novaLista[index] = {
      ...jogo,
      gols_mandante: gmNum,
      gols_visitante: gvNum,
      bonus_pago: true,
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)

    // recalcula classificação/moral
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')

    // estado local
    setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: novaLista } : r))

    if (!silencioso) {
      const { feitos, total } = contagemDaRodada({ ...(rodadas.find(r=>r.id===rodadaId) as Rodada), jogos: novaLista })
      toast.success(`✏️ Resultado atualizado! ${feitos}/${total} jogos desta rodada com placar (sem repetir bônus).`)
    }

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)
  }

  /** =============== Excluir placar (com ESTORNO automático) =============== */
  const excluirResultado = async (rodadaId: string, index: number) => {
    if (!confirm('Deseja excluir o resultado deste jogo? Isso fará estorno automático de todas as finanças.')) return
    const rodada = rodadas.find((r) => r.id === rodadaId)
    if (!rodada) return

    const jogo = rodada.jogos[index]
    if (!jogo) return

    const now = new Date().toISOString()
    const mandanteId = jogo.mandante
    const visitanteId = jogo.visitante

    if (jogo.bonus_pago) {
      // valores para reverter (com fallback p/ jogos antigos)
      const receitaMandante = jogo.receita_mandante ?? (jogo.renda ? jogo.renda * 0.95 : 0)
      const receitaVisitante = jogo.receita_visitante ?? (jogo.renda ? jogo.renda * 0.05 : 0)
      const salariosMandante = jogo.salarios_mandante ?? await somarSalarios(mandanteId)
      const salariosVisitante = jogo.salarios_visitante ?? await somarSalarios(visitanteId)
      const premiacaoMandante = jogo.premiacao_mandante ?? 0
      const premiacaoVisitante = jogo.premiacao_visitante ?? 0

      // 1) Reverter saldos
      await Promise.all([
        receitaMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -receitaMandante }) : Promise.resolve(),
        receitaVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -receitaVisitante }) : Promise.resolve(),
        salariosMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: +salariosMandante }) : Promise.resolve(),
        salariosVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: +salariosVisitante }) : Promise.resolve(),
        premiacaoMandante ? supabase.rpc('atualizar_saldo', { id_time: mandanteId, valor: -premiacaoMandante }) : Promise.resolve(),
        premiacaoVisitante ? supabase.rpc('atualizar_saldo', { id_time: visitanteId, valor: -premiacaoVisitante }) : Promise.resolve(),
      ])

      // 2) Registrar estornos em movimentacoes
      const movs: any[] = []
      if (receitaMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_receita', valor: receitaMandante, descricao: 'Estorno receita de partida', data: now })
      if (receitaVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_receita', valor: receitaVisitante, descricao: 'Estorno receita de partida', data: now })
      if (salariosMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_salario', valor: salariosMandante, descricao: 'Estorno de salários da partida', data: now })
      if (salariosVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_salario', valor: salariosVisitante, descricao: 'Estorno de salários da partida', data: now })
      if (premiacaoMandante) movs.push({ id_time: mandanteId, tipo: 'estorno_premiacao', valor: premiacaoMandante, descricao: 'Estorno de bônus por desempenho', data: now })
      if (premiacaoVisitante) movs.push({ id_time: visitanteId, tipo: 'estorno_premiacao', valor: premiacaoVisitante, descricao: 'Estorno de bônus por desempenho', data: now })
      if (movs.length) await supabase.from('movimentacoes').insert(movs)

      // 3) Registrar estornos no BID
      const bids: any[] = []
      if (receitaMandante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida', id_time1: mandanteId, valor: -receitaMandante, data_evento: now })
      if (receitaVisitante) bids.push({ tipo_evento: 'estorno_receita_partida', descricao: 'Estorno da receita da partida', id_time1: visitanteId, valor: -receitaVisitante, data_evento: now })
      if (salariosMandante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários)', id_time1: mandanteId, valor: +salariosMandante, data_evento: now })
      if (salariosVisitante) bids.push({ tipo_evento: 'estorno_despesas', descricao: 'Estorno de despesas (salários)', id_time1: visitanteId, valor: +salariosVisitante, data_evento: now })
      if (premiacaoMandante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus por desempenho', id_time1: mandanteId, valor: -premiacaoMandante, data_evento: now })
      if (premiacaoVisitante) bids.push({ tipo_evento: 'estorno_bonus', descricao: 'Estorno de bônus por desempenho', id_time1: visitanteId, valor: -premiacaoVisitante, data_evento: now })
      if (bids.length) await supabase.from('bid').insert(bids)

      // 4) Decrementa 1 jogo no elenco dos dois times
      await ajustarJogosElenco(mandanteId, -1)
      await ajustarJogosElenco(visitanteId, -1)
    }

    // 5) Limpa o placar e zera campos financeiros do jogo
    const novaLista = [...rodada.jogos]
    novaLista[index] = {
      ...novaLista[index],
      gols_mandante: undefined,
      gols_visitante: undefined,
      renda: undefined,
      publico: undefined,
      bonus_pago: false,
      receita_mandante: undefined,
      receita_visitante: undefined,
      salarios_mandante: undefined,
      salarios_visitante: undefined,
      premiacao_mandante: undefined,
      premiacao_visitante: undefined,
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodadaId)
    await fetch(`/api/classificacao?temporada=${temporada}`)

    setRodadas(prev => prev.map(r => r.id === rodadaId ? { ...r, jogos: novaLista } : r))

    toast.success('🗑️ Resultado removido e estorno financeiro concluído.')
  }

  /** =============== Filtro por time (opcional) =============== */
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

  const { feitos: feitosGlobais, total: totalGlobais } = contagemGlobal(rodadasFiltradas, timeSelecionado)

  return (
    <div className="relative p-6 max-w-7xl mx-auto">
      {/* glows de fundo */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

      <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-emerald-300 to-sky-400 bg-clip-text text-transparent">
        📅 Jogos da LigaFut
      </h1>

      {/* Controles */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporada(temp)}
            className={`px-4 py-2 rounded-xl font-semibold border border-white/10 ${
              temporada === temp ? 'bg-emerald-600 text-white' : 'bg-white/5 text-white/80'
            }`}
          >
            Temporada {temp}
          </button>
        ))}

        {/* botão admin para gerar T3 */}
        {isAdmin && (
          <button
            onClick={gerarTemporada3}
            disabled={gerando}
            className={`ml-2 px-4 py-2 rounded-xl font-semibold border ${
              gerando ? 'bg-gray-700 border-white/10 text-white/70' : 'bg-emerald-600 border-emerald-500/50 text-black hover:bg-emerald-500'
            }`}
            title="Cria a classificação e gera todas as rodadas (divisões 1–3) da Temporada 3"
          >
            {gerando ? 'Processando…' : '⚙️ Gerar Temporada 3 (todas as divisões)'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisao(div)}
            className={`px-4 py-2 rounded-xl font-semibold border border-white/10 ${
              divisao === div ? 'bg-sky-600 text-white' : 'bg-white/5 text-white/80'
            }`}
          >
            Divisão {div}
          </button>
        ))}
        <span className="ml-auto text-sm px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
          {feitosGlobais}/{totalGlobais} jogos com placar (filtro atual)
        </span>
      </div>

      <select
        className="mb-6 p-2 bg-white/5 border border-white/10 text-white rounded-lg"
        onChange={(e) => setTimeSelecionado(e.target.value)}
        value={timeSelecionado}
      >
        <option value="">Todos os times</option>
        {Object.values(timesMap).map((time) => (
          <option key={time.id} value={time.id}>{time.nome}</option>
        ))}
      </select>

      {rodadasFiltradas.map((rodada) => {
        const { feitos, total } = contagemDaRodada(rodada)
        return (
          <div key={rodada.id} className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl p-4 mb-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold text-white">🏁 Rodada {rodada.numero}</h2>
              <span className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/70">
                {feitos}/{total} com placar
              </span>
            </div>

            <div className="space-y-2">
              {rodada.jogos.map((jogo, index) => {
                const mandante = timesMap[jogo.mandante]
                const visitante = timesMap[jogo.visitante]
                const estaEditando = editandoRodada === rodada.id && editandoIndex === index
                const jaPago = !!jogo.bonus_pago

                const handleAutoBlur = async () => {
                  if (!isAdmin || !estaEditando || !jaPago) return
                  if (Number.isNaN(golsMandante) || Number.isNaN(golsVisitante)) return
                  await salvarAjusteResultado(rodada.id, index, Number(golsMandante), Number(golsVisitante))
                }

                return (
                  <div key={index} className="bg-white/5 border border-white/10 text-white px-4 py-3 rounded-xl">
                    <div className="flex items-center justify-between">
                      {/* mandante */}
                      <div className="flex items-center w-1/3 justify-end gap-2">
                        {mandante?.logo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mandante.logo_url} alt="logo" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                        )}
                        <span className="font-medium text-right">{mandante?.nome || '???'}</span>
                      </div>

                      {/* centro/placar */}
                      <div className="w-1/3 text-center text-zinc-200 font-bold">
                        {estaEditando ? (
                          <div className="flex items-center justify-center gap-2">
                            <input
                              type="number"
                              value={golsMandante}
                              onChange={(e) => setGolsMandante(Number(e.target.value))}
                              onBlur={handleAutoBlur}
                              className="w-12 text-black text-center rounded-lg px-2 py-1"
                              placeholder="0"
                              min={0}
                            />
                            <span className="text-white/70">x</span>
                            <input
                              type="number"
                              value={golsVisitante}
                              onChange={(e) => setGolsVisitante(Number(e.target.value))}
                              onBlur={handleAutoBlur}
                              className="w-12 text-black text-center rounded-lg px-2 py-1"
                              placeholder="0"
                              min={0}
                            />
                          </div>
                        ) : isPlacarPreenchido(jogo) ? (
                          <>{jogo.gols_mandante} x {jogo.gols_visitante}</>
                        ) : (
                          <span className="text-white/50">🆚</span>
                        )}
                      </div>

                      {/* visitante + ações */}
                      <div className="flex items-center w-1/3 justify-start gap-2">
                        <span className="font-medium text-left">{visitante?.nome || '???'}</span>
                        {visitante?.logo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={visitante.logo_url} alt="logo" className="h-6 w-6 rounded-full ring-1 ring-white/10" />
                        )}

                        {isAdmin && !estaEditando && (
                          <div className="flex gap-2 ml-2">
                            <button
                              onClick={() => {
                                setEditandoRodada(rodada.id)
                                setEditandoIndex(index)
                                setGolsMandante(jogo.gols_mandante ?? 0)
                                setGolsVisitante(jogo.gols_visitante ?? 0)
                                if (jogo.bonus_pago) {
                                  toast('Modo ajuste: edite e saia do campo para salvar automaticamente.', { icon: '✏️' })
                                }
                              }}
                              className="text-sm text-yellow-300"
                              title={jogo.bonus_pago ? 'Editar (ajuste sem repetir bônus)' : 'Editar (lançamento com finanças)'}
                            >
                              📝
                            </button>

                            {isPlacarPreenchido(jogo) && (
                              <button
                                onClick={() => excluirResultado(rodada.id, index)}
                                className="text-sm text-red-400"
                                title="Remover resultado (com estorno)"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )}

                        {isAdmin && estaEditando && (
                          <div className="flex gap-2 ml-2">
                            {!jogo.bonus_pago ? (
                              <button
                                onClick={() => salvarPrimeiroLancamento(rodada.id, index, Number(golsMandante), Number(golsVisitante))}
                                disabled={isSalvando}
                                className="text-sm text-green-400 font-semibold"
                                title="Salvar e processar finanças"
                              >
                                💾
                              </button>
                            ) : (
                              <button
                                onClick={() => salvarAjusteResultado(rodada.id, index, Number(golsMandante), Number(golsVisitante))}
                                disabled={isSalvando}
                                className="text-sm text-green-400 font-semibold"
                                title="Salvar ajuste (sem repetir bônus)"
                              >
                                ✅
                              </button>
                            )}
                            <button
                              onClick={() => { setEditandoRodada(null); setEditandoIndex(null) }}
                              className="text-sm text-red-400 font-semibold"
                              title="Cancelar edição"
                            >
                              ❌
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {jogo.renda && jogo.publico && (
                      <div className="text-xs text-zinc-400 text-right mt-1 mr-10">
                        🎟️ Público: {jogo.publico.toLocaleString()} | 💰 Renda: R$ {jogo.renda.toLocaleString()}
                      </div>
                    )}

                    {jogo.bonus_pago && (
                      <div className="mt-2 text-[11px] text-emerald-300/80">
                        ✔️ Lançado com finanças. Edições futuras não repetem bônus/salários — apenas atualizam o placar e a classificação.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```
