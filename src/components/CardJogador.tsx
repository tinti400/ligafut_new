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
      {/* brilho */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.16] bg-[radial-gradient(circle_at_top,_#fff,_transparent_65%)]" />

      {/* pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] mix-blend-overlay"
        style={{
          backgroundImage: `url("${pattern}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '260px 200px',
        }}
      />

      {/* logo watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt=""
          className="w-[92%] opacity-[0.12]"
        />
      </div>

      {/* efeito especial */}
      {tipoCarta === 'especial' && (
        <div className="pointer-events-none absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(0,245,212,0.25),transparent,rgba(255,255,255,0.25),transparent)] animate-pulse" />
      )}

      {/* OVR */}
      <div className="absolute left-3 top-3 z-10">
        <div className="text-[34px] font-black">{overallNumero}</div>
        <div className="text-[11px] font-black uppercase">
          {jogador.posicao}
        </div>
      </div>

      {/* bandeira */}
      {flagCode && (
        <div className="absolute left-3 top-[70px] z-10">
          <img
            src={`https://flagcdn.com/w40/${flagCode}.png`}
            className="w-7 h-5"
          />
        </div>
      )}

      {/* imagem */}
      <div className="flex justify-center pt-14">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          className="h-[180px] object-contain"
        />
      </div>

      {/* info */}
      <div className="absolute bottom-3 left-0 w-full px-2">
        <div className="rounded-2xl bg-black/40 backdrop-blur px-3 py-3 text-center">
          <div className="text-sm font-black uppercase text-white">
            {jogador.nome}
          </div>

          {salario !== null && (
            <div className="text-[11px] text-white/80">
              💼 R$ {salario.toLocaleString('pt-BR')}
            </div>
          )}

          {typeof jogador.valor === 'number' && (
            <div className="text-sm font-black text-emerald-300">
              💰 R$ {jogador.valor.toLocaleString('pt-BR')}
            </div>
          )}

          {/* ATRIBUTOS */}
          <div className="mt-2 grid grid-cols-3 text-[10px] font-black text-white">
            <span>PAC {jogador.pace ?? 0}</span>
            <span>SHO {jogador.shooting ?? 0}</span>
            <span>PAS {jogador.passing ?? 0}</span>
            <span>DRI {jogador.dribbling ?? 0}</span>
            <span>DEF {jogador.defending ?? 0}</span>
            <span>PHY {jogador.physical ?? 0}</span>
          </div>

          {/* botão */}
          {modo === 'mercado' && onComprar && (
            <button
              onClick={onComprar}
              disabled={loadingComprar || mercadoFechado}
              className="mt-3 w-full rounded-xl py-2 font-black bg-emerald-600 hover:bg-emerald-700 text-white"
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