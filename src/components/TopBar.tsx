'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TopBar() {
  const [nomeTime, setNomeTime] = useState('Meu Clube')
  const [saldo, setSaldo] = useState(0)
  const [posicao, setPosicao] = useState('-')

  const router = useRouter()

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}')

    setNomeTime(user?.nome_time || 'Sem Nome')
    setSaldo(user?.saldo || 0)
    setPosicao(user?.posicao || '-')
  }, [])

  const formatar = (valor: number) => {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  return (
    <div className="sticky top-0 z-50 w-full backdrop-blur-md bg-black/60 border-b border-white/10">

      <div className="flex items-center justify-between px-4 md:px-8 py-3">

        {/* ESQUERDA */}
        <div className="flex items-center gap-3">

          {/* Logo */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-yellow-400 flex items-center justify-center font-bold">
            LF
          </div>

          {/* Nome */}
          <div>
            <p className="text-sm text-gray-400">Seu Clube</p>
            <h1 className="text-lg font-bold leading-none">{nomeTime}</h1>
          </div>
        </div>

        {/* CENTRO */}
        <div className="hidden md:flex items-center gap-8">

          <div className="text-center">
            <p className="text-xs text-gray-400">Saldo</p>
            <p className="font-bold text-green-400">{formatar(saldo)}</p>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400">Ranking</p>
            <p className="font-bold text-yellow-400">#{posicao}</p>
          </div>

        </div>

        {/* DIREITA */}
        <div className="flex items-center gap-3">

          {/* BOTÃO BID */}
          <button
            onClick={() => router.push('/leilao')}
            className="relative px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 font-bold text-sm overflow-hidden"
          >
            BID AO VIVO

            {/* efeito pulsando */}
            <span className="absolute inset-0 animate-ping bg-blue-400 opacity-20 rounded-xl"></span>
          </button>

        </div>
      </div>

      {/* MOBILE EXTRA */}
      <div className="md:hidden flex justify-around pb-2 text-xs text-center">

        <div>
          <p className="text-gray-400">Saldo</p>
          <p className="text-green-400 font-bold">{formatar(saldo)}</p>
        </div>

        <div>
          <p className="text-gray-400">Ranking</p>
          <p className="text-yellow-400 font-bold">#{posicao}</p>
        </div>

      </div>

    </div>
  )
}