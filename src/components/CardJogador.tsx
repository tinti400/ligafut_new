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
  Bélgica: 'be',
  Uruguai: 'uy',
  Paraguai: 'py',
  Chile: 'cl',
  Colômbia: 'co',
  México: 'mx',
  EstadosUnidos: 'us',
  USA: 'us',
}

function formatarValor(valor?: number | null) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(valor || 0))
}

function normalizarTexto(texto?: string | null) {
  return String(texto || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function gerarImagemComProxy(urlOriginal?: string | null) {
  const url = String(urlOriginal || '').trim()

  if (!url || url === 'null' || url === 'undefined') {
    return '/player-placeholder.png'
  }

  const limpa = url.replace(/\s/g, '%20')

  if (limpa.includes('cdn.sofifa.net')) {
    const semProtocolo = limpa.replace('https://', '').replace('http://', '')
    return `https://images.weserv.nl/?url=${encodeURIComponent(semProtocolo)}`
  }

  if (limpa.startsWith('http://')) {
    return limpa.replace('http://', 'https://')
  }

  return limpa
}

function imagemJogador(jogador: Jogador) {
  return gerarImagemComProxy(jogador.imagem_url || jogador.foto)
}

function textPatternSvg(text = 'LIGAFUT26') {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="260" height="200">
    <rect width="100%" height="100%" fill="transparent"/>
    <g transform="rotate(-18 130 100)">
      <text x="10" y="70" font-family="Arial" font-size="28" font-weight="900"
        fill="rgba(255,255,255,0.13)" letter-spacing="3">${text}</text>
      <text x="10" y="130" font-family="Arial" font-size="28" font-weight="900"
        fill="rgba(255,255,255,0.07)" letter-spacing="3">${text}</text>
      <text x="10" y="190" font-family="Arial" font-size="28" font-weight="900"
        fill="rgba(255,255,255,0.05)" letter-spacing="3">${text}</text>
    </g>
  </svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
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
    typeof jogador.valor === 'number' ? Math.round(jogador.valor * 0.0075) : null

  const nacionalidadeNormalizada = normalizarTexto(jogador.nacionalidade)
  const flagCode =
    bandeiras[jogador.nacionalidade || ''] ||
    bandeiras[nacionalidadeNormalizada] ||
    null

  const imagem = imagemJogador(jogador)

  const gradiente =
    tipoCarta === 'bronze'
      ? 'from-[#4b2612] via-[#b9793e] to-[#f2b56b] text-yellow-100'
      : tipoCarta === 'prata'
        ? 'from-[#3f4650] via-[#cfd5dd] to-[#ffffff] text-gray-900'
        : tipoCarta === 'ouro'
          ? 'from-[#8a6100] via-[#f7c843] to-[#fff4b0] text-black'
          : 'from-[#020617] via-[#0f766e] to-[#67e8f9] text-white'

  const borda =
    tipoCarta === 'bronze'
      ? 'border-orange-300/40'
      : tipoCarta === 'prata'
        ? 'border-white/60'
        : tipoCarta === 'ouro'
          ? 'border-yellow-200/70'
          : 'border-cyan-300/70'

  const brilho =
    tipoCarta === 'bronze'
      ? 'shadow-[0_24px_60px_rgba(180,90,35,0.35)]'
      : tipoCarta === 'prata'
        ? 'shadow-[0_24px_60px_rgba(210,220,230,0.28)]'
        : tipoCarta === 'ouro'
          ? 'shadow-[0_24px_70px_rgba(255,200,60,0.38)]'
          : 'shadow-[0_24px_70px_rgba(34,211,238,0.38)]'

  const pattern = textPatternSvg()

  return (
    <div
      className={[
        'group relative h-[410px] w-[230px] overflow-hidden rounded-[28px]',
        'border bg-gradient-to-br',
        gradiente,
        borda,
        brilho,
        'transition-all duration-300 hover:-translate-y-2 hover:scale-[1.035]',
        selecionado ? 'ring-4 ring-emerald-400' : '',
        loadingComprar ? 'pointer-events-none opacity-70' : '',
      ].join(' ')}
    >
      <div className="absolute inset-[6px] rounded-[24px] border border-white/20" />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.65),transparent_38%)] opacity-60" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.24] mix-blend-overlay"
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
          className="w-[95%] rotate-[-8deg] select-none opacity-[0.10]"
          draggable={false}
        />
      </div>

      <div className="pointer-events-none absolute -left-20 top-0 h-[140%] w-20 rotate-[18deg] bg-white/25 blur-xl transition-all duration-700 group-hover:left-[130%]" />

      <div className="absolute left-4 top-4 z-30 leading-none">
        <div className="text-[38px] font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]">
          {overallNumero || '--'}
        </div>
        <div className="mt-1 text-[12px] font-black uppercase tracking-wider drop-shadow">
          {jogador.posicao}
        </div>

        {flagCode && (
          <img
            src={`https://flagcdn.com/w40/${flagCode}.png`}
            alt={jogador.nacionalidade ?? ''}
            className="mt-2 h-5 w-7 rounded-sm shadow"
            loading="lazy"
          />
        )}
      </div>

      {onToggleSelecionado && (
        <button
          type="button"
          onClick={onToggleSelecionado}
          className="absolute right-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-black/45 text-lg font-black text-white shadow-lg backdrop-blur-md"
        >
          {selecionado ? '✓' : '+'}
        </button>
      )}

      <div className="absolute inset-x-0 top-[58px] z-20 flex justify-center">
        <img
          src={imagem}
          alt={jogador.nome}
          referrerPolicy="no-referrer"
          className="h-[245px] max-w-[235px] object-contain drop-shadow-[0_28px_35px_rgba(0,0,0,0.85)]"
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget

            if (img.src.includes('26_120.png')) {
              img.src = img.src.replace('26_120.png', '25_120.png')
              return
            }

            if (img.src.includes('25_120.png')) {
              img.src = img.src.replace('25_120.png', '24_120.png')
              return
            }

            if (!img.src.includes('/player-placeholder.png')) {
              img.src = '/player-placeholder.png'
            }
          }}
        />
      </div>

      <div className="absolute bottom-3 left-0 z-40 w-full px-3">
        <div className="rounded-[22px] border border-white/25 bg-black/60 px-3 py-3 text-center shadow-2xl backdrop-blur-md">
          <div className="truncate text-[15px] font-black uppercase tracking-wide text-white">
            {jogador.nome}
          </div>

          {typeof jogador.valor === 'number' && (
            <div className="mt-1 text-sm font-black text-emerald-300">
              {formatarValor(jogador.valor)}
            </div>
          )}

          {salario !== null && (
            <div className="mt-1 text-[11px] font-semibold text-white/75">
              Salário: {formatarValor(salario)}
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/35 px-2 py-2 text-[10px] font-black text-white">
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
                'mt-3 w-full rounded-2xl py-2 text-sm font-black transition-all',
                loadingComprar || mercadoFechado
                  ? 'cursor-not-allowed bg-gray-700 text-gray-300'
                  : 'bg-emerald-500 text-black hover:scale-[1.03] hover:bg-emerald-400',
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