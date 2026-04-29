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
    typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null

  const flagCode = jogador.nacionalidade
    ? bandeiras[jogador.nacionalidade]
    : null

  const gradiente =
    tipoCarta === 'bronze'
      ? 'bg-gradient-to-b from-[#8b5a2b] via-[#b37a45] to-[#3a2416] text-yellow-100'
      : tipoCarta === 'prata'
        ? 'bg-gradient-to-b from-[#f3f4f6] via-[#9ca3af] to-[#4b5563] text-gray-900'
        : 'bg-gradient-to-b from-[#fff2a8] via-[#f6c453] to-[#b88900] text-black'

  const pattern = textPatternSvg('LIGAFUT26')

  return (
    <div
      className={[
        'relative',
        'w-[220px] h-[380px]',
        'rounded-[22px]',
        'overflow-hidden',
        'shadow-[0_18px_45px_rgba(0,0,0,0.45)]',
        'transition-all duration-300 hover:scale-[1.04] hover:-translate-y-1',
        gradiente,
        selecionado ? 'ring-4 ring-emerald-400/80' : '',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_top,_#fff,_transparent_65%)]" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-overlay"
        style={{
          backgroundImage: `url("${pattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '260px 200px',
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt=""
          className="w-[92%] opacity-[0.12] blur-[0.2px] select-none"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.20),rgba(0,0,0,0.34)_55%,rgba(0,0,0,0.62)_100%)]" />

      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-[34px] font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.45)]">
          {overallNumero}
        </div>

        <div className="text-[11px] font-black uppercase tracking-wider drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
          {jogador.posicao}
        </div>
      </div>

      {flagCode && (
        <div className="absolute left-3 top-[70px] z-10">
          <img
            src={`https://flagcdn.com/w40/${flagCode}.png`}
            alt={jogador.nacionalidade ?? ''}
            className="w-7 h-5 rounded-sm shadow"
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {modo !== 'mercado' && onToggleSelecionado && (
        <div className="absolute right-3 top-3 z-20">
          <button
            type="button"
            onClick={onToggleSelecionado}
            className={[
              'flex h-9 w-9 items-center justify-center rounded-xl',
              'border border-white/20 bg-black/35 backdrop-blur-sm',
              'shadow-md transition hover:scale-110',
              selecionado ? 'ring-2 ring-emerald-400/80' : '',
            ].join(' ')}
            title="Selecionar"
          >
            <span className="text-white text-base font-black">
              {selecionado ? '✓' : '+'}
            </span>
          </button>
        </div>
      )}

      <div className="flex justify-center pt-14 relative z-10">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[190px] max-w-[190px] object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,0.70)]"
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="absolute bottom-3 left-0 w-full z-10 px-2">
        <div className="rounded-2xl border border-white/20 bg-black/40 backdrop-blur px-3 py-3 text-center shadow-lg">
          <div className="text-sm font-black uppercase tracking-wide truncate text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
            {jogador.nome}
          </div>

          {salario !== null && (
            <div className="mt-1 text-[11px] text-white/85">
              💼 Salário: <b>R$ {salario.toLocaleString('pt-BR')}</b>
            </div>
          )}

          {typeof jogador.valor === 'number' && (
            <div className="mt-1 text-sm font-black text-emerald-200 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]">
              💰 R$ {jogador.valor.toLocaleString('pt-BR')}
            </div>
          )}

          {modo === 'mercado' && onComprar && (
            <button
              type="button"
              onClick={onComprar}
              disabled={loadingComprar || mercadoFechado}
              className={[
                'mt-3 w-full rounded-xl py-2 text-sm font-black transition-all',
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