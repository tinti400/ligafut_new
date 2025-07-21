// pages/api/recalcular-classificacao.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const { temporada, divisao } = await req.json()

  try {
    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('jogos')
      .eq('temporada', temporada)
      .eq('divisao', divisao)

    if (!rodadasData) return NextResponse.json({ ok: true })

    const classificacao = {}

    for (const rodada of rodadasData) {
      for (const jogo of rodada.jogos || []) {
        const { mandante, visitante, gols_mandante, gols_visitante } = jogo
        if (gols_mandante == null || gols_visitante == null) continue

        for (const timeId of [mandante, visitante]) {
          if (!classificacao[timeId]) {
            classificacao[timeId] = {
              id_time: timeId,
              temporada,
              divisao,
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
        }

        classificacao[mandante].jogos++
        classificacao[visitante].jogos++

        classificacao[mandante].gols_pro += gols_mandante
        classificacao[mandante].gols_contra += gols_visitante

        classificacao[visitante].gols_pro += gols_visitante
        classificacao[visitante].gols_contra += gols_mandante

        if (gols_mandante > gols_visitante) {
          classificacao[mandante].vitorias++
          classificacao[mandante].pontos += 3
          classificacao[visitante].derrotas++
        } else if (gols_mandante === gols_visitante) {
          classificacao[mandante].empates++
          classificacao[mandante].pontos += 1
          classificacao[visitante].empates++
          classificacao[visitante].pontos += 1
        } else {
          classificacao[visitante].vitorias++
          classificacao[visitante].pontos += 3
          classificacao[mandante].derrotas++
        }
      }
    }

    await supabase.from('classificacao').delete().eq('temporada', temporada).eq('divisao', divisao)
    if (Object.keys(classificacao).length > 0) {
      await supabase.from('classificacao').insert(Object.values(classificacao))
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

