'use client'

import React, { useMemo } from 'react'
import classNames from 'classnames'

export type Leilao = {
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

export type CardJogadorLeilaoProps = {
  leilao: Leilao
  index: number

  // identidade / status
  travadoPorIdentidade?: string | null
  saldo: number | null
  isAdmin: boolean

  // tempo (já sincronizado fora)
  tempoRestante: number
  pctRestante: number

  // ui state
  disabledPorCooldown: boolean
  tremendo?: boolean
  burst?: boolean
  efeitoOverlay?: React.ReactNode

  // propostas
  minimoPermitido: number
  valorProposto: string
  setValorProposto: (v: string) => void

  // logos
  logoVencedor?: string

  // ações
  onDarLanceManual: (valorPropostoNum: number) => void
  onDarLanceInc: (inc: number) => void
  onResetMinimo: () => void

  // admin
  onExcluir?: () => void
  onFinalizar?: () => void
  finalizando?: boolean
}

const INCS = [4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000] as const

const brl = (v?: number | null) =>
  typeof v === 'number'
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—'

const formatarTempo = (segundos: number) => {
  const h = Math.floor(segundos / 3600)
  const min = Math.floor((segundos % 3600) / 60).toString().padStart(2, '0')
  const sec = Math.max(0, Math.floor(segundos % 60)).toString().padStart(2, '0')
  return h > 0 ? `${h}:${min}:${sec}` : `${min}:${sec}`
}

function tierBadge(valor: number) {
  if (valor >= 1_500_000_000) return 'text-fuchsia-300 border-fuchsia-900/40 bg-fuchsia-950/30'
  if (valor >= 1_000_000_000) return 'text-blue-300 border-blue-900/40 bg-blue-950/30'
  if (valor >= 500_000_000) return 'text-emerald-300 border-emerald-900/40 bg-emerald-950/30'
  if (valor >= 250_000_000) return 'text-amber-300 border-amber-900/40 bg-amber-950/30'
  return 'text-emerald-200 border-emerald-900/30 bg-emerald-950/20'
}

export default function CardJogadorLeilao(props: CardJogadorLeilaoProps) {
  const {
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
  } = props

  const encerrado = tempoRestante === 0

  const valorPropostoNum = useMemo(() => {
    const n = Math.floor(Number(valorProposto || 0))
    return n
  }, [valorProposto])

  const invalido =
    !isFinite(valorPropostoNum) ||
    valorPropostoNum < minimoPermitido ||
    (saldo !== null && valorPropostoNum > Number(saldo))

  const barraCor = encerrado ? 'bg-red-500' : tempoRestante <= 15 ? 'bg-amber-400' : 'bg-emerald-500'

  const CARD_GRADIENTS = [
    'from-emerald-500/40 via-emerald-400/25 to-emerald-300/20',
    'from-emerald-400/45 via-teal-400/30 to-cyan-400/20',
    'from-teal-400/45 via-cyan-400/30 to-sky-400/20',
    'from-cyan-400/45 via-sky-400/30 to-blue-400/20',
    'from-sky-400/45 via-blue-500/30 to-indigo-500/20',
    'from-blue-500/45 via-indigo-500/30 to-violet-500/20',
    'from-indigo-500/45 via-violet-500/30 to-fuchsia-500/20',
    'from-violet-500/45 via-fuchsia-500/30 to-pink-500/20',
    'from-fuchsia-500/45 via-pink-500/30 to-rose-500/20',
    'from-pink-500/45 via-rose-500/30 to-red-500/20',
    'from-rose-500/45 via-red-500/30 to-orange-500/20',
    'from-red-500/45 via-orange-500/30 to-amber-500/20',
    'from-orange-500/45 via-amber-500/30 to-yellow-500/20',
    'from-amber-500/45 via-yellow-400/30 to-lime-400/20',
    'from-yellow-400/45 via-lime-400/30 to-emerald-400/20',
  ] as const

  const gradIndexForValor = (v: number) => {
    const idx = Math.floor((v || 0) / 50_000_000)
    return Math.max(0, Math.min(idx, CARD_GRADIENTS.length - 1))
  }

  const gradIdx = gradIndexForValor(leilao.valor_atual)

  return (
    <div className="relative group">
      <div
        className={classNames(
          'rounded-2xl bg-gradient-to-br p-[1px] shadow-[0_0_0_1px_rgba(0,0,0,.5)]',
          CARD_GRADIENTS[gradIdx]
        )}
      >
        <article
          className={classNames(
            'relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 backdrop-blur transition',
            'hover:border-emerald-600/30 hover:bg-zinc-900/70',
            tremendo ? 'animate-[pulse_0.3s_ease_1] ring-1 ring-emerald-500/30' : ''
          )}
        >
          {/* admin: excluir */}
          {isAdmin && onExcluir && (
            <button
              onClick={onExcluir}
              className="absolute right-3 top-3 rounded-lg border border-red-900/40 bg-red-950/40 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400/30"
              title="Excluir do leilão (admin)"
              type="button"
            >
              🗑️ Excluir
            </button>
          )}

          {/* burst / overlay */}
          {burst && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="animate-[fadeout_0.7s_ease_forwards] select-none text-2xl">💥✨🔥</div>
            </div>
          )}
          {efeitoOverlay}

          {/* barra tempo */}
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/70">
            <div
              className={classNames('h-full transition-[width] duration-1000', barraCor)}
              style={{ width: `${pctRestante}%` }}
            />
          </div>

          {/* topo */}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-300">Leilão #{index + 1}</h2>
            <span
              className={classNames(
                'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[11px]',
                encerrado
                  ? 'border-red-900/60 bg-red-950/40 text-red-200'
                  : 'border-emerald-900/40 bg-emerald-950/40 text-emerald-200'
              )}
            >
              {encerrado ? 'Encerrado' : 'Termina em'}
              {!encerrado && <b className="tabular-nums">{formatarTempo(tempoRestante)}</b>}
            </span>
          </div>

          {/* corpo */}
          <div className="mt-3 flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              {leilao.imagem_url ? (
                <img
                  src={leilao.imagem_url}
                  alt={leilao.nome}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                />
              ) : (
                <div className="h-full w-full bg-zinc-900" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold leading-5">{leilao.nome}</p>
                <span className={classNames('rounded-md border px-2 py-0.5 text-xs', tierBadge(leilao.valor_atual))}>
                  {brl(leilao.valor_atual)}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">{leilao.posicao}</span>
                <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                  ⭐ OVR {leilao.overall}
                </span>
                {leilao.nacionalidade && (
                  <span className="rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                    🌍 {leilao.nacionalidade}
                  </span>
                )}

                {leilao.nome_time_vencedor && (
                  <span className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-0.5">
                    👑
                    {logoVencedor ? (
                      <img
                        src={logoVencedor}
                        alt={leilao.nome_time_vencedor}
                        className="h-4 w-4 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] text-zinc-200">
                        {leilao.nome_time_vencedor.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span>{leilao.nome_time_vencedor}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* lance manual */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={classNames(
                  'w-full rounded-xl border bg-zinc-950/60 px-3 py-2 text-sm tabular-nums outline-none',
                  invalido
                    ? 'border-red-900/60 focus:ring-2 focus:ring-red-400/30'
                    : 'border-emerald-900/40 focus:ring-2 focus:ring-emerald-400/30'
                )}
                value={valorProposto ?? ''}
                onChange={(e) => setValorProposto(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={String(minimoPermitido)}
                disabled={!!travadoPorIdentidade}
              />

              <button
                type="button"
                onClick={() => onDarLanceManual(valorPropostoNum)}
                disabled={!!travadoPorIdentidade || disabledPorCooldown || invalido || encerrado}
                className={classNames(
                  'shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  !!travadoPorIdentidade || disabledPorCooldown || invalido || encerrado
                    ? 'cursor-not-allowed border border-zinc-800 bg-zinc-900/60 text-zinc-500'
                    : 'border border-emerald-900/40 bg-emerald-600/90 text-white hover:bg-emerald-600'
                )}
              >
                Dar lance
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>
                Mínimo permitido: <b className="tabular-nums text-zinc-200">{brl(minimoPermitido)}</b>
              </span>
              <button
                type="button"
                onClick={onResetMinimo}
                className="rounded-lg border border-emerald-900/40 bg-emerald-950/40 px-2 py-1 font-semibold text-emerald-200 hover:bg-emerald-900/40"
              >
                +20mi (mínimo)
              </button>
            </div>
          </div>

          {/* incrementos */}
          <div className="mt-4">
            <div className="grid grid-cols-3 gap-2">
              {INCS.map((inc) => {
                const disabled =
                  !!travadoPorIdentidade ||
                  disabledPorCooldown ||
                  encerrado ||
                  (saldo !== null && Number(leilao.valor_atual) + inc > saldo)

                return (
                  <button
                    key={inc}
                    type="button"
                    onClick={() => onDarLanceInc(inc)}
                    disabled={disabled}
                    className={classNames(
                      'rounded-xl px-3 py-2 text-xs font-bold tabular-nums transition',
                      'border bg-zinc-950/60 hover:bg-zinc-900',
                      'focus:outline-none focus:ring-2 focus:ring-emerald-400/30',
                      disabled
                        ? 'border-zinc-800 text-zinc-500 opacity-60'
                        : 'border-emerald-900/40 text-emerald-200 hover:text-emerald-100'
                    )}
                    title={disabled ? 'Indisponível no momento' : undefined}
                  >
                    + {(inc / 1_000_000).toLocaleString()} mi
                  </button>
                )
              })}
            </div>

            {leilao.link_sofifa && (
              <a
                href={leilao.link_sofifa}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs text-cyan-300 underline hover:text-cyan-200"
              >
                🔗 Ver no Sofifa
              </a>
            )}
          </div>

          {/* finalizar admin */}
          {isAdmin && onFinalizar && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onFinalizar}
                disabled={!!finalizando || !encerrado}
                className={classNames(
                  'w-full rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2',
                  !!finalizando || !encerrado
                    ? 'bg-zinc-900/60 text-zinc-400 border border-zinc-800 cursor-not-allowed'
                    : 'bg-red-600/90 text-white hover:bg-red-600 border border-red-700/40 focus:ring-red-400/30'
                )}
                title={!encerrado ? 'Aguarde o relógio do servidor zerar' : 'Finaliza e marca como leiloado'}
              >
                {finalizando ? 'Finalizando…' : 'Finalizar Leilão'}
              </button>
            </div>
          )}
        </article>
      </div>

      {encerrado && (
        <div className="pointer-events-none absolute -right-2 -top-2 rotate-3 rounded-lg border border-red-900/50 bg-red-950/70 px-2 py-1 text-[10px] font-semibold text-red-200 shadow">
          ENCERRADO
        </div>
      )}
    </div>
  )
}
