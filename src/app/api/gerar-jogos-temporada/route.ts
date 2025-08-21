import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function uuid() {
  // @ts-ignore
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function gerarTabela(teamsOrig: string[], duploTurno = true) {
  if (teamsOrig.length < 2) return [] as Array<Array<{ mandante: string; visitante: string; bonus_pago: boolean }>>
  const teams = [...teamsOrig]
  if (teams.length % 2 === 1) teams.push('__BYE__')
  const n = teams.length, rounds = n - 1, half = n / 2
  let arr = [...teams]
  const rodadas: Array<Array<{ mandante: string; visitante: string; bonus_pago: boolean }>> = []
  for (let r = 0; r < rounds; r++) {
    const jogos: Array<{ mandante: string; visitante: string; bonus_pago: boolean }> = []
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i]
      if (a === '__BYE__' || b === '__BYE__') continue
      const par = r % 2 === 0
      jogos.push({ mandante: par ? a : b, visitante: par ? b : a, bonus_pago: false })
    }
    rodadas.push(jogos)
    const [fixo, ...resto] = arr
    resto.unshift(resto.pop() as string)
    arr = [fixo, ...resto]
  }
  if (!duploTurno) return rodadas
  const volta = rodadas.map(js => js.map(j => ({ mandante: j.visitante, visitante: j.mandante, bonus_pago: false })))
  return [...rodadas, ...volta]
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !supaKey) {
    return NextResponse.json({ erro: 'Env ausente: URL ou KEY.' }, { status: 500 })
  }
  const supabase = createClient(url, supaKey, { auth: { persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)
    const divisoes: number[] = Array.isArray(body?.divisoes) ? body.divisoes.map(Number) : [1, 2, 3]
    const duploTurno: boolean = body?.duploTurno ?? true
    const limparExistentes: boolean = body?.limparExistentes ?? false
    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    const resumo: Record<number, { times: number; rodadas: number; jogos: number; skipped?: boolean; motivo?: string }> = {}

    for (const divisao of divisoes) {
      if (limparExistentes) {
        const { error: errDel } = await supabase
          .from('rodadas')
          .delete()
          .eq('temporada', temporada)
          .eq('divisao', divisao)
        if (errDel) return NextResponse.json({ erro: errDel.message }, { status: 500 })
      } else {
        const { count: existentes, error: errCount } = await supabase
          .from('rodadas')
          .select('id', { head: true, count: 'exact' })
          .eq('temporada', temporada)
          .eq('divisao', divisao)
        if (errCount) return NextResponse.json({ erro: errCount.message }, { status: 500 })
        if ((existentes ?? 0) > 0) {
          resumo[divisao] = { times: 0, rodadas: 0, jogos: 0, skipped: true, motivo: 'Já existiam rodadas' }
          continue
        }
      }

      // pega times aceitando divisao number OU string
      const { data: timesMix, error: errTimes } = await supabase
        .from('times')
        .select('id, divisao')
        .in('divisao', [divisao as any, String(divisao)])
        .order('id', { ascending: true })
      if (errTimes) return NextResponse.json({ erro: errTimes.message }, { status: 500 })

      const teamIds = (timesMix ?? []).map(t => t.id)
      if (teamIds.length < 2) {
        resumo[divisao] = { times: teamIds.length, rodadas: 0, jogos: 0, motivo: 'Menos de 2 times' }
        continue
      }

      const rodadasJogos = gerarTabela(teamIds, duploTurno)
      const inserts = rodadasJogos.map((jogos, i) => ({
        id: uuid(),
        numero: i + 1,
        temporada,
        divisao,
        jogos,
      }))

      const { error: errInsert } = await supabase.from('rodadas').insert(inserts)
      if (errInsert) return NextResponse.json({ erro: errInsert.message }, { status: 500 })

      resumo[divisao] = {
        times: teamIds.length,
        rodadas: inserts.length,
        jogos: inserts.reduce((acc, r) => acc + r.jogos.length, 0),
      }
    }

    return NextResponse.json({ ok: true, temporada, duploTurno, resumo })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message ?? 'Falha ao gerar jogos.' }, { status: 500 })
  }
}
