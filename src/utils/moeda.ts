// /src/utils/moeda.ts
export const COINS_PER_BRL = 5_000_000; // R$1 => 5 milhões de moedas

export function brlToMoedas(valorBRL: number) {
  // usa inteiro para evitar ponto flutuante
  return Math.round(valorBRL * COINS_PER_BRL);
}
