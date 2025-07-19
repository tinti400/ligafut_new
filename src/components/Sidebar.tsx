'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Sidebar() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(true)
  const [abrirLeilao, setAbrirLeilao] = useState(false)
  const [abrirElenco, setAbrirElenco] = useState(false)
  const [abrirAdmin, setAbrirAdmin] = useState(false)
  const [abrirRoubo, setAbrirRoubo] = useState(false)
  const [logado, setLogado] = useState(false)
  const [nomeTime, setNomeTime] = useState('')
  const [saldoTime, setSaldoTime] = useState('0')
  const [totalSalarios, setTotalSalarios] = useState('0')

  useEffect(() => {
    const usuarioId = localStorage.getItem('usuario_id')
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    setSaldoTime(localStorage.getItem('saldo') || '0')
    setTotalSalarios(localStorage.getItem('total_salarios') || '0')

    if (usuarioId || userStr) {
      setLogado(true)
      if (userStr) {
        try {
          const userData = JSON.parse(userStr)
          setNomeTime(userData.nome_time || userData.nome || '')
        } catch {
          setNomeTime('')
        }
      } else {
        setNomeTime('')
      }
    } else {
      setLogado(false)
      setNomeTime('')
    }

    const handleStorage = () => {
      setSaldoTime(localStorage.getItem('saldo') || '0')
      setTotalSalarios(localStorage.getItem('total_salarios') || '0')
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
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

        <h1 className={`text-2xl font-bold mb-4 ${!isOpen ? 'hidden' : ''}`}>⚽ LigaFut</h1>

        {isOpen && (
          <div
            className={`mb-2 px-3 py-2 rounded ${
              logado ? 'bg-green-700 text-green-200' : 'bg-red-700 text-red-200'
            } font-semibold text-sm text-center`}
          >
            {logado
              ? `✅ ${nomeTime || 'Usuário Logado'}`
              : '❌ Você não está logado'}
          </div>
        )}

        {isOpen && logado && (
          <>
            <div className="mb-2 px-3 py-2 rounded bg-gray-700 text-white text-xs font-semibold text-center">
              💰 Caixa: <span className="text-green-400">R$ {parseInt(saldoTime).toLocaleString('pt-BR')}</span>
            </div>

            <div className="mb-6 px-3 py-2 rounded bg-gray-700 text-white text-xs font-semibold text-center">
              🧩 Salários: <span className="text-yellow-400">R$ {parseInt(totalSalarios).toLocaleString('pt-BR')}</span>
            </div>
          </>
        )}

        <nav className="space-y-4">
          {!logado && (
            <Link href="/login" className="block hover:text-green-400">
              🔑 {isOpen && 'Login'}
            </Link>
          )}

          <Link href="/" className="block hover:text-green-400">
            🏠 {isOpen && 'Home'}
          </Link>

          <Link href="/classificacao" className="block hover:text-green-400">
            🏆 {isOpen && 'Classificação'}
          </Link>

          <Link href="/jogos" className="block hover:text-green-400">
            📅 {isOpen && 'Jogos'}
          </Link>

          {/* Elenco + Submenu */}
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
                <Link href="/elenco/tatico" className="block hover:text-green-400">
                  🎯 Painel Tático
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

          {/* Evento de Roubo */}
          <div>
            <button
              onClick={() => setAbrirRoubo(!abrirRoubo)}
              className="w-full text-left hover:text-green-400"
            >
              🕵️ {isOpen && `Evento de Roubo ${abrirRoubo ? '▲' : '▼'}`}
            </button>

            {abrirRoubo && isOpen && (
              <div className="ml-4 mt-2 space-y-2 text-sm">
                <Link href="/evento_roubo/bloqueio" className="block hover:text-green-400">
                  🔒 Bloqueio
                </Link>
                <Link href="/evento_roubo/acao" className="block hover:text-green-400">
                  ⚔️ Ação
                </Link>
                <Link href="/evento_roubo/relatorio" className="block hover:text-green-400">
                  📋 Relatório
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
                <Link href="/admin/leilao_sistema" className="block hover:text-green-400">
                  ⚙️ Leilão Sistema
                </Link>
              </div>
            )}
          </div>

          {/* Administração */}
          <div>
            <button
              onClick={() => setAbrirAdmin(!abrirAdmin)}
              className="w-full text-left hover:text-green-400"
            >
              🛠️ {isOpen && `Admin ${abrirAdmin ? '▲' : '▼'}`}
            </button>

            {abrirAdmin && isOpen && (
              <div className="ml-4 mt-2 space-y-2 text-sm">
                <Link href="/admin/leilao" className="block hover:text-green-400">
                  🎯 Leilão
                </Link>
                <Link href="/admin/leiloes_finalizados" className="block hover:text-green-400">
                  📜 Leilões Finalizados
                </Link>
                <Link href="/admin/painel_times" className="block hover:text-green-400">
                  📋 Painel de Times
                </Link>
                <Link href="/admin/evento_roubo_admin" className="block hover:text-green-400">
                  🕵️ Evento de Roubo (Admin)
                </Link>
                <Link href="/admin" className="block hover:text-green-400">
                  🗂️ Administração Geral
                </Link>
              </div>
            )}
          </div>

          <Link href="/BID" className="block hover:text-green-400">
            📰 {isOpen && 'BID'}
          </Link>

          <Link href="/mercado" className="block hover:text-green-400">
            💸 {isOpen && 'Mercado'}
          </Link>

          <Link href="/estadio" className="block hover:text-green-400">
            🏟️ {isOpen && 'Estádio'}
          </Link>

          <Link href="/banco" className="block hover:text-green-400">
            🏦 {isOpen && 'Banco'}
          </Link>

          <Link href="/financeiro" className="block hover:text-green-400">
            💰 {isOpen && 'Painel Financeiro'}
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


