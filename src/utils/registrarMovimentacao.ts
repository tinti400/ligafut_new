import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function registrarMovimentacao({
  id_time,
  tipo,
  descricao,
  valor,
}: {
  id_time: string
  tipo: 'entrada' | 'saida'
  descricao: string
  valor: number
}) {
  const { error } = await supabase.from('financeiro').insert({
    id_time,
    tipo,
    descricao,
    valor,
    data: new Date(),
  })

  if (error) {
    console.error('Erro ao registrar movimentação financeira:', error.message)
  }
}
