'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Sidebar() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(true)
  const [abrirLeilao, setAbrirLeilao] = useState(false)
  const [abrirElenco, setAbrirElenco] = useState(false)
  const [logado, setLogado] = useState(false)
  const [nomeTime, setNomeTime] = useState('')

  useEffect(() => {
    const usuarioId = localStorage.getItem('usuario_id')
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    if (usuarioId) {
      setLogado(true)
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          setNomeTime(userData.nome_time || userData.nome || '')
        } catch {
          setNomeTime('')
        }
      }
    } else {
      setLogado(false)
      setNomeTime('')
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

        <h1 className={`text-2xl font-bold mb-4 ${!isOpen && 'hidden'}`}>⚽ LigaFut</h1>

        {/* Mensagem login */}
        {isOpen && (
          <div
            className={`mb-8 px-3 py-2 rounded ${
              logado ? 'bg-green-700 text-green-200' : 'bg-red-700 text-red-200'
            } font-semibold text-sm`}
          >
            {logado
              ? `✅ Você está logado como ${nomeTime || 'usuário'}`
              : '❌ Você não está logado'}
          </div>
        )}

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

          {/* Elenco */}
          <div>
            <button
              onClick={() => setAbrirElenco(!abrirElenco)}
              className="w-full text-left hover:text-green-400"
            >
              👥 {isOpen && `Elenco ${abrirElenco ? '▲' : '▼'}`}
            </button>

            {abrirElenco && isOpen && (
              <div className="ml-4 mt-2 space-y-2 text-sm">
                <Link href="/elenco" className="block hover:text-green-400">
                  👥 Meu Elenco
                </Link>
                <Link href="/negociacoes" className="block hover:text-green-400">
                  🤝 Negociações
                </Link>
                <Link href="/propostas_recebidas" className="block hover:text-green-400">
                  📥 Propostas Recebidas
                </Link>
                <Link href="/propostas_enviadas" className="block hover:text-green-400">
                  📤 Propostas Enviadas
                </Link>
              </div>
            )}
          </div>

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
