'use client'

import Image from 'next/image'
import { useMemo, useState, KeyboardEvent } from 'react'

type Tamanho = 'sm' | 'md' | 'lg'

export interface Jogador {
  id: string | number
  nome: string
  posicao: string
  overall: number
  valor: number
  imagem_url?: string | null
}

interface JogadorCardProps {
  jogador: Jogador
  selecionado?: boolean
  onClick?: () => void
  exibirValor?: boolean
  disabled?: boolean
  size?: Tamanho
  className?: string
}

const formatarBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

export default function JogadorCard({
  jogador,
  selecionado = false,
  onClick,
  exibirValor = true,
  disabled = false,
  size = 'md',
  className,
}: JogadorCardProps) {
  const [src, setSrc] = useState<string>(jogador.imagem_url || '/jogador.png')

  const isInteractive = !!onClick && !disabled
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  const sizes = useMemo(
    () =>
      ({
        sm: { img: 40, gap: 'gap-3', pad: 'p-2.5', textName: 'text-[13px]', textMeta: 'text-[11px]' },
        md: { img: 56, gap: 'gap-4', pad: 'p-3', textName: 'text-sm', textMeta: 'text-xs' },
        lg: { img: 72, gap: 'gap-5', pad: 'p-4', textName: 'text-base', textMeta: 'text-sm' },
      }[size]),
    [size],
  )

  return (
    <div
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : -1}
      aria-pressed={isInteractive ? selecionado : undefined}
      aria-disabled={disabled || undefined}
      title={jogador.nome}
      className={cx(
        'flex items-center rounded-xl border shadow-sm transition-all',
        sizes.pad,
        sizes.gap,
        // visual states
        selecionado
          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-500/10'
          : 'border-black/10 bg-white hover:shadow-md dark:bg-gray-900 dark:border-white/10',
        disabled
          ? 'opacity-60 cursor-not-allowed'
          : isInteractive
          ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/60'
          : 'cursor-default',
        className,
      )}
      data-testid="jogador-card"
    >
      <div className="relative shrink-0">
        <Image
          src={src}
          alt={jogador.nome}
          width={sizes.img}
          height={sizes.img}
          className="rounded-lg object-cover"
          onError={() => setSrc('/jogador.png')}
          loading="lazy"
          // se quiser blur: placeholder="blur" blurDataURL="data:image/svg+xml;base64,PHN2Zy8+"
        />
        {/* badge de posição */}
        <span className="absolute -bottom-1 -right-1 rounded-md bg-gray-900 text-white text-[10px] px-1.5 py-0.5 ring-1 ring-white/10 dark:bg-black">
          {jogador.posicao}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className={cx('font-semibold truncate', sizes.textName)}>{jogador.nome}</p>
        <p className={cx('text-gray-600 dark:text-gray-300', sizes.textMeta)}>
          OVR{' '}
          <span className="font-semibold tabular-nums">
            {jogador.overall}
          </span>
        </p>
        {exibirValor && (
          <p className="text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums text-sm">
            {formatarBRL(Number(jogador.valor || 0))}
          </p>
        )}
      </div>

      {/* chevron sutil quando interativo */}
      {isInteractive && (
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:text-gray-400 dark:group-hover:text-gray-200 transition"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 1 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0Z"
          />
        </svg>
      )}
    </div>
  )
}

/** Skeleton opcional para loading */
export function JogadorCardSkeleton({ size = 'md' as Tamanho }) {
  const sizes = {
    sm: { img: 40, pad: 'p-2.5', gap: 'gap-3' },
    md: { img: 56, pad: 'p-3', gap: 'gap-4' },
    lg: { img: 72, pad: 'p-4', gap: 'gap-5' },
  }[size]
  return (
    <div
      className={cx(
        'flex items-center rounded-xl border border-black/10 bg-white dark:bg-gray-900 dark:border-white/10 shadow-sm animate-pulse',
        sizes.pad,
        sizes.gap,
      )}
    >
      <div
        className="rounded-lg bg-gray-200 dark:bg-gray-700"
        style={{ width: sizes.img, height: sizes.img }}
      />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  )
}
