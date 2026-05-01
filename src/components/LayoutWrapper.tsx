'use client'

import Sidebar from '@/components/Sidebar'
import { usePathname } from 'next/navigation'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
      <Sidebar />

      <main className="relative flex-1 overflow-y-auto">
        {/* Fundo premium */}
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,#14532d_0%,#020617_45%,#000_100%)]" />

        {/* Efeito luz */}
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),transparent_35%,rgba(250,204,21,0.08))]" />

        {/* Conteúdo */}
        <div className="min-h-screen px-4 py-4 md:px-8 md:py-6">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}