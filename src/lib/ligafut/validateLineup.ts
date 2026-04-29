type Player = {
  id: string
  time_id: string
  nome_player: string
  categoria: 'ouro' | 'prata' | 'bronze'
  jogos_limite: number
  jogos_usados: number
  ouro_vs_ouro_obrigatorio: number
  ouro_vs_ouro_realizados: number
}

export function validateMatchPlayers(params: {
  mandantePlayer: Player
  visitantePlayer: Player
}) {
  const { mandantePlayer, visitantePlayer } = params

  if (mandantePlayer.jogos_usados >= mandantePlayer.jogos_limite) {
    throw new Error(`${mandantePlayer.nome_player} já atingiu o limite de jogos.`)
  }

  if (visitantePlayer.jogos_usados >= visitantePlayer.jogos_limite) {
    throw new Error(`${visitantePlayer.nome_player} já atingiu o limite de jogos.`)
  }

  const mandanteRestantes = mandantePlayer.jogos_limite - mandantePlayer.jogos_usados
  const visitanteRestantes = visitantePlayer.jogos_limite - visitantePlayer.jogos_usados

  const mandantePrecisaOuro =
    mandantePlayer.categoria === 'ouro' &&
    mandantePlayer.ouro_vs_ouro_realizados < mandantePlayer.ouro_vs_ouro_obrigatorio

  const visitantePrecisaOuro =
    visitantePlayer.categoria === 'ouro' &&
    visitantePlayer.ouro_vs_ouro_realizados < visitantePlayer.ouro_vs_ouro_obrigatorio

  const ehOuroVsOuro =
    mandantePlayer.categoria === 'ouro' && visitantePlayer.categoria === 'ouro'

  if (
    mandantePlayer.categoria === 'ouro' &&
    mandantePrecisaOuro &&
    !ehOuroVsOuro &&
    mandanteRestantes <= (mandantePlayer.ouro_vs_ouro_obrigatorio - mandantePlayer.ouro_vs_ouro_realizados)
  ) {
    throw new Error(
      `${mandantePlayer.nome_player} precisa cumprir os confrontos obrigatórios contra Ouro.`
    )
  }

  if (
    visitantePlayer.categoria === 'ouro' &&
    visitantePrecisaOuro &&
    !ehOuroVsOuro &&
    visitanteRestantes <= (visitantePlayer.ouro_vs_ouro_obrigatorio - visitantePlayer.ouro_vs_ouro_realizados)
  ) {
    throw new Error(
      `${visitantePlayer.nome_player} precisa cumprir os confrontos obrigatórios contra Ouro.`
    )
  }

  return {
    ok: true,
    ouroVsOuro: ehOuroVsOuro,
  }
}