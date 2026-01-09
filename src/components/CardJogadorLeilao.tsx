'use client'

import React, { useMemo } from 'react'
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

/** ================== TIER DO CARD (BRONZE/PRATA/OURO) ================== */
function cartaTierByOverall(overall: number) {
  if (overall <= 64) return 'bronze'
  if (overall <= 74) return 'prata'
  return 'ouro'
}

function cartaClasses(overall: number) {
  const tier = cartaTierByOverall(Number(overall || 0))

  // ✅ Gradiente + borda (bem “cara de carta”)
  if (tier === 'bronze') {
    return {
      ring: 'ring-[#b87333]/25',
      border: 'border-[#b87333]/35',
      topGlow: 'from-[#b87333]/20 via-zinc-900/20 to-zinc-950/70',
      badge: 'bg-[#b87333]/15 text-[#ffd9b8] ring-[#b87333]/25',
      accent: 'text-[#ffd9b8]',
    }
  }

  if (tier === 'prata') {
    return {
      ring: 'ring-zinc-200/20',
      border: 'border-zinc-300/25',
      topGlow: 'from-zinc-200/15 via-zinc-900/20 to-zinc-950/70',
      badge: 'bg-zinc-200/15 text-zinc-100 ring-zinc-200/25',
      accent: 'text-zinc-100',
    }
  }

  // ouro
  return {
    ring: 'ring-[#f5c84b]/25',
    border: 'border-[#f5c84b]/35',
    topGlow: 'from-[#f5c84b]/18 via-zinc-900/20 to-zinc-950/70',
    badge: 'bg-[#f5c84b]/15 text-[#ffe9a6] ring-[#f5c84b]/25',
    accent: 'text-[#ffe9a6]',
  }
}

function badgeTierValor(valor: number) {
  if (valor >= 1_500_000_000) return 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-500/25'
  if (valor >= 1_000_000_000) return 'bg-blue-500/15 text-blue-200 ring-blue-500/25'
  if (valor >= 500_000_000) return 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/25'
  if (valor >= 250_000_000) return 'bg-amber-500/15 text-amber-200 ring-amber-500/25'
  return 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/20'
}

