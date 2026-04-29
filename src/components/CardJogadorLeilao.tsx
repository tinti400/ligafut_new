'use client'

import React, { useMemo, useState } from 'react'
import classNames from 'classnames'

type Leilao = {
  id: string
  nome: string
  posicao: string
  overall: number
  nacionalidade?: string | null
  imagem_url?: string | null
  link_sofifa?: string | null
  valor_atual: number
  nome_time_vencedor?: string | null
  fim: string
  criado_em: string
}

type Props = {
  leilao: Leilao
  index: number
  travadoPorIdentidade?: string | null
  saldo: number | null
  isAdmin: boolean
  tempoRestante: number
  pctRestante: number
  disabledPorCooldown: boolean
  tremendo?: boolean
  burst?: boolean
  efeitoOverlay?: React.ReactNode
  minimoPermitido: number
  valorProposto: string
  setValorProposto: (v: string) => void
  logoVencedor?: string
  onDarLanceManual: (valorPropostoNum: number) => void
  onDarLanceInc: (inc: number) => void
  onResetMinimo: () => void
  onExcluir?: () => void
  onFinalizar?: () => void
  finalizando?: boolean
}

const INCS = [4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000] as const

const brl = (v?: number | null) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      })
    : '—'

const formatarTempo = (segundos: number) => {
  const h = Math.floor(segundos / 3600)
  const min = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0')
  const sec = Math.max(0, Math.floor(segundos % 60)).toString().padStart(2, '0')
  return h > 0 ? `${h}:${min}:${sec}` : `${min}:${sec}`
}

function cartaTierByOverall(overall: number) {
  if (overall >= 90) return 'lendario'
  if (overall >= 85) return 'especial'
  if (overall <= 64) return 'bronze'
  if (overall <= 74) return 'prata'
  return 'ouro'
}

function cartaClasses(overall: number) {
  const tier = cartaTierByOverall(Number(overall || 0))

  if (tier === 'lendario') {
    return {
      bg: 'from-cyan-400/35 via-violet-500/25 to-yellow-300/25',
      border: 'border-cyan-300/55',
      ring: 'ring-cyan-300/30',
      accent: 'text-cyan-100',
      badge: 'bg-cyan-400/20 text-cyan-100 ring-cyan-300/35',
      glow: 'bg-cyan-300/25',
    }
  }

  if (tier === 'especial') {
    return {
      bg: 'from-purple-500/35 via-blue-500/25 to-emerald-400/25',
      border: 'border-purple-300/50',
      ring: 'ring-purple-300/30',
      accent: 'text-purple-100',
      badge: 'bg-purple-400/20 text-purple-100 ring-purple-300/35',
      glow: 'bg-purple-300/25',
    }
  }

  if (tier === 'bronze') {
    return {
      bg: 'from-[#9b5a28]/35 via-[#3b2112]/35 to-black',
      border: 'border-[#b87333]/45',
      ring: 'ring-[#b87333]/25',
      accent: 'text-[#ffe3c9]',
      badge: 'bg-[#b87333]/20 text-[#ffe3c9] ring-[#b87333]/30',
      glow: 'bg-orange-400/20',
    }
  }

  if (tier === 'prata') {
    return {
      bg: 'from-zinc-200/30 via-slate-500/25 to-black',
      border: 'border-zinc-200/40',
      ring: 'ring-zinc-200/25',
      accent: 'text-zinc-100',
      badge: 'bg-zinc-200/20 text-zinc-100 ring-zinc-200/30',
      glow: 'bg-zinc-200/20',
    }
  }

  return {
    bg: 'from-yellow-300/35 via-amber-500/25 to-black',
    border: 'border-yellow-300/50',
    ring: 'ring-yellow-300/30',
    accent: 'text-yellow-100',
    badge: 'bg-yellow-300/20 text-yellow-100 ring-yellow-300/35',
    glow: 'bg-yellow-300/25',
  }
}

function badgeTierValor(valor: number) {
  if (valor >= 1_500_000_000) return 'bg-fuchsia-500/20 text-fuchsia-100 ring-fuchsia-400/35'
  if (valor >= 1_000_000_000) return 'bg-blue-500/20 text-blue-100 ring-blue-400/35'
  if (valor >= 500_000_000) return 'bg-emerald-500/20 text-emerald-100 ring-emerald-400/35'
  if (valor >= 250_000_000) return 'bg-amber-500/20 text-amber-100 ring-amber-400/35'
  return 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/25'
}

function posBadge(pos: string) {
  const p = (pos || '').toUpperCase()
  if (p === 'ZAGUEIRO') return 'ZAG'
  if (p === 'GOLEIRO') return 'GL'
  if (p === 'MEIO CAMPO') return 'MC'
  if (p === 'LATERAL DIREITO') return 'LD'
  if (p === 'LATERAL ESQUERDO') return 'LE'
  if (p === 'VOLANTE') return 'VOL'
  if (p === 'CENTRO AVANTE') return 'CA'
  return p
}

