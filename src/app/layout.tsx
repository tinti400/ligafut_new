// src/app/layout.tsx
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { AuthProvider } from '@/components/AuthProvider'

export const metadata = {
  title: 'LigaFut',
  description: 'Simule campeonatos com seus amigos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-white">
        {/* Provider de sessão (client) visível para toda a árvore */}
        <AuthProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-gray-900 text-white p-6">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
