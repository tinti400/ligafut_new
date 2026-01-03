'use client'

import '@/styles/cardJogador.css'
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

  /* Mercado */
  onComprar?: () => void

  /* Elenco / Leilão (futuro) */
  selecionado?: boolean
  modo?: 'mercado' | 'elenco' | 'leilao'
}

/* ================= COMPONENTE ================= */

export default function CardJogador({
  jogador,
  onComprar,
  selecionado = false,
  modo = 'mercado',
}: CardJogadorProps) {
  const overallNumero = Number(jogador.overall ?? 0)
  const tipoCarta = getTipoCarta(overallNumero) // bronze | prata | ouro

  return (
    <div
      className={`card ${tipoCarta} ${selecionado ? 'ring-2 ring-emerald-400/60' : ''}`}
    >
      {/* ================= WATERMARKS ================= */}
      <div className="watermark-logo" />
      <div className="watermark-text" />

      {/* ================= TOPO ================= */}
      <div className="card-topo">
        <strong>{overallNumero}</strong>
        <span>{jogador.posicao}</span>
      </div>

      {/* ================= IMAGEM ================= */}
      <img
        src={
          jogador.imagem_url ||
          jogador.foto ||
          '/player-placeholder.png'
        }
        alt={jogador.nome}
        className="card-imagem"
        loading="lazy"
      />

      {/* ================= NOME ================= */}
      <h3 className="card-nome">{jogador.nome}</h3>

      {/* ================= NACIONALIDADE ================= */}
      {jogador.nacionalidade && (
        <p className="card-nacionalidade">
          🌍 {jogador.nacionalidade}
        </p>
      )}

      {/* ================= VALOR ================= */}
      {typeof jogador.valor === 'number' && (
        <p className="card-valor">
          💰 R$ {jogador.valor.toLocaleString('pt-BR')}
        </p>
      )}

      {/* ================= BOTÃO (MERCADO) ================= */}
      {modo === 'mercado' && onComprar && (
        <button
          type="button"
          className="card-botao"
          onClick={onComprar}
        >
          Comprar
        </button>
      )}
    </div>
  )
}
