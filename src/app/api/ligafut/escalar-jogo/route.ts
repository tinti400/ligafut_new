import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateMatchPlayers } from '@/lib/ligafut/validateLineup'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const {
      jogoId,
      mandantePlayerId,
      visitantePlayerId,
    } = await req.json()

    const { data: jogo, error: jogoError } = await supabase
      .from('competicao_jogos')
      .select('*')
      .eq('id', jogoId)
      .single()

    if (jogoError || !jogo) throw new Error('Jogo não encontrado.')

    const { data: players, error: playerError } = await supabase
      .from('competicao_players')
      .select('*')
      .in('id', [mandantePlayerId, visitantePlayerId])

    if (playerError) throw playerError

    const mandantePlayer = players?.find((p) => p.id === mandantePlayerId)
    const visitantePlayer = players?.find((p) => p.id === visitantePlayerId)

    if (!mandantePlayer || !visitantePlayer) {
      throw new Error('Players não encontrados.')
    }

    if (mandantePlayer.time_id !== jogo.mandante_time_id) {
      throw new Error('O player mandante não pertence a este time.')
    }

    if (visitantePlayer.time_id !== jogo.visitante_time_id) {
      throw new Error('O player visitante não pertence a este time.')
    }

    validateMatchPlayers({
      mandantePlayer,
      visitantePlayer,
    })

    const { error: updateError } = await supabase
      .from('competicao_jogos')
      .update({
        mandante_player_id: mandantePlayer.id,
        mandante_player_nome: mandantePlayer.nome_player,
        mandante_categoria: mandantePlayer.categoria,
        visitante_player_id: visitantePlayer.id,
        visitante_player_nome: visitantePlayer.nome_player,
        visitante_categoria: visitantePlayer.categoria,
        status: 'escalado',
      })
      .eq('id', jogoId)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao escalar jogo.' },
      { status: 500 }
    )
  }
}