import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { jogoId, golsMandante, golsVisitante } = await req.json()

    const { data: jogo, error: jogoError } = await supabase
      .from('competicao_jogos')
      .select('*')
      .eq('id', jogoId)
      .single()

    if (jogoError || !jogo) throw new Error('Jogo não encontrado.')

    if (!jogo.mandante_player_id || !jogo.visitante_player_id) {
      throw new Error('O jogo ainda não foi escalado.')
    }

    const { error: updateJogoError } = await supabase
      .from('competicao_jogos')
      .update({
        gols_mandante: golsMandante,
        gols_visitante: golsVisitante,
        status: 'finalizado',
      })
      .eq('id', jogoId)

    if (updateJogoError) throw updateJogoError

    const ouroVsOuro =
      jogo.mandante_categoria === 'ouro' && jogo.visitante_categoria === 'ouro'

    const { data: mandantePlayer, error: mpError } = await supabase
      .from('competicao_players')
      .select('*')
      .eq('id', jogo.mandante_player_id)
      .single()

    if (mpError) throw mpError

    const { data: visitantePlayer, error: vpError } = await supabase
      .from('competicao_players')
      .select('*')
      .eq('id', jogo.visitante_player_id)
      .single()

    if (vpError) throw vpError

    const { error: up1 } = await supabase
      .from('competicao_players')
      .update({
        jogos_usados: mandantePlayer.jogos_usados + 1,
        ouro_vs_ouro_realizados:
          mandantePlayer.categoria === 'ouro' && ouroVsOuro
            ? mandantePlayer.ouro_vs_ouro_realizados + 1
            : mandantePlayer.ouro_vs_ouro_realizados,
      })
      .eq('id', mandantePlayer.id)

    if (up1) throw up1

    const { error: up2 } = await supabase
      .from('competicao_players')
      .update({
        jogos_usados: visitantePlayer.jogos_usados + 1,
        ouro_vs_ouro_realizados:
          visitantePlayer.categoria === 'ouro' && ouroVsOuro
            ? visitantePlayer.ouro_vs_ouro_realizados + 1
            : visitantePlayer.ouro_vs_ouro_realizados,
      })
      .eq('id', visitantePlayer.id)

    if (up2) throw up2

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao finalizar jogo.' },
      { status: 500 }
    )
  }
}