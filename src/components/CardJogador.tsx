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

  /* ===== Gradiente EA FC ===== */
  const gradiente =
    tipoCarta === 'bronze'
      ? 'bg-gradient-to-b from-[#8b5a2b] via-[#b37a45] to-[#3a2416] text-yellow-100'
      : tipoCarta === 'prata'
      ? 'bg-gradient-to-b from-[#f3f4f6] via-[#9ca3af] to-[#4b5563] text-gray-900'
      : 'bg-gradient-to-b from-[#fff2a8] via-[#f6c453] to-[#b88900] text-black'

  return (
    <div
      className={[
        'relative',
        'w-[220px] h-[340px]',          // 🔒 tamanho fixo EA FC
        'rounded-[18px]',
        'overflow-hidden',              // 🔥 evita borda preta externa
        'shadow-2xl',
        'transition-transform duration-300 hover:scale-[1.04]',
        gradiente,
        selecionado ? 'ring-4 ring-emerald-400/70' : '',
        loadingComprar ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* ===== WATERMARK ===== */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top,_#fff,_transparent_70%)]" />

      {/* ===== OVR / POSIÇÃO ===== */}
      <div className="absolute left-3 top-3 z-10 leading-none">
        <div className="text-[32px] font-extrabold">{overallNumero}</div>
        <div className="text-[11px] font-bold uppercase">{jogador.posicao}</div>
      </div>

      {/* ===== CHECKBOX (ELENCO) — DENTRO DA CARTA ===== */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <div className="absolute right-3 top-3 z-20">
          <label className="flex h-7 w-7 items-center justify-center rounded-md bg-black/30 backdrop-blur-sm">
            <input
              type="checkbox"
              checked={selecionado}
              onChange={onToggleSelecionado}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>
        </div>
      )}

      {/* ===== IMAGEM ===== */}
      <div className="flex justify-center pt-12">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[185px] object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
          loading="lazy"
        />
      </div>

      {/* ===== INFO ===== */}
      <div className="absolute bottom-0 w-full bg-black/30 px-3 py-3 text-center">
        <div className="text-sm font-extrabold uppercase tracking-wide truncate">
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
        <div className="absolute bottom-[-56px] left-0 w-full px-3">
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


