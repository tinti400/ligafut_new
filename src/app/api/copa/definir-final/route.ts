// app/api/copa/definir-final/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const dbg = (step: string, extra: any = {}) => ({ ok: false, step, ...extra })

  try {
    const body = await req.json().catch(() => ({}))
    const temporada: number = Number(body?.temporada ?? 1)
    const divisao: number = Number(body?.divisao ?? 1)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRole) {
      return NextResponse.json(
        dbg('env', { erro: 'Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 500 }
      )
    }

    const supabase = createClient(url, serviceRole, { auth: { persistSession: false } })

    // ===== tenta buscar as semis (tabela + colunas variando)
    const selects = [
      // gols "simples" + volta
      'id,temporada,divisao,id_time1,id_time2,gols_time1,gols_time2,gols_time1_volta,gols_time2_volta,vencedor_manual',
      // *_ida + *_volta
      'id,temporada,divisao,id_time1,id_time2,gols_time1_ida,gols_time2_ida,gols_time1_volta,gols_time2_volta,vencedor_manual'
    ]
    const tables = ['copa_semi', 'copa_semifinal']

    let semis: any[] | null = null
    let lastErr: string | null = null

    for (const tb of tables) {
      for (const sel of selects) {
        const { data, error } = await supabase
          .from(tb)
          .select(sel)
          .eq('temporada', temporada)
          .eq('divisao', divisao)
          .order('id', { ascending: true })

        if (!error && data && data.length >= 2) {
          semis = data
          break
        }
        lastErr = error?.message ?? `sem dados suficientes em ${tb} (${sel})`
      }
      if (semis) break
    }

    if (!semis) {
      return NextResponse.json(dbg('fetch_semis', { erro: lastErr }), { status: 422 })
    }

    // ===== normaliza leitura de gols
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

      // gols fora: time1 fora = VOLTA; time2 fora = IDA
      if (vol1 > ida2) return s.id_time1
      if (ida2 > vol1) return s.id_time2

      return s.vencedor_manual ?? null
    }

    const vencedor1 = decidir(semis[0])
    const vencedor2 = decidir(semis[1])
    if (!vencedor1 || !vencedor2) {
      return NextResponse.json(dbg('decidir', { erro: 'Empate total sem vencedor_manual' }), { status: 422 })
    }

    // ===== limpa final da temporada/divisão (fallback: apaga todas se não existir cols)
    let del = await supabase
      .from('copa_final')
      .delete()
      .eq('temporada', temporada)
      .eq('divisao', divisao)

    if (del.error) {
      // se a msg for "column ... does not exist", faz um delete geral
      const msg = del.error.message.toLowerCase()
      if (msg.includes('column') && msg.includes('does not exist')) {
        del = await supabase.from('copa_final').delete().not('id', 'is', null)
      } else {
        return NextResponse.json(dbg('delete_final', { erro: del.error.message }), { status: 400 })
      }
    }

    // ===== tenta inserir com vários formatos de schema
    const base: any = {
      id_time1: vencedor1,
      id_time2: vencedor2,
      gols_time1: null,
      gols_time2: null
    }

    // 1) com temporada/divisao + ordem
    let ins = await supabase
      .from('copa_final')
      .insert({ ...base, temporada, divisao, ordem: 1 })

    if (ins.error) {
      // 2) com temporada/divisao + "order"
      ins = await supabase
        .from('copa_final')
        .insert({ ...base, temporada, divisao, ['order']: 1 } as any)
    }
    if (ins.error) {
      // 3) sem temporada/divisao + ordem
      ins = await supabase
        .from('copa_final')
        .insert({ ...base, ordem: 1 })
    }
    if (ins.error) {
      // 4) sem temporada/divisao + "order"
      ins = await supabase
        .from('copa_final')
        .insert({ ...base, ['order']: 1 } as any)
    }
    if (ins.error) {
      return NextResponse.json(dbg('insert_final', { erro: ins.error.message }), { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      final: { temporada, divisao, id_time1: vencedor1, id_time2: vencedor2 }
    })
  } catch (e: any) {
    // qualquer exceção inesperada cai aqui, com mensagem clara
    return NextResponse.json({ ok: false, step: 'exception', erro: e?.message || String(e) }, { status: 500 })
  }
}

