'use client'

import { getTipoCarta } from '@/utils/cardUtils'

type CardJogadorProps = {
  jogador: {
    id?: string | number
    nome: string
    overall: number | string
    posicao: string
    nacionalidade?: string
    imagem_url?: string
    foto?: string
    valor?: number
  }
  onComprar?: () => void
}

export default function CardJogador({ jogador, onComprar }: CardJogadorProps) {
  const overallNumero = Number(jogador.overall || 0)
  const tipoCarta = getTipoCarta(overallNumero) // bronze | prata | ouro

  return (
    <div className={`card ${tipoCarta}`}>
      {/* WATERMARKS */}
      <div className="watermark-logo" />
      <div className="watermark-text" />

      {/* TOPO */}
      <div className="card-topo">
        <strong>{overallNumero}</strong>
        <span>{jogador.posicao}</span>
      </div>

      {/* IMAGEM */}
      <img
        src={jogador.imagem_url || jogador.foto || '/player-placeholder.png'}
        alt={jogador.nome}
        className="card-imagem"
      />

      {/* NOME */}
      <h3 className="card-nome">{jogador.nome}</h3>

      {/* NACIONALIDADE */}
      {jogador.nacionalidade && (
        <p className="card-nacionalidade">{jogador.nacionalidade}</p>
      )}

      {/* VALOR */}
      {typeof jogador.valor === 'number' && (
        <p className="card-valor">
          💰 R$ {jogador.valor.toLocaleString('pt-BR')}
        </p>
      )}

      {/* BOTÃO */}
      {onComprar && (
        <button className="card-botao" onClick={onComprar}>
          Comprar
        </button>
      )}
    </div>
  )
}
