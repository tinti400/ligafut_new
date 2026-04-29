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

export default function CardJogador({
  jogador,
  modo = 'mercado',
  onComprar,
  loadingComprar = false,
  mercadoFechado = false,
}: CardJogadorProps) {
  const overallNumero = Number(jogador.overall ?? 0)
  const tipoCarta = getTipoCarta(overallNumero)

  const flagCode = jogador.nacionalidade
    ? bandeiras[jogador.nacionalidade]
    : null

  const gradiente =
    tipoCarta === 'bronze'
      ? 'from-[#7a4a2e] to-[#3a2416]'
      : tipoCarta === 'prata'
        ? 'from-[#d1d5db] to-[#4b5563]'
        : tipoCarta === 'ouro'
          ? 'from-[#f5d061] to-[#b88900]'
          : 'from-[#0f172a] to-[#00f5d4]'

  return (
    <div className="relative w-[220px] h-[360px] rounded-[20px] overflow-hidden shadow-2xl">

      {/* FUNDO */}
      <div className={`absolute inset-0 bg-gradient-to-b ${gradiente}`} />

      {/* IMAGEM GRANDE (AGORA CORRETO 🔥) */}
      <div className="absolute inset-0 flex items-center justify-center pt-8">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          alt={jogador.nome}
          className="h-[240px] object-contain drop-shadow-[0_25px_40px_rgba(0,0,0,0.8)]"
        />
      </div>

      {/* OVERALL */}
      <div className="absolute top-3 left-3 text-black z-10">
        <div className="text-[30px] font-extrabold">{overallNumero}</div>
        <div className="text-[11px] font-bold">{jogador.posicao}</div>
      </div>

      {/* BANDEIRA */}
      {flagCode && (
        <img
          src={`https://flagcdn.com/w40/${flagCode}.png`}
          className="absolute top-[55px] left-3 w-6"
        />
      )}

      {/* BASE INFERIOR */}
      <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur px-3 py-3 text-center">

        <div className="text-sm font-extrabold text-white truncate">
          {jogador.nome}
        </div>

        {/* ATRIBUTOS */}
        <div className="mt-2 grid grid-cols-3 text-[10px] text-white font-bold">
          <span>PAC {jogador.pace ?? 0}</span>
          <span>SHO {jogador.shooting ?? 0}</span>
          <span>PAS {jogador.passing ?? 0}</span>
          <span>DRI {jogador.dribbling ?? 0}</span>
          <span>DEF {jogador.defending ?? 0}</span>
          <span>PHY {jogador.physical ?? 0}</span>
        </div>

        {/* VALOR */}
        {typeof jogador.valor === 'number' && (
          <div className="mt-2 text-emerald-400 font-extrabold">
            R$ {jogador.valor.toLocaleString('pt-BR')}
          </div>
        )}

        {/* BOTÃO */}
        {modo === 'mercado' && onComprar && (
          <button
            onClick={onComprar}
            disabled={loadingComprar || mercadoFechado}
            className="mt-3 w-full bg-green-600 hover:bg-green-700 py-2 rounded-xl font-bold text-white"
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