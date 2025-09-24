// app/api/liga-copa/gerar/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type UUID = string
type TimeRow = { id: UUID; nome: string; divisao?: number | null }
type Jogo = {
  mandante_id: UUID
  visitante_id: UUID
  mandante: string
  visitante: string
  gols_mandante: number | null
  gols_visitante: number | null
  data_iso?: string | null
}

// ====== Helpers (seed + shuffle determinístico) ======
function hashStr(s: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}
function shuffleDeterministico<T>(arr: T[], seed: string): T[] {
  const a = [...arr]
  let x = hashStr(seed) || 1
  for (let i = a.length - 1; i > 0; i--) {
    x = (1664525 * x + 1013904223) >>> 0 // LCG
    const j = x % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ====== Datas (próximo sábado 16:00; semanal) ======
function proximoSabado16() {
  const d = new Date()
  const dia = d.getDay() // 0 dom .. 6 sáb
  const delta = (6 - dia + 7) % 7 || 7
  d.setDate(d.getDate() + delta)
  d.setHours(16, 0, 0, 0)
  return d
}
function gerarDatasRodadas(qtd: number, inicio?: Date): string[] {
  const base = inicio ? new Date(inicio) : proximoSabado16()
  const out: string[] = []
  for (let i = 0; i < qtd; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i * 7)
    out.push(d.toISOString())
  }
  return out
}

// ====== Round-robin (turno único) com seed e mandos balanceados ======
function gerarRodadasTurnoUnico(
  times: TimeRow[],
  opts?: { seed?: string; datas?: string[] }
): { numero: number; jogos: Jogo[] }[] {
  if (times.length < 2) return []

  const ghost: TimeRow = { id: 'ghost' as UUID, nome: 'BYE' }
  const lista = times.length % 2 === 1 ? [...times, ghost] : [...times]

  const seed =
    opts?.seed ??
    times
      .map(t => t.id)
      .sort()
      .join('|')

  const arr = shuffleDeterministico(lista, seed)
  const n = arr.length
  const rounds = n - 1
  const half = n / 2

  const fixo = arr[0]
  let rotativos = arr.slice(1)

  const mandos = new Map<string, number>()
  for (const t of times) mandos.set(t.id, 0)

  const datas = opts?.datas ?? gerarDatasRodadas(rounds)
  const result: { numero: number; jogos: Jogo[] }[] = []

  for (let r = 0; r < rounds; r++) {
    const esquerda = [fixo, ...rotativos.slice(0, half - 1)]
    const direita = rotativos.slice(half - 1).reverse()

    const jogos: Jogo[] = []
    for (let i = 0; i < half; i++) {
      const A = esquerda[i]
      const B = direita[i]
      if (!A || !B) continue
      if (A.id === 'ghost' || B.id === 'ghost') continue

      let mand = A
      let vis = B
      const invert = (r + i) % 2 === 1
      if (invert) [mand, vis] = [vis, mand]

      const mMand = mandos.get(mand.id) ?? 0
      const mVis = mandos.get(vis.id) ?? 0
      if (mMand > mVis + 1) [mand, vis] = [vis, mand]

      if (mand.id !== 'ghost') mandos.set(mand.id, (mandos.get(mand.id) ?? 0) + 1)

      jogos.push({
        mandante_id: mand.id as UUID,
        visitante_id: vis.id as UUID,
        mandante: mand.nome,
        visitante: vis.nome,
        gols_mandante: null,
        gols_visitante: null,
        data_iso: datas[r] ?? null,
      })
    }

    result.push({ numero: r + 1, jogos })
    rotativos = [rotativos[rotativos.length - 1], ...rotativos.slice(0, rotativos.length - 1)]
  }
  return result
}

// ====== Route (POST) ======
export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY // ⚠️ server-side only
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'Missing SUPABASE envs (URL or SERVICE_ROLE_KEY)' },
      { status: 500 }
    )
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    // 1) times das divisões 1..3
    const { data: times, error: tErr } = await supabase
      .from('times')
      .select('id, nome, divisao')
      .in('divisao', [1, 2, 3])
      .order('divisao', { ascending: true })
      .order('nome', { ascending: true })

    if (tErr) throw tErr
    const T = (times ?? []) as TimeRow[]
    if (T.length < 2) {
      return NextResponse.json({ ok: false, error: 'É preciso ao menos 2 times (D1–D3).' }, { status: 400 })
    }

    // 2) gerar confrontos
    const qtdTimesPar = T.length % 2 === 0 ? T.length : T.length + 1
    const qtdRodadas = qtdTimesPar - 1
    const datas = gerarDatasRodadas(qtdRodadas)
    const seed = 'liga-copa-D1-D3'

    const listas = gerarRodadasTurnoUnico(T, { seed, datas })
    if (listas.length === 0) {
      return NextResponse.json({ ok: false, error: 'Falha ao gerar rodadas.' }, { status: 500 })
    }

    // 3) limpar tabela e inserir
    const { error: delErr } = await supabase.from('liga_copa_rodadas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (delErr && delErr.code !== '42P01') throw delErr

    const payload = listas.map(r => ({ numero: r.numero, jogos: r.jogos }))
    const { error: insErr, count } = await supabase
      .from('liga_copa_rodadas')
      .insert(payload, { count: 'exact' })

    if (insErr) throw insErr

    return NextResponse.json({ ok: true, rodadas: listas.length, inseridos: count ?? payload.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Erro desconhecido' }, { status: 500 })
  }
}
