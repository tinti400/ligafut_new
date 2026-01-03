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

  /* Comportamento */
  modo?: 'mercado' | 'elenco' | 'leilao'
  selecionado?: boolean

  /* Mercado */
  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean

  /* Elenco / Admin */
  onToggleSelecionado?: () => void
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
  const tipoCarta = getTipoCarta(overallNumero) // bronze | prata | ouro

  /* ===== Gradiente padrão do MERCADO ===== */
  const gradiente =
    tipoCarta === 'bronze'
      ? 'bg-gradient-to-b from-[#7a4a1d] via-[#a97142] to-[#2a1a0f] text-yellow-100'
      : tipoCarta === 'prata'
      ? 'bg-gradient-to-b from-[#e5e7eb] via-[#9ca3af] to-[#374151] text-gray-900'
      : 'bg-gradient-to-b from-[#fff4b0] via-[#f6c453] to-[#b88900] text-black'

  return (
    <div
      className={[
        'relative w-full max-w-[260px] overflow-hidden rounded-[22px]',
        'shadow-xl transition-transform duration-300 hover:scale-[1.03]',
        gradiente,
        selecionado ? 'ring-4 ring-emerald-400/70' : '',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* ===== WATERMARKS ===== */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_top,_#fff,_transparent_70%)]" />

      {/* ===== OVR / POSIÇÃO ===== */}
      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-3xl font-extrabold">{overallNumero}</div>
        <div className="text-xs font-bold uppercase">{jogador.posicao}</div>
      </div>

      {/* ===== CHECKBOX (ELENCO / ADMIN) ===== */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <div className="absolute right-2 top-2 z-20">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={onToggleSelecionado}
            className="h-5 w-5 accent-emerald-500"
          />
        </div>
      )}

      {/* ===== IMAGEM ===== */}
      <div className="flex justify-center pt-10">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[180px] object-contain drop-shadow-2xl"
          loading="lazy"
        />
      </div>

      {/* ===== INFO ===== */}
      <div className="mt-3 bg-black/25 px-3 py-2 text-center">
        <div className="text-sm font-extrabold uppercase tracking-wide line-clamp-1">
          {jogador.nome}
        </div>

        {jogador.nacionalidade && (
          <div className="mt-0.5 text-[11px] opacity-90">
            🌍 {jogador.nacionalidade}
          </div>
        )}

        {typeof jogador.valor === 'number' && (
          <div className="mt-1 text-sm font-semibold text-green-300">
            💰 R$ {jogador.valor.toLocaleString('pt-BR')}
          </div>
        )}
      </div>

      {/* ===== BOTÃO MERCADO ===== */}
      {modo === 'mercado' && onComprar && (
        <div className="px-3 pb-4 pt-3">
          <button
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className={[
              'w-full rounded-xl py-2 text-sm font-bold transition-all',
              loadingComprar || mercadoFechado
                ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 hover:scale-[1.02]',
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

