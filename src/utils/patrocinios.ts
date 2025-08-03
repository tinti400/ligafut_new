import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/**
 * Realiza o pagamento do bônus de patrocinador com base no desempenho.
 * @returns Valor pago
 */
export async function pagarBonusPatrocinador(
  id_time: string,
  golsPro: number,
  golsContra: number,
  posicao: number
): Promise<number> {
  const tipo = golsPro > golsContra ? 'vitoria' : golsPro === golsContra ? 'empate' : 'derrota'

  const { data: patrocinio } = await supabase
    .from('patrocinios_escolhidos')
    .select('valor_fixo, beneficio, bonus_posicao')
    .eq('id_time', id_time)
    .maybeSingle()

  if (!patrocinio) return 0

  let valor = 0

  // Bônus por resultado (vitoria, empate, derrota)
  if (patrocinio.beneficio === tipo) {
    valor += Number(patrocinio.valor_fixo || 0)
  }

  // Bônus por posição no campeonato (ex: líder, G4, Z4)
  if (patrocinio.bonus_posicao) {
    const bonus = getBonusPorPosicao(posicao, patrocinio.bonus_posicao)
    valor += bonus
  }

  if (valor === 0) return 0

  await supabase.rpc('atualizar_saldo', {
    id_time,
    valor,
  })

  // Registrar no BID
  await supabase.from('bid').insert({
    tipo_evento: 'bonus_patrocinio',
    descricao: 'Bônus de patrocinador por desempenho',
    id_time1: id_time,
    valor,
    data_evento: new Date().toISOString(),
  })

  return valor
}

function getBonusPorPosicao(posicao: number, tipo: string): number {
  if (tipo === 'lider' && posicao === 1) return 10000000
  if (tipo === 'g4' && posicao <= 4) return 6000000
  if (tipo === 'z4' && posicao >= 17) return 3000000
  return 0
}
