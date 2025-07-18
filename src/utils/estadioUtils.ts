export const capacidadePorNivel: Record<number, number> = {
  1: 25000,
  2: 47500,
  3: 67500,
  4: 87500,
  5: 110000
}

export const setoresBase: Record<string, number> = {
  geral: 0.4,
  norte: 0.2,
  sul: 0.2,
  central: 0.15,
  camarote: 0.05
}

export const precosPadrao: Record<string, number> = {
  geral: 20,
  norte: 40,
  sul: 40,
  central: 60,
  camarote: 100,
  vip: 1500
}

export const limitesPrecos: Record<number, Record<string, number>> = {
  1: { geral: 100, norte: 150, sul: 150, central: 200, camarote: 1000, vip: 5000 },
  2: { geral: 150, norte: 200, sul: 200, central: 300, camarote: 1500, vip: 5000 },
  3: { geral: 200, norte: 250, sul: 250, central: 400, camarote: 2000, vip: 5000 },
  4: { geral: 250, norte: 300, sul: 300, central: 500, camarote: 2500, vip: 5000 },
  5: { geral: 300, norte: 350, sul: 350, central: 600, camarote: 3000, vip: 5000 }
}

export function calcularPublicoSetor(
  lugares: number,
  preco: number,
  desempenho: number,
  posicao: number,
  vitorias: number,
  derrotas: number
) {
  const fatorBase = 0.8 + desempenho * 0.007 + (20 - posicao) * 0.005 + vitorias * 0.01 - derrotas * 0.005
  const fatorPreco =
    preco <= 20 ? 1.0 :
    preco <= 50 ? 0.85 :
    preco <= 100 ? 0.65 :
    preco <= 200 ? 0.4 :
    preco <= 500 ? 0.2 : 0.05

  const publicoEstimado = Math.min(lugares, Math.floor(lugares * fatorBase * fatorPreco))
  const renda = publicoEstimado * preco
  return { publicoEstimado, renda }
}

export function calcularMelhoriaEstadio(nivel: number, percentualDesconto: number = 0): number {
  const custoBase = 250_000_000 + nivel * 120_000_000
  return Math.floor(custoBase * (1 - percentualDesconto / 100))
}
