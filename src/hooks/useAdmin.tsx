'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const verificarAdmin = async () => {
      try {
        const userStr = localStorage.getItem('user') || localStorage.getItem('usuario')
        if (!userStr) {
          setIsAdmin(false)
          return
        }

        const user = JSON.parse(userStr)
        const email = user.email
        const nome = user.nome?.toLowerCase()

        // ✅ Se o nome for 'adm', concede acesso
        if (nome === 'adm') {
          setIsAdmin(true)
          return
        }

        // ✅ Se tiver email, busca na tabela de admins (case-insensitive)
        if (email) {
          const { data, error } = await supabase
            .from('admins')
            .select('email')
            .ilike('email', email) // <- insensível a maiúsculas/minúsculas
            .maybeSingle()

          if (error) {
            console.error('Erro ao verificar admin:', error)
            setIsAdmin(false)
            return
          }

          setIsAdmin(!!data)
          return
        }

        // Caso não tenha e-mail e não seja adm
        setIsAdmin(false)
      } catch (err) {
        console.error('Erro no useAdmin:', err)
        setIsAdmin(false)
      } finally {
        setLoading(false)
      }
    }

    verificarAdmin()
  }, [])

  return { isAdmin, loading }
}
