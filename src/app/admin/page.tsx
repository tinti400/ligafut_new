// /app/admin/page.tsx

import Link from 'next/link'

export default function AdminHome() {
  return (
    <main className="min-h-screen p-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-6">Administração - LigaFut</h1>
      <nav className="flex flex-col gap-4">
        <Link href="/admin/leilao" className="text-blue-400 hover:underline">
          🎯 Leilão Manual
        </Link>
        <Link href="/admin/leilao_sistema" className="text-blue-400 hover:underline">
          ⚙️ Leilão do Sistema
        </Link>
        <Link href="/admin/leiloes_finalizados" className="text-blue-400 hover:underline">
          📜 Leilões Finalizados
        </Link>
        {/* outros links administrativos */}
      </nav>
    </main>
  )
}
