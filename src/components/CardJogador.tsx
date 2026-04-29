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

  pace?: number | null
  shooting?: number | null
  passing?: number | null
  dribbling?: number | null
  defending?: number | null
  physical?: number | null
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

  const imagemJogador =
    jogador.imagem_url ||
    jogador.foto ||
    '/player-placeholder.png'

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
        : tipoCarta === 'ouro'
          ? 'bg-gradient-to-b from-[#fff2a8] via-[#f6c453] to-[#b88900] text-black'
          : 'bg-gradient-to-b from-[#050816] via-[#123c69] to-[#00f5d4] text-white'

  const pattern = textPatternSvg('LIGAFUT26')

  return (
    <div
      className={[
        'relative',
        'w-[220px] h-[400px]',
        'rounded-[22px]',
        'overflow-hidden',
        'shadow-[0_18px_45px_rgba(0,0,0,0.45)]',
        'transition-all duration-300 hover:scale-[1.04] hover:-translate-y-1',
        gradiente,
        selecionado ? 'ring-4 ring-emerald-400/80' : '',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* FOTO OCUPANDO A CARTA TODA */}
      <div className="absolute inset-0 z-0">
        <img
          src={imagemJogador}
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
          className="absolute inset-0 h-full w-full object-cover scale-110 brightness-95 contrast-110"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/20" />
      </div>

      {/* BRILHO DA CARTA */}
      <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.22] bg-[radial-gradient(circle_at_top,_#fff,_transparent_62%)]" />

      {/* PADRÃO LIGAFUT */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage: `url("${pattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '260px 200px',
        }}
      />

      {/* MARCA D'ÁGUA */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt=""
          className="w-[92%] opacity-[0.08] select-none"
        />
      </div>

      {tipoCarta === 'especial' && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(0,245,212,0.25),transparent,rgba(255,255,255,0.25),transparent)] animate-pulse" />
      )}

      {/* OVERALL + POSIÇÃO */}
      <div className="absolute left-3 top-3 z-30 leading-none text-white">
        <div className="text-[34px] font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.65)]">
          {overallNumero}
        </div>
        <div className="text-[11px] font-black uppercase drop-shadow-[0_1px_0_rgba(0,0,0,0.65)]">
          {jogador.posicao}
        </div>
      </div>

      {/* BANDEIRA */}
      {flagCode && (
        <div className="absolute left-3 top-[70px] z-30">
          <img
            src={`https://flagcdn.com/w40/${flagCode}.png`}
            alt={jogador.nacionalidade ?? ''}
            className="w-7 h-5 rounded-sm shadow"
          />
        </div>
      )}

      {/* BOTÃO SELECIONAR */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <button
          type="button"
          onClick={onToggleSelecionado}
          className="absolute right-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-white shadow-md backdrop-blur-sm"
        >
          {selecionado ? '✓' : '+'}
        </button>
      )}

      {/* INFO FINAL */}
      <div className="absolute bottom-3 left-0 z-40 w-full px-2">
        <div className="rounded-2xl border border-white/20 bg-black/60 px-3 py-3 text-center shadow-lg backdrop-blur-md">
          <div className="truncate text-sm font-black uppercase tracking-wide text-white">
            {jogador.nome}
          </div>

          {salario !== null && (
            <div className="mt-1 text-[11px] text-white/80">
              💼 Salário: <b>R$ {salario.toLocaleString('pt-BR')}</b>
            </div>
          )}

          {typeof jogador.valor === 'number' && (
            <div className="mt-1 text-sm font-black text-emerald-300">
              💰 R$ {jogador.valor.toLocaleString('pt-BR')}
            </div>
          )}

          <div className="mt-2 grid grid-cols-3 gap-y-1 text-[10px] font-black text-white">
            <span>PAC {jogador.pace ?? 0}</span>
            <span>SHO {jogador.shooting ?? 0}</span>
            <span>PAS {jogador.passing ?? 0}</span>
            <span>DRI {jogador.dribbling ?? 0}</span>
            <span>DEF {jogador.defending ?? 0}</span>
            <span>PHY {jogador.physical ?? 0}</span>
          </div>

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