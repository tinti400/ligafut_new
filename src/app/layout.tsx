import './globals.css'
import Sidebar from '../components/Sidebar'
import ChatWrapper from '../components/ChatWrapper'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-white">
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto bg-gray-900 text-white p-6">
            {children}
          </main>
        </div>

        {/* Chat Flutuante Global */}
        <ChatWrapper />
      </body>
    </html>
  )
}
