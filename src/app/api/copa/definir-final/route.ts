import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // use a service key no servidor para poder inserir/atualizar com segurança
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type RowSemi = {
  id: number | string
  ordem: number | null
  id_time1: string
  id_time2: string
  time1: string
  time2: string
  gols_time1: number | null
  gols_time2: number | null
  gols_time1_volta?: number | null
  gols_time2_volta?: number | null
}

/** tenta buscar com *_volta; se não existir, volta sem essas colunas */
async function fetchSemis(): Promise<{ jogos: RowSemi[]; supportsVolta: boolean }> {
  const q1 = await supabase
    .from('copa_semi')
    .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta')
    .order('ordem', { ascending: true })

  if (q1.error?.message?.toLowerCase().includes('_volta')) {
    const q2 = await supabase
      .from('copa_semi')
      .select('id,ordem,id_time1,id_time2,time1,time2,gols_time1,gols_time2')
      .order('ordem', { ascending: true })
    if (q2.error) throw q2.error
    return { jogos: (q2.data || []) as any, supportsVolta: false }
  }
  if (q1.error) throw q1.error
  return { jogos: (q1.data || []) as any, supportsVolta: true }
}

function completos(j: RowSemi, supportsVolta: boolean) {
  const idaOk = j.gols_time1 != null && j.gols_time2 != null
  const voltaOk = !supportsVolta || (j.gols_time1_volta != null && j.gols_time2_volta != null)
  return idaOk && voltaOk
}

async function pontosClassificacao(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('classificacao').select('id_time,pontos')
  if (error) throw error
  const map: Record<string, number> = {}
  ;(data || []).forEach((r: any) => { map[r.id_time] = r.pontos ?? 0 })
  return map
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const temporada = Number(body?.temporada ?? 1)
    const divisao = Number(body?.divisao ?? 1)

    // 1) Ler semis
    const { jogos, supportsVolta } = await fetchSemis()
    if (!jogos?.length || jogos.length < 2) {
      return NextResponse.json({ erro: 'Semifinal não encontrada (2 jogos necessários).' }, { status: 400 })
    }
    if (jogos.length > 2) {
      // opcional: considerar apenas os 2 primeiros por 'ordem'
      jogos.sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99))
    }

    // 2) Validar placares completos
    if (!jogos.slice(0, 2).every(j => completos(j, supportsVolta))) {
      return NextResponse.json({ erro: 'Preencha todos os placares da Semifinal (ida e volta, se houver).' }, { status: 400 })
    }

    // 3) Desempate por pontos da classificação
    const pts = await pontosClassificacao()

    const vencedores = jogos.slice(0, 2).map((j) => {
      const ida1 = j.gols_time1 ?? 0
      const ida2 = j.gols_time2 ?? 0
      const vol1 = supportsVolta ? (j.gols_time1_volta ?? 0) : 0
      const vol2 = supportsVolta ? (j.gols_time2_volta ?? 0) : 0
      const total1 = ida1 + vol1
      const total2 = ida2 + vol2

      if (total1 > total2) return j.id_time1
      if (total2 > total1) return j.id_time2

      // empate no agregado -> desempata por campanha
      const p1 = pts[j.id_time1] ?? 0
      const p2 = pts[j.id_time2] ?? 0
      if (p1 > p2) return j.id_time1
      if (p2 > p1) return j.id_time2

      // persistindo empate, segue time1
      return j.id_time1
    })

    const [finalista1, finalista2] = vencedores
    if (!finalista1 || !finalista2) {
      return NextResponse.json({ erro: 'Falha ao determinar os dois finalistas.' }, { status: 400 })
    }

    // 4) Inserir nova Final (gols nulos)
    const { error: insErr } = await supabase
      .from('copa_final')
      .insert([{
        id_time1: finalista1,
        id_time2: finalista2,
        gols_time1: null,
        gols_time2: null,
        temporada,
        divisao,
      }])
    if (insErr) throw insErr

    return NextResponse.json({ ok: true, supportsVolta, final: { id_time1: finalista1, id_time2: finalista2 } })
  } catch (e: any) {
    console.error('definir-final error:', e)
    return NextResponse.json({ erro: e?.message || 'Erro desconhecido' }, { status: 500 })
  }
}
