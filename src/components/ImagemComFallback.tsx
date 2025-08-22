'use client'

import Image, { ImageProps } from 'next/image'
import { useEffect, useMemo, useState } from 'react'

type Props = ImageProps & {
  /** URL do placeholder quando a imagem falhar */
  fallbackSrc?: string
}

export default function ImagemComFallback({
  src,
  alt,
  fallbackSrc = 'https://via.placeholder.com/80x80.png?text=Sem+Foto',
  ...rest
}: Props) {
  const normalizedFallback = useMemo(
    () => fallbackSrc.trim().replace(/\s/g, '%20'),
    [fallbackSrc]
  )

  function sanitizeOrFallback(
    input: ImageProps['src'] | undefined
  ): string | NonNullable<ImageProps['src']> {
    if (!input) return normalizedFallback
    if (typeof input === 'string') {
      const s = input.trim().replace(/\s/g, '%20')
      return s.length ? s : normalizedFallback
    }
    return input
  }

  const initialSrc = useMemo(() => sanitizeOrFallback(src), [src, normalizedFallback])
  const [imgSrc, setImgSrc] = useState<string | NonNullable<ImageProps['src']>>(initialSrc)

  useEffect(() => {
    setImgSrc(initialSrc)
  }, [initialSrc])

  const handleError = () => {
    if (imgSrc !== normalizedFallback) setImgSrc(normalizedFallback)
  }

  const isRemoteHttp = typeof imgSrc === 'string' && /^https?:\/\//i.test(imgSrc)

  return (
    <Image
      src={imgSrc}
      alt={alt || 'Imagem'}
      onError={handleError}
      unoptimized={isRemoteHttp}
      referrerPolicy="no-referrer"
      {...rest}
    />
  )
}
