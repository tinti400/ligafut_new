import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST() {
  try {
    const { data: times, error } = await supabase.from('times').select('id, divisao')

    if (error) return NextResponse.json({ erro: error.message }, { status: 400 })
    if (!times || times.length === 0) return NextResponse.json({ erro: 'Nenhum time encontrado' }, { status: 400 })

    const dados = times.map((t) => ({
      id_time: t.id,
      temporada: 2,
      divisao: t.divisao,
      pontos: 0,
      vitorias: 0,
      empates: 0,
      derrotas: 0,
      gols_pro: 0,
      gols_contra: 0,
      jogos: 0,
      saldo: 0,
    }))

    const { error: errorInsert } = await supabase
      .from('classificacao')
      .upsert(dados, { onConflict: 'id_time,temporada,divisao' })

    if (errorInsert) return NextResponse.json({ erro: errorInsert.message }, { status: 500 })

    return NextResponse.json({ ok: true, mensagem: 'Temporada iniciada com sucesso' })
  } catch (err: any) {
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
