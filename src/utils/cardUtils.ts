export function getTipoCarta(overall: number) {
  if (overall <= 68) return 'bronze'
  if (overall <= 74) return 'prata'
  return 'ouro'
}

