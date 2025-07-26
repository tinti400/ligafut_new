import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const temporada = Number(searchParams.get('temporada') || 1)

  const { data: rodadas, error: errorRodadas } = await supabase
    .from('rodadas')
    .select('*')
    .eq('temporada', temporada)

  if (errorRodadas || !rodadas) {
    return Response.json({ erro: 'Erro ao buscar rodadas' }, { status: 500 })
  }

  const { data: times, error: errorTimes } = await supabase
    .from('times')
    .select('id, nome, logo_url, divisao')

  if (errorTimes || !times) {
    return Response.json({ erro: 'Erro ao buscar times' }, { status: 500 })
  }

  const mapa: Record<string, any> = {}

  for (const time of times) {
    mapa[time.id] = {
      id_time: time.id,
      pontos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      gols_pro: 0,
      gols_contra: 0,
      jogos: 0,
      divisao: time.divisao,
      times: {
        nome: time.nome,
        logo_url: time.logo_url
      }
    }
  }

  for (const rodada of rodadas) {
    if (!rodada.jogos) continue

    for (const jogo of rodada.jogos) {
      const { mandante, visitante, gols_mandante, gols_visitante } = jogo

      if (
        gols_mandante === null ||
        gols_visitante === null ||
        !mapa[mandante] ||
        !mapa[visitante]
      )
        continue

      mapa[mandante].gols_pro += gols_mandante
      mapa[mandante].gols_contra += gols_visitante
      mapa[mandante].jogos += 1

      mapa[visitante].gols_pro += gols_visitante
      mapa[visitante].gols_contra += gols_mandante
      mapa[visitante].jogos += 1

      if (gols_mandante > gols_visitante) {
        mapa[mandante].vitorias += 1
        mapa[mandante].pontos += 3
        mapa[visitante].derrotas += 1
      } else if (gols_mandante < gols_visitante) {
        mapa[visitante].vitorias += 1
        mapa[visitante].pontos += 3
        mapa[mandante].derrotas += 1
      } else {
        mapa[mandante].empates += 1
        mapa[visitante].empates += 1
        mapa[mandante].pontos += 1
        mapa[visitante].pontos += 1
      }
    }
  }

  const classificacao = Object.values(mapa)
  return Response.json(classificacao)
}
