'use client'

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
      setLoading(true)

      const userStr = localStorage.getItem('user')
      if (!userStr) {
        setLoading(false)
        return
      }

      const userObj = JSON.parse(userStr)
      const usuario = userObj?.usuario // <-- agora busca o campo correto

      if (!usuario) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('admins')
        .select('email')
        .eq('email', usuario)
        .single()

      setIsAdmin(!!data)
      setLoading(false)
    }

    verificarAdmin()
  }, [])

  return { isAdmin, loading }
}
