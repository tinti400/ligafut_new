// app/api/gerar-jogos-temporada/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role para writes
)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Gera tabela de confrontos ida/volta usando round-robin simples
function roundRobin(teamIds: string[], duploTurno: boolean) {
  const ids = [...teamIds]
  if (ids.length % 2 === 1) ids.push('__BYE__') // garantir par
  const n = ids.length
  const rodadas: { mandante: string, visitante: string }[][] = []

  const arr = ids.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const rodada: { mandante: string, visitante: string }[] = []
    const esquerda = ids[0]
    const direita = arr[arr.length - 1]

    if (esquerda !== '__BYE__' && direita !== '__BYE__') {
      rodada.push({ mandante: esquerda, visitante: direita })
    }

    for (let i = 0; i < (n/2) - 1; i++) {
      const a = arr[i]
      const b = arr[(arr.length - 2) - i]
      if (a !== '__BYE__' && b !== '__BYE__') {
        // alterna mando a cada rodada pra variabilidade
        if (r % 2 === 0) rodada.push({ mandante: a, visitante: b })
        else rodada.push({ mandante: b, visitante: a })
      }
    }
    rodadas.push(rodada)

    // rotate (algoritmo polaco)
    arr.unshift(arr.pop() as string)
  }

  if (!duploTurno) return rodadas

  // returno (inverte mandos)
  const volta = rodadas.map(r =>
    r.map(j => ({ mandante: j.visitante, visitante: j.mandante }))
  )
  return [...rodadas, ...volta]
}

export async function POST(req: Request) {
  try {
    const { temporada, divisoes = [1,2,3], duploTurno = true } = await req.json()

    if (!temporada) {
      return NextResponse.json({ erro: 'Informe temporada.' }, { status: 400 })
    }

    // pega times por divisão
    const resumo: Record<number, { times: number; rodadas: number; jogos: number }> = {}

    for (const divisao of divisoes) {
      const { data: times, error: errTimes } = await supabase
        .from('times')
        .select('id')
        .eq('divisao', divisao)
        .order('id', { ascending: true })

      if (errTimes) return NextResponse.json({ erro: errTimes.message }, { status: 500 })
      const teamIds = (times ?? []).map(t => t.id)
      if (teamIds.length < 2) continue

      const matriz = roundRobin(teamIds, duploTurno)
      // limpa rodadas anteriores da mesma temporada/divisão
      const { error: errDel } = await supabase
        .from('rodadas')
        .delete()
        .eq('temporada', temporada)
        .eq('divisao', divisao)
      if (errDel) return NextResponse.json({ erro: errDel.message }, { status: 500 })

      // insere cada rodada
      const inserts = matriz.map((jogos, i) => ({
        id: crypto.randomUUID(),
        numero: i + 1,
        temporada,
        divisao,
        jogos // [{ mandante, visitante }]
      }))

      const { error: errInsert } = await supabase
        .from('rodadas')
        .insert(inserts)

      if (errInsert) return NextResponse.json({ erro: errInsert.message }, { status: 500 })

      resumo[divisao] = {
        times: teamIds.length,
        rodadas: inserts.length,
        jogos: inserts.reduce((acc, r) => acc + r.jogos.length, 0),
      }
    }

    return NextResponse.json({ ok: true, temporada, duploTurno, ...resumo, total_rodadas: Object.values(resumo).reduce((a, r) => a + r.rodadas, 0), total_jogos: Object.values(resumo).reduce((a, r) => a + r.jogos, 0) })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message ?? 'Falha ao gerar jogos.' }, { status: 500 })
  }
}
