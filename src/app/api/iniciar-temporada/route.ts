import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY! // <- server-only (NUNCA expor no client)
const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)  // default = 3
    const limparExistentes: boolean = !!body?.limparExistentes

    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    // (Opcional) limpar tudo desta temporada antes de criar
    if (limparExistentes) {
      const { error: errDel } = await supabase.from('classificacao').delete().eq('temporada', temporada)
      if (errDel) return NextResponse.json({ erro: errDel.message }, { status: 500 })
    }

    // Times com divisão válida
    const { data: times, error } = await supabase.from('times').select('id, divisao')
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 })
    if (!times || times.length === 0)
      return NextResponse.json({ erro: 'Nenhum time encontrado' }, { status: 400 })

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
        saldo: 0, // mantenho porque seu schema usa
      }))

    if (dados.length === 0) {
      return NextResponse.json({ erro: 'Nenhum time com divisão válida encontrado' }, { status: 400 })
    }

    // Idempotente: precisa existir um UNIQUE em (id_time, temporada) ou (id_time, temporada, divisao)
    const { data: upserts, error: errorInsert } = await supabase
      .from('classificacao')
      .upsert(dados, { onConflict: 'id_time,temporada' }) // ajuste para o seu UNIQUE
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
    return NextResponse.json({ erro: err.message ?? 'Falha ao iniciar temporada' }, { status: 500 })
  }
}
