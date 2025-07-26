'use client'

import { useEffect, useState } from 'react'

interface SessionData {
  usuario: string
  idTime: string
  nomeTime: string
  isAdmin: boolean
}

export default function useSession() {
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const userStr = localStorage.getItem('user') // chave usada no login

    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        setSession({
          usuario: user.usuario,
          idTime: user.id_time,
          nomeTime: user.nome_time,
          isAdmin: user.isAdmin || false
        })
      } catch (error) {
        console.error('Erro ao interpretar dados da sessão:', error)
        setSession(null)
      }
    } else {
      setSession(null)
    }

    setLoading(false)
  }, [])

  return { session, loading }
}


