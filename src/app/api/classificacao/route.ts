import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    // Busca todos os times com divisão válida
    const { data: timesData, error: errorTimes } = await supabase
      .from('times')
      .select('id, divisao')

    if (errorTimes) return NextResponse.json({ erro: errorTimes.message }, { status: 500 })
    if (!timesData) return NextResponse.json([], { status: 200 })

    const updates = []

    const timesValidos = timesData.filter(t => t.divisao && !isNaN(t.divisao))

    for (const time of timesValidos) {
      let pontos = 0, vitorias = 0, empates = 0, derrotas = 0, gols_pro = 0, gols_contra = 0, jogos = 0

      const { data: rodadasData, error: errorRodadas } = await supabase
        .from('rodadas_copa')
        .select('jogos')
        .eq('divisao', time.divisao)

      if (!errorRodadas && rodadasData) {
        for (const rodada of rodadasData) {
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
      }

      pontos = vitorias * 3 + empates

      updates.push({
        id_time: time.id,
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

    // Atualiza a tabela classificacao_copa com os dados calculados
    if (updates.length > 0) {
      const { error: errorInsert } = await supabase
        .from('classificacao_copa')
        .upsert(updates, { onConflict: 'id_time' })

      if (errorInsert) return NextResponse.json({ erro: errorInsert.message }, { status: 500 })
    }

    // Retorna a classificação com os dados dos times
    const { data: classificacaoData, error: errorClass } = await supabase
      .from('classificacao_copa')
      .select('*, times:times(id, nome, logo_url)')
      .order('pontos', { ascending: false })
      .order('saldo', { ascending: false })
      .order('gols_pro', { ascending: false })

    if (errorClass) return NextResponse.json({ erro: errorClass.message }, { status: 500 })

    return NextResponse.json(classificacaoData)
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
