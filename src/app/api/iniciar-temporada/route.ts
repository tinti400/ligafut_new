// app/api/iniciar-temporada/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    return NextResponse.json({ erro: 'Variáveis de ambiente ausentes (URL/Service Role).' }, { status: 500 })
  }
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)

    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    // 1) Limpa qualquer classificação existente desta temporada (idempotente)
    const { error: errDel } = await supabase
      .from('classificacao')
      .delete()
      .eq('temporada', temporada)
    if (errDel) return NextResponse.json({ erro: `Erro apagando temporada ${temporada}: ${errDel.message}` }, { status: 500 })

    // 2) Busca times + divisão (aceita number ou string)
    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, divisao')
    if (errTimes) return NextResponse.json({ erro: errTimes.message }, { status: 400 })
    if (!times?.length) return NextResponse.json({ erro: 'Nenhum time encontrado' }, { status: 400 })

    // 3) Monta payload zerado
    const dados = times
      .filter(t => t.divisao !== null && t.divisao !== undefined && !Number.isNaN(Number(t.divisao)))
      .map((t) => ({
        id_time: t.id,
        temporada,
        divisao: Number(t.divisao),
        pontos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        gols_pro: 0,
        gols_contra: 0,
        jogos: 0,
        // ⚠️ NÃO envia colunas que não existam no seu schema
      }))

    if (!dados.length) {
      return NextResponse.json({ erro: 'Nenhum time com divisão válida encontrado' }, { status: 400 })
    }

    // 4) Insert puro (sem upsert/índice único)
    const { data: inserted, error: errInsert } = await supabase
      .from('classificacao')
      .insert(dados)
      .select('id_time')
    if (errInsert) {
      return NextResponse.json({ erro: `Erro inserindo classificação: ${errInsert.message}` }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      mensagem: 'Temporada iniciada com sucesso',
      temporada,
      total_times: dados.length,
      inseridos: inserted?.length ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ erro: err?.message ?? 'Falha ao iniciar temporada' }, { status: 500 })
  }
}
