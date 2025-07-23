import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // 🔍 Buscar times com histórico recente (ajuste conforme estrutura real)
    const { data: times, error: errorTimes } = await supabase
      .from('times')
      .select('id, nome, divisao')

    if (errorTimes || !times) {
      return NextResponse.json({ erro: 'Erro ao buscar times' }, { status: 500 })
    }

    let totalPremiado = 0

    for (const time of times) {
      const { id: id_time, nome, divisao } = time

      // 🧠 Buscar últimos 5 jogos do time
      const { data: jogos } = await supabase
        .from('resultados')
        .select('gols_pro, gols_contra, resultado')
        .eq('id_time', id_time)
        .order('data_jogo', { ascending: false })
        .limit(5)

      if (!jogos || jogos.length === 0) continue

      const ultima = jogos[0]

      const regras = {
        1: { vitoria: 6_000_000, empate: 3_000_000, derrota: 2_000_000, gol: 500_000, gol_sofrido: 80_000 },
        2: { vitoria: 4_500_000, empate: 2_250_000, derrota: 1_500_000, gol: 375_000, gol_sofrido: 60_000 },
        3: { vitoria: 3_000_000, empate: 1_500_000, derrota: 1_000_000, gol: 250_000, gol_sofrido: 40_000 },
      }

      const r = regras[divisao as 1 | 2 | 3] || regras[1]

      let premiacao = 0

      if (ultima.resultado === 'vitoria') premiacao += r.vitoria
      else if (ultima.resultado === 'empate') premiacao += r.empate
      else premiacao += r.derrota

      premiacao += ultima.gols_pro * r.gol
      premiacao -= ultima.gols_contra * r.gol_sofrido

      const venceu5Seguidas = jogos.length === 5 && jogos.every(j => j.resultado === 'vitoria')
      if (venceu5Seguidas) premiacao += 5_000_000

      if (premiacao === 0) continue

      // 💰 Atualiza saldo do time
      await supabase.rpc('incrementar_saldo', {
        id_time,
        valor: premiacao
      })

      // 🧾 Registrar movimentação
      await supabase.from('movimentacoes').insert({
        id_time,
        tipo: 'premiacao',
        descricao: `Premiação rodada - ${ultima.resultado.toUpperCase()}`,
        valor: premiacao,
        data: new Date().toISOString()
      })

      totalPremiado += premiacao
    }

    return NextResponse.json({ sucesso: true, totalPremiado })
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 })
  }
}
