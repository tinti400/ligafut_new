'use client'

import { useMemo } from 'react'
import { getTipoCarta } from '@/utils/cardUtils'

/* ================= TIPOS ================= */
type Jogador = {
  id?: string | number
  nome: string
  overall?: number | string | null
  posicao: string
  nacionalidade?: string | null
  imagem_url?: string | null
  foto?: string | null
  link_sofifa?: string | null
  valor?: number | null
  salario?: number | null
}

type CardJogadorProps = {
  jogador: Jogador

  modo?: 'mercado' | 'elenco' | 'leilao'
  selecionado?: boolean

  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean

  onToggleSelecionado?: () => void

  /** ✅ NOVO: watermark (logo no fundo) */
  watermarkLogoUrl?: string | null

  /** ✅ NOVO: texto do pattern */
  watermarkText?: string
}

/* ================= HELPERS ================= */
const formatBRL = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))

const safeNumber = (v: any) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const svgToDataUri = (svg: string) => {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')
  return `data:image/svg+xml;charset=utf-8,${encoded}`
}

const buildLigafutPattern = (text: string) => {
  // pattern leve, repetido e inclinado
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="280" height="220">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="rgba(255,255,255,0.10)"/>
        <stop offset="1" stop-color="rgba(255,255,255,0.02)"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="transparent"/>
    <g transform="translate(0,0) rotate(-18 140 110)">
      <text x="20" y="80" font-size="28" font-family="Arial, sans-serif" font-weight="800" fill="url(#g)" letter-spacing="2">
        ${text}
      </text>
      <text x="20" y="140" font-size="28" font-family="Arial, sans-serif" font-weight="800" fill="url(#g)" letter-spacing="2">
        ${text}
      </text>
      <text x="20" y="200" font-size="28" font-family="Arial, sans-serif" font-weight="800" fill="url(#g)" letter-spacing="2">
        ${text}
      </text>
    </g>
  </svg>`
  return svgToDataUri(svg)
}

const getCartaTheme = (tipo: string) => {
  // você pode ajustar como quiser (mantive neutro + “EA vibe”)
  switch (tipo) {
    case 'icon':
      return {
        ring: 'ring-1 ring-amber-400/30',
        glow: 'from-amber-500/15 via-white/0 to-white/0',
        badge: 'bg-amber-500/20 border-amber-400/30',
      }
    case 'ouro':
      return {
        ring: 'ring-1 ring-yellow-400/25',
        glow: 'from-yellow-500/12 via-white/0 to-white/0',
        badge: 'bg-yellow-500/15 border-yellow-400/25',
      }
    case 'prata':
      return {
        ring: 'ring-1 ring-white/15',
        glow: 'from-white/10 via-white/0 to-white/0',
        badge: 'bg-white/10 border-white/15',
      }
    case 'bronze':
      return {
        ring: 'ring-1 ring-orange-500/25',
        glow: 'from-orange-500/12 via-white/0 to-white/0',
        badge: 'bg-orange-500/15 border-orange-500/25',
      }
    default:
      return {
        ring: 'ring-1 ring-emerald-500/18',
        glow: 'from-emerald-500/10 via-white/0 to-white/0',
        badge: 'bg-emerald-500/12 border-emerald-500/20',
      }
  }
}

/* ================= COMPONENTE ================= */
export default function CardJogador({
  jogador,
  modo = 'mercado',
  selecionado = false,
  onComprar,
  loadingComprar = false,
  mercadoFechado = false,
  onToggleSelecionado,
  watermarkLogoUrl = '/logo-ligafut.png',
  watermarkText = 'LIGAFUT',
}: CardJogadorProps) {
  const overallNumero = safeNumber(jogador.overall ?? 0)
  const tipoCarta = getTipoCarta(overallNumero)

  const theme = useMemo(() => getCartaTheme(tipoCarta), [tipoCarta])

  const foto =
    (jogador.imagem_url && String(jogador.imagem_url)) ||
    (jogador.foto && String(jogador.foto)) ||
    ''

  const valor = safeNumber(jogador.valor)
  const salario = safeNumber(jogador.salario)

  const patternUrl = useMemo(
    () => buildLigafutPattern(watermarkText),
    [watermarkText]
  )

  return (
    <div
      className={[
        'relative overflow-hidden rounded-[28px] bg-[#0B0F14] text-white',
        'border border-white/10 shadow-[0_18px_45px_rgba(0,0,0,0.55)]',
        theme.ring,
        selecionado ? 'outline outline-2 outline-emerald-400/70' : '',
      ].join(' ')}
    >
      {/* brilho/gradiente EA */}
      <div
        className={[
          'absolute inset-0 pointer-events-none',
          'bg-gradient-to-br',
          theme.glow,
        ].join(' ')}
      />

      {/* pattern LIGAFUT */}
      <div
        className="absolute inset-0 opacity-[0.18] pointer-events-none mix-blend-screen"
        style={{
          backgroundImage: `url("${patternUrl}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '280px 220px',
        }}
      />

      {/* watermark logo */}
      {!!watermarkLogoUrl && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <img
            src={watermarkLogoUrl}
            alt="Watermark"
            className="w-[82%] opacity-[0.10] blur-[0.2px] select-none"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {/* vinheta */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.10),rgba(0,0,0,0.65)_60%,rgba(0,0,0,0.85)_100%)]" />

      {/* topo: overall e posição */}
      <div className="relative z-10 p-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div
              className={[
                'inline-flex w-12 h-12 items-center justify-center rounded-2xl',
                'border text-lg font-extrabold tracking-tight',
                theme.badge,
              ].join(' ')}
            >
              {overallNumero}
            </div>
            <div className="text-xs font-bold text-white/85">
              {String(jogador.posicao || '').toUpperCase()}
            </div>
          </div>

          {/* ações (mercado) */}
          {modo === 'mercado' && (
            <button
              type="button"
              disabled={loadingComprar || mercadoFechado}
              onClick={onComprar}
              className={[
                'px-3 py-2 rounded-2xl text-xs font-extrabold',
                'border border-white/10 bg-white/[0.06] hover:bg-white/[0.10]',
                'transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
                mercadoFechado ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
              title={mercadoFechado ? 'Mercado fechado' : 'Comprar'}
            >
              {loadingComprar ? 'Comprando...' : '💰 Comprar'}
            </button>
          )}

          {/* seleção (elenco/leilão) */}
          {modo !== 'mercado' && onToggleSelecionado && (
            <button
              type="button"
              onClick={onToggleSelecionado}
              className={[
                'h-10 w-10 rounded-2xl border text-sm font-extrabold',
                selecionado
                  ? 'bg-emerald-500/15 border-emerald-500/30'
                  : 'bg-white/[0.06] border-white/10 hover:bg-white/[0.10]',
                'transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60',
              ].join(' ')}
              title={selecionado ? 'Selecionado' : 'Selecionar'}
            >
              {selecionado ? '✓' : '＋'}
            </button>
          )}
        </div>
      </div>

      {/* foto */}
      <div className="relative z-10 px-4">
        <div className="relative mx-auto mt-1 w-[82%] aspect-square">
          {/* aro e glow */}
          <div className="absolute inset-0 rounded-full bg-white/[0.06] blur-[10px]" />
          <div className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.03]" />

          {foto ? (
            <img
              src={foto}
              alt={jogador.nome}
              className="absolute inset-0 h-full w-full object-cover rounded-full"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="absolute inset-0 rounded-full grid place-items-center text-white/60 text-xs font-extrabold">
              SEM FOTO
            </div>
          )}

          {/* brilho no rosto */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.22),rgba(255,255,255,0)_55%)]" />
        </div>
      </div>

      {/* faixa nome */}
      <div className="relative z-10 mt-3 px-3 pb-3">
        <div className="rounded-2xl border border-white/10 bg-black/35 backdrop-blur px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold tracking-tight">
                {jogador.nome}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/70">
                <span className="font-semibold">{tipoCarta?.toUpperCase?.() ?? ''}</span>
                {jogador.link_sofifa && (
                  <a
                    href={jogador.link_sofifa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 hover:bg-white/[0.10] transition"
                    title="Abrir no SoFIFA"
                  >
                    🔗 SoFIFA
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* valores */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
              <div className="text-[10px] text-white/60 font-semibold">VALOR</div>
              <div className="text-sm font-extrabold text-emerald-300">
                {formatBRL(valor)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
              <div className="text-[10px] text-white/60 font-semibold">SALÁRIO</div>
              <div className="text-sm font-extrabold text-emerald-200">
                {formatBRL(salario)}
              </div>
            </div>
          </div>
        </div>

        {/* detalhe “EA style” no rodapé */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/45 px-1">
          <span className="font-extrabold tracking-[0.25em]">LIGAFUT</span>
          <span className="font-semibold">ULTIMATE MANAGER</span>
        </div>
      </div>

      {/* borda brilho */}
      <div className="absolute inset-0 pointer-events-none rounded-[28px] ring-1 ring-white/10" />
    </div>
  )
}

