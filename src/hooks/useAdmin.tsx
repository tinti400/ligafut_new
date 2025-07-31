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

        if (!email) {
          setIsAdmin(false)
          return
        }

        const { data, error } = await supabase
          .from('admins')
          .select('email')
          .eq('email', email)
          .maybeSingle()

        setIsAdmin(!!data)
      } catch (err) {
        setIsAdmin(false)
      } finally {
        setLoading(false)
      }
    }

    verificarAdmin()
  }, [])

  return { isAdmin, loading }
}
