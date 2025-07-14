'use client'

import Image from 'next/image'

interface JogadorCardProps {
  jogador: any
  selecionado?: boolean
  onClick?: () => void
  exibirValor?: boolean
}

export default function JogadorCard({
  jogador,
  selecionado = false,
  onClick,
  exibirValor = true,
}: JogadorCardProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 p-3 border rounded-md shadow-sm cursor-pointer transition-all hover:shadow-md ${
        selecionado ? 'bg-green-100 border-green-500' : 'bg-white'
      }`}
    >
      <Image
        src={jogador.imagem_url || '/jogador.png'}
        alt={jogador.nome}
        width={50}
        height={50}
        className="rounded object-cover w-[50px] h-[50px]"
      />

      <div className="flex-1">
        <p className="font-bold">{jogador.nome}</p>
        <p className="text-sm text-gray-600">
          {jogador.posicao} • Overall {jogador.overall}
        </p>
        {exibirValor && (
          <p className="text-sm text-blue-600 font-semibold">
            R$ {Number(jogador.valor).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
