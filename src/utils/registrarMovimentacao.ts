import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Variáveis do Supabase não configuradas.')
}

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

type TipoMovimentacao = 'entrada' | 'saida'

type RegistrarMovimentacaoParams = {
  id_time: string
  tipo: TipoMovimentacao
  descricao: string
  valor: number
  origem?: string
  id_referencia?: string | number | null
  saldo_antes?: number | null
  saldo_depois?: number | null
}

export async function registrarMovimentacao({
  id_time,
  tipo,
  descricao,
  valor,
  origem = 'sistema',
  id_referencia = null,
  saldo_antes = null,
  saldo_depois = null,
}: RegistrarMovimentacaoParams): Promise<boolean> {
  try {
    const valorNumerico = Number(valor)

    if (!id_time) {
      console.error('❌ id_time não informado.')
      return false
    }

    if (tipo !== 'entrada' && tipo !== 'saida') {
      console.error('❌ Tipo inválido para movimentação:', tipo)
      return false
    }

    if (!descricao || descricao.trim().length < 3) {
      console.error('❌ Descrição inválida para movimentação.')
      return false
    }

    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) {
      console.error('❌ Valor inválido para movimentação:', valor)
      return false
    }

    const payload = {
      id_time,
      tipo,
      descricao: descricao.trim(),
      valor: Math.abs(valorNumerico),
      origem,
      id_referencia,
      saldo_antes,
      saldo_depois,
      data: new Date().toISOString(),
    }

    const { error } = await supabase.from('movimentacoes').insert(payload)

    if (error) {
      console.error('❌ Erro ao registrar movimentação financeira:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        payload,
      })

      return false
    }

    return true
  } catch (error) {
    console.error('❌ Erro inesperado ao registrar movimentação:', error)
    return false
  }
}