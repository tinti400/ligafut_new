'use client'

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
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v)

const cx = (...c: Array<string | false | null | undefined>) =>
  c.filter(Boolean).join(' ')

function getRaridade(overall: number) {
  if (overall >= 90) return 'lendario'
  if (overall >= 85) return 'especial'
  if (overall >= 75) return 'ouro'
  if (overall >= 65) return 'prata'
  return 'bronze'
}

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

  const overall = Number(jogador.overall || 0)
  const raridade = getRaridade(overall)
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
        sm: {
          img: 54,
          pad: 'p-3',
          name: 'text-sm',
          card: 'min-h-[96px]',
          overall: 'text-xl',
        },
        md: {
          img: 72,
          pad: 'p-4',
          name: 'text-base',
          card: 'min-h-[118px]',
          overall: 'text-2xl',
        },
        lg: {
          img: 90,
          pad: 'p-5',
          name: 'text-lg',
          card: 'min-h-[142px]',
          overall: 'text-3xl',
        },
      }[size]),
    [size],
  )

  const raridadeClass =
    raridade === 'lendario'
      ? 'from-cyan-400/30 via-violet-500/25 to-amber-300/30 border-cyan-300/50'
      : raridade === 'especial'
        ? 'from-purple-500/25 via-blue-500/20 to-emerald-400/25 border-purple-300/40'
        : raridade === 'ouro'
          ? 'from-yellow-400/25 via-amber-500/20 to-orange-500/25 border-yellow-300/45'
          : raridade === 'prata'
            ? 'from-slate-200/25 via-slate-400/15 to-slate-700/25 border-slate-200/35'
            : 'from-orange-700/25 via-amber-800/20 to-zinc-900/30 border-orange-300/35'

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
        'group relative overflow-hidden rounded-2xl border bg-gradient-to-br text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] transition-all duration-300',
        sizes.pad,
        sizes.card,
        raridadeClass,
        selecionado && 'ring-4 ring-emerald-400/80 scale-[1.02]',
        disabled && 'opacity-55 cursor-not-allowed grayscale',
        isInteractive && 'cursor-pointer hover:-translate-y-1 hover:scale-[1.015] focus:outline-none focus:ring-4 focus:ring-emerald-400/50',
        className,
      )}
      data-testid="jogador-card"
    >
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.35),transparent_35%)] opacity-70" />
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/10 blur-2xl transition-all group-hover:bg-white/20" />
      <div className="absolute -bottom-16 left-1/3 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />

      <div className="relative z-10 flex items-center gap-4">
        <div className="relative shrink-0">
          <div
            className="absolute inset-0 rounded-2xl bg-white/20 blur-md"
            style={{ width: sizes.img, height: sizes.img }}
          />

          <img
            src={src}
            alt={jogador.nome}
            style={{ width: sizes.img, height: sizes.img }}
            className="relative rounded-2xl border border-white/25 bg-black/40 object-cover shadow-xl"
            onError={() => setSrc('/jogador.png')}
          />

          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-lg border border-white/20 bg-black/75 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-md">
            {jogador.posicao}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cx('truncate font-black uppercase tracking-wide text-white drop-shadow', sizes.name)}>
                {jogador.nome}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                LigaFut Card
              </p>
            </div>

            <div className="text-right">
              <p className={cx('font-black leading-none text-white drop-shadow', sizes.overall)}>
                {overall}
              </p>
              <p className="text-[10px] font-black text-white/60">OVR</p>
            </div>
          </div>

          {exibirValor && (
            <div className="mt-3 inline-flex rounded-xl border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-sm font-black text-emerald-200 shadow-inner">
              {formatarBRL(Number(jogador.valor || 0))}
            </div>
          )}
        </div>

        {isInteractive && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/70 transition group-hover:bg-white/20 group-hover:text-white">
            ›
          </div>
        )}
      </div>
    </div>
  )
}

export function JogadorCardSkeleton({ size = 'md' as Tamanho }) {
  const sizes = {
    sm: { img: 54, pad: 'p-3', card: 'min-h-[96px]' },
    md: { img: 72, pad: 'p-4', card: 'min-h-[118px]' },
    lg: { img: 90, pad: 'p-5', card: 'min-h-[142px]' },
  }[size]

  return (
    <div
      className={cx(
        'flex items-center gap-4 rounded-2xl border border-white/10 bg-gray-900 shadow-sm animate-pulse',
        sizes.pad,
        sizes.card,
      )}
    >
      <div
        className="rounded-2xl bg-gray-700"
        style={{ width: sizes.img, height: sizes.img }}
      />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-2/3 rounded bg-gray-700" />
        <div className="h-3 w-1/3 rounded bg-gray-700" />
        <div className="h-6 w-1/2 rounded bg-gray-700" />
      </div>
    </div>
  )
}