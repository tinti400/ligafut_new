export type JogoFinalizado = {
  mandante_time_id: string
  mandante_nome: string
  visitante_time_id: string
  visitante_nome: string
  gols_mandante: number | null
  gols_visitante: number | null
  status: string
}

export function calculateTable(jogos: JogoFinalizado[]) {
  const tabela = new Map<string, any>()

  function ensure(id: string, nome: string) {
    if (!tabela.has(id)) {
      tabela.set(id, {
        time_id: id,
        nome_time: nome,
        pontos: 0,
        jogos: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        gols_pro: 0,
        gols_contra: 0,
        saldo_gols: 0,
      })
    }
    return tabela.get(id)
  }

  for (const jogo of jogos) {
    if (jogo.status !== 'finalizado') continue
    if (jogo.gols_mandante == null || jogo.gols_visitante == null) continue

    const mandante = ensure(jogo.mandante_time_id, jogo.mandante_nome)
    const visitante = ensure(jogo.visitante_time_id, jogo.visitante_nome)

    mandante.jogos++
    visitante.jogos++

    mandante.gols_pro += jogo.gols_mandante
    mandante.gols_contra += jogo.gols_visitante

    visitante.gols_pro += jogo.gols_visitante
    visitante.gols_contra += jogo.gols_mandante

    if (jogo.gols_mandante > jogo.gols_visitante) {
      mandante.vitorias++
      mandante.pontos += 3
      visitante.derrotas++
    } else if (jogo.gols_mandante < jogo.gols_visitante) {
      visitante.vitorias++
      visitante.pontos += 3
      mandante.derrotas++
    } else {
      mandante.empates++
      visitante.empates++
      mandante.pontos += 1
      visitante.pontos += 1
    }
  }

  const arr = Array.from(tabela.values()).map((item) => ({
    ...item,
    saldo_gols: item.gols_pro - item.gols_contra,
  }))

  arr.sort((a, b) => {
    if (b.pontos !== a.pontos) return b.pontos - a.pontos
    if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
    if (b.saldo_gols !== a.saldo_gols) return b.saldo_gols - a.saldo_gols
    if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
    return a.nome_time.localeCompare(b.nome_time)
  })

  return arr
}