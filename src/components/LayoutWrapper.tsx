'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const authPages = ['/Login', '/Cadastro', '/login', '/cadastro']
  const isAuthPage = authPages.includes(pathname)

  if (isAuthPage) {
    return (
      <main className="min-h-screen bg-black text-white">
        {children}
      </main>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#050505] text-white">
      {/* SIDEBAR SEMPRE EXISTE, MAS PODE FECHAR */}
      <aside
        className={`
          relative z-30 h-screen shrink-0 transition-all duration-300
          ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
        `}
      >
        <Sidebar />
      </aside>

      <main className="relative flex-1 overflow-y-auto bg-[#050505]">
        {/* Fundo premium */}
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,#14532d_0%,#020617_45%,#000_100%)]" />

        <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),transparent_35%,rgba(250,204,21,0.08))]" />

        <div className="relative z-10 min-h-screen">
          {/* BOTÃO ABRIR / FECHAR MENU */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur hover:bg-green-600 transition"
            title={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            <Menu size={22} />
          </button>

          <TopBar />

          <div className="px-4 py-4 md:px-8 md:py-6">
            <div className="mx-auto w-full max-w-[1600px]">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}