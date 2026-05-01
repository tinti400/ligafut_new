'use client'

import Image, { ImageProps } from 'next/image'
import { useEffect, useMemo, useState } from 'react'

export type CardType = 'normal' | 'bronze' | 'prata' | 'ouro' | 'ouro-raro'

type Props = Omit<ImageProps, 'src' | 'alt'> & {
  src?: string | null
  alt?: string
  fallbackSrc?: string
  variant?: 'default' | 'elenco-card'
  cardType?: CardType
  playerName?: string
  position?: string
  overall?: number
  rounded?: boolean
  showLoadingSkeleton?: boolean
}

const DEFAULT_FALLBACK = '/sem-foto.png'

function normalizarImagem(src?: string | null) {
  if (!src) return ''
  const value = String(src).trim()

  if (!value) return ''
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('http://')) return value.replace('http://', 'https://')

  return value
}

function imagemPermitida(src: string) {
  if (!src) return false
  if (src.startsWith('/')) return true

  try {
    const url = new URL(src)
    const path = url.pathname.toLowerCase()

    return ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'].some((ext) =>
      path.endsWith(ext)
    )
  } catch {
    return false
  }
}

function getCardClass(type: CardType) {
  const map: Record<CardType, string> = {
    normal: 'from-slate-800 via-slate-700 to-slate-950 text-white',
    bronze: 'from-[#7a4a1d] via-[#a97142] to-[#2a1a0f] text-yellow-100',
    prata: 'from-[#f8fafc] via-[#94a3b8] to-[#334155] text-black',
    ouro: 'from-[#fff4b0] via-[#f6c453] to-[#b88900] text-black',
    'ouro-raro': 'from-[#fff7c2] via-[#facc15] to-[#92400e] text-black',
  }

  return map[type]
}

export default function ImagemComFallback({
  src,
  fallbackSrc = DEFAULT_FALLBACK,
  alt = 'Imagem',
  variant = 'default',
  cardType = 'normal',
  playerName,
  position,
  overall,
  rounded = false,
  showLoadingSkeleton = true,
  className = '',
  onError,
  onLoad,
  ...rest
}: Props) {
  const imagemNormalizada = useMemo(() => normalizarImagem(src), [src])
  const fallbackNormalizado = useMemo(() => normalizarImagem(fallbackSrc), [fallbackSrc])

  const srcInicial = imagemPermitida(imagemNormalizada)
    ? imagemNormalizada
    : fallbackNormalizado

  const [imgSrc, setImgSrc] = useState(srcInicial)
  const [erroFallback, setErroFallback] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    setImgSrc(srcInicial)
    setErroFallback(false)
    setCarregando(true)
  }, [srcInicial])

  const handleError: ImageProps['onError'] = (event) => {
    if (!erroFallback && imgSrc !== fallbackNormalizado) {
      setImgSrc(fallbackNormalizado)
      setErroFallback(true)
      setCarregando(false)
    }

    onError?.(event)
  }

  const handleLoad: ImageProps['onLoad'] = (event) => {
    setCarregando(false)
    onLoad?.(event)
  }

  if (variant === 'elenco-card') {
    return (
      <div
        className={`
          relative h-[270px] w-[195px] overflow-hidden rounded-[28px]
          bg-gradient-to-br ${getCardClass(cardType)}
          shadow-[0_18px_45px_rgba(0,0,0,0.65)]
          transition-all duration-300 hover:scale-[1.04]
        `}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.5),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 bg-[repeating-linear-gradient(-35deg,transparent_0px,transparent_20px,rgba(255,255,255,0.25)_21px,transparent_42px)]" />

        <div className="absolute left-3 top-3 z-20 drop-shadow">
          {overall !== undefined && (
            <div className="text-4xl font-black leading-none">{overall}</div>
          )}
          {position && (
            <div className="text-xs font-black uppercase tracking-wide">{position}</div>
          )}
        </div>

        <div className="absolute inset-x-0 top-10 z-10 flex justify-center">
          {showLoadingSkeleton && carregando && (
            <div className="absolute h-[170px] w-[150px] animate-pulse rounded-2xl bg-white/20" />
          )}

          <Image
            src={imgSrc || fallbackNormalizado}
            alt={alt}
            onError={handleError}
            onLoad={handleLoad}
            width={155}
            height={180}
            className={`
              h-[180px] w-[155px] object-contain
              drop-shadow-[0_18px_22px_rgba(0,0,0,0.8)]
              transition-opacity duration-300
              ${carregando ? 'opacity-0' : 'opacity-100'}
              ${className}
            `}
            {...rest}
          />
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl bg-black/50 px-3 py-2 text-center backdrop-blur">
          <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-white">
            {playerName || alt}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-[28px] border border-white/30" />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${rounded ? 'rounded-full' : ''}`}>
      {showLoadingSkeleton && carregando && (
        <div className="absolute inset-0 animate-pulse bg-white/10" />
      )}

      <Image
        src={imgSrc || fallbackNormalizado}
        alt={alt}
        onError={handleError}
        onLoad={handleLoad}
        className={`
          transition-opacity duration-300
          ${carregando ? 'opacity-0' : 'opacity-100'}
          ${className}
        `}
        {...rest}
      />
    </div>
  )
}