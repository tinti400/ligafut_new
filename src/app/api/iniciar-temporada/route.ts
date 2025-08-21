// app/api/iniciar-temporada/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // cria o client somente dentro do handler (evita erro no build)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    return NextResponse.json({ erro: 'Variáveis de ambiente ausentes (URL/Service Role).' }, { status: 500 })
  }
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)          // default = 3
    const limparExistentes: boolean = !!body?.limparExistentes      // opcional

    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    // opcional: limpar classificação existente da mesma temporada
    if (limparExistentes) {
      const { error: errDel } = await supabase
        .from('classificacao')
        .delete()
        .eq('temporada', temporada)
      if (errDel) return NextResponse.json({ erro: errDel.message }, { status: 500 })
    }

    // pega todos os times e suas divisões atuais
    const { data: times, error: errTimes } = await supabase
      .from('times')
      .select('id, divisao')
    if (errTimes) return NextResponse.json({ erro: errTimes.message }, { status: 400 })
    if (!times?.length) return NextResponse.json({ erro: 'Nenhum time encontrado' }, { status: 400 })

    // monta payload zerado
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
        saldo: 0,
      }))

    if (!dados.length) {
      return NextResponse.json({ erro: 'Nenhum time com divisão válida encontrado' }, { status: 400 })
    }

    // upsert idempotente – garanta UNIQUE(id_time, temporada) na tabela `classificacao`
    const { data: upserts, error: errorInsert } = await supabase
      .from('classificacao')
      .upsert(dados, { onConflict: 'id_time,temporada' })
      .select('id_time')

    if (errorInsert) return NextResponse.json({ erro: errorInsert.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      mensagem: 'Temporada iniciada com sucesso',
      temporada,
      total_times: dados.length,
      upserts: upserts?.length ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ erro: err?.message ?? 'Falha ao iniciar temporada' }, { status: 500 })
  }
}