export default function CardJogadorLeilao({
  leilao,
  index,
  travadoPorIdentidade,
  saldo,
  isAdmin,
  tempoRestante,
  pctRestante,
  disabledPorCooldown,
  tremendo,
  burst,
  efeitoOverlay,
  minimoPermitido,
  valorProposto,
  setValorProposto,
  logoVencedor,
  onDarLanceManual,
  onDarLanceInc,
  onResetMinimo,
  onExcluir,
  onFinalizar,
  finalizando,
}: Props) {
  const [imgSrc, setImgSrc] = useState(leilao.imagem_url || '/player-placeholder.png')

  const encerrado = tempoRestante === 0
  const valorPropostoNum = useMemo(() => Math.floor(Number(valorProposto || 0)), [valorProposto])

  const invalido =
    !isFinite(valorPropostoNum) ||
    valorPropostoNum < minimoPermitido ||
    (saldo !== null && valorPropostoNum > Number(saldo))

  const disabledLance =
    !!travadoPorIdentidade ||
    disabledPorCooldown ||
    encerrado ||
    invalido ||
    (saldo !== null && valorPropostoNum > Number(saldo))

  const c = cartaClasses(Number(leilao.overall || 0))
  const tier = cartaTierByOverall(Number(leilao.overall || 0))
  const vencedor = leilao.nome_time_vencedor || ''
  const hasVencedor = Boolean(vencedor)

  const barraCor = encerrado
    ? 'bg-red-500'
    : tempoRestante <= 15
      ? 'bg-amber-400'
      : 'bg-emerald-500'

  return (
    <div className="relative">
      <div
        className={classNames(
          'group relative overflow-hidden rounded-[30px] border bg-gradient-to-br shadow-[0_28px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-all duration-300',
          c.bg,
          c.border,
          tremendo ? 'animate-pulse ring-4 ring-emerald-400/45' : classNames('ring-1', c.ring),
          !encerrado && 'hover:-translate-y-1 hover:scale-[1.015]',
        )}
      >
        {/* FOTO COMO FUNDO PREMIUM */}
        <div className="absolute inset-0 z-0">
          <img
            src={imgSrc}
            alt={leilao.nome}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-full w-full object-cover scale-110 brightness-[0.72] contrast-110 saturate-110 transition-transform duration-700 group-hover:scale-125"
            onError={(e) => {
              const img = e.currentTarget
              if (img.src.includes('26_120.png')) {
                setImgSrc(img.src.replace('26_120.png', '25_120.png'))
              } else if (img.src.includes('25_120.png')) {
                setImgSrc(img.src.replace('25_120.png', '24_120.png'))
              } else {
                setImgSrc('/player-placeholder.png')
              }
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-transparent to-black/35" />
        </div>

        {/* GLOWS */}
        <div className={classNames('pointer-events-none absolute -top-24 left-1/2 z-10 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl', c.glow)} />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.09),transparent)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        <div className="relative z-20 flex flex-col p-4 sm:p-5">
          {/* TEMPO */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-white/70">
              <span>Tempo restante</span>
              <span className={encerrado ? 'text-red-200' : tempoRestante <= 15 ? 'text-amber-200' : 'text-emerald-200'}>
                {encerrado ? 'Encerrado' : formatarTempo(tempoRestante)}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10">
              <div
                className={classNames('h-full rounded-full transition-[width] duration-1000', barraCor)}
                style={{ width: `${pctRestante}%` }}
              />
            </div>
          </div>

          {/* TOPO */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={classNames('text-5xl font-black leading-none tracking-tight drop-shadow-[0_3px_0_rgba(0,0,0,0.45)]', c.accent)}>
                {Number(leilao.overall ?? 0)}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-sky-500/20 px-2.5 py-1 text-[11px] font-black text-sky-100 ring-1 ring-sky-400/30">
                  {posBadge(leilao.posicao)}
                </span>

                <span className={classNames('rounded-xl px-2.5 py-1 text-[11px] font-black ring-1', c.badge)}>
                  {tier.toUpperCase()}
                </span>

                {leilao.nacionalidade && (
                  <span className="rounded-xl bg-black/35 px-2.5 py-1 text-[11px] font-semibold text-white/85 ring-1 ring-white/10">
                    {leilao.nacionalidade}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className="rounded-2xl border border-white/15 bg-black/45 px-3 py-1 text-[11px] font-black text-white/80 backdrop-blur">
                #{index + 1}
              </span>

              {isAdmin && onExcluir && (
                <button
                  onClick={onExcluir}
                  className="rounded-xl border border-red-400/25 bg-red-600/20 px-3 py-1 text-[11px] font-bold text-red-100 hover:bg-red-600/35"
                >
                  🗑️ Excluir
                </button>
              )}
            </div>
          </div>

          {/* ÁREA CENTRAL */}
          <div className="mt-48 sm:mt-56">
            <div className="rounded-3xl border border-white/15 bg-black/55 p-4 shadow-2xl backdrop-blur-md">
              <div className="truncate text-center text-lg font-black uppercase tracking-wide text-white">
                {leilao.nome}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <a
                  href={leilao.link_sofifa || '#'}
                  target={leilao.link_sofifa ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className={classNames(
                    'inline-flex items-center gap-2 rounded-xl px-3 py-1 text-[11px] font-bold ring-1',
                    leilao.link_sofifa
                      ? 'bg-sky-500/15 text-sky-100 ring-sky-400/25 hover:bg-sky-500/25'
                      : 'pointer-events-none bg-zinc-800/50 text-zinc-500 ring-white/10',
                  )}
                >
                  🔗 SoFIFA
                </a>

                <span className={classNames('rounded-xl px-3 py-1 text-[12px] font-black ring-1', badgeTierValor(leilao.valor_atual))}>
                  {brl(leilao.valor_atual)}
                </span>
              </div>

              {hasVencedor && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-black/45 px-3 py-2 text-xs font-bold text-white/90 ring-1 ring-white/10">
                  👑 Liderando:
                  {logoVencedor ? (
                    <img
                      src={logoVencedor}
                      alt={vencedor}
                      className="h-5 w-5 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                  ) : null}
                  <span className="truncate">{vencedor}</span>
                </div>
              )}

              {encerrado && (
                <div className="mt-3 rounded-2xl border border-red-400/25 bg-red-600/20 px-3 py-2 text-center text-xs font-black text-red-100">
                  LEILÃO ENCERRADO
                </div>
              )}
            </div>
          </div>

          {/* LANCES */}
          <div className="mt-4 rounded-3xl border border-white/15 bg-black/55 p-3 shadow-xl backdrop-blur-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={classNames(
                  'w-full rounded-2xl border bg-black/45 px-4 py-3 text-sm font-bold text-white tabular-nums outline-none placeholder:text-white/30',
                  invalido
                    ? 'border-red-400/45 focus:ring-2 focus:ring-red-400/30'
                    : 'border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/30',
                )}
                value={valorProposto}
                onChange={(e) => setValorProposto(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={String(minimoPermitido)}
                disabled={!!travadoPorIdentidade}
              />

              <button
                onClick={() => onDarLanceManual(valorPropostoNum)}
                disabled={disabledLance}
                className={classNames(
                  'w-full rounded-2xl px-5 py-3 text-sm font-black transition sm:w-auto',
                  disabledLance
                    ? 'cursor-not-allowed border border-white/10 bg-zinc-900/70 text-zinc-500'
                    : 'border border-emerald-300/30 bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500 hover:scale-[1.03]',
                )}
              >
                Dar lance
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 text-[11px] text-white/75 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mínimo:{' '}
                <b className="tabular-nums text-white">
                  {brl(minimoPermitido)}
                </b>
              </span>

              <button
                type="button"
                onClick={onResetMinimo}
                className="rounded-2xl border border-emerald-300/25 bg-emerald-500/15 px-3 py-2 font-black text-emerald-100 hover:bg-emerald-500/25"
              >
                +20mi mínimo
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INCS.map((inc) => {
                const disabled =
                  !!travadoPorIdentidade ||
                  disabledPorCooldown ||
                  encerrado ||
                  (saldo !== null && Number(leilao.valor_atual) + inc > saldo)

                return (
                  <button
                    key={inc}
                    onClick={() => onDarLanceInc(inc)}
                    disabled={disabled}
                    className={classNames(
                      'rounded-2xl border px-2 py-2 text-[12px] font-black tabular-nums transition',
                      disabled
                        ? 'cursor-not-allowed border-white/10 bg-zinc-900/55 text-zinc-500'
                        : 'border-emerald-300/25 bg-black/35 text-emerald-100 hover:bg-emerald-500/20 hover:scale-[1.03]',
                    )}
                  >
                    + {(inc / 1_000_000).toLocaleString('pt-BR')} mi
                  </button>
                )
              })}
            </div>

            {isAdmin && onFinalizar && encerrado && (
              <button
                onClick={onFinalizar}
                disabled={!!finalizando}
                className={classNames(
                  'mt-3 w-full rounded-2xl border px-3 py-3 text-sm font-black transition',
                  finalizando
                    ? 'cursor-not-allowed border-white/10 bg-zinc-900/70 text-zinc-500'
                    : 'border-red-300/25 bg-red-600 text-white hover:bg-red-500',
                )}
              >
                {finalizando ? 'Finalizando…' : 'Finalizar Leilão'}
              </button>
            )}
          </div>
        </div>

        {burst && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="animate-[fadeout_0.75s_ease_forwards] select-none text-5xl">
              💥✨🔥
            </div>
          </div>
        )}

        {efeitoOverlay}
      </div>

      <style jsx>{`
        @keyframes fadeout {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(1.45) translateY(-18px);
          }
        }
      `}</style>
    </div>
  )
}