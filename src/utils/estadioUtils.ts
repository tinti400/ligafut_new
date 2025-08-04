// Capacidade total por nível de estádio
export const capacidadePorNivel: Record<number, number> = {
  1: 25000,
  2: 47500,
  3: 67500,
  4: 87500,
  5: 110000
}

// Proporção de assentos por setor
export const setoresBase: Record<string, number> = {
  geral: 0.4,
  norte: 0.2,
  sul: 0.2,
  central: 0.15,
  camarote: 0.05
}

// Preços padrão por setor
export const precosPadrao: Record<string, number> = {
  geral: 20,
  norte: 40,
  sul: 40,
  central: 60,
  camarote: 100,
  vip: 1500
}

// Limites máximos de preços por nível e setor
export const limitesPrecos: Record<number, Record<string, number>> = {
  1: { geral: 100, norte: 150, sul: 150, central: 200, camarote: 1000, vip: 5000 },
  2: { geral: 150, norte: 200, sul: 200, central: 300, camarote: 1500, vip: 5000 },
  3: { geral: 200, norte: 250, sul: 250, central: 400, camarote: 2000, vip: 5000 },
  4: { geral: 250, norte: 300, sul: 300, central: 500, camarote: 2500, vip: 5000 },
  5: { geral: 300, norte: 350, sul: 350, central: 600, camarote: 3000, vip: 5000 }
}

// Cálculo de público estimado e renda por setor
export function calcularPublicoSetor(
  lugares: number,
  preco: number,
  desempenho: number,
  posicao: number,
  vitorias: number,
  derrotas: number,
  nivelEstadio: number,
  moralTecnico: number,
  moralTorcida: number
) {
  const fatorBase =
    0.8 +
    desempenho * 0.007 +
    (20 - posicao) * 0.005 +
    vitorias * 0.01 -
    derrotas * 0.005

  const fatorPreco =
    preco <= 20 ? 1.0 :
    preco <= 50 ? 0.85 :
    preco <= 100 ? 0.65 :
    preco <= 200 ? 0.4 :
    preco <= 500 ? 0.2 : 0.05

  const fatorEstadio = 1 + (nivelEstadio - 1) * 0.15
  const fatorMoral = (moralTecnico / 10 + moralTorcida / 100) / 2

  const publicoEstimado = Math.min(
    lugares,
    Math.floor(lugares * fatorBase * fatorPreco * fatorEstadio * fatorMoral)
  )

  const renda = publicoEstimado * preco
  return { publicoEstimado, renda }
}

// Cálculo de custo para melhorar o estádio
export function calcularMelhoriaEstadio(nivel: number, percentualDesconto: number = 0): number {
  const custoBase = 250_000_000 + nivel * 120_000_000
  return Math.floor(custoBase * (1 - percentualDesconto / 100))
}

// Mensagem de aviso baseado no desempenho do time
export function mensagemDesempenho(desempenho: number): string {
  if (desempenho >= 85) return '🔥 Seu time está em excelente fase! Expectativa de lotação máxima.'
  if (desempenho >= 70) return '😊 Boa fase! Ótima chance de público elevado.'
  if (desempenho >= 50) return '😐 Fase regular. Público razoável esperado.'
  if (desempenho >= 30) return '⚠️ Fase ruim. Público abaixo do esperado. Considere baixar os preços.'
  return '🚨 Péssima fase! Muito difícil atrair público. Baixe o preço urgente!'
}

// Cálculo da moral do técnico baseado nos pontos
export function calcularMoralTecnico(pontos: number): number {
  if (pontos >= 85) return 10
  if (pontos >= 70) return 9
  if (pontos >= 55) return 8
  if (pontos >= 40) return 7
  if (pontos >= 25) return 6
  return 5
}

// Cálculo da moral da torcida baseada no desempenho + ocupação média
export function calcularMoralTorcida(pontos: number, ocupacaoMedia: number): number {
  let moral = 50

  if (pontos >= 85) moral += 30
  else if (pontos >= 70) moral += 20
  else if (pontos >= 50) moral += 10
  else if (pontos < 30) moral -= 10

  if (ocupacaoMedia >= 0.9) moral += 10
  else if (ocupacaoMedia < 0.5) moral -= 10

  return Math.max(30, Math.min(100, Math.round(moral)))
}

// Atualiza moral da torcida com base no resultado da partida e ocupação
export function atualizarMoralTorcidaPeloResultado(
  moralAtual: number,
  resultado: 'vitoria' | 'empate' | 'derrota',
  ocupacao: number // valor entre 0 e 1
): number {
  let novaMoral = moralAtual

  if (resultado === 'vitoria') novaMoral += 10
  else if (resultado === 'empate') novaMoral += 2
  else if (resultado === 'derrota') novaMoral -= 5

  if (ocupacao >= 0.9) novaMoral += 5
  else if (ocupacao < 0.5) novaMoral -= 5

  return Math.max(30, Math.min(100, Math.round(novaMoral)))
}
