'use client'

import { getTipoCarta } from '@/utils/cardUtils'

type Jogador = {
  id?: string | number
  nome: string
  posicao: string
  overall?: number | string | null
  valor?: number | null
  salario?: number | null
  nacionalidade?: string | null
  imagem_url?: string | null
  foto?: string | null

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

type Props = {
  jogador: Jogador
  modo?: 'mercado' | 'elenco' | 'leilao'
  selecionado?: boolean
  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean
  onToggleSelecionado?: () => void
}

const bandeiras: Record<string, string> = {
  brasil: 'br',
  argentina: 'ar',
  portugal: 'pt',
  espanha: 'es',
  franca: 'fr',
  frança: 'fr',
  alemanha: 'de',
  italia: 'it',
  inglaterra: 'gb',
  holanda: 'nl',
  uruguai: 'uy',
  chile: 'cl',
  colombia: 'co',
  colômbia: 'co',
  paraguai: 'py',
  mexico: 'mx',
  méxico: 'mx',
}

function normalizar(txt?: string | null) {
  return String(txt || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function formatarValor(v?: number | null) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(v || 0))
}

function getImagem(jogador: Jogador) {
  const url = String(jogador.imagem_url || jogador.foto || '').trim()

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

export default function CardJogador({
  jogador,
  modo = 'mercado',
  selecionado = false,
  onComprar,
  loadingComprar = false,
  mercadoFechado = false,
  onToggleSelecionado,
}: Props) {
  const overall = Number(jogador.overall ?? 0)
  const tipo = getTipoCarta(overall)

  const imagem = getImagem(jogador)

  const flag = jogador.nacionalidade
    ? bandeiras[normalizar(jogador.nacionalidade)]
    : null

  const salario =
    jogador.salario ??
    (jogador.valor != null ? Math.round(Number(jogador.valor) * 0.075) : null)

  const stats = {
    pace: jogador.pace ?? jogador.pac ?? jogador.ritmo ?? 0,
    shooting: jogador.shooting ?? jogador.sho ?? jogador.finalizacao ?? 0,
    passing: jogador.passing ?? jogador.pas ?? jogador.passe ?? 0,
    dribbling: jogador.dribbling ?? jogador.dri ?? jogador.drible ?? 0,
    defending: jogador.defending ?? jogador.def ?? jogador.defesa ?? 0,
    physical: jogador.physical ?? jogador.phy ?? jogador.fisico ?? 0,
  }

  const gradiente =
    tipo === 'bronze'
      ? 'from-[#4b2612] via-[#b9793e] to-[#f2b56b]'
      : tipo === 'prata'
        ? 'from-[#3f4650] via-[#cfd5dd] to-[#ffffff]'
        : tipo === 'ouro'
          ? 'from-[#8a6100] via-[#f7c843] to-[#fff4b0]'
          : 'from-[#020617] via-[#0f766e] to-[#67e8f9]'

  return (
    <div
      className={[
        'group relative h-[410px] w-[230px] overflow-hidden rounded-[28px]',
        'border border-white/20 bg-gradient-to-br',
        gradiente,
        'shadow-[0_24px_70px_rgba(0,0,0,0.55)]',
        'transition-all duration-300 hover:-translate-y-2 hover:scale-[1.035]',
        selecionado ? 'ring-4 ring-emerald-400' : '',
        loadingComprar ? 'pointer-events-none opacity-70' : '',
      ].join(' ')}
    >
      <div className="absolute inset-[6px] rounded-[24px] border border-white/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.65),transparent_38%)] opacity-60" />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <img
          src="/watermarks/ligafut26.png"
          alt=""
          className="w-[95%] rotate-[-8deg] select-none opacity-[0.10]"
          draggable={false}
        />
      </div>

      <div className="absolute left-4 top-4 z-30 leading-none text-white">
        <div className="text-[38px] font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]">
          {overall || '--'}
        </div>
        <div className="mt-1 text-[12px] font-black uppercase tracking-wider drop-shadow">
          {jogador.posicao}
        </div>

        {flag && (
          <img
            src={`https://flagcdn.com/w40/${flag}.png`}
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
            <span>PAC {stats.pace}</span>
            <span>SHO {stats.shooting}</span>
            <span>PAS {stats.passing}</span>
            <span>DRI {stats.dribbling}</span>
            <span>DEF {stats.defending}</span>
            <span>PHY {stats.physical}</span>
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