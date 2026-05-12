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
    <div className="flex h-screen w-full overflow-hidden bg-[#050505] text-white">
      <aside
        className={`
          relative z-30 h-screen shrink-0 transition-all duration-300
          ${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'}
        `}
      >
        <Sidebar />
      </aside>

      <main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#050505]">
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,#14532d_0%,#020617_45%,#000_100%)]" />
        <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),transparent_35%,rgba(250,204,21,0.08))]" />

        <div className="relative z-10 min-h-screen w-full overflow-x-hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/70 text-white shadow-lg backdrop-blur transition hover:bg-green-600 lg:left-4 lg:top-4 lg:h-11 lg:w-11"
            title={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
          >
            <Menu size={22} />
          </button>

          <TopBar />

          <div className="w-full px-3 py-3 sm:px-4 md:px-6 md:py-5">
            <div className="mx-auto w-full max-w-[1600px]">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}