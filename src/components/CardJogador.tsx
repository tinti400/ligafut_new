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
  // garante que overall é número
  const overallNumero = Number(jogador.overall || 0)

  // define automaticamente bronze / prata / ouro
  const tipoCarta = getTipoCarta(overallNumero)

  return (
    <div className={`card ${tipoCarta}`}>
      {/* TOPO */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>{overallNumero}</strong>
        <span>{jogador.posicao}</span>
      </div>

      {/* IMAGEM */}
      <img
        src={
          jogador.imagem_url ||
          jogador.foto ||
          '/player-placeholder.png'
        }
        alt={jogador.nome}
        style={{ width: '100%', borderRadius: 10, marginTop: 8 }}
      />

      {/* NOME */}
      <h3>{jogador.nome}</h3>

      {/* NACIONALIDADE */}
      {jogador.nacionalidade && (
        <p>{jogador.nacionalidade}</p>
      )}

      {/* VALOR (opcional – mercado) */}
      {typeof jogador.valor === 'number' && (
        <p>
          💰 R$ {jogador.valor.toLocaleString('pt-BR')}
        </p>
      )}

      {/* BOTÃO COMPRAR (opcional) */}
      {onComprar && (
        <button
          onClick={onComprar}
          style={{
            marginTop: 8,
            padding: '6px 10px',
            borderRadius: 6,
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Comprar
        </button>
      )}
    </div>
  )
}
