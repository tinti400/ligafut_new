export type TipoCarta = 'bronze' | 'prata' | 'ouro' | 'especial'

export function getTipoCarta(overall: number): TipoCarta {
  if (overall < 65) return 'bronze'
  if (overall < 75) return 'prata'
  if (overall < 85) return 'ouro'
  return 'especial'
}

