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
  if (!id_time || !tipo || !descricao || valor === undefined || valor <= 0) {
    console.error('❌ Dados inválidos para registrar movimentação')
    return false
  }

  const { error } = await supabase.from('financeiro').insert({
    id_time,
    tipo,
    descricao,
    valor: Math.abs(valor), // Garante que o valor seja sempre positivo
    data: new Date().toISOString(), // Formato UTC
  })

  if (error) {
    console.error('❌ Erro ao registrar movimentação financeira:', error.message)
    return false
  }

  return true
}
