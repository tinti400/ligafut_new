import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const { data: times, error: erroTimes } = await supabase.from('times').select('id')

  if (erroTimes) {
    return NextResponse.json({ erro: erroTimes.message }, { status: 500 })
  }

  const { data: classificacao } = await supabase
    .from('classificacao')
    .select('id_time, pontos')
    .order('pontos', { ascending: false })

  for (const time of times) {
    const id = time.id

    const { data: jogos } = await supabase
      .from('jogos')
      .select('*')
      .or(`id_time_mandante.eq.${id},id_time_visitante.eq.${id}`)
      .order('data_jogo', { ascending: false })
      .limit(5)

    let vitorias = 0
    let empates = 0
    let derrotas = 0
    let derrotasGoleada = 0

    for (const jogo of jogos || []) {
      const ehMandante = jogo.id_time_mandante === id
      const golsPro = ehMandante ? jogo.gols_mandante : jogo.gols_visitante
      const golsContra = ehMandante ? jogo.gols_visitante : jogo.gols_mandante

      if (golsPro > golsContra) vitorias++
      else if (golsPro === golsContra) empates++
      else {
        derrotas++
        if (golsContra - golsPro >= 3) derrotasGoleada++
      }
    }

    let moralTecnico = vitorias * 2 + empates
    if (jogos && jogos[0]) {
      const jogo = jogos[0]
      const ehMandante = jogo.id_time_mandante === id
      const perdeuUltimo = (ehMandante && jogo.gols_mandante < jogo.gols_visitante) ||
                           (!ehMandante && jogo.gols_visitante < jogo.gols_mandante)
      if (perdeuUltimo) moralTecnico -= 1
    }

    moralTecnico = Math.max(0, Math.min(10, moralTecnico))

    const index = classificacao?.findIndex((t) => t.id_time === id) ?? -1
    const posicao = index >= 0 ? index + 1 : 20
    const pontos = classificacao?.[index]?.pontos || 0

    const aproveitamento = Math.min(100, Math.round((pontos / (jogos.length * 3)) * 100)) || 0

    let moralTorcida = 30 + (aproveitamento * 0.3) + (10 - posicao) * 2 - derrotas * 5
    moralTorcida = Math.max(0, Math.min(100, moralTorcida))

    await supabase
      .from('times')
      .update({
        moral_tecnico: Math.round(moralTecnico),
        moral_torcida: Math.round(moralTorcida)
      })
      .eq('id', id)
  }

  return NextResponse.json({ status: '✅ Morais atualizadas com sucesso' })
}
