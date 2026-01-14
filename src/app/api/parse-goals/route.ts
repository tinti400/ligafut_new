import { NextResponse } from 'next/server'

type Goal = { player: string; minute: number | null; side?: 'home' | 'away' }
type ParseOut = {
  ok: boolean
  data?: {
    mandante: string
    visitante: string
    placar: { mandante: number; visitante: number }
    gols: Array<{ nome: string; minuto?: string | null }>
  }
  error?: string
}

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const STOP_WORDS = [
  'CARTAO',
  'AMARELO',
  'VERMELHO',
  'SUBSTITUICAO',
  'SUBSTITUICAO',
  'ENTRA',
  'SAI',
  'LESIONADO',
  'PENALTI',
  'PENALTY',
  'GOL CONTRA',
  'OWN GOAL',
  'FALTA',
  'IMPEDIMENTO',
  'VAR',
  'EVENTOS',
  'RESUMO',
  'DEFESA',
  'PASSES',
  'FINALIZACOES',
  'POSSE',
]

function looksLikePlayer(line: string) {
  const t = norm(line)
  if (t.length < 3) return false
  if (STOP_WORDS.some(w => t.includes(w))) return false
  // evita linhas só de números
  if (/^\d+$/.test(t)) return false
  // evita "2 - 0"
  if (/^\d+\s*[-xX]\s*\d+$/.test(t)) return false
  return true
}

// tenta achar placar: "2 - 0" ou "2x0"
function extractScore(fullText: string) {
  const t = fullText.replace(/\n/g, ' ')
  const m = t.match(/(\d{1,2})\s*[-xX]\s*(\d{1,2})/)
  if (!m) return null
  return { mandante: Number(m[1]), visitante: Number(m[2]) }
}

// tenta achar times (bem simples — opcional)
function extractTeams(fullText: string) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)
  // heurística: pegar palavras grandes de topo
  // se não achar, retorna vazio e o front só usa placar
  const joinedTop = lines.slice(0, 8).join(' ')
  // exemplo: "FLAMENGO 2 - 0 JUVENTUS MOOCA"
  const m = joinedTop.match(/([A-ZÀ-Ú0-9\s]{3,})\s+\d{1,2}\s*[-xX]\s*\d{1,2}\s+([A-ZÀ-Ú0-9\s]{3,})/i)
  if (!m) return { mandante: '', visitante: '' }
  return { mandante: m[1].trim(), visitante: m[2].trim() }
}

