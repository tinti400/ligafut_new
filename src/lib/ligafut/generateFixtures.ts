export type TeamInput = {
  time_id: string
  nome_time: string
}

export type Fixture = {
  rodada: number
  mandante_time_id: string
  mandante_nome: string
  visitante_time_id: string
  visitante_nome: string
}

function rotate(arr: TeamInput[]) {
  const fixed = arr[0]
  const rest = arr.slice(1)
  rest.unshift(rest.pop()!)
  return [fixed, ...rest]
}

export function generateDoubleRoundRobin(teams: TeamInput[]): Fixture[] {
  if (teams.length !== 6) {
    throw new Error('A competição exige exatamente 6 times.')
  }

  let current = [...teams]
  const firstLeg: Fixture[] = []
  const rounds = teams.length - 1

  for (let rodada = 1; rodada <= rounds; rodada++) {
    for (let i = 0; i < teams.length / 2; i++) {
      const a = current[i]
      const b = current[current.length - 1 - i]

      const invert = rodada % 2 === 0

      firstLeg.push({
        rodada,
        mandante_time_id: invert ? b.time_id : a.time_id,
        mandante_nome: invert ? b.nome_time : a.nome_time,
        visitante_time_id: invert ? a.time_id : b.time_id,
        visitante_nome: invert ? a.nome_time : b.nome_time,
      })
    }

    current = rotate(current)
  }

  const secondLeg = firstLeg.map((jogo) => ({
    ...jogo,
    rodada: jogo.rodada + rounds,
    mandante_time_id: jogo.visitante_time_id,
    mandante_nome: jogo.visitante_nome,
    visitante_time_id: jogo.mandante_time_id,
    visitante_nome: jogo.mandante_nome,
  }))

  return [...firstLeg, ...secondLeg]
}