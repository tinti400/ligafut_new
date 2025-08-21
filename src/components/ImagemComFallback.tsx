'use client'

import Image, { ImageProps } from 'next/image'
import { useEffect, useMemo, useState } from 'react'

type Props = ImageProps & {
  /** URL do placeholder quando a imagem falhar */
  fallbackSrc?: string
}

function sanitize(src?: ImageProps['src']): ImageProps['src'] {
  if (!src) return src
  if (typeof src === 'string') {
    // remove espaços e normaliza
    const s = src.trim().replace(/\s/g, '%20')
    return s
  }
  // StaticImport (import img from ...)
  return src
}

function isRemoteString(src?: ImageProps['src']): src is string {
  return typeof src === 'string' && /^https?:\/\//i.test(src)
}

function isDisplayable(src?: ImageProps['src']): boolean {
  if (!src) return false
  if (typeof src !== 'string') return true // StaticImport é ok
  // aceita .png/.jpg/.jpeg/.webp/.gif/.bmp/.svg com ou sem query
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i.test(src)) return true
  // aceita data URL (base64)
  if (/^data:image\//i.test(src)) return true
  // pode ser um CDN que não expõe extensão — tentamos mesmo assim
  return /^https?:\/\//i.test(src)
}

export default function ImagemComFallback({
  src,
  alt,
  fallbackSrc = 'https://via.placeholder.com/80x80.png?text=Sem+Foto',
  ...rest
}: Props) {
  const inicial = useMemo(() => {
    const s = sanitize(src)
    return isDisplayable(s) ? s : fallbackSrc
  }, [src, fallbackSrc])

  const [imgSrc, setImgSrc] = useState<ImageProps['src']>(inicial)

  useEffect(() => {
    setImgSrc(inicial)
  }, [inicial])

  const handleError = () => {
    // evita loop se já estiver no fallback
    if (imgSrc !== fallbackSrc) setImgSrc(fallbackSrc)
  }

  // Para URLs remotas, ignoramos domains do Next com `unoptimized`
  const unoptimized = isRemoteString(imgSrc)

  return (
    <Image
      src={imgSrc}
      alt={alt || 'Imagem'}
      onError={handleError}
      unoptimized={unoptimized}
      referrerPolicy="no-referrer"
      {...rest}
    />
  )
}
