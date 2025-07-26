import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const temporada = Number(searchParams.get('temporada') || 1)

  if (!temporada || isNaN(temporada)) {
    return NextResponse.json({ erro: 'Temporada inválida' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('classificacao')
    .select('id_time, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, jogos, divisao, times ( nome, logo_url )')
    .eq('temporada', temporada)
    .order('pontos', { ascending: false })

  if (error) {
    console.error('Erro Supabase:', error.message)
    return NextResponse.json({ erro: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
