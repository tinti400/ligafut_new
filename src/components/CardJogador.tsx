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

  // ✅ NOVO (resolve seu erro)
  salario?: number | null

  // atributos (todas variações)
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

type CardJogadorProps = {
  jogador: Jogador
  modo?: 'mercado' | 'elenco' | 'leilao'
  selecionado?: boolean
  onComprar?: () => void
  loadingComprar?: boolean
  mercadoFechado?: boolean
  onToggleSelecionado?: () => void
}

const getAttr = (j: Jogador, keys: (keyof Jogador)[]) => {
  for (const k of keys) {
    const val = Number(j[k] ?? 0)
    if (val > 0) return val
  }
  return 0
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

  // ✅ salario inteligente
  const salario =
    jogador.salario ??
    (typeof jogador.valor === 'number'
      ? Math.round(jogador.valor * 0.0075)
      : null)

  // ✅ atributos inteligentes (aceita qualquer base)
  const attrs = {
    pac: getAttr(jogador, ['pace', 'pac', 'ritmo']),
    sho: getAttr(jogador, ['shooting', 'sho', 'finalizacao']),
    pas: getAttr(jogador, ['passing', 'pas', 'passe']),
    dri: getAttr(jogador, ['dribbling', 'dri', 'drible']),
    def: getAttr(jogador, ['defending', 'def', 'defesa']),
    phy: getAttr(jogador, ['physical', 'phy', 'fisico']),
  }

  const gradiente =
    tipoCarta === 'bronze'
      ? 'from-[#8b5a2b] to-[#3a2416]'
      : tipoCarta === 'prata'
        ? 'from-[#e5e7eb] to-[#4b5563]'
        : tipoCarta === 'ouro'
          ? 'from-[#fff2a8] to-[#b88900]'
          : 'from-[#00f5d4] to-[#001f3f]'

  return (
    <div
      className={`relative w-[220px] h-[400px] rounded-[20px] overflow-hidden shadow-xl 
      bg-gradient-to-b ${gradiente} text-white
      ${selecionado ? 'ring-4 ring-emerald-400' : ''}
      transition hover:scale-105`}
    >
      {/* OVERALL */}
      <div className="absolute top-3 left-3 text-3xl font-black">
        {overallNumero}
      </div>

      <div className="absolute top-10 left-3 text-xs font-bold">
        {jogador.posicao}
      </div>

      {/* BOTÃO SELECT */}
      {modo !== 'mercado' && onToggleSelecionado && (
        <button
          onClick={onToggleSelecionado}
          className="absolute top-3 right-3 bg-black/50 px-2 py-1 rounded"
        >
          {selecionado ? '✓' : '+'}
        </button>
      )}

      {/* IMAGEM */}
      <div className="flex justify-center items-center h-[230px] mt-8">
        <img
          src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
          className="h-[220px] object-contain"
        />
      </div>

      {/* NOME */}
      <div className="text-center font-bold text-sm truncate">
        {jogador.nome}
      </div>

      {/* SALARIO + VALOR */}
      <div className="text-center text-xs mt-1">
        {salario && <>💼 R$ {salario.toLocaleString('pt-BR')}</>}
      </div>

      <div className="text-center text-emerald-300 font-bold">
        {jogador.valor && `R$ ${jogador.valor.toLocaleString('pt-BR')}`}
      </div>

      {/* ATRIBUTOS */}
      <div className="grid grid-cols-3 text-[10px] mt-2 px-2 text-center font-bold">
        <span>PAC {attrs.pac}</span>
        <span>SHO {attrs.sho}</span>
        <span>PAS {attrs.pas}</span>
        <span>DRI {attrs.dri}</span>
        <span>DEF {attrs.def}</span>
        <span>PHY {attrs.phy}</span>
      </div>

      {/* BOTÃO COMPRAR */}
      {modo === 'mercado' && onComprar && (
        <button
          onClick={onComprar}
          disabled={loadingComprar || mercadoFechado}
          className="absolute bottom-2 left-2 right-2 bg-emerald-600 py-2 rounded text-xs font-bold"
        >
          {loadingComprar
            ? 'Comprando...'
            : mercadoFechado
              ? 'Mercado fechado'
              : 'Comprar'}
        </button>
      )}
    </div>
  )
}