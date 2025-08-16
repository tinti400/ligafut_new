// utils/estadioUtils.ts

/** ======= Parâmetros gerais ======= */
export const NIVEL_MAXIMO = 5 as const

/** Capacidade por nível (recompensa forte por evoluir) */
export const capacidadePorNivel: Record<number, number> = {
  1: 22000,
  2: 34000,
  3: 52000,
  4: 74000,
  5: 95000,
}

/** Setores base e proporção de assentos (soma ≈ 1.0) */
export const setoresBase: Record<
  'popular' | 'norte' | 'sul' | 'leste' | 'oeste' | 'camarote',
  number
> = {
  popular: 0.36,
  norte: 0.14,
  sul: 0.14,
  leste: 0.18,
  oeste: 0.16,
  camarote: 0.02,
}

/** Preços de referência por nível (base onde a demanda é ~ neutra) */
const ref: Record<keyof typeof setoresBase, number[]> = {
  // índice 0 -> nível 1, índice 4 -> nível 5
  popular:  [30, 38, 48, 62, 80],
  norte:    [35, 44, 56, 72, 92],
  sul:      [35, 44, 56, 72, 92],
  leste:    [50, 65, 85, 110, 145],
  oeste:    [60, 78, 100, 130, 170],
  camarote: [350, 420, 520, 660, 820],
}

/** Export conveniente: preço padrão (do nível 1) */
export const precosPadrao: Record<keyof typeof setoresBase, number> = {
  popular: ref.popular[0],
  norte: ref.norte[0],
  sul: ref.sul[0],
  leste: ref.leste[0],
  oeste: ref.oeste[0],
  camarote: ref.camarote[0],
}

/** Limites de preço por nível e setor (para inputs) */
export const limitesPrecos: Record<
  number,
  Record<keyof typeof setoresBase, number>
> = {
  1: { popular: 120, norte: 150, sul: 150, leste: 220, oeste: 260, camarote: 1500 },
  2: { popular: 160, norte: 190, sul: 190, leste: 280, oeste: 330, camarote: 2000 },
  3: { popular: 210, norte: 240, sul: 240, leste: 360, oeste: 420, camarote: 2700 },
  4: { popular: 280, norte: 320, sul: 320, leste: 460, oeste: 540, camarote: 3600 },
  5: { popular: 360, norte: 400, sul: 400, leste: 580, oeste: 690, camarote: 4800 },
}

/** Elasticidade base por setor (quanto a demanda cai quando o preço sobe) */
const elasticidadeBase: Record<keyof typeof setoresBase, number> = {
  popular: 1.20,
  norte: 1.05,
  sul: 1.05,
  leste: 0.90,
  oeste: 0.85,
  camarote: 0.55,
}

/** Mensagem contextual por desempenho em pontos (ex.: classificação) */
export function mensagemDesempenho(pontos: number): string {
  if (pontos >= 60) return 'Time em alta! A procura por ingressos está bombando. 💥'
  if (pontos >= 40) return 'Campanha sólida. A torcida está confiante. 👏'
  if (pontos >= 25) return 'Alerta amarelo: resultados irregulares, mas a galera comparece. 🟡'
  return 'Fase difícil. Preços mais acessíveis ajudam a lotar. 🔻'
}

/** Moral do técnico (0-10) derivada de pontos — simples e estável */
export function calcularMoralTecnico(pontos: number): number {
  // 0 pts ~ 4.0 | 90 pts ~ 10.0
  const val = 4 + (Math.min(Math.max(pontos, 0), 90) / 90) * 6
  return Number(val.toFixed(1))
}

/** Preço de referência por setor e nível */
export function precoReferencia(setor: keyof typeof setoresBase, nivel: number): number {
  const idx = Math.min(Math.max(nivel, 1), NIVEL_MAXIMO) - 1
  return ref[setor][idx]
}

/** Custo de melhoria do estádio (n -> n+1) com escala agressiva */
export function calcularMelhoriaEstadio(nivelAtual: number): number {
  // base 80M e cresce 45% por nível
  const base = 80_000_000
  const fator = Math.pow(1.45, Math.max(nivelAtual - 1, 0))
  const bruto = base * fator
  // arredonda para milhão
  return Math.round(bruto / 1_000_000) * 1_000_000
}

/** Util: BRL */
export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** ======= Núcleo de Demanda e Receita =======
 * A demanda parte de:
 *  - desempenho (pontos),
 *  - moral do técnico (0-10) e da torcida (0-100),
 *  - nível do estádio (conforto + experiência => aumenta disposição a pagar),
 *  - contexto do jogo: importância, clássico e clima.
 * O preço atua com elasticidade por setor e é menos sensível com estádio evoluído.
 */
