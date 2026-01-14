import { NextResponse } from 'next/server'

type GoalOut = { nome: string; minuto?: string }
type GoalRaw = { minute: number; player: string }

function normName(s: string) {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function extractGoalsFromText(fullText: string): GoalRaw[] {
  const lines = fullText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const out: GoalRaw[] = []

  for (const ln of lines) {
    // padrões: "87' B. Thomas" | "87’ Pelé" | "90 Pelé" | "90+2 Pelé"
    const m = ln.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[’'"]?\s+(.+)$/)
    if (!m) continue

    const baseMin = Number(m[1])
    const plus = m[2] ? Number(m[2]) : 0
    const minute = baseMin + (Number.isFinite(plus) ? plus : 0)

    if (!Number.isFinite(minute) || minute < 0 || minute > 130) continue

    let player = (m[3] || '').trim()
    player = player
      .replace(/\b(GOL|GOAL|PENALTI|PENALTY|ASSIST|ASSISTENCIA|ASSISTÊNCIA)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (player.length < 2) continue

    out.push({ minute, player })
  }

  // dedupe local (nome+minuto)
  const seen = new Set<string>()
  return out.filter((g) => {
    const k = `${normName(g.player)}:${g.minute}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/**
 * Heurística para tentar pegar:
 * - placar: "FLAMENGO 2 x 0 JUVENTUS" / "2-0" / "2 0"
 * - nomes dos times (strings ao redor)
 */
function extractMatchFromText(fullText: string): {
  mandante: string
  visitante: string
  gm: number | null
  gv: number | null
} {
  const text = (fullText || '').replace(/\r/g, '')
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Tenta achar um padrão "A 2 x 0 B" na MESMA LINHA
  const reSameLine = /(.{2,40}?)\s+(\d{1,2})\s*[xX\-:]\s*(\d{1,2})\s+(.{2,40})/
  for (const ln of lines) {
    const m = ln.match(reSameLine)
    if (m) {
      const a = m[1].trim()
      const b = m[4].trim()
      const gm = Number(m[2])
      const gv = Number(m[3])
      if (Number.isFinite(gm) && Number.isFinite(gv)) {
        return { mandante: a, visitante: b, gm, gv }
      }
    }
  }

  // Tenta pegar "2 x 0" ou "2-0" e buscar nomes próximos
  const reScore = /(\d{1,2})\s*[xX\-:]\s*(\d{1,2})/
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    const m = ln.match(reScore)
    if (!m) continue

    const gm = Number(m[1])
    const gv = Number(m[2])
    if (!Number.isFinite(gm) || !Number.isFinite(gv)) continue

    // tenta usar linhas adjacentes como nomes
    const prev = lines[i - 1] || ''
    const next = lines[i + 1] || ''

    // se a própria linha tiver mais texto além do placar, pode conter times
    const cleaned = ln.replace(reScore, ' ').replace(/\s+/g, ' ').trim()
    if (cleaned.length >= 4) {
      // tenta dividir em duas partes
      const parts = cleaned.split(/\s{2,}|\s+VS\s+|\s+vs\s+/).filter(Boolean)
      if (parts.length >= 2) return { mandante: parts[0], visitante: parts[1], gm, gv }
    }

    if (prev.length >= 3 && next.length >= 3) return { mandante: prev, visitante: next, gm, gv }
    if (prev.length >= 3) return { mandante: prev, visitante: '', gm, gv }
    if (next.length >= 3) return { mandante: '', visitante: next, gm, gv }

    return { mandante: '', visitante: '', gm, gv }
  }

  return { mandante: '', visitante: '', gm: null, gv: null }
}

function toGoalOut(g: GoalRaw): GoalOut {
  // minuto como string (padrão do seu front)
  return { nome: g.player.trim(), minuto: String(g.minute) }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))

    // ✅ aceita os DOIS formatos:
    // 1) { imageBase64: "..." }
    // 2) { images: [{ base64: "..." }, ...] }
    const fromSingle = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
    const fromArray = Array.isArray(body?.images) ? body.images : []

    const images: Array<{ base64: string }> = []
    if (fromSingle) images.push({ base64: fromSingle })
    for (const it of fromArray) {
      if (it?.base64 && typeof it.base64 === 'string') images.push({ base64: it.base64 })
    }

    if (!images.length) {
      // status 200 pra não “pintar vermelho” no console do navegador
      return NextResponse.json({ ok: false, error: 'Sem imagem (envie imageBase64 ou images[]).' })
    }

    // evita payload absurdo (Vercel pode limitar)
    // base64 cresce ~33%; 6_000_000 chars já costuma dar dor de cabeça
    const tooBig = images.some((i) => (i.base64?.length || 0) > 6_000_000)
    if (tooBig) {
      return NextResponse.json({
        ok: false,
        error: 'Imagem muito grande. Faça print mais “cortado” (só placar/eventos) ou reduza a resolução.',
      })
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      // status 200 pra ficar “bonito” no console
      return NextResponse.json({ ok: false, error: 'GOOGLE_VISION_API_KEY não configurada no Vercel.' })
    }

    const goalsAll: GoalRaw[] = []
    let bestText = ''
    let bestTextLen = 0

    for (const img of images) {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: img.base64 },
              // ✅ melhor para OCR de prints
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        // status 200 com ok:false pra não virar 500 no console
        const msg = json?.error?.message || `Falha Google Vision (HTTP ${res.status})`
        return NextResponse.json({ ok: false, error: msg })
      }

      const fullText = json?.responses?.[0]?.fullTextAnnotation?.text || ''
      if (fullText.length > bestTextLen) {
        bestText = fullText
        bestTextLen = fullText.length
      }

      const goals = extractGoalsFromText(fullText)
      goalsAll.push(...goals)
    }

    // dedupe final (nome+minuto)
    const seen = new Set<string>()
    const merged = goalsAll.filter((g) => {
      const k = `${normName(g.player)}:${g.minute}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    const { mandante, visitante, gm, gv } = extractMatchFromText(bestText)

    return NextResponse.json({
      ok: true,
      data: {
        mandante,
        visitante,
        placar: {
          mandante: gm ?? 0,
          visitante: gv ?? 0,
        },
        gols: merged.map(toGoalOut),
        // opcional p/ debug (se quiser mostrar no toast)
        // rawText: bestText,
      },
    })
  } catch (e: any) {
    // só cai aqui em erro inesperado de verdade
    return NextResponse.json({ ok: false, error: e?.message || String(e) })
  }
}

