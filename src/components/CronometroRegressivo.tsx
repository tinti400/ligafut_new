'use client'

import Image, { ImageProps } from 'next/image'
import { useState } from 'react'

type Props = ImageProps & {
  fallbackSrc?: string
}

export default function ImagemComFallback({
  src,
  fallbackSrc = 'https://via.placeholder.com/80x80.png?text=Sem+Foto',
  alt,
  ...rest
}: Props) {
  const [imgSrc, setImgSrc] = useState(src)

  const handleError = () => {
    setImgSrc(fallbackSrc)
  }

  const isImagemValida =
    typeof src === 'string' &&
    (src.endsWith('.png') || src.endsWith('.jpg') || src.endsWith('.jpeg') || src.endsWith('.webp'))

  return (
    <Image
      src={isImagemValida ? imgSrc : fallbackSrc}
      onError={handleError}
      alt={alt}
      {...rest}
    />
  )
}
