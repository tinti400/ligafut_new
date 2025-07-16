'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Sidebar() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(true)
  const [abrirLeilao, setAbrirLeilao] = useState(false)
  const [logado, setLogado] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('usuario_id')) {
      setLogado(true)
    }
  }, [])

  const logout = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <aside
      className={`bg-gray-800 text-white h-screen p-4 flex flex-col justify-between transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-16'
      }`}
    >
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-white mb-4 focus:outline-none"
        >
          {isOpen ? '←' : '☰'}
        </button>

        <h1 className={`text-2xl font-bold mb-8 ${!isOpen && 'hidden'}`}>⚽ LigaFut</h1>

        <nav className="space-y-4">
          {!logado && (
            <Link href="/login" className="block hover:text-green-400">
              🔑 {isOpen && 'Login'}
            </Link>
          )}

          <Link href="/classificacao" className="block hover:text-green-400">
            🏆 {isOpen && 'Classificação'}
          </Link>
          <Link href="/jogos" className="block hover:text-green-400">
            📅 {isOpen && 'Jogos'}
          </Link>

          {/* Leilão */}
          <div>
            <button
              onClick={() => setAbrirLeilao(!abrirLeilao)}
              className="w-full text-left hover:text-green-400"
            >
              📢 {isOpen && `Leilão ${abrirLeilao ? '▲' : '▼'}`}
            </button>

            {abrirLeilao && isOpen && (
              <div className="ml-4 mt-2 space-y-2 text-sm">
                <Link href="/admin/leilao" className="block hover:text-green-400">
                  📢 Leilão
                </Link>
                <Link href="/admin/leilao_sistema" className="block hover:text-green-400">
                  ⚙️ Leilão Sistema
                </Link>
                <Link href="/admin/leiloes_finalizados" className="block hover:text-green-400">
                  📜 Leilões Finalizados
                </Link>
              </div>
            )}
          </div>

          <Link href="/mercado" className="block hover:text-green-400">
            💸 {isOpen && 'Mercado'}
          </Link>
          <Link href="/estadio" className="block hover:text-green-400">
            🏟️ {isOpen && 'Estádio'}
          </Link>
          <Link href="/banco" className="block hover:text-green-400">
            🏦 {isOpen && 'Banco'}
          </Link>
          <Link href="/admin" className="block hover:text-green-400">
            🔧 {isOpen && 'Admin'}
          </Link>
        </nav>
      </div>

      {logado && (
        <button
          onClick={logout}
          className="bg-red-600 hover:bg-red-700 text-xs py-2 px-3 rounded text-center mt-4"
        >
          🚪 {isOpen && 'Logout'}
        </button>
      )}
    </aside>
  )
}
