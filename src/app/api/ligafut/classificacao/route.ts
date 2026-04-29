import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TimeRow = { id: string; divisao: number | null }
type RodadaRow = { jogos: any[]; divisao: number | null }
type PunicaoRow = { id_time: string; pontos_retirados?: number | null; valor?: number | null }

export async function GET(req: NextRequest) {
  try {
    // -------- params --------
    const url = new URL(req.url)
    const comp = (url.searchParams.get('comp') || 'liga').toLowerCase() // 'liga' | 'copa'
    const persist = url.searchParams.get('persist') === '1'

    const T_RODADAS = comp === 'copa' ? 'rodadas_copa' : 'rodadas_liga'
    const T_CLASSIF = comp === 'copa' ? 'classificacao_copa' : 'classificacao_liga'

    // -------- 1) times com divisão válida --------
    const { data: timesData, error: errorTimes } = await supabase
      .from('times')
      .select('id, divisao')

    if (errorTimes) return NextResponse.json({ erro: errorTimes.message }, { status: 500 })

    const timesValidos: TimeRow[] = (timesData || []).filter(
      (t) => t.divisao !== null && !Number.isNaN(t.divisao)
    )
    if (timesValidos.length === 0) return NextResponse.json([], { status: 200 })

    // -------- 2) carrega rodadas da competição escolhida --------
    const divisoes = Array.from(new Set(timesValidos.map((t) => t.divisao))) as number[]
    const { data: rodadasData, error: errorRodadas } = await supabase
      .from(T_RODADAS)
      .select('jogos, divisao')
      .in('divisao', divisoes)

    if (errorRodadas) {
      // exemplo: relation "rodadas_liga" does not exist (42P01)
      return NextResponse.json({ erro: errorRodadas.message }, { status: 500 })
    }

    const rodadasPorDivisao = new Map<number, RodadaRow[]>()
    ;(rodadasData || []).forEach((r: RodadaRow) => {
      const key = Number(r.divisao)
      const arr = rodadasPorDivisao.get(key) || []
      arr.push(r)
      rodadasPorDivisao.set(key, arr)
    })

    // -------- 3) punições ativas (desconto de pontos) --------
    const { data: punicoesAtivas, error: errorPunicoes } = await supabase
      .from('punicoes')
      .select('id_time, pontos_retirados, valor')
      .eq('ativo', true)
      .eq('tipo_punicao', 'desconto_pontos')

    if (errorPunicoes) return NextResponse.json({ erro: errorPunicoes.message }, { status: 500 })

    const deducaoPorTime = new Map<string, number>()
    ;(punicoesAtivas || []).forEach((p: PunicaoRow) => {
      // prioridade para pontos_retirados; cai para valor se necessário
      const v = Number(
        (p.pontos_retirados ?? p.valor ?? 0)
      )
      const add = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
      if (add > 0) deducaoPorTime.set(p.id_time, (deducaoPorTime.get(p.id_time) || 0) + add)
    })

    // -------- 4) calcula classificação --------
    const rows: any[] = []

    for (const time of timesValidos) {
      let vitorias = 0,
        empates = 0,
        derrotas = 0,
        gols_pro = 0,
        gols_contra = 0,
        jogos = 0

      const pacoteDivisao = rodadasPorDivisao.get(Number(time.divisao)) || []

      for (const rodada of pacoteDivisao) {
        for (const jogo of rodada?.jogos || []) {
          if (jogo?.gols_mandante == null || jogo?.gols_visitante == null) continue

          if (jogo.mandante === time.id) {
            gols_pro += Number(jogo.gols_mandante) || 0
            gols_contra += Number(jogo.gols_visitante) || 0
            jogos++
            if (jogo.gols_mandante > jogo.gols_visitante) vitorias++
            else if (jogo.gols_mandante === jogo.gols_visitante) empates++
            else derrotas++
          } else if (jogo.visitante === time.id) {
            gols_pro += Number(jogo.gols_visitante) || 0
            gols_contra += Number(jogo.gols_mandante) || 0
            jogos++
            if (jogo.gols_visitante > jogo.gols_mandante) vitorias++
            else if (jogo.gols_visitante === jogo.gols_mandante) empates++
            else derrotas++
          }
        }
      }

      const pontos_base = vitorias * 3 + empates
      const pontos_deduzidos = Math.max(0, Math.floor(deducaoPorTime.get(time.id) || 0))
      const pontos_final = Math.max(0, pontos_base - pontos_deduzidos)

      rows.push({
        id_time: time.id,
        divisao: time.divisao,
        jogos,
        vitorias,
        empates,
        derrotas,
        gols_pro,
        gols_contra,
        saldo: gols_pro - gols_contra,
        pontos_base,
        pontos_deduzidos,
        pontos_final
      })
    }

    // ordenação padrão
    rows.sort((a, b) =>
      b.pontos_final - a.pontos_final ||
      b.saldo - a.saldo ||
      b.gols_pro - a.gols_pro
    )

    // -------- 5) persistência opcional --------
    if (persist && rows.length > 0) {
      // tenta upsert com campos extras; se a tabela não tiver, faz fallback
      const extended = rows.map(r => ({
        id_time: r.id_time,
        divisao: r.divisao,
        jogos: r.jogos,
        vitorias: r.vitorias,
        empates: r.empates,
        derrotas: r.derrotas,
        gols_pro: r.gols_pro,
        gols_contra: r.gols_contra,
        saldo: r.saldo,
        // extras
        pontos: r.pontos_base,
        pontos_deduzidos: r.pontos_deduzidos,
        pontos_final: r.pontos_final
      }))

      let upsertErr: any = null
      const up1 = await supabase.from(T_CLASSIF).upsert(extended, { onConflict: 'id_time' })
      if (up1.error) {
        upsertErr = up1.error
        // fallback básico (sem colunas extras)
        const basic = rows.map(r => ({
          id_time: r.id_time,
          divisao: r.divisao,
          jogos: r.jogos,
          vitorias: r.vitorias,
          empates: r.empates,
          derrotas: r.derrotas,
          gols_pro: r.gols_pro,
          gols_contra: r.gols_contra,
          saldo: r.saldo,
          pontos: r.pontos_final // grava o final em "pontos" caso a tabela só tenha isso
        }))
        const up2 = await supabase.from(T_CLASSIF).upsert(basic, { onConflict: 'id_time' })
        if (up2.error) {
          return NextResponse.json(
            { erro: `Falha ao upsert em ${T_CLASSIF}: ${upsertErr.message} / ${up2.error.message}` },
            { status: 500 }
          )
        }
      }
    }

    // -------- 6) retorno --------
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}

