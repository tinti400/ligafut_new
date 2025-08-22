// app/api/copa/definir-final/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const temporada: number = Number(body?.temporada ?? 1)
  const divisao: number = Number(body?.divisao ?? 1)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    return NextResponse.json({ erro: 'Faltam SUPABASE_URL/SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

  // Pegue as duas semis do seu schema
  const { data: semis, error } = await supabase
    .from('copa_semifinal')
    .select(`
      id, temporada, divisao, id_time1, id_time2,
      gols_time1_ida, gols_time2_ida, gols_time1_volta, gols_time2_volta,
      vencedor_manual
    `)
    .eq('temporada', temporada)
    .eq('divisao', divisao)
    .order('id', { ascending: true })

  if (error) return NextResponse.json({ erro: error.message }, { status: 400 })
  if (!semis || semis.length < 2) {
    return NextResponse.json({ erro: 'Semifinais incompletas.' }, { status: 422 })
  }

  const decidir = (s: any) => {
    const agg1 = (s.gols_time1_ida ?? 0) + (s.gols_time1_volta ?? 0)
    const agg2 = (s.gols_time2_ida ?? 0) + (s.gols_time2_volta ?? 0)
    if (agg1 > agg2) return s.id_time1
    if (agg2 > agg1) return s.id_time2
    // gols fora: time1 fora = VOLTA; time2 fora = IDA
    const away1 = (s.gols_time1_volta ?? 0)
    const away2 = (s.gols_time2_ida ?? 0)
    if (away1 > away2) return s.id_time1
    if (away2 > away1) return s.id_time2
    // se persistir empate, usa vencedor_manual (definido na semi)
    return s.vencedor_manual ?? null
  }

  const vencedor1 = decidir(semis[0])
  const vencedor2 = decidir(semis[1])
  if (!vencedor1 || !vencedor2) {
    return NextResponse.json(
      { erro: 'Empate total em alguma semi. Defina o vencedor manualmente.' },
      { status: 422 }
    )
  }

  const base = { temporada, divisao, id_time1: vencedor1, id_time2: vencedor2 }

  // Upsert tolerante: tenta com "ordem" e, se falhar, tenta com "order"
  let upErr = null
  const up1 = await supabase.from('copa_final')
    .upsert({ ...base, ordem: 1 }, { onConflict: 'temporada,divisao' })
  if (up1.error) {
    const up2 = await supabase.from('copa_final')
      .upsert({ ...base, ["order"]: 1 } as any, { onConflict: 'temporada,divisao' })
    upErr = up2.error
  }

  if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, final: base })
}
