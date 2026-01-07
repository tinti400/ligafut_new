'use client'

import { useMemo } from 'react'

/* ================= TIPOS ================= */
export type CardModo = 'mercado' | 'elenco' | 'leilao'

export type JogadorCardModel = {
  id: string | number
  nome: string
  posicao: string
  overall: number
  valor: number
  salario?: number | null
  nacionalidade?: string | null
  imagem_url?: string | null
  foto?: string | null
  link_sofifa?: string | null
}

/* ================= PROPS ================= */
type Props = {
  jogador: JogadorCardModel

  modo?: CardModo
  selecionado?: boolean
  onToggleSelecionado?: () => void

  // mercado (se quiser reaproveitar no mercado)
  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean

  // badges opcionais
  badgeTopLeft?: React.ReactNode
  badgeTopRight?: React.ReactNode
}

/* ================= Helpers ================= */
const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))

function iso2FromPais(pais?: string | null) {
  if (!pais) return ''
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')

  const map: Record<string, string> = {
    brasil: 'br',
    argentina: 'ar',
    portugal: 'pt',
    espanha: 'es',
    franca: 'fr',
    inglaterra: 'gb',
    alemanha: 'de',
    italia: 'it',
    holanda: 'nl',
    belgica: 'be',
    uruguai: 'uy',
    chile: 'cl',
    colombia: 'co',
    mexico: 'mx',
    estadosunidos: 'us',
    canada: 'ca',
    paraguai: 'py',
    peru: 'pe',
    equador: 'ec',
    bolivia: 'bo',
    venezuela: 've',
    croacia: 'hr',
    servia: 'rs',
    suica: 'ch',
    polonia: 'pl',
    russia: 'ru',
    japao: 'jp',
    coreiadosul: 'kr',
    australia: 'au',
  }
  return map[norm(pais)] || ''
}

function safeUrl(u?: string | null) {
  if (!u) return ''
  const s = String(u).trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  return s
}

function getTipoCarta(overall: number) {
  if (overall >= 88) return 'ouro'
  if (overall >= 80) return 'prata'
  return 'bronze'
}

function gradientByTipo(tipo: 'ouro' | 'prata' | 'bronze') {
  if (tipo === 'ouro') {
    return 'from-yellow-500/25 via-amber-400/10 to-transparent'
  }
  if (tipo === 'prata') {
    return 'from-slate-300/20 via-slate-200/10 to-transparent'
  }
  return 'from-orange-500/20 via-amber-200/10 to-transparent'
}

/* ================= Watermark (igual mercado) ================= */
function WatermarkOverlay() {
  const items = useMemo(() => Array.from({ length: 24 }), [])
  return (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-[0.10]">
        <div className="absolute -left-24 top-12 rotate-[-18deg] w-[160%]">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {items.map((_, i) => (
              <span
                key={i}
                className="text-[11px] font-extrabold tracking-[0.26em] text-white/80 select-none"
              >
                LIGAFUT
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      </div>
    </>
  )
}

/* ================= COMPONENTE ================= */
export default function CardJogador({
  jogador,
  modo = 'elenco',
  selecionado = false,
  onToggleSelecionado,
  onComprar,
  loadingComprar = false,
  mercadoFechado = false,
  badgeTopLeft,
  badgeTopRight,
}: Props) {
  const img =
    safeUrl(jogador.imagem_url) ||
    safeUrl(jogador.foto) ||
    '' // fallback vazio

  const iso2 = iso2FromPais(jogador.nacionalidade)
  const flagUrl = iso2 ? `https://flagcdn.com/w40/${iso2}.png` : ''

  const overall = Number(jogador.overall || 0)
  const tipo = getTipoCarta(overall)
  const grad = gradientByTipo(tipo)

  const ring = selecionado
    ? 'ring-2 ring-emerald-400/70 shadow-[0_0_0_6px_rgba(16,185,129,0.08)]'
    : 'ring-1 ring-white/10 hover:ring-white/20'

  return (
    <article
      className={`relative overflow-hidden rounded-[28px] bg-gradient-to-b ${grad} border border-white/10 ${ring} transition-all`}
    >
      <WatermarkOverlay />

      {/* Área clicável (seleção) */}
      <button
        type="button"
        onClick={onToggleSelecionado}
        className="relative w-full text-left"
        disabled={!onToggleSelecionado}
        aria-label="Abrir jogador"
      >
        {/* topo */}
        <div className="flex items-start justify-between gap-2 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/70">
                {jogador.posicao}
              </span>

              {flagUrl ? (
                <img
                  src={flagUrl}
                  alt={jogador.nacionalidade || 'Bandeira'}
                  className="h-4 w-6 rounded-sm border border-white/10 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="text-[10px] text-white/50">
                  {jogador.nacionalidade || ''}
                </span>
              )}
            </div>

            <h3 className="mt-1 truncate text-base font-extrabold tracking-tight">
              {jogador.nome}
            </h3>

            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/80">
                OVR <b className="ml-1 text-white">{overall}</b>
              </span>

              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/80">
                {formatBRL(jogador.valor)}
              </span>
            </div>
          </div>

          {/* Badges externos */}
          <div className="flex flex-col items-end gap-2">
            {badgeTopRight}
            {badgeTopLeft}
          </div>
        </div>

        {/* imagem */}
        <div className="px-4 pb-4">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/20">
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            {img ? (
              <img
                src={img}
                alt={jogador.nome}
                className="h-[170px] w-full object-contain p-3"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="h-[170px] w-full grid place-items-center text-white/50 text-sm">
                Sem imagem
              </div>
            )}

            {/* pílula inferior estilo EA */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full bg-black/40 border border-white/10 px-3 py-1 text-[11px] font-bold text-white/90">
                {modo === 'mercado' ? 'Mercado' : modo === 'leilao' ? 'Leilão' : 'Elenco'}
              </span>

              {selecionado && (
                <span className="inline-flex items-center rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-extrabold text-emerald-100">
                  Selecionado
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* ações (apenas no mercado, se quiser reaproveitar) */}
      {modo === 'mercado' && onComprar && (
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className={`w-full rounded-2xl px-4 py-3 font-extrabold transition border
              ${
                mercadoFechado
                  ? 'bg-gray-700/40 text-gray-300 border-white/10 cursor-not-allowed'
                  : loadingComprar
                  ? 'bg-emerald-600/40 text-emerald-100 border-emerald-500/20 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500/20'
              }`}
          >
            {mercadoFechado ? 'Mercado fechado' : loadingComprar ? 'Comprando...' : 'Comprar'}
          </button>
        </div>
      )}
    </article>
  )
}

