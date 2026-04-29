import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { jogoId } = await req.json()

    if (!jogoId) {
      return NextResponse.json(
        { error: 'jogoId não informado.' },
        { status: 400 }
      )
    }

    const { data: jogo, error: jogoError } = await supabase
      .from('competicao_jogos')
      .select('*')
      .eq('id', jogoId)
      .single()

    if (jogoError || !jogo) {
      throw new Error('Jogo não encontrado.')
    }

    if (jogo.status !== 'finalizado') {
      throw new Error('Só é possível excluir resultado de jogo finalizado.')
    }

    if (!jogo.mandante_player_id || !jogo.visitante_player_id) {
      throw new Error('Jogo sem players escalados.')
    }

    const ouroVsOuro =
      jogo.mandante_categoria === 'ouro' && jogo.visitante_categoria === 'ouro'

    const { data: mandantePlayer, error: mpError } = await supabase
      .from('competicao_players')
      .select('*')
      .eq('id', jogo.mandante_player_id)
      .single()

    if (mpError || !mandantePlayer) {
      throw new Error('Player mandante não encontrado.')
    }

    const { data: visitantePlayer, error: vpError } = await supabase
      .from('competicao_players')
      .select('*')
      .eq('id', jogo.visitante_player_id)
      .single()

    if (vpError || !visitantePlayer) {
      throw new Error('Player visitante não encontrado.')
    }

    const novoJogosUsadosMandante = Math.max(0, (mandantePlayer.jogos_usados || 0) - 1)
    const novoJogosUsadosVisitante = Math.max(0, (visitantePlayer.jogos_usados || 0) - 1)

    const novoOuroMandante =
      mandantePlayer.categoria === 'ouro' && ouroVsOuro
        ? Math.max(0, (mandantePlayer.ouro_vs_ouro_realizados || 0) - 1)
        : mandantePlayer.ouro_vs_ouro_realizados || 0

    const novoOuroVisitante =
      visitantePlayer.categoria === 'ouro' && ouroVsOuro
        ? Math.max(0, (visitantePlayer.ouro_vs_ouro_realizados || 0) - 1)
        : visitantePlayer.ouro_vs_ouro_realizados || 0

    const { error: upMandante } = await supabase
      .from('competicao_players')
      .update({
        jogos_usados: novoJogosUsadosMandante,
        ouro_vs_ouro_realizados: novoOuroMandante,
      })
      .eq('id', mandantePlayer.id)

    if (upMandante) throw upMandante

    const { error: upVisitante } = await supabase
      .from('competicao_players')
      .update({
        jogos_usados: novoJogosUsadosVisitante,
        ouro_vs_ouro_realizados: novoOuroVisitante,
      })
      .eq('id', visitantePlayer.id)

    if (upVisitante) throw upVisitante

    const { error: resetJogoError } = await supabase
      .from('competicao_jogos')
      .update({
        mandante_player_id: null,
        mandante_player_nome: null,
        mandante_categoria: null,
        visitante_player_id: null,
        visitante_player_nome: null,
        visitante_categoria: null,
        gols_mandante: null,
        gols_visitante: null,
        status: 'pendente',
      })
      .eq('id', jogoId)

    if (resetJogoError) throw resetJogoError

    return NextResponse.json({
      ok: true,
      message: 'Resultado excluído e confronto liberado para nova edição.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao excluir resultado.' },
      { status: 500 }
    )
  }
}