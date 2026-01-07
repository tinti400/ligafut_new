'use client'

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

// 🇧🇷 map simples → pode expandir depois
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

/** gera um pattern leve de texto "LIGAFUT" (sem imagem externa) */
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

  /* ===== Salário (0,75%) ===== */
  const salario =
    typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null

  /* ===== Bandeira ===== */
  const flagCode = jogador.nacionalidade
    ? bandeiras[jogador.nacionalidade]
    : null

  /* ===== Gradiente EA FC ===== */
  const gradiente =
    tipoCarta === 'bronze'
      ? 'bg-gradient-to-b from-[#8b5a2b] via-[#b37a45] to-[#3a2416] text-yellow-100'
      : tipoCarta === 'prata'
      ? 'bg-gradient-to-b from-[#f3f4f6] via-[#9ca3af] to-[#4b5563] text-gray-900'
      : 'bg-gradient-to-b from-[#fff2a8] via-[#f6c453] to-[#b88900] text-black'

  const pattern = textPatternSvg('LIGAFUT')

  return (
    <div
      className={[
        'relative',
        'w-[220px] h-[340px]',
        'rounded-[18px]',
        'overflow-hidden',
        'shadow-2xl',
        'transition-transform duration-300 hover:scale-[1.04]',
        gradiente,
        selecionado ? 'ring-4 ring-emerald-400/70' : '',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* ===== FUNDO: brilho EA ===== */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.10] bg-[radial-gradient(circle_at_top,_#fff,_transparent_70%)]" />

      {/* ===== FUNDO: pattern LIGAFUT ===== */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25] mix-blend-overlay"
        style={{
          backgroundImage: `url("${pattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '260px 200px',
        }}
      />

      {/* ===== FUNDO: watermark logo (imagem do /public) ===== */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt="Watermark LigaFut"
          className="w-[92%] opacity-[0.12] blur-[0.2px] select-none"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* ===== VINHETA (deixa com cara EAFC) ===== */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.18),rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.55)_100%)]" />

      {/* ===== OVR / POSIÇÃO ===== */}
      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-[32px] font-extrabold drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]">
          {overallNumero}
        </div>
        <div className="text-[11px] font-bold uppercase drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
          {jogador.posicao}
        </div>
      </div>

      {/* ===== BANDEIRA ===== */}
      {flagCode && (
        <div className="absolute left-3 top-[64px] z-10">
          <img
            src={`https://flagcdn.com/w40/${flagCode}.png`}
            alt={jogador.nacionalidade ?? ''}
            className="w-6 h-4 rounded-sm shadow"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {/* ===== CHECKBOX (ELENCO) ===== */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <div className="absolute right-3 top-3 z-20">
          <button
            type="button"
            onClick={onToggleSelecionado}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-xl',
              'border border-black/20 bg-black/30 backdrop-blur-sm',
              'shadow-md',
              selecionado ? 'ring-2 ring-emerald-400/70' : '',
            ].join(' ')}
            title="Selecionar"
          >
            <span className="text-white text-sm font-extrabold">
              {selecionado ? '✓' : '+'}
            </span>
          </button>
        </div>
      )}

      {/* ===== IMAGEM ===== */}
      <div className="flex justify-center pt-12 relative z-10">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[185px] object-contain drop-shadow-[0_14px_26px_rgba(0,0,0,0.65)]"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* ===== INFO (faixa mais bonita) ===== */}
      <div className="absolute bottom-0 w-full z-10">
        <div className="mx-2 mb-2 rounded-2xl border border-white/20 bg-black/35 backdrop-blur px-3 py-3 text-center shadow-lg">
          <div className="text-sm font-extrabold uppercase tracking-wide truncate drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
            {jogador.nome}
          </div>

          {/* SALÁRIO */}
          {salario !== null && (
            <div className="mt-0.5 text-[11px] text-white/85">
              💼 Salário: <b>R$ {salario.toLocaleString('pt-BR')}</b>
            </div>
          )}

          {/* VALOR */}
          {typeof jogador.valor === 'number' && (
            <div className="mt-1 text-sm font-extrabold text-emerald-200 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
              💰 R$ {jogador.valor.toLocaleString('pt-BR')}
            </div>
          )}
        </div>
      </div>

      {/* ===== BOTÃO MERCADO ===== */}
      {modo === 'mercado' && onComprar && (
        <div className="absolute bottom-[-56px] left-0 w-full px-3 z-10">
          <button
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className={[
              'w-full rounded-xl py-2 text-sm font-bold transition-all',
              loadingComprar || mercadoFechado
                ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 hover:scale-[1.03]',
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

