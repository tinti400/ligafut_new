export function formatarValor(valor: number, negativo = false): string {
  const prefixo = negativo ? '-R$' : 'R$'
  return `${prefixo}${Math.abs(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}