function posBadge(pos: string) {
  const p = (pos || '').toUpperCase()
  if (p === 'ZAGUEIRO') return 'ZAG'
  if (p === 'GOLEIRO') return 'GL'
  if (p === 'MEIO CAMPO') return 'MC'
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

  const disabledLance =
    !!travadoPorIdentidade ||
    disabledPorCooldown ||
    encerrado ||
    invalido ||
    (saldo !== null && valorPropostoNum > Number(saldo))

  const c = cartaClasses(Number(leilao.overall || 0))

  return (
    <div className="relative">
      {/* Carta */}
      <div
        className={classNames(
          'relative overflow-hidden rounded-[28px] border bg-gradient-to-b shadow-xl backdrop-blur',
          c.border,
          c.topGlow,
          'from-zinc-100/10 to-zinc-950/70',
          tremendo ? 'ring-2 ring-emerald-400/40' : classNames('ring-1', c.ring)
        )}
        style={{ aspectRatio: '3 / 4', minHeight: 380 }}
      >
        {/* barra tempo */}
        <div className="absolute left-4 right-4 top-4 h-2 overflow-hidden rounded-full bg-zinc-800/70">
          <div className={classNames('h-full transition-[width] duration-1000', barraCor)} style={{ width: `${pctRestante}%` }} />
        </div>

        {/* topo: overall + pos */}
        <div className="absolute left-5 top-8 z-10">
          <div className={classNames('text-4xl font-extrabold tracking-tight drop-shadow', c.accent)}>
            {Number(leilao.overall ?? 0)}
          </div>
          <div className="mt-1 inline-flex items-center gap-2">
            <span className="rounded-lg bg-sky-500/20 px-2 py-1 text-[11px] font-bold text-sky-200 ring-1 ring-sky-500/25">
              {posBadge(leilao.posicao)}
            </span>

            {leilao.nacionalidade && (
              <span className="rounded-lg bg-zinc-900/50 px-2 py-1 text-[11px] font-semibold text-zinc-200 ring-1 ring-zinc-700/40">
                {leilao.nacionalidade}
              </span>
            )}

            {/* ✅ badge do tier (bronze/prata/ouro) */}
            <span className={classNames('rounded-lg px-2 py-1 text-[11px] font-extrabold ring-1', c.badge)}>
              {cartaTierByOverall(Number(leilao.overall || 0)).toUpperCase()}
            </span>
          </div>
        </div>

        {/* admin excluir */}
        {isAdmin && onExcluir && (
          <button
            onClick={onExcluir}
            className="absolute right-4 top-8 z-10 rounded-xl border border-red-900/40 bg-red-950/40 px-3 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-red-400/30"
            title="Excluir do leilão (admin)"
          >
            🗑️ Excluir
          </button>
        )}

        {/* ✅ imagem central (AGORA INTEIRA) */}
        <div className="absolute inset-x-0 top-16 flex justify-center px-6">
          <div className="relative h-[260px] w-full overflow-hidden rounded-3xl bg-zinc-900/35 ring-1 ring-zinc-800/50">
            {leilao.imagem_url ? (
              <img
                src={leilao.imagem_url}
                alt={leilao.nome}
                className="h-full w-full object-contain object-center bg-zinc-900"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : (
              <div className="h-full w-full bg-zinc-900" />
            )}

            {/* overlay do vencedor (coroa) */}
            {leilao.nome_time_vencedor && (
              <div className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-2xl bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-100 ring-1 ring-zinc-700/40">
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
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px]">
                    {leilao.nome_time_vencedor.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[120px] truncate">{leilao.nome_time_vencedor}</span>
              </div>
            )}
          </div>
        </div>

        {/* ✅ faixa nome (SUBIU) */}
        <div className="absolute inset-x-0 top-[285px] px-6">
          <div className="rounded-2xl bg-zinc-950/55 px-4 py-2 ring-1 ring-zinc-800/50">
            <div className="truncate text-center text-sm font-extrabold uppercase tracking-wide text-zinc-100">
              {leilao.nome}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <a
                href={leilao.link_sofifa || '#'}
                target={leilao.link_sofifa ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={classNames(
                  'inline-flex items-center gap-2 text-[11px] font-semibold',
                  leilao.link_sofifa ? 'text-sky-200 hover:text-sky-100' : 'text-zinc-500 pointer-events-none'
                )}
              >
                🔗 SoFIFA
              </a>

              <span className={classNames('rounded-xl px-2 py-1 text-[11px] font-bold ring-1', badgeTierValor(leilao.valor_atual))}>
                {brl(leilao.valor_atual)}
              </span>
            </div>

            {/* tempo */}
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-300">
              <span className="opacity-80">Leilão #{index + 1}</span>
              <span className={encerrado ? 'text-red-200' : 'text-emerald-200'}>
                {encerrado ? 'Encerrado' : `Termina em ${formatarTempo(tempoRestante)}`}
              </span>
            </div>
          </div>
        </div>

        {/* área de lances (base da carta) */}
        <div className="absolute inset-x-0 bottom-4 px-6">
          <div className="rounded-2xl bg-zinc-950/60 p-3 ring-1 ring-zinc-800/50">
            {/* input + botão */}
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                className={classNames(
                  'w-full rounded-xl border bg-zinc-950/60 px-3 py-2 text-sm tabular-nums outline-none',
                  invalido ? 'border-red-900/60 focus:ring-2 focus:ring-red-400/30' : 'border-emerald-900/40 focus:ring-2 focus:ring-emerald-400/30'
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
                  'shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold transition',
                  disabledLance
                    ? 'cursor-not-allowed border border-zinc-800 bg-zinc-900/60 text-zinc-500'
                    : 'border border-emerald-900/40 bg-emerald-600/90 text-white hover:bg-emerald-600'
                )}
              >
                Dar lance
              </button>
            </div>

            {/* mínimo + botão +20mi */}
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-300">
              <span>
                Mínimo: <b className="tabular-nums text-zinc-100">{brl(minimoPermitido)}</b>
              </span>
              <button
                type="button"
                onClick={onResetMinimo}
                className="rounded-xl border border-emerald-900/40 bg-emerald-950/40 px-3 py-1 font-bold text-emerald-200 hover:bg-emerald-900/40"
              >
                +20mi (mínimo)
              </button>
            </div>

            {/* incrementos */}
            <div className="mt-3 grid grid-cols-3 gap-2">
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
                      'rounded-xl px-2 py-2 text-[12px] font-extrabold tabular-nums transition',
                      'border bg-zinc-950/60 hover:bg-zinc-900',
                      disabled ? 'border-zinc-800 text-zinc-500 opacity-60' : 'border-emerald-900/40 text-emerald-200 hover:text-emerald-100'
                    )}
                  >
                    + {(inc / 1_000_000).toLocaleString()} mi
                  </button>
                )
              })}
            </div>

            {/* finalizar admin apenas quando encerrado */}
            {isAdmin && onFinalizar && encerrado && (
              <button
                onClick={onFinalizar}
                disabled={!!finalizando}
                className={classNames(
                  'mt-3 w-full rounded-xl border px-3 py-2 text-sm font-extrabold transition focus:outline-none focus:ring-2',
                  !!finalizando
                    ? 'border-zinc-800 bg-zinc-900/60 text-zinc-400 cursor-not-allowed'
                    : 'border-red-700/40 bg-red-600/90 text-white hover:bg-red-600 focus:ring-red-400/30'
                )}
              >
                {finalizando ? 'Finalizando…' : 'Finalizar Leilão'}
              </button>
            )}
          </div>
        </div>

        {/* burst/overlay */}
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="animate-[fadeout_0.7s_ease_forwards] select-none text-3xl">💥✨🔥</div>
          </div>
        )}
        {efeitoOverlay}

        {/* etiqueta encerrado */}
        {encerrado && (
          <div className="pointer-events-none absolute left-5 top-14 rotate-[-6deg] rounded-xl border border-red-900/50 bg-red-950/70 px-3 py-1 text-[11px] font-extrabold text-red-200 shadow">
            ENCERRADO
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeout {
          0% { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(1.3) translateY(-10px); }
        }
      `}</style>
    </div>
  )
}
