import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type TimeDb = {
  id: string
  nome: string
  divisao: number | null
  logo: string | null
}

type TeamInput = {
  time_id: string
  nome_time: string
}

type Fixture = {
  rodada: number
  mandante_time_id: string
  mandante_nome: string
  visitante_time_id: string
  visitante_nome: string
}

const TIMES_OFICIAIS = [
  'Cruzeiro',
  'Atletico-MG',
  'Palmeiras',
  'Corinthians',
  'Vasco',
  'Botafogo',
] as const

const PLAYERS_POR_TIME: Record<
  string,
  { ouro: string; prata: string; bronze: string }
> = {
  Cruzeiro: {
    ouro: 'Dellatorre',
    prata: 'Emanuel',
    bronze: 'Sérgio',
  },
  'Atletico-MG': {
    ouro: 'Jorge',
    prata: 'Paulão',
    bronze: 'Daniel',
  },
  Palmeiras: {
    ouro: 'Yan',
    prata: 'Lorenzo',
    bronze: 'Fábio',
  },
  Corinthians: {
    ouro: 'Natham',
    prata: 'Matheus',
    bronze: 'Renan',
  },
  Vasco: {
    ouro: 'Denis',
    prata: 'Driko',
    bronze: 'Lamas',
  },
  Botafogo: {
    ouro: 'Jamerson',
    prata: 'Jorge Dias',
    bronze: 'Marcus',
  },
}

function normalizarNome(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function generateRoundRobin(teams: TeamInput[]): Fixture[] {
  if (teams.length !== 6) {
    throw new Error('A LigaFut exige exatamente 6 times.')
  }

  const arr = [...teams]
  const rounds = arr.length - 1
  const matchesPerRound = arr.length / 2
  const fixtures: Fixture[] = []

  let current = [...arr]

  for (let rodada = 1; rodada <= rounds; rodada++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const home = current[i]
      const away = current[current.length - 1 - i]

      const invert = rodada % 2 === 0

      fixtures.push({
        rodada,
        mandante_time_id: invert ? away.time_id : home.time_id,
        mandante_nome: invert ? away.nome_time : home.nome_time,
        visitante_time_id: invert ? home.time_id : away.time_id,
        visitante_nome: invert ? home.nome_time : away.nome_time,
      })
    }

    const fixed = current[0]
    const rest = current.slice(1)
    rest.unshift(rest.pop()!)
    current = [fixed, ...rest]
  }

  return fixtures
}

function generateDoubleRoundRobin(teams: TeamInput[]): Fixture[] {
  const turno = generateRoundRobin(teams)

  const returno = turno.map((jogo) => ({
    rodada: jogo.rodada + 5,
    mandante_time_id: jogo.visitante_time_id,
    mandante_nome: jogo.visitante_nome,
    visitante_time_id: jogo.mandante_time_id,
    visitante_nome: jogo.mandante_nome,
  }))

  return [...turno, ...returno]
}

export async function POST() {
  try {
    // 1) Buscar todos os times da divisão 1
    const { data: timesDb, error: timesError } = await supabase
      .from('times')
      .select('id, nome, divisao, logo')
      .eq('divisao', 1)

    if (timesError) throw timesError

    const timesEncontrados = (timesDb || []) as TimeDb[]

    // 2) Montar mapa normalizado para aceitar nome com/sem acento
    const mapaTimes = new Map(
      timesEncontrados.map((t) => [normalizarNome(t.nome), t])
    )

    const timesOrdenados = TIMES_OFICIAIS.map((nomeOficial) => {
      const time = mapaTimes.get(normalizarNome(nomeOficial))
      if (!time) {
        throw new Error(`Faltando time na tabela times: ${nomeOficial}`)
      }
      return time
    })

    // 3) Criar competição
    const competicaoId = crypto.randomUUID()

    const { error: compError } = await supabase.from('competicoes').insert({
      id: competicaoId,
      nome: 'LigaFut',
      temporada: '2026',
      status: 'ativa',
      tipo: 'ligafut',
    })

    if (compError) throw compError

    // 4) Inserir times da competição
    const competicaoTimesRows = timesOrdenados.map((time) => ({
      id: crypto.randomUUID(),
      competicao_id: competicaoId,
      time_id: time.id,
      nome_time: time.nome,
    }))

    const { error: competicaoTimesError } = await supabase
      .from('competicao_times')
      .insert(competicaoTimesRows)

    if (competicaoTimesError) throw competicaoTimesError

    // 5) Inserir players reais por time
    const playersRows = timesOrdenados.flatMap((time) => {
      const chaveNormalizada = TIMES_OFICIAIS.find(
        (nome) => normalizarNome(nome) === normalizarNome(time.nome)
      )

      if (!chaveNormalizada) {
        throw new Error(`Não foi possível localizar players do time ${time.nome}`)
      }

      const p = PLAYERS_POR_TIME[chaveNormalizada]

      return [
        {
          id: crypto.randomUUID(),
          competicao_id: competicaoId,
          time_id: time.id,
          nome_player: p.ouro,
          categoria: 'ouro',
          jogos_limite: 4,
          jogos_usados: 0,
          ouro_vs_ouro_obrigatorio: 2,
          ouro_vs_ouro_realizados: 0,
        },
        {
          id: crypto.randomUUID(),
          competicao_id: competicaoId,
          time_id: time.id,
          nome_player: p.prata,
          categoria: 'prata',
          jogos_limite: 3,
          jogos_usados: 0,
          ouro_vs_ouro_obrigatorio: 0,
          ouro_vs_ouro_realizados: 0,
        },
        {
          id: crypto.randomUUID(),
          competicao_id: competicaoId,
          time_id: time.id,
          nome_player: p.bronze,
          categoria: 'bronze',
          jogos_limite: 3,
          jogos_usados: 0,
          ouro_vs_ouro_obrigatorio: 0,
          ouro_vs_ouro_realizados: 0,
        },
      ]
    })

    const { error: playersError } = await supabase
      .from('competicao_players')
      .insert(playersRows)

    if (playersError) throw playersError

    // 6) Gerar rodadas estilo Brasileirão
    const fixtures = generateDoubleRoundRobin(
      timesOrdenados.map((time) => ({
        time_id: time.id,
        nome_time: time.nome,
      }))
    )

    const jogosRows = fixtures.map((jogo) => ({
      id: crypto.randomUUID(),
      competicao_id: competicaoId,
      rodada: jogo.rodada,
      mandante_time_id: jogo.mandante_time_id,
      mandante_nome: jogo.mandante_nome,
      visitante_time_id: jogo.visitante_time_id,
      visitante_nome: jogo.visitante_nome,
      status: 'pendente',
    }))

    const { error: jogosError } = await supabase
      .from('competicao_jogos')
      .insert(jogosRows)

    if (jogosError) throw jogosError

    return NextResponse.json({
      ok: true,
      competicao_id: competicaoId,
      total_times: 6,
      total_jogos: 30,
      total_rodadas: 10,
      jogos_por_rodada: 3,
      times: timesOrdenados.map((t) => ({
        id: t.id,
        nome: t.nome,
        logo: t.logo,
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao criar competição.' },
      { status: 500 }
    )
  }
}