function extractGoalsWithMinute(fullText: string): Goal[] {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)
  const out: Goal[] = []

  for (const ln of lines) {
    // formatos comuns:
    // "67' J. Arroyo" | "67 J. Arroyo" | "67’ J. Arroyo"
    const m = ln.match(/^(\d{1,3})\s*[’'"]?\s+(.+)$/)
    if (!m) continue
    const minute = Number(m[1])
    if (!Number.isFinite(minute) || minute < 0 || minute > 130) continue

    const raw = (m[2] || '').trim()
    if (!looksLikePlayer(raw)) continue

    out.push({ minute, player: raw, side: undefined })
  }

  // dedupe por nome+minuto
  const seen = new Set<string>()
  return out.filter(g => {
    const k = `${norm(g.player)}:${g.minute}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// fallback: sem minuto, usar placar para limitar
function buildGoalsWithoutMinute(fullText: string, needHome: number, needAway: number) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)

  // pega candidatos que parecem nomes
  const players = lines.filter(looksLikePlayer)

  // normaliza e mantém ordem
  const normed = players.map(p => ({ raw: p, n: norm(p) }))

  // agrupa por nome e mantém ordem de primeira aparição
  const order: string[] = []
  const counts = new Map<string, { raw: string; c: number }>()
  for (const p of normed) {
    if (!counts.has(p.n)) {
      counts.set(p.n, { raw: p.raw, c: 0 })
      order.push(p.n)
    }
    counts.get(p.n)!.c += 1
  }

  // 🔥 como decidir se é home/away sem minuto?
  // Nesta tela, geralmente os eventos listados são do time que marcou,
  // mas o print pode conter ambos. Então:
  // - se placar visitante = 0, tudo que aparecer atribuimos ao mandante
  // - se ambos >0, tentamos dividir proporcionalmente pela ordem (não perfeito, mas funciona)
  const gols: Array<{ nome: string; minuto: null; side: 'home' | 'away' }> = []

  if (needAway === 0 && needHome > 0) {
    // tudo pro mandante até completar needHome
    for (const key of order) {
      const info = counts.get(key)!
      while (info.c > 0 && gols.filter(g => g.side === 'home').length < needHome) {
        gols.push({ nome: info.raw, minuto: null, side: 'home' })
        info.c -= 1
      }
      if (gols.filter(g => g.side === 'home').length >= needHome) break
    }
    return gols
  }

  // caso geral (ambos marcaram):
  // vai preenchendo home e away alternando até bater os totais
  let h = 0
  let a = 0
  for (const key of order) {
    const info = counts.get(key)!
    while (info.c > 0 && (h < needHome || a < needAway)) {
      if (h < needHome) {
        gols.push({ nome: info.raw, minuto: null, side: 'home' })
        h++
      } else if (a < needAway) {
        gols.push({ nome: info.raw, minuto: null, side: 'away' })
        a++
      }
      info.c -= 1
    }
    if (h >= needHome && a >= needAway) break
  }
  return gols
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // ✅ aceita os 2 formatos:
    // 1) { images: [{base64}] }
    // 2) { imageBase64: "..." }
    const imagesFromArray = (body?.images || []) as Array<{ base64: string }>
    const one = typeof body?.imageBase64 === 'string' ? [{ base64: body.imageBase64 }] : []
    const images = imagesFromArray.length ? imagesFromArray : one

    if (!images.length) {
      return NextResponse.json({ ok: false, error: 'Sem imagens.' } satisfies ParseOut, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'GOOGLE_VISION_API_KEY não configurada.' } satisfies ParseOut, { status: 500 })
    }

    let fullTextAll = ''

    for (const img of images) {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: img.base64 }, features: [{ type: 'TEXT_DETECTION' }] }],
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: json?.error?.message || 'Falha Google Vision' } satisfies ParseOut,
          { status: 500 }
        )
      }

      const fullText = json?.responses?.[0]?.fullTextAnnotation?.text || ''
      fullTextAll += '\n' + fullText
    }

    const placar = extractScore(fullTextAll)
    if (!placar) {
      return NextResponse.json(
        { ok: false, error: 'Não consegui detectar o placar (ex: 2-0).' } satisfies ParseOut,
        { status: 200 }
      )
    }

    const teams = extractTeams(fullTextAll)

    // 1) tenta gols com minuto
    let goals = extractGoalsWithMinute(fullTextAll)

    // 2) se não achou minuto, usa fallback pelo placar
    if (goals.length === 0) {
      const needHome = placar.mandante
      const needAway = placar.visitante
      const fb = buildGoalsWithoutMinute(fullTextAll, needHome, needAway)
      goals = fb.map(g => ({ player: g.nome, minute: null, side: g.side }))
    }

    // 3) limita gols para não explodir com ruído (NUNCA mais que o placar)
    const limited: Goal[] = []
    let h = 0
    let a = 0
    for (const g of goals) {
      const side = g.side || (placar.visitante === 0 ? 'home' : undefined)
      if (side === 'home') {
        if (h >= placar.mandante) continue
        limited.push({ ...g, side: 'home' })
        h++
      } else if (side === 'away') {
        if (a >= placar.visitante) continue
        limited.push({ ...g, side: 'away' })
        a++
      } else {
        // se não sabe o lado, ainda limita pelo total geral
        if (limited.length >= placar.mandante + placar.visitante) continue
        limited.push(g)
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        mandante: teams.mandante,
        visitante: teams.visitante,
        placar,
        gols: limited.map(g => ({ nome: g.player, minuto: g.minute === null ? null : String(g.minute) })),
      },
    } satisfies ParseOut)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) } satisfies ParseOut, { status: 500 })
  }
}

