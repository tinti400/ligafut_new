export function getTipoCarta(overall: number) {
  if (overall <= 64) return 'bronze'
  if (overall <= 74) return 'prata'
  return 'ouro'
}

