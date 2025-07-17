import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export interface Movimentacao {
  id_time: string
  tipo: string
  descricao: string
  valor: number
  id_jogador?: string
  id_evento?: string
  data_hora?: string
}

export async function registrarMovimentacao(mov: Movimentacao) {
  const data = {
    id_time: mov.id_time,
    tipo: mov.tipo,
    descricao: mov.descricao,
    valor: mov.valor,
    id_jogador: mov.id_jogador || null,
    id_evento: mov.id_evento || null,
    data_hora: mov.data_hora || new Date().toISOString()
  }

  const { data: result, error } = await supabase
    .from('movimentacoes_financeiras')
    .insert(data)

  if (error) {
    console.error('Erro ao registrar movimentação:', error)
    throw error
  }
  return result
}
