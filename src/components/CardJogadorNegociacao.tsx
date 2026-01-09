'use client'

import { useMemo } from 'react'
import ImagemComFallback from '@/components/ImagemComFallback'
import { getTipoCarta } from '@/utils/cardUtils'

/* ================= TIPOS ================= */

export type JogadorNegociacao = {
  id: string
  id_time: string
  nome: string
  posicao: string
  overall: number | null
  valor: number | null
  imagem_url?: string | null
  foto?: string | null
}

/* ================= PROPS ================= */

type CardJogadorNegociacaoProps = {
  jogador: JogadorNegociacao

  // estado visual
  selecionado?: boolean

  // pendentes
  temPendentes?: boolean
  qtdPendentes?: number
  onExcluirPendentes?: () => void
  loadingExcluir?: boolean

  // ação principal
  onFazerProposta: () => void
  loadingAbrir?: boolean

  // opcional: mostrar badge de time/adversário etc
  subtitulo?: string | null
}

/* ================= UTILS ================= */

const formatBRL = (v: number | null | undefined) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

const textPatternSvg = (text = 'LIGAFUT') => {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="200">
    <rect width="100%" height="100%" fill="transparent"/>
    <g transform="rotate(-18 130 100)">
      <text x="10" y="70" font-family="Arial" font-size="28" font-weight="800"
        fill="rgba(255,255,255,0.10)" letter-spacing="3">${text}</text>
      <text x="10" y="130" font-family="Arial" font-size="28" font-weight="800"
        fill="rgba(255,255,255,0.06)" letter-spacing="3">${text}</text>
      <text x="10" y="190" font-family="Arial" font-size="28" font-weight="800"
        fill="rgba(255,255,255,0.04)" letter-spacing="3">${text}</text>
    </g>
  </svg>`
  const enc = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')
  return `data:image/svg+xml;charset=utf-8,${enc}`
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/* ================= COMPONENTE ================= */

export default function CardJogadorNegociacao({
  jogador,
  selecionado = false,

  temPendentes = false,
  qtdPendentes = 0,
  onExcluirPendentes,
  loadingExcluir = false,

  onFazerProposta,
  loadingAbrir = false,

  subtitulo = null,
}: CardJogadorNegociacaoProps) {
  const overallNumero = useMemo(() => Number(jogador.overall ?? 0), [jogador.overall])
  const tipoCarta = useMemo(() => getTipoCarta(overallNumero), [overallNumero])

  // Pattern e “glow”
  const pattern = useMemo(() => textPatternSvg('LIGAFUT'), [])

  // Ajuste de cores do gradiente + detalhes (estilo EAFC)
  const theme = useMemo(() => {
    if (tipoCarta === 'bronze') {
      return {
        card: 'from-[#7a4a22] via-[#a86b39] to-[#2c1a10] text-yellow-100',
        ring: 'ring-orange-400/25',
        glow: 'bg-orange-500/12',
        btn: 'bg-emerald-700 hover:bg-emerald-800',
        chip: 'bg-black/35 border-white/15 text-white',
        meta: 'text-yellow-100/90',
      }
    }
    if (tipoCarta === 'prata') {
      return {
        card: 'from-[#f1f5f9] via-[#9aa4b2] to-[#2f3b4a] text-zinc-950',
        ring: 'ring-slate-200/20',
        glow: 'bg-slate-200/10',
        btn: 'bg-emerald-700 hover:bg-emerald-800',
        chip: 'bg-black/35 border-white/15 text-white',
        meta: 'text-white/90',
      }
    }
    // ouro
    return {
      card: 'from-[#fff2a8] via-[#f6c453] to-[#8a6500] text-black',
      ring: 'ring-yellow-500/25',
      glow: 'bg-yellow-500/12',
      btn: 'bg-emerald-700 hover:bg-emerald-800',
      chip: 'bg-black/35 border-white/15 text-white',
      meta: 'text-white/90',
    }
  }, [tipoCarta])

  // alguns detalhes “EA” que ficam melhores com OVR muito baixo/alto
  const ovrBadge = clamp(overallNumero, 0, 99)

  return (
    <div
      className={[
        'relative',
        // tamanho fixo pro grid ficar lindo
        'w-[224px] h-[360px]',
        'rounded-[18px] overflow-hidden',
        'shadow-[0_16px_40px_rgba(0,0,0,.45)]',
        'transition-transform duration-300 hover:scale-[1.045]',
        'border border-white/10',
        'bg-gradient-to-b',
        theme.card,
        selecionado ? 'ring-4 ring-emerald-400/80 scale-[1.02]' : '',
        loadingAbrir ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Glow */}
      <div className={`pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full blur-3xl ${theme.glow}`} />
      <div className="pointer-events-none absolute -bottom-28 -left-28 h-64 w-64 rounded-full blur-3xl bg-emerald-500/10" />

      {/* Pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-overlay"
        style={{
          backgroundImage: `url("${pattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '260px 200px',
        }}
      />

      {/* Watermark (se não existir, não quebra) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt="Watermark LigaFut"
          className="w-[92%] opacity-[0.12] blur-[0.2px] select-none"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            // esconde se não existir
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      </div>

      {/* Vinheta */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.18),rgba(0,0,0,0.34)_55%,rgba(0,0,0,0.58)_100%)]" />

      {/* OVR + POS (canto esquerdo) */}
      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-[32px] font-extrabold drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
          {ovrBadge}
        </div>
        <div className="text-[11px] font-bold uppercase drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
          {jogador.posicao}
        </div>
        {subtitulo ? (
          <div className={`mt-1 text-[10px] font-semibold ${theme.meta} drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]`}>
            {subtitulo}
          </div>
        ) : null}
      </div>

      {/* Badge pendentes + excluir */}
      {temPendentes && (
        <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
          <span className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-amber-400 text-black shadow">
            ⏳ {qtdPendentes}
          </span>

          {onExcluirPendentes && (
            <button
              type="button"
              onClick={onExcluirPendentes}
              disabled={loadingExcluir}
              className={[
                'text-[10px] font-bold px-2 py-1 rounded-full shadow',
                loadingExcluir ? 'bg-zinc-700 text-zinc-200 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700',
              ].join(' ')}
              title="Excluir propostas pendentes deste jogador"
            >
              {loadingExcluir ? '...' : 'Excluir'}
            </button>
          )}
        </div>
      )}

      {/* Moldura da imagem (igual seu estilo) */}
      <div className={`absolute left-1/2 -translate-x-1/2 top-[76px] z-10 rounded-2xl p-1 ring-1 ${theme.ring} bg-black/25`}>
        <ImagemComFallback
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          width={200}
          height={200}
          className="h-[190px] w-auto object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.65)]"
        />
      </div>

      {/* Faixa inferior */}
      <div className="absolute bottom-0 left-0 w-full z-20">
        <div className="mx-2 mb-2 rounded-2xl border border-white/15 bg-black/35 backdrop-blur px-3 py-3 text-center shadow-lg">
          <div className="text-sm font-extrabold uppercase tracking-wide truncate drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
            {jogador.nome}
          </div>

          <div className="mt-1 text-sm font-extrabold text-emerald-200 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
            💰 {formatBRL(jogador.valor)}
          </div>
        </div>

        {/* Botão ação */}
        <div className="px-3 pb-3">
          <button
            onClick={onFazerProposta}
            disabled={loadingAbrir}
            className={[
              'w-full rounded-xl py-2 text-sm font-extrabold transition-all',
              'shadow-[0_10px_22px_rgba(0,0,0,.35)]',
              loadingAbrir ? 'bg-zinc-700 text-zinc-200 cursor-not-allowed' : `${theme.btn} text-white hover:scale-[1.03]`,
            ].join(' ')}
          >
            {loadingAbrir ? 'Abrindo…' : '💬 Fazer Proposta'}
          </button>
        </div>
      </div>
    </div>
  )
}
