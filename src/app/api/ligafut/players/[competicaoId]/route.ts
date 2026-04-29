import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ competicaoId: string }> }
) {
  try {
    const { competicaoId } = await params

    if (!competicaoId || competicaoId === 'undefined') {
      return NextResponse.json(
        { error: 'competicaoId inválido ou não informado.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('competicao_players')
      .select('*')
      .eq('competicao_id', competicaoId)
      .order('categoria', { ascending: true })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      players: data || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar players.' },
      { status: 500 }
    )
  }
}