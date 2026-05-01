import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import LayoutWrapper from '@/components/LayoutWrapper'

export const metadata = {
  title: 'LigaFut',
  description: 'Simule campeonatos com seus amigos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-white antialiased">
        <AuthProvider>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </AuthProvider>
      </body>
    </html>
  )
}