import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const temporada = Number(req.query.temporada || 1)

  if (!temporada || isNaN(temporada)) {
    return res.status(400).json({ erro: 'Temporada inválida' })
  }

  try {
    const { data, error } = await supabase
      .from('classificacao')
      .select('id_time, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, jogos, divisao, times ( nome, logo_url )')
      .eq('temporada', temporada)
      .order('pontos', { ascending: false })

    if (error) {
      console.error('Erro ao buscar classificação:', error.message)
      return res.status(500).json({ erro: error.message })
    }

    return res.status(200).json(data)
  } catch (err: any) {
    console.error('Erro interno:', err.message)
    return res.status(500).json({ erro: 'Erro interno do servidor' })
  }
}
