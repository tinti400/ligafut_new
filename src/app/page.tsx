'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@supabase/supabase-js'

// Inicialize o client Supabase com suas variáveis de ambiente
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Home() {
  const router = useRouter()
  const [nomeTime, setNomeTime] = useState('')
  const [logoUrl, setLogoUrl] = useState('')

  useEffect(() => {
    const user = localStorage.getItem('user')
    if (!user) {
      router.push('/login')
      return
    }

    const userData = JSON.parse(user)
    setNomeTime(userData.nome_time || '')

    const idTime = userData.id_time
    if (idTime) {
      buscarLogoDoTime(idTime)
    }
  }, [])

  async function buscarLogoDoTime(idTime: string) {
    const { data, error } = await supabase
      .from('times')
      .select('logo_url')
      .eq('id', idTime)
      .single()

    if (error) {
      console.error('Erro ao buscar logo do time:', error.message)
      return
    }

    if (data?.logo_url) {
      setLogoUrl(data.logo_url)
    }
  }

  const handleLogout = () => {
    localStorage.clear()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Logo do time */}
        {logoUrl && (
          <div className="mb-6 flex justify-center">
            <Image
              src={logoUrl}
              alt={`Logo do time ${nomeTime}`}
              width={180}
              height={180}
              priority={true}
            />
          </div>
        )}

        <h1 className="text-4xl font-bold mb-2 text-green-400">🏟️ Bem-vindo à LigaFut</h1>
        {nomeTime && <p className="mb-4 text-gray-300">🔰 Gerenciando: <strong>{nomeTime}</strong></p>}

        <button
          onClick={handleLogout}
          className="mb-8 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-bold"
        >
          🚪 Sair
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">⚔️ Leilões Ativos</h2>
            <p className="text-gray-400">Acompanhe e participe dos leilões em tempo real.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">📋 Classificação</h2>
            <p className="text-gray-400">Veja a tabela atualizada do campeonato da sua divisão.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">💰 Mercado de Transferências</h2>
            <p className="text-gray-400">Negocie jogadores diretamente com outros times.</p>
          </div>
          <div className="bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg hover:bg-gray-700 transition">
            <h2 className="text-2xl font-semibold mb-2">📝 Painel Administrativo</h2>
            <p className="text-gray-400">Gerencie as regras, eventos e participantes da LigaFut.</p>
          </div>
        </div>
      </div>
    </main>
  )
}
