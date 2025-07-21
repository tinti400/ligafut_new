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

    if (errorTimes) return NextResponse.json({ erro: errorTimes.message }, { status: 500 })
    if (!timesData) return NextResponse.json([], { status: 200 })

    const updates = []

    for (const time of timesData) {
      let pontos = 0
      let vitorias = 0
      let empates = 0
      let derrotas = 0
      let gols_pro = 0
      let gols_contra = 0
      let jogos = 0

      const { data: rodadasData } = await supabase
        .from('rodadas')
        .select('jogos')
        .eq('temporada', temporada)
        .eq('divisao', time.divisao)

      for (const rodada of rodadasData || []) {
        for (const jogo of rodada.jogos || []) {
          if (jogo.gols_mandante == null || jogo.gols_visitante == null) continue

          if (jogo.mandante === time.id) {
            gols_pro += jogo.gols_mandante
            gols_contra += jogo.gols_visitante
            jogos++
            if (jogo.gols_mandante > jogo.gols_visitante) vitorias++
            else if (jogo.gols_mandante === jogo.gols_visitante) empates++
            else derrotas++
          } else if (jogo.visitante === time.id) {
            gols_pro += jogo.gols_visitante
            gols_contra += jogo.gols_mandante
            jogos++
            if (jogo.gols_visitante > jogo.gols_mandante) vitorias++
            else if (jogo.gols_visitante === jogo.gols_mandante) empates++
            else derrotas++
          }
        }
      }

      pontos = vitorias * 3 + empates

      updates.push({
        id_time: time.id,
        temporada,
        divisao: time.divisao,
        pontos,
        vitorias,
        empates,
        derrotas,
        gols_pro,
        gols_contra,
        jogos,
        saldo: gols_pro - gols_contra,
      })
    }

    if (updates.length > 0) {
      await supabase.from('classificacao').upsert(updates, { onConflict: 'id_time,temporada,divisao' })
    }

    const { data: classificacaoData, error: errorClass } = await supabase
      .from('classificacao')
      .select('*, times:times(id, nome, logo_url)')
      .eq('temporada', temporada)
      .order('pontos', { ascending: false })
      .order('saldo', { ascending: false })
      .order('gols_pro', { ascending: false })

    if (errorClass) return NextResponse.json({ erro: errorClass.message }, { status: 500 })

    return NextResponse.json(classificacaoData)
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
