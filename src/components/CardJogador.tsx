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
  alemanha: 'de',
  italia: 'it',
  inglaterra: 'gb',
}

// 🔥 RESOLVE 100% DOS PROBLEMAS DE IMAGEM
function getImagem(jogador: Jogador) {
  const url = jogador.imagem_url || jogador.foto || ''

  if (!url) return '/player-placeholder.png'

  let limpa = url.trim().replace(/\s/g, '%20')

  // 🔥 CORREÇÃO SOFIFA (CAUSA DO SEU BUG)
  if (limpa.includes('cdn.sofifa.net')) {
    const semHttps = limpa.replace('https://', '').replace('http://', '')
    return `https://images.weserv.nl/?url=${encodeURIComponent(semHttps)}`
  }

  return limpa
}

function formatarValor(v?: number | null) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(v || 0))
}

export default function CardJogador({
  jogador,
  modo = 'mercado',
  selecionado,
  onComprar,
  loadingComprar,
  mercadoFechado,
  onToggleSelecionado,
}: Props) {
  const overall = Number(jogador.overall ?? 0)
  const tipo = getTipoCarta(overall)

  const imagem = getImagem(jogador)

  const flag =
    jogador.nacionalidade &&
    bandeiras[jogador.nacionalidade.toLowerCase()]

  const salario =
    jogador.valor != null ? Math.round(jogador.valor * 0.0075) : null

  const gradiente =
    tipo === 'bronze'
      ? 'from-[#5a2e12] via-[#a56a3a] to-[#e0a15f]'
      : tipo === 'prata'
      ? 'from-[#3b3f45] via-[#cfd3da] to-[#ffffff]'
      : 'from-[#8a6100] via-[#f6c453] to-[#fff4b0]'

  return (
    <div
      className={[
        'relative w-[230px] h-[400px] rounded-[26px] overflow-hidden',
        'bg-gradient-to-b',
        gradiente,
        'shadow-[0_20px_50px_rgba(0,0,0,0.6)]',
        'hover:scale-[1.05] transition',
        selecionado ? 'ring-4 ring-green-400' : '',
      ].join(' ')}
    >
      {/* brilho premium */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.6),transparent_40%)] opacity-60" />

      {/* OVERALL */}
      <div className="absolute left-4 top-4 z-30">
        <div className="text-[38px] font-black text-white drop-shadow">
          {overall || '--'}
        </div>
        <div className="text-[12px] font-bold text-white">
          {jogador.posicao}
        </div>

        {flag && (
          <img
            src={`https://flagcdn.com/w40/${flag}.png`}
            className="mt-1 w-7"
          />
        )}
      </div>

      {/* BOTÃO SELECT */}
      {onToggleSelecionado && (
        <button
          onClick={onToggleSelecionado}
          className="absolute right-3 top-3 z-30 bg-black/50 text-white w-8 h-8 rounded-lg"
        >
          {selecionado ? '✓' : '+'}
        </button>
      )}

      {/* IMAGEM */}
      <div className="flex justify-center items-center h-[250px] mt-10">
        <img
          src={imagem}
          alt={jogador.nome}
          className="h-[220px] object-contain drop-shadow-2xl"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget

            // fallback sofifa versões
            if (img.src.includes('26_120.png')) {
              img.src = img.src.replace('26_120.png', '25_120.png')
              return
            }

            if (img.src.includes('25_120.png')) {
              img.src = img.src.replace('25_120.png', '24_120.png')
              return
            }

            img.src = '/player-placeholder.png'
          }}
        />
      </div>

      {/* INFO */}
      <div className="absolute bottom-0 w-full p-3 bg-black/60 backdrop-blur-md text-center">
        <div className="text-white font-black text-sm truncate">
          {jogador.nome}
        </div>

        {jogador.valor && (
          <div className="text-green-300 font-bold">
            {formatarValor(jogador.valor)}
          </div>
        )}

        {salario && (
          <div className="text-[11px] text-white/70">
            Salário: {formatarValor(salario)}
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-3 text-[10px] text-white font-bold mt-2">
          <span>PAC {jogador.pace ?? 0}</span>
          <span>SHO {jogador.shooting ?? 0}</span>
          <span>PAS {jogador.passing ?? 0}</span>
          <span>DRI {jogador.dribbling ?? 0}</span>
          <span>DEF {jogador.defending ?? 0}</span>
          <span>PHY {jogador.physical ?? 0}</span>
        </div>

        {/* BOTÃO */}
        {modo === 'mercado' && onComprar && (
          <button
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className="mt-2 w-full bg-green-500 text-black py-2 rounded-xl font-bold hover:bg-green-400 transition"
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
  )
}