'use client'

import { useAuth } from '../context/AuthContext'

export function useRoute() {
  const { user } = useAuth()

  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  return user
}
