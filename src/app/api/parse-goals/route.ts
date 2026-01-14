import { NextResponse } from 'next/server'

export const runtime = 'nodejs' // garante Node runtime na Vercel
export const dynamic = 'force-dynamic'

type VisionErr = { error?: { message?: string } }

function safeStr(v: any, max = 500) {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    // ✅ aceita { imageBase64 } ou { images:[{base64}] }
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : null
    const imagesArr = Array.isArray(body?.images) ? body.images : null

    const images: Array<{ base64: string }> =
      imagesArr?.length
        ? imagesArr
            .map((x: any) => ({ base64: String(x?.base64 || '') }))
            .filter((x: any) => x.base64)
        : imageBase64
          ? [{ base64: imageBase64 }]
          : []

    if (!images.length) {
      return NextResponse.json(
        { ok: false, error: 'Sem imagens. Envie {imageBase64} ou {images:[{base64}]}.', got: body ? Object.keys(body) : null },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'GOOGLE_VISION_API_KEY não configurada na Vercel.',
          hint: 'Vá em Vercel > Project > Settings > Environment Variables e adicione GOOGLE_VISION_API_KEY (Production + Preview). Depois redeploy.',
        },
        { status: 500 }
      )
    }

    // chama Google Vision (Text Detection)
    const goalsAllText: string[] = []

    for (const img of images) {
      const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
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
      }).catch((e) => {
        throw new Error(`Falha no fetch do Google Vision: ${e?.message || e}`)
      })

      const visionJson: any = await visionRes.json().catch(() => null)

      if (!visionRes.ok) {
        const msg = (visionJson as VisionErr)?.error?.message || 'Falha no Google Vision'
        return NextResponse.json(
          {
            ok: false,
            error: 'Google Vision retornou erro.',
            status: visionRes.status,
            msg,
            raw: safeStr(visionJson),
          },
          { status: 500 }
        )
      }

      const fullText = visionJson?.responses?.[0]?.fullTextAnnotation?.text || ''
      goalsAllText.push(fullText)
    }

    // ✅ por enquanto, só devolve o texto pra provar que está funcionando
    // depois a gente liga o parser de placar/gols
    const joined = goalsAllText.join('\n').trim()

    return NextResponse.json({
      ok: true,
      data: {
        textPreview: joined.slice(0, 1200),
        textLength: joined.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Erro interno no /api/parse-goals',
        message: e?.message || String(e),
        stack: safeStr(e?.stack),
      },
      { status: 500 }
    )
  }
}

