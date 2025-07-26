import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  // Busca apenas os times com divisão preenchida
  const { data: times, error } = await supabase
    .from('times')
    .select('nome')
    .not('divisao', 'is', null)

  if (error || !times) {
    return NextResponse.json({ erro: 'Erro ao buscar times', detalhes: error?.message }, { status: 500 })
  }

  const jogos: { time1: string, time2: string }[] = []
  const jogosPorTime: Record<string, number> = {}

  for (const time of times) {
    jogosPorTime[time.nome] = 0
  }

  while (true) {
    const restantes = times.filter(t => jogosPorTime[t.nome] < 8)
    if (restantes.length < 2) break

    const embaralhados = [...restantes].sort(() => Math.random() - 0.5)
    const [a, b] = embaralhados.slice(0, 2)

    const jaExiste = jogos.some(
      (j) => (j.time1 === a.nome && j.time2 === b.nome) || (j.time1 === b.nome && j.time2 === a.nome)
    )

    if (!jaExiste) {
      jogos.push({ time1: a.nome, time2: b.nome })
      jogosPorTime[a.nome]++
      jogosPorTime[b.nome]++
    }

    if (jogos.length >= ((times.length * 8) / 2)) break
  }

  // Limpa os jogos anteriores
  await supabase.from('copa_fase_liga').delete().neq('id', 0)

  // Divide em rodadas (8 jogos por rodada = 15 rodadas)
  const jogosComRodada = jogos.map((jogo, index) => ({
    ...jogo,
    gols_time1: null,
    gols_time2: null,
    rodada: Math.floor(index / 8) + 1
  }))

  const { error: insertError } = await supabase
    .from('copa_fase_liga')
    .insert(jogosComRodada)

  if (insertError) {
    return NextResponse.json({ erro: 'Erro ao inserir jogos', detalhes: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    mensagem: '✅ Jogos sorteados com sucesso!',
    total: jogos.length,
    rodadas: Math.ceil(jogos.length / 8)
  })
}
