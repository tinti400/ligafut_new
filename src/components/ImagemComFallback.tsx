'use client'

import Image, { ImageProps } from 'next/image'
import { useEffect, useMemo, useState } from 'react'

type Props = ImageProps & {
  /** URL do placeholder quando a imagem falhar */
  fallbackSrc?: string
}

/** Normaliza URLs vindas da planilha e trata provedores comuns. */
function normalizeRemoteUrl(raw: string): string {
  let u = (raw || '').trim().replace(/\s/g, '%20')
  if (!u) return u

  // ---------- Google Drive ----------
  // .../file/d/<ID>/view?...
  const m1 = u.match(/https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\/view/i)
  if (m1) return `https://drive.google.com/uc?export=view&id=${m1[1]}`
  // ...open?id=<ID>  ou  uc?export=download&id=<ID>
  const m2 = u.match(/https?:\/\/drive\.google\.com\/(?:open\?id=|uc\?[^#]*id=)([^&?#]+)/i)
  if (m2) return `https://drive.google.com/uc?export=view&id=${m2[1]}`
  // já direto
  if (/https?:\/\/(?:lh\d+|googleusercontent)\./i.test(u)) return u

  // ---------- Dropbox ----------
  if (/https?:\/\/www\.dropbox\.com\/s\//i.test(u)) {
    const noQuery = u.replace(/\?dl=\d/i, '')
    return noQuery.replace('www.dropbox.com', 'dl.dropboxusercontent.com')
  }

  // ---------- Sofifa (bloqueia hotlink) -> proxy local ----------
  try {
    const host = new URL(u).hostname.toLowerCase()
    if (host.endsWith('cdn.sofifa.net')) {
      // exige o endpoint app/api/img/route.ts
      return `/api/img?u=${encodeURIComponent(u)}`
    }
  } catch {
    // ignore parsing errors e segue com 'u'
  }

  return u
}

export default function ImagemComFallback({
  src,
  alt,
  fallbackSrc = 'https://via.placeholder.com/80x80.png?text=Sem+Foto',
  ...rest
}: Props) {
  // Normaliza o fallback (sem espaços)
  const normalizedFallback = useMemo(
    () => (fallbackSrc || '').trim().replace(/\s/g, '%20') || 'https://via.placeholder.com/80x80.png?text=Sem+Foto',
    [fallbackSrc]
  )

  /** Sempre retorna uma string ou StaticImport (nunca undefined) */
  function sanitizeOrFallback(input: ImageProps['src'] | undefined): ImageProps['src'] {
    if (!input) return normalizedFallback
    if (typeof input === 'string') {
      const s = normalizeRemoteUrl(input)
      return s || normalizedFallback
    }
    // StaticImport (ex.: import avatar from '...')
    return input
  }

  const initialSrc = useMemo(() => sanitizeOrFallback(src), [src, normalizedFallback])
  const [imgSrc, setImgSrc] = useState<ImageProps['src']>(initialSrc)

  useEffect(() => {
    setImgSrc(initialSrc)
  }, [initialSrc])

  const handleError = () => {
    if (imgSrc !== normalizedFallback) setImgSrc(normalizedFallback)
  }

  // Para evitar exigir domains no next.config, não otimiza quando for string (http/https ou /api/img)
  const isStringSrc = typeof imgSrc === 'string'

  return (
    <Image
      src={imgSrc}
      alt={alt || 'Imagem'}
      onError={handleError}
      unoptimized={isStringSrc}
      referrerPolicy="no-referrer"
      {...rest}
    />
  )
}
