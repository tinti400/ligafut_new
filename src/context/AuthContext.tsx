
'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type AuthContextType = {
  user: any
  setUser: (user: any) => void
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {}
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
