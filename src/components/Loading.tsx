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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const usuario = localStorage.getItem('usuario') || ''
    const idTime = localStorage.getItem('id_time') || ''
    const nomeTime = localStorage.getItem('nome_time') || ''
    const isAdmin = localStorage.getItem('admin') === 'true'

    if (usuario && idTime) {
      setSession({ usuario, idTime, nomeTime, isAdmin })
    } else {
      setSession(null)
    }

    setLoading(false)
  }, [])

  return { session, loading }
}
