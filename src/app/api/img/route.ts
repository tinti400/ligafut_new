// src/app/api/img/route.ts
import { NextRequest } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['cdn.sofifa.net'])

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new Response('Missing "u"', { status: 400 })

  let target: URL
  try {
    target = new URL(u)
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }

  if (!ALLOWED.has(target.hostname)) {
    return new Response('Host not allowed', { status: 403 })
  }

  const upstream = await fetch(target.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      'Referer': 'https://sofifa.com/',
    },
  })

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream error: ${upstream.status}`, { status: upstream.status })
  }

  const ct = upstream.headers.get('content-type') ?? 'image/png'
  return new Response(upstream.body, {
    headers: {
      'content-type': ct,
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  })
}
