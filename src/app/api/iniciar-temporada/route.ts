import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !supaKey) {
    return NextResponse.json({ erro: 'Env ausente: URL ou KEY.' }, { status: 500 })
  }
  const supabase = createClient(url, supaKey, { auth: { persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)
    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    // zera a classificação da temporada (idempotente)
    const { error: errDel } = await supabase
      .from('classificacao')
      .delete()
      .eq('temporada', temporada)
    if (errDel) return NextResponse.json({ erro: `Apagando classificação: ${errDel.message}` }, { status: 500 })

    // times + divisão
    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, divisao')
    if (errTimes) return NextResponse.json({ erro: errTimes.message }, { status: 400 })
    if (!times?.length) return NextResponse.json({ erro: 'Nenhum time encontrado' }, { status: 400 })

    const dados = times
      .filter(t => t.divisao !== null && t.divisao !== undefined && !Number.isNaN(Number(t.divisao)))
      .map(t => ({
        id_time: t.id,
        temporada,
        divisao: Number(t.divisao),
        pontos: 0, vitorias: 0, empates: 0, derrotas: 0,
        gols_pro: 0, gols_contra: 0, jogos: 0,
      }))
    if (!dados.length) return NextResponse.json({ erro: 'Nenhum time com divisão válida.' }, { status: 400 })

    const { data: inserted, error: errInsert } = await supabase
      .from('classificacao')
      .insert(dados)
      .select('id_time')
    if (errInsert) return NextResponse.json({ erro: `Inserindo classificação: ${errInsert.message}` }, { status: 500 })

    return NextResponse.json({
      ok: true, mensagem: 'Temporada iniciada', temporada,
      total_times: dados.length, inseridos: inserted?.length ?? 0
    })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message ?? 'Falha ao iniciar temporada' }, { status: 500 })
  }
}
