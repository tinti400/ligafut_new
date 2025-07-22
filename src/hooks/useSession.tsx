'use client'

import { useEffect, useState } from 'react'

export function useSession() {
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userObj = JSON.parse(userStr)
      setUser(userObj)
      setIsAdmin(!!userObj?.admin)  // ajuste conforme sua lógica
    }
  }, [])

  return { user, isAdmin }
}
