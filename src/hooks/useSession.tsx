'use client'

import { useEffect, useState } from 'react'

export default function useSession() {
  const [session, setSession] = useState<any>(null)

  useEffect(() => {
    const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        setSession(user)
      } catch (error) {
        console.error('Erro ao interpretar JSON do usuário:', error)
        setSession(null)
      }
    }
  }, [])

  return session
}
