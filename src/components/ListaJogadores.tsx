'use client'

interface Jogador {
  id: number
  nome: string
  posicao: string
}

interface ListaJogadoresProps {
  jogadores: Jogador[]
  onSelecionar: (jogador: Jogador) => void
}

export default function ListaJogadores({ jogadores, onSelecionar }: ListaJogadoresProps) {
  return (
    <div className="bg-gray-800 p-4 rounded-lg w-full max-w-md mx-auto shadow-md">
      <h2 className="text-lg font-bold text-center text-green-400 mb-2">🎯 Jogadores Disponíveis</h2>

      <div className="flex flex-wrap gap-2 justify-center">
        {jogadores.map((jogador) => (
          <button
            key={jogador.id}
            onClick={() => onSelecionar(jogador)}
            className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded-full text-white text-xs font-semibold transition"
          >
            {jogador.nome} ({jogador.posicao})
          </button>
        ))}
      </div>
    </div>
  )
}
