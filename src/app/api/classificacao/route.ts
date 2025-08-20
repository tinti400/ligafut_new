import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TimeRow = { id: string; divisao: number | null }
type RodadaRow = { jogos: any[]; divisao: number | null }
type PunicaoRow = { id_time: string; valor: number | null }

export async function GET(req: NextRequest) {
  try {
    // 1) Times com divisão válida
    const { data: timesData, error: errorTimes } = await supabase
      .from('times')
      .select('id, divisao')
    if (errorTimes) return NextResponse.json({ erro: errorTimes.message }, { status: 500 })

    const timesValidos: TimeRow[] = (timesData || []).filter(
      (t) => t.divisao !== null && !Number.isNaN(t.divisao)
    )
    if (timesValidos.length === 0) return NextResponse.json([], { status: 200 })

    // 2) Carrega todas as rodadas da COPA das divisões envolvidas (uma vez só)
    const divisoes = Array.from(new Set(timesValidos.map((t) => t.divisao)))
    const { data: rodadasData, error: errorRodadas } = await supabase
      .from('rodadas_copa')
      .select('jogos, divisao')
      .in('divisao', divisoes as number[])
    if (errorRodadas) return NextResponse.json({ erro: errorRodadas.message }, { status: 500 })

    // Agrupa rodadas por divisão para lookup rápido
    const rodadasPorDivisao = new Map<number, RodadaRow[]>()
    ;(rodadasData || []).forEach((r: RodadaRow) => {
      const key = Number(r.divisao)
      const arr = rodadasPorDivisao.get(key) || []
      arr.push(r)
      rodadasPorDivisao.set(key, arr)
    })

    // 3) Soma de punições ativas (desconto de pontos) por time
    const { data: punicoesAtivas, error: errorPunicoes } = await supabase
      .from('punicoes')
      .select('id_time, valor')
      .eq('ativo', true)
      .eq('tipo_punicao', 'desconto_pontos')
    if (errorPunicoes) return NextResponse.json({ erro: errorPunicoes.message }, { status: 500 })

    const deducaoPorTime = new Map<string, number>()
    ;(punicoesAtivas || []).forEach((p: PunicaoRow) => {
      const v = Math.max(0, Number(p.valor || 0))
      if (!v) return
      deducaoPorTime.set(p.id_time, (deducaoPorTime.get(p.id_time) || 0) + v)
    })

    // 4) Calcula classificação por time (pontos “puros”)
    const updates: any[] = []

    for (const time of timesValidos) {
      let pontos = 0,
        vitorias = 0,
        empates = 0,
        derrotas = 0,
        gols_pro = 0,
        gols_contra = 0,
        jogos = 0

      const pacoteDivisao = rodadasPorDivisao.get(Number(time.divisao)) || []

      for (const rodada of pacoteDivisao) {
        for (const jogo of (rodada?.jogos || [])) {
          if (jogo?.gols_mandante == null || jogo?.gols_visitante == null) continue

          if (jogo.mandante === time.id) {
            gols_pro += Number(jogo.gols_mandante)
            gols_contra += Number(jogo.gols_visitante)
            jogos++
            if (jogo.gols_mandante > jogo.gols_visitante) vitorias++
            else if (jogo.gols_mandante === jogo.gols_visitante) empates++
            else derrotas++
          } else if (jogo.visitante === time.id) {
            gols_pro += Number(jogo.gols_visitante)
            gols_contra += Number(jogo.gols_mandante)
            jogos++
            if (jogo.gols_visitante > jogo.gols_mandante) vitorias++
            else if (jogo.gols_visitante === jogo.gols_mandante) empates++
            else derrotas++
          }
        }
      }

      pontos = vitorias * 3 + empates

      const pontos_deduzidos = Math.max(0, Math.floor(deducaoPorTime.get(time.id) || 0))
      const pontos_final = Math.max(0, pontos - pontos_deduzidos)

      updates.push({
        id_time: time.id,
        divisao: time.divisao,
        pontos,               // pontos “puros”
        pontos_deduzidos,     // soma de punições ativas
        pontos_final,         // pontos após dedução (nunca negativo)
        vitorias,
        empates,
        derrotas,
        gols_pro,
        gols_contra,
        jogos,
        saldo: gols_pro - gols_contra
      })
    }

    // 5) Upsert na tabela classificacao_copa (inclui campos novos se existirem)
    if (updates.length > 0) {
      const { error: errorInsert } = await supabase
        .from('classificacao_copa')
        .upsert(updates, { onConflict: 'id_time' })
      if (errorInsert) return NextResponse.json({ erro: errorInsert.message }, { status: 500 })
    }

    // 6) Retorna já ordenado por pontos_final > saldo > gols_pro
    const { data: classificacaoData, error: errorClass } = await supabase
      .from('classificacao_copa')
      .select('*, times:times(id, nome, logo_url)')
      .order('pontos_final', { ascending: false, nullsFirst: false })
      .order('saldo', { ascending: false })
      .order('gols_pro', { ascending: false })

    if (errorClass) return NextResponse.json({ erro: errorClass.message }, { status: 500 })

    return NextResponse.json(classificacaoData || [])
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