type ContextoJogo = {
  importancia?: number   // 0.7 fraco | 1.0 normal | 1.2 decisivo
  classico?: boolean
  clima?: 'bom' | 'chuva'
}

export function calcularPublicoSetor(
  lugares: number,
  preco: number,
  pontos: number,
  posicaoAproximada: number /* opcional / ignorado */,
  vitoriasRecentes: number /* opcional / ignorado */,
  derrotasRecentes: number /* opcional / ignorado */,
  nivelEstadio: number,
  moralTecnico: number,    // 0-10
  moralTorcida: number,    // 0-100
  contexto: ContextoJogo = {}
) {
  const { importancia = 1.0, classico = false, clima = 'bom' } = contexto

  // Base de procura
  let demandaBase =
    0.28 +                                  // piso
    0.0010 * Math.max(pontos, 0) +          // desempenho
    0.08 * (moralTecnico / 10) +            // confiança no trabalho
    0.14 * (moralTorcida / 100) +           // humor da torcida
    0.06 * Math.max(nivelEstadio - 1, 0)    // conforto/experiência

  // Ajustes de contexto
  if (classico) demandaBase *= 1.15
  demandaBase *= importancia                 // decisivo puxa demanda
  if (clima === 'chuva') demandaBase *= 0.94 // leve queda

  // Intervalo de segurança
  demandaBase = clamp(demandaBase, 0.15, 1.35)

  // Elasticidade efetiva com bônus por nível (torcida tolera preço maior em estádios top)
  const elasticidadeSetorial: Record<keyof typeof setoresBase, number> = Object.fromEntries(
    (Object.keys(setoresBase) as (keyof typeof setoresBase)[]).map((s) => {
      const e0 = elasticidadeBase[s]
      const bonusNivel = 1 - 0.08 * Math.max(nivelEstadio - 1, 0) // -8% por nível acima do 1
      return [s, Math.max(0.35, e0 * bonusNivel)]
    })
  ) as any

  function publicoPara(setor: keyof typeof setoresBase): {
    publicoEstimado: number
    renda: number
    ocupacao: number
  } {
    const pRef = precoReferencia(setor, nivelEstadio)
    const e = elasticidadeSetorial[setor]

    // Curva de preço (logística suave)
    const r = preco <= 0 ? 0.01 : preco / pRef
    const multPreco = Math.exp(-e * (r - 1)) // r>1 reduz, r<1 aumenta
    const procura = clamp(demandaBase * multPreco, 0, 1.5)

    const publicoEstimado = Math.min(lugares, Math.round(lugares * procura))
    const renda = publicoEstimado * preco
    const ocupacao = publicoEstimado / Math.max(lugares, 1)

    return { publicoEstimado, renda, ocupacao }
  }

  // Resultado para um preço qualquer (do setor chamador)
  // O chamador passa qual setor está calculando — como navegamos por todos os setores na página,
  // basta informar o setor correto no momento do uso.
  // Nesta função "genérica", retornaremos a função auxiliar para ser usada por setor.

  return {
    publicoPara,
  }
}

/** Sugerir preço ótimo aproximando a maximização de receita do setor */
export function sugerirPrecoParaSetor(
  setor: keyof typeof setoresBase,
  nivelEstadio: number,
  lugares: number,
  pontos: number,
  moralTecnico: number,
  moralTorcida: number,
  limiteMaximo: number,
  contexto: ContextoJogo = {}
): number {
  const pRef = precoReferencia(setor, nivelEstadio)
  const piso = Math.max(10, Math.round(pRef * 0.5))
  const teto = Math.max(piso, Math.min(limiteMaximo, Math.round(pRef * 2.2)))

  // Varre em passos adaptativos próximos ao ótimo
  let melhor = pRef
  let melhorReceita = -1

  const avaliador = (precoTest: number) => {
    const { publicoPara } = calcularPublicoSetor(
      lugares,
      precoTest,
      pontos,
      0,
      0,
      0,
      nivelEstadio,
      moralTecnico,
      moralTorcida,
      contexto
    )
    const { renda } = publicoPara(setor)
    return renda
  }

  // Busca grossa
  for (let p = piso; p <= teto; p += Math.max(5, Math.round((teto - piso) / 25))) {
    const receita = avaliador(p)
    if (receita > melhorReceita) {
      melhorReceita = receita
      melhor = p
    }
  }
  // Refinamento local
  const passoFino = 2
  for (let p = Math.max(piso, melhor - 20); p <= Math.min(teto, melhor + 20); p += passoFino) {
    const receita = avaliador(p)
    if (receita > melhorReceita) {
      melhorReceita = receita
      melhor = p
    }
  }

  return Math.max(1, Math.round(melhor))
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}
