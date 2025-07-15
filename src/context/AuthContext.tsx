'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type AuthContextType = {
  user: any
  setUser: (user: any) => void
}

// ✅ Exportar o contexto direto
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

// ✅ Hook para usar no projeto
export function useAuth() {
  return useContext(AuthContext)
}
