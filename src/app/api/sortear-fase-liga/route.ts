import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { data: times, error } = await supabase
    .from('times')
    .select('nome')

  if (error || !times) {
    return NextResponse.json({ erro: 'Erro ao buscar times', detalhes: error?.message }, { status: 500 })
  }

  const jogos: { time1: string, time2: string }[] = []
  const jogosPorTime: Record<string, number> = {}

  for (const time of times) {
    jogosPorTime[time.nome] = 0
  }

  while (true) {
    const restantes = times.filter(t => jogosPorTime[t.nome] < 6)
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

    if (jogos.length >= 120) break
  }

  // Limpa jogos anteriores (opcional)
  await supabase.from('copa_fase_liga').delete().neq('id', 0)

  // Insere os jogos
  const { error: insertError } = await supabase
    .from('copa_fase_liga')
    .insert(jogos.map(j => ({
      time1: j.time1,
      time2: j.time2,
      gols_time1: null,
      gols_time2: null,
    })))

  if (insertError) {
    return NextResponse.json({ erro: 'Erro ao inserir jogos', detalhes: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ mensagem: '✅ Jogos sorteados com sucesso!', total: jogos.length })
}
