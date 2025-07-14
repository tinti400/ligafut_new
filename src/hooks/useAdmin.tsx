'use client'

export function useAdmin() {
  if (typeof window === 'undefined') return { isAdmin: false, loading: false }

  const userStorage = localStorage.getItem('user')
  if (!userStorage) return { isAdmin: false, loading: false }

  const user = JSON.parse(userStorage)
  return { isAdmin: !!user.isAdmin, loading: false }
}
