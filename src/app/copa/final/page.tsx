'use client'

import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'

interface Time {
  id: string
  nome: string
  logo_url: string
}

interface Jogo {
  id: string
  mandante: Time
  visitante: Time
  gols_mandante: number | null
  gols_visitante: number | null
}

export default function FinalPage() {
  const [jogo, setJogo] = useState<Jogo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/final')
      .then((res) => res.json())
      .then((data) => {
        setJogo(data)
        setLoading(false)
        if (data && data.gols_mandante !== null && data.gols_visitante !== null) {
          const vencedor = definirVencedor(data)
          if (vencedor) {
            setTimeout(() => confetti(), 500)
          }
        }
      })
  }, [])

  const definirVencedor = (jogo: Jogo) => {
    const { gols_mandante, gols_visitante } = jogo
    if (gols_mandante === null || gols_visitante === null) return null
    if (gols_mandante > gols_visitante) return jogo.mandante
    if (gols_visitante > gols_mandante) return jogo.visitante
    // Desempate: time mandante (melhor campanha)
    return jogo.mandante
  }

  if (loading) return <div className="p-4 text-white">🔄 Carregando...</div>

  const vencedor = jogo && definirVencedor(jogo)

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4 text-center">🏅 Final da Copa</h1>

      {jogo ? (
        <div className="max-w-xl mx-auto bg-gray-900 p-6 rounded-xl shadow-lg text-center">
          <h2 className="text-lg font-bold mb-4">🎯 Jogo Único</h2>
          <div className="flex items-center justify-center gap-6 text-lg font-semibold mb-4">
            <div className="flex items-center gap-2">
              <img src={jogo.mandante.logo_url} alt={jogo.mandante.nome} className="w-8 h-8 rounded-full" />
              {jogo.mandante.nome}
            </div>
            <span>{jogo.gols_mandante} x {jogo.gols_visitante}</span>
            <div className="flex items-center gap-2">
              {jogo.visitante.nome}
              <img src={jogo.visitante.logo_url} alt={jogo.visitante.nome} className="w-8 h-8 rounded-full" />
            </div>
          </div>

          {vencedor && (
            <div className="mt-6">
              <h2 className="text-2xl font-bold text-green-400 mb-2 animate-bounce">🏆 Campeão: {vencedor.nome}!</h2>
              <img src={vencedor.logo_url} alt={vencedor.nome} className="w-20 h-20 mx-auto mb-4 rounded-full" />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`🏆 ${vencedor.nome} é o campeão da Copa da LigaFut!`)}
                `}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                📤 Compartilhar no WhatsApp
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-center text-gray-400">Jogo ainda não definido.</p>
      )}
    </div>
  )
}

