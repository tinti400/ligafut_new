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
  valor?: number | null
}

type CardJogadorProps = {
  jogador: Jogador

  modo?: 'mercado' | 'elenco' | 'leilao'
  selecionado?: boolean

  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean

  onToggleSelecionado?: () => void
}

/* ================= UTIL ================= */

// map simples (mantive) + fallback inteligente
const bandeiras: Record<string, string> = {
  Brasil: 'br',
  Argentina: 'ar',
  Portugal: 'pt',
  Espanha: 'es',
  França: 'fr',
  Alemanha: 'de',
  Itália: 'it',
  Inglaterra: 'gb',
  Holanda: 'nl',
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n)

const safeUrl = (u?: string | null) => {
  if (!u) return ''
  const s = String(u).trim()
  if (!s || s === 'null' || s === 'undefined') return ''
  return s
}

const normalizeKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// fallback para nacionalidade (se não tiver no map)
const iso2FromNacionalidade = (n?: string | null) => {
  if (!n) return ''
  const raw = String(n).trim()
  if (!raw) return ''

  // tenta pelo map "bonitinho"
  if (bandeiras[raw]) return bandeiras[raw]

  // tenta por normalização (sem acento)
  const norm = normalizeKey(raw)

  const map: Record<string, string> = {
    brasil: 'br',
    argentina: 'ar',
    portugal: 'pt',
    espanha: 'es',
    franca: 'fr',
    alemanha: 'de',
    italia: 'it',
    inglaterra: 'gb',
    holanda: 'nl',
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

  return map[norm] || ''
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
}: CardJogadorProps) {
  const overallNumero = Number(jogador.overall ?? 0)
  const tipoCarta = getTipoCarta(overallNumero)

  // ✅ REMOVIDO: qualquer regra de desgaste/desconto por tempo
  // ✅ Mantive o salário (0,75%) porque ele já existia no seu card
  const salario =
    typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null

  // bandeira
  const flagCode = iso2FromNacionalidade(jogador.nacionalidade)
  const flagUrl = flagCode ? `https://flagcdn.com/w40/${flagCode}.png` : ''

  // imagem
  const img = safeUrl(jogador.imagem_url) || safeUrl(jogador.foto) || '/player-placeholder.png'

  /* ===== Estilo "mercado" (premium, escuro, watermark, borda) ===== */
  const gradiente =
    tipoCarta === 'bronze'
      ? 'from-[#5b3a1f] via-[#8b5a2b] to-[#0b0f17] text-yellow-100'
      : tipoCarta === 'prata'
      ? 'from-[#e5e7eb] via-[#9ca3af] to-[#111827] text-gray-900'
      : 'from-[#fff2a8] via-[#f6c453] to-[#111827] text-black'

  // brilho + ring quando selecionado
  const ring = selecionado
    ? 'ring-2 ring-emerald-400/70 shadow-[0_0_0_6px_rgba(16,185,129,0.08)]'
    : 'ring-1 ring-white/10 hover:ring-white/20'

  const cardBase =
    'relative overflow-hidden rounded-[22px] shadow-2xl transition-all duration-300 hover:scale-[1.03]'

  // responsivo: em vez de fixar px, deixei proporção boa (e mantém seu tamanho em desktop)
  const size =
    'w-full max-w-[220px] aspect-[220/340]' // mantém a mesma proporção do seu 220x340

  // watermark estilo mercado
  const watermarkItems = useMemo(() => Array.from({ length: 20 }), [])

  return (
    <div
      className={[
        cardBase,
        size,
        `bg-gradient-to-b ${gradiente}`,
        'border border-white/10',
        ring,
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* ===== WATERMARK (igual mercado) ===== */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.10]">
        <div className="absolute -left-20 top-10 rotate-[-18deg] w-[160%]">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {watermarkItems.map((_, i) => (
              <span
                key={i}
                className="text-[10px] font-extrabold tracking-[0.26em] text-white/80 select-none"
              >
                LIGAFUT
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* glow central */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      </div>

      {/* ===== HEADER TOP: OVR / POSIÇÃO / FLAG ===== */}
      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-[34px] font-extrabold drop-shadow">{overallNumero}</div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider opacity-90">
          {jogador.posicao}
        </div>

        {flagUrl ? (
          <div className="mt-2">
            <img
              src={flagUrl}
              alt={jogador.nacionalidade ?? ''}
              className="w-7 h-5 rounded-sm shadow border border-white/10 object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}
      </div>

      {/* ===== CHECKBOX / SELEÇÃO (ELENCO/LEILAO) ===== */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <button
          type="button"
          onClick={onToggleSelecionado}
          className="absolute right-3 top-3 z-20 h-9 w-9 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm grid place-items-center hover:bg-black/40 transition"
          aria-label="Selecionar jogador"
          title="Selecionar"
        >
          <span
            className={[
              'text-sm font-extrabold',
              selecionado ? 'text-emerald-300' : 'text-white/70',
            ].join(' ')}
          >
            ✓
          </span>
        </button>
      )}

      {/* ===== IMAGEM ===== */}
      <div className="relative z-10 flex justify-center pt-12 px-3">
        <div className="relative w-full rounded-3xl border border-white/10 bg-black/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <img
            src={img}
            alt={jogador.nome}
            className="h-[190px] w-full object-contain p-3 drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
            loading="lazy"
            decoding="async"
          />

          {/* pílula inferior (modo) + selecionado */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full bg-black/40 border border-white/10 px-3 py-1 text-[11px] font-extrabold text-white/90">
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

      {/* ===== INFO BOTTOM ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-3 pt-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm px-3 py-3 text-center">
          <div className="text-sm font-extrabold uppercase tracking-wide truncate">
            {jogador.nome}
          </div>

          {/* SALÁRIO */}
          {salario !== null && (
            <div className="mt-0.5 text-[11px] text-white/80">
              💼 Salário: {formatBRL(salario)}
            </div>
          )}

          {/* VALOR */}
          {typeof jogador.valor === 'number' && (
            <div className="mt-1 text-sm font-extrabold text-emerald-300">
              💰 {formatBRL(jogador.valor)}
            </div>
          )}
        </div>
      </div>

      {/* ===== BOTÃO MERCADO (fixo dentro do card) ===== */}
      {modo === 'mercado' && onComprar && (
        <div className="absolute bottom-3 left-0 w-full px-4 z-20">
          <button
            type="button"
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className={[
              'w-full rounded-2xl py-2.5 text-sm font-extrabold transition-all border',
              loadingComprar || mercadoFechado
                ? 'bg-gray-700/50 text-gray-200 border-white/10 cursor-not-allowed'
                : 'bg-emerald-600 text-white border-emerald-500/20 hover:bg-emerald-700 hover:scale-[1.01]',
            ].join(' ')}
          >
            {loadingComprar
              ? 'Comprando...'
              : mercadoFechado
              ? 'Mercado fechado'
              : 'Comprar'}
          </button>
        </div>
      )}
    </div>
  )
}

