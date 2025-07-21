import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const temporada = Number(searchParams.get('temporada') || '1')

  try {
    const { data: timesData, error: errorTimes } = await supabase
      .from('times')
      .select('id, divisao')

    if (errorTimes) {
      return NextResponse.json({ erro: errorTimes.message }, { status: 500 })
    }

    if (!timesData || timesData.length === 0) return NextResponse.json([], { status: 200 })

    const { data: rodadasData, error: errorRodadas } = await supabase
      .from('rodadas')
      .select('jogos, divisao')
      .eq('temporada', temporada)

    if (errorRodadas) {
      return NextResponse.json({ erro: errorRodadas.message }, { status: 500 })
    }

    const classificacaoMap: Record<string, any> = {}

    for (const time of timesData) {
      classificacaoMap[time.id] = {
        id_time: time.id,
        temporada,
        divisao: time.divisao,
        pontos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        gols_pro: 0,
        gols_contra: 0,
        jogos: 0,
        saldo: 0,
      }
    }

    for (const rodada of rodadasData || []) {
      for (const jogo of rodada.jogos || []) {
        const { mandante, visitante, gols_mandante, gols_visitante } = jogo
        if (gols_mandante == null || gols_visitante == null) continue

        if (classificacaoMap[mandante]) {
          classificacaoMap[mandante].jogos++
          classificacaoMap[mandante].gols_pro += gols_mandante
          classificacaoMap[mandante].gols_contra += gols_visitante

          if (gols_mandante > gols_visitante) {
            classificacaoMap[mandante].vitorias++
            classificacaoMap[mandante].pontos += 3
          } else if (gols_mandante === gols_visitante) {
            classificacaoMap[mandante].empates++
            classificacaoMap[mandante].pontos += 1
          } else {
            classificacaoMap[mandante].derrotas++
          }
        }

        if (classificacaoMap[visitante]) {
          classificacaoMap[visitante].jogos++
          classificacaoMap[visitante].gols_pro += gols_visitante
          classificacaoMap[visitante].gols_contra += gols_mandante

          if (gols_visitante > gols_mandante) {
            classificacaoMap[visitante].vitorias++
            classificacaoMap[visitante].pontos += 3
          } else if (gols_visitante === gols_mandante) {
            classificacaoMap[visitante].empates++
            classificacaoMap[visitante].pontos += 1
          } else {
            classificacaoMap[visitante].derrotas++
          }
        }
      }
    }

    // Atualiza saldo
    Object.values(classificacaoMap).forEach((c: any) => {
      c.saldo = c.gols_pro - c.gols_contra
    })

    // Apagar classificação anterior
    await supabase.from('classificacao').delete().eq('temporada', temporada)

    // Inserir a nova classificação
    await supabase.from('classificacao').insert(Object.values(classificacaoMap))

    // Retornar a classificação completa com JOIN dos times
    const { data: classificacaoData, error: errorClass } = await supabase
      .from('classificacao')
      .select('*, times:times(id, nome, logo_url)')
      .eq('temporada', temporada)

    if (errorClass) {
      return NextResponse.json({ erro: errorClass.message }, { status: 500 })
    }

    return NextResponse.json(classificacaoData)
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}

