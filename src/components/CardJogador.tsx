'use client'

import { getTipoCarta } from '@/utils/cardUtils'

type Jogador = {
  id?: string | number
  nome: string
  overall?: number | string | null
  posicao: string
  nacionalidade?: string | null
  imagem_url?: string | null
  foto?: string | null
  valor?: number | null
  salario?: number | null

  pace?: number | null
  shooting?: number | null
  passing?: number | null
  dribbling?: number | null
  defending?: number | null
  physical?: number | null

  pac?: number | null
  sho?: number | null
  pas?: number | null
  dri?: number | null
  def?: number | null
  phy?: number | null

  ritmo?: number | null
  finalizacao?: number | null
  passe?: number | null
  drible?: number | null
  defesa?: number | null
  fisico?: number | null
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

function getAttr(j: Jogador, keys: (keyof Jogador)[]) {
  for (const key of keys) {
    const value = Number(j[key] ?? 0)
    if (Number.isFinite(value) && value > 0) return Math.round(value)
  }
  return 0
}

function formatBRL(valor?: number | null) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

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

  const salario =
    jogador.salario ??
    (typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null)

  const attrs = [
    { label: 'PAC', value: getAttr(jogador, ['pace', 'pac', 'ritmo']) },
    { label: 'SHO', value: getAttr(jogador, ['shooting', 'sho', 'finalizacao']) },
    { label: 'PAS', value: getAttr(jogador, ['passing', 'pas', 'passe']) },
    { label: 'DRI', value: getAttr(jogador, ['dribbling', 'dri', 'drible']) },
    { label: 'DEF', value: getAttr(jogador, ['defending', 'def', 'defesa']) },
    { label: 'PHY', value: getAttr(jogador, ['physical', 'phy', 'fisico']) },
  ]

  const theme =
    tipoCarta === 'bronze'
      ? {
          border: 'from-orange-200 via-orange-700 to-stone-950',
          bg: 'from-[#c47a38] via-[#7a431e] to-[#1f130c]',
          glow: 'shadow-[0_0_35px_rgba(249,115,22,0.28)]',
          badge: 'BRONZE',
        }
      : tipoCarta === 'prata'
        ? {
            border: 'from-white via-slate-300 to-slate-800',
            bg: 'from-[#f8fafc] via-[#94a3b8] to-[#1e293b]',
            glow: 'shadow-[0_0_35px_rgba(203,213,225,0.25)]',
            badge: 'PRATA',
          }
        : tipoCarta === 'ouro'
          ? {
              border: 'from-yellow-100 via-yellow-400 to-yellow-950',
              bg: 'from-[#fff3b0] via-[#d6a331] to-[#4a2c05]',
              glow: 'shadow-[0_0_45px_rgba(234,179,8,0.35)]',
              badge: 'OURO',
            }
          : {
              border: 'from-cyan-200 via-emerald-400 to-blue-950',
              bg: 'from-[#5eead4] via-[#0f766e] to-[#020617]',
              glow: 'shadow-[0_0_55px_rgba(45,212,191,0.45)]',
              badge: 'ESPECIAL',
            }

  return (
    <div
      className={`relative mx-auto w-[235px] h-[410px] rounded-[28px] bg-gradient-to-br ${theme.border} p-[3px] ${theme.glow} transition-all duration-300 hover:scale-[1.04] hover:-translate-y-1 ${
        selecionado ? 'ring-4 ring-emerald-400/80' : ''
      } ${loadingComprar ? 'opacity-70 pointer-events-none' : ''}`}
    >
      <div className={`relative h-full overflow-hidden rounded-[25px] bg-gradient-to-b ${theme.bg}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.18),transparent_45%,rgba(0,0,0,0.45))]" />

        <div className="absolute inset-0 opacity-[0.08]">
          <div className="absolute left-[-35px] top-20 rotate-[-18deg] text-[42px] font-black text-white whitespace-nowrap">
            LIGAFUT26 LIGAFUT26
          </div>
          <div className="absolute left-[-45px] top-40 rotate-[-18deg] text-[42px] font-black text-white whitespace-nowrap">
            LIGAFUT26 LIGAFUT26
          </div>
          <div className="absolute left-[-55px] top-60 rotate-[-18deg] text-[42px] font-black text-white whitespace-nowrap">
            LIGAFUT26 LIGAFUT26
          </div>
        </div>

        <div className="absolute left-4 top-4 z-20">
          <div className="text-[42px] leading-none font-black text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.65)]">
            {overallNumero || '--'}
          </div>
          <div className="mt-1 w-fit rounded-lg bg-black/40 px-2 py-1 text-xs font-black text-white">
            {jogador.posicao}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-20 rounded-full bg-black/45 px-3 py-1 text-[10px] font-black tracking-widest text-white backdrop-blur">
          {theme.badge}
        </div>

        {modo !== 'mercado' && onToggleSelecionado && (
          <button
            type="button"
            onClick={onToggleSelecionado}
            className="absolute right-4 top-12 z-30 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-white shadow-md backdrop-blur"
          >
            {selecionado ? '✓' : '+'}
          </button>
        )}

        <div className="absolute inset-x-0 top-[58px] z-10 flex h-[210px] items-end justify-center px-2">
          <img
            src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
            alt={jogador.nome}
            onError={(e) => {
              const img = e.currentTarget

              if (img.src.includes('26_120.png')) {
                img.src = img.src.replace('26_120.png', '25_120.png')
              } else if (img.src.includes('25_120.png')) {
                img.src = img.src.replace('25_120.png', '24_120.png')
              } else {
                img.src = '/player-placeholder.png'
              }
            }}
            className="h-[235px] max-w-[235px] object-contain object-bottom drop-shadow-[0_24px_34px_rgba(0,0,0,0.85)]"
          />
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-30 rounded-3xl border border-white/20 bg-black/55 p-3 text-center shadow-2xl backdrop-blur-md">
          <div className="truncate text-[15px] font-black uppercase tracking-wide text-white">
            {jogador.nome}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1">
            {attrs.map((attr) => (
              <div
                key={attr.label}
                className="rounded-xl border border-white/10 bg-white/10 px-1 py-1.5"
              >
                <div className="text-sm font-black text-white">{attr.value}</div>
                <div className="text-[9px] font-black tracking-widest text-white/70">
                  {attr.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-2xl bg-black/35 px-3 py-2">
            {salario !== null && (
              <div className="text-[11px] text-white/80">
                💼 Salário: <b>{formatBRL(salario)}</b>
              </div>
            )}

            {typeof jogador.valor === 'number' && (
              <div className="mt-1 text-sm font-black text-emerald-300">
                💰 {formatBRL(jogador.valor)}
              </div>
            )}
          </div>

          {modo === 'mercado' && onComprar && (
            <button
              type="button"
              onClick={onComprar}
              disabled={loadingComprar || mercadoFechado}
              className={[
                'mt-3 w-full rounded-2xl py-2 text-sm font-black transition-all',
                loadingComprar || mercadoFechado
                  ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-[1.03]',
              ].join(' ')}
            >
              {loadingComprar
                ? 'Comprando...'
                : mercadoFechado
                  ? 'Mercado fechado'
                  : 'Comprar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}