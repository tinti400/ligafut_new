'use client'

import { useState } from 'react'
import Link from 'next/link'

interface SidebarProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const [abrirAdmin, setAbrirAdmin] = useState(false)
  const [abrirLeilao, setAbrirLeilao] = useState(false)

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-gray-900 text-white w-64 p-4 transition-transform ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold">LigaFut</h2>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white text-2xl font-bold"
          aria-label="Fechar menu"
        >
          ×
        </button>
      </div>

      <nav>
        <ul className="space-y-4">
          <li>
            <Link href="/classificacao" className="hover:text-green-400">
              🏆 Classificação
            </Link>
          </li>
          <li>
            <Link href="/jogos" className="hover:text-green-400">
              📅 Jogos
            </Link>
          </li>
          <li>
            <Link href="/elenco" className="hover:text-green-400">
              👥 Elenco
            </Link>
          </li>

          {/* Leilão */}
          <li>
            <button
              onClick={() => setAbrirLeilao(!abrirLeilao)}
              className="w-full text-left hover:text-green-400 flex justify-between items-center"
            >
              📢 {isOpen && `Leilão ${abrirLeilao ? '▲' : '▼'}`}
            </button>
            {abrirLeilao && isOpen && (
              <div className="ml-4 mt-2 space-y-2 text-sm">
                {/* Removido Leilão Manual e Leilões Finalizados daqui */}
                <Link href="/admin/leilao_sistema" className="block hover:text-green-400">
                  ⚙️ Leilão Sistema
                </Link>
              </div>
            )}
          </li>

          {/* Admin */}
          <li>
            <button
              onClick={() => setAbrirAdmin(!abrirAdmin)}
              className="w-full text-left hover:text-green-400 flex justify-between items-center"
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
                {/* Outros itens do admin aqui */}
              </div>
            )}
          </li>

          {/* Outros itens do menu aqui */}
        </ul>
      </nav>
    </aside>
  )
}
