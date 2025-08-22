// app/api/copa/definir-final/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 1)
    const divisao: number = Number(body?.divisao ?? 1)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRole) {
      return NextResponse.json(
        { erro: 'Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no ambiente.' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

    // ---- Buscar semis, aceitando variações de tabela/colunas
    const tryFetch = async (table: string, select: string) =>
      supabase
        .from(table)
        .select(select)
        .eq('temporada', temporada)
        .eq('divisao', divisao)
        .order('id', { ascending: true })

    // Tenta primeiro a tabela curta e colunas sem _ida
    const selects = [
      // 1) gols_time1/gols_time2 + volta
      'id,temporada,divisao,id_time1,id_time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta,vencedor_manual',
      // 2) *_ida + *_volta
      'id,temporada,divisao,id_time1,id_time2,gols_time1_ida,gols_time2_ida,gols_time1_volta,gols_time2_volta,vencedor_manual'
    ]
    const tables = ['copa_semi', 'copa_semifinal']

    let semis: any[] | null = null
    for (const table of tables) {
      for (const select of selects) {
        const { data, error } = await tryFetch(table, select)
        if (!error && data && data.length >= 2) {
          semis = data
          break
        }
      }
      if (semis) break
    }
    if (!semis) {
      return NextResponse.json({ erro: 'Semifinais não encontradas para a temporada/divisão.' }, { status: 422 })
    }

    // ---- Normalização de campos (ida/volta)
    const get = (row: any, ...keys: string[]) => {
      for (const k of keys) if (row[k] !== undefined && row[k] !== null) return Number(row[k])
      return 0
    }

    const decidir = (s: any) => {
      const ida1 = get(s, 'gols_time1_ida', 'gols_time1')
      const ida2 = get(s, 'gols_time2_ida', 'gols_time2')
      const vol1 = get(s, 'gols_time1_volta')
      const vol2 = get(s, 'gols_time2_volta')

      const agg1 = ida1 + vol1
      const agg2 = ida2 + vol2
      if (agg1 > agg2) return s.id_time1
      if (agg2 > agg1) return s.id_time2

      // Gols fora: time1 fora = VOLTA; time2 fora = IDA
      if (vol1 > ida2) return s.id_time1
      if (ida2 > vol1) return s.id_time2

      return s.vencedor_manual ?? null
    }

    const vencedor1 = decidir(semis[0])
    const vencedor2 = decidir(semis[1])

    if (!vencedor1 || !vencedor2) {
      return NextResponse.json(
        { erro: 'Alguma semi empatou em tudo. Defina vencedor_manual na semi.' },
        { status: 422 }
      )
    }

    // ---- Garante apenas 1 final por temporada/divisão
    const del = await supabase
      .from('copa_final')
      .delete()
      .eq('temporada', temporada)
      .eq('divisao', divisao)
    if (del.error && !/column .* does not exist/i.test(del.error.message)) {
      return NextResponse.json({ erro: 'Erro ao limpar final: ' + del.error.message }, { status: 400 })
    }

    const base = {
      temporada,
      divisao,
      id_time1: vencedor1,
      id_time2: vencedor2,
      gols_time1: null as number | null,
      gols_time2: null as number | null
    }

    // Tenta inserir com "ordem"; se a coluna não existir, tenta com "order"
    let ins = await supabase.from('copa_final').insert({ ...base, ordem: 1 } as any)
    if (ins.error) {
      ins = await supabase.from('copa_final').insert({ ...base, ['order']: 1 } as any)
      if (ins.error) {
        return NextResponse.json({ erro: 'Erro ao inserir final: ' + ins.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({
      ok: true,
      final: { temporada, divisao, id_time1: vencedor1, id_time2: vencedor2 }
    })
  } catch (e: any) {
    console.error('definir-final error:', e)
    return NextResponse.json({ erro: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}

