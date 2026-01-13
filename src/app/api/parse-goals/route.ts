import { NextResponse } from 'next/server'

type Goal = { minute: number; player: string }

function normName(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function extractGoalsFromText(fullText: string): Goal[] {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)
  const out: Goal[] = []

  for (const ln of lines) {
    // padrões: "87' B. Thomas" | "87’ Pelé" | "90 Pelé"
    const m = ln.match(/^(\d{1,3})\s*[’'"]?\s+(.+)$/)
    if (!m) continue

    const minute = Number(m[1])
    if (!Number.isFinite(minute) || minute < 0 || minute > 130) continue

    let player = (m[2] || '').trim()
    player = player.replace(/\b(GOL|GOAL|PENALTI|PENALTY|ASSIST|ASSISTENCIA)\b/gi, '').trim()

    // evitar lixo pequeno
    if (player.length < 2) continue

    out.push({ minute, player })
  }

  // dedupe local (nome+minuto)
  const seen = new Set<string>()
  return out.filter(g => {
    const k = `${normName(g.player)}:${g.minute}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const images = (body?.images || []) as Array<{ base64: string }>
    if (!images.length) {
      return NextResponse.json({ ok: false, erro: 'Sem imagens.' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, erro: 'GOOGLE_VISION_API_KEY não configurada.' }, { status: 500 })
    }

    const goalsAll: Goal[] = []

    for (const img of images) {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: img.base64 },
              features: [{ type: 'TEXT_DETECTION' }],
            },
          ],
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        return NextResponse.json(
          { ok: false, erro: json?.error?.message || 'Falha Google Vision' },
          { status: 500 }
        )
      }

      const fullText = json?.responses?.[0]?.fullTextAnnotation?.text || ''
      const goals = extractGoalsFromText(fullText)
      goalsAll.push(...goals)
    }

    // dedupe final (nome+minuto)
    const seen = new Set<string>()
    const merged = goalsAll.filter(g => {
      const k = `${normName(g.player)}:${g.minute}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    return NextResponse.json({ ok: true, goals: merged })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || String(e) }, { status: 500 })
  }
}
