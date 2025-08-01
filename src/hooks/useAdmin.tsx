'use client'

import { useEffect, useState } from 'react'

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      setIsAdmin(false)
      setLoading(false)
      return
    }

    try {
      const userData = JSON.parse(userStr)
      setIsAdmin(userData.isAdmin === true)
    } catch (error) {
      console.error('Erro ao verificar admin:', error)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }, [])

  return { isAdmin, loading }
}

