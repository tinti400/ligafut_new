// app/api/gerar-jogos-temporada/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// util simples p/ uuid
function uuid() {
  // @ts-ignore
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// round-robin (circle method) com ida e volta
function gerarTabela(teamsOrig: string[], duploTurno = true) {
  if (teamsOrig.length < 2) return [] as Array<Array<{ mandante: string; visitante: string; bonus_pago: boolean }>>
  const teams = [...teamsOrig]
  const isOdd = teams.length % 2 === 1
  if (isOdd) teams.push('__BYE__')

  const n = teams.length
  const rounds = n - 1
  const half = n / 2

  let arr = [...teams]
  const rodadas: Array<Array<{ mandante: string; visitante: string; bonus_pago: boolean }>> = []

  for (let r = 0; r < rounds; r++) {
    const jogos: Array<{ mandante: string; visitante: string; bonus_pago: boolean }> = []
    for (let i = 0; i < half; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a === '__BYE__' || b === '__BYE__') continue
      const par = r % 2 === 0
      const mandante = par ? a : b
      const visitante = par ? b : a
      jogos.push({ mandante, visitante, bonus_pago: false })
    }
    rodadas.push(jogos)

    // rotate (fixa o primeiro)
    const [fixo, ...resto] = arr
    resto.unshift(resto.pop() as string)
    arr = [fixo, ...resto]
  }

  if (!duploTurno) return rodadas
  const volta = rodadas.map(jgs => jgs.map(j => ({ mandante: j.visitante, visitante: j.mandante, bonus_pago: false })))
  return [...rodadas, ...volta]
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) {
    return NextResponse.json({ erro: 'Variáveis de ambiente ausentes (URL/Service Role).' }, { status: 500 })
  }
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 3)
    const divisoes: number[] = Array.isArray(body?.divisoes) ? body.divisoes.map(Number) : [1, 2, 3]
    const duploTurno: boolean = body?.duploTurno ?? true
    const limparExistentes: boolean = body?.limparExistentes ?? false

    if (!Number.isInteger(temporada) || temporada <= 0) {
      return NextResponse.json({ erro: 'Temporada inválida.' }, { status: 400 })
    }

    const resumo: Record<number, { rodadas: number; jogos: number }> = {}

    for (const divisao of divisoes) {
      // checa se já existem rodadas p/ evitar duplicação
      const { count: existentes, error: errCount } = await supabase
        .from('rodadas')
        .select('id', { head: true, count: 'exact' })
        .eq('temporada', temporada)
        .eq('divisao', divisao)
      if (errCount) throw errCount

      if ((existentes ?? 0) > 0 && !limparExistentes) {
        resumo[divisao] = { rodadas: 0, jogos: 0 }
        continue
      }

      if (limparExistentes && (existentes ?? 0) > 0) {
        const { error: errDel } = await supabase
          .from('rodadas')
          .delete()
          .eq('temporada', temporada)
          .eq('divisao', divisao)
        if (errDel) throw errDel
      }

      // busca times da divisão
      const { data: times, error: errTimes } = await supabase
        .from('times')
        .select('id')
        .eq('divisao', divisao)
        .order('id', { ascending: true })
      if (errTimes) throw errTimes

      const teamIds = (times ?? []).map(t => t.id)
      if (teamIds.length < 2) {
        resumo[divisao] = { rodadas: 0, jogos: 0 }
        continue
      }

      // gera rodadas (ida e volta)
      const rodadasJogos = gerarTabela(teamIds, duploTurno)

      // monta inserts
      const inserts = rodadasJogos.map((jogos, i) => ({
        id: uuid(),
        numero: i + 1,
        temporada,
        divisao,
        jogos,
      }))

      // insere em lote
      const { error: errInsert } = await supabase.from('rodadas').insert(inserts)
      if (errInsert) throw errInsert

      resumo[divisao] = {
        rodadas: inserts.length,
        jogos: inserts.reduce((acc, r) => acc + r.jogos.length, 0),
      }
    }

    return NextResponse.json({ ok: true, temporada, duploTurno, resumo })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e?.message ?? 'Falha ao gerar jogos.' }, { status: 500 })
  }
}
