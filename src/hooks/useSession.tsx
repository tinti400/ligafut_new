'use client'

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function useSession() {
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const userObj = JSON.parse(userStr)
      setUser(userObj)
      verificarAdmin(userObj?.email)
    }
  }, [])

  const verificarAdmin = async (email: string) => {
    if (!email) return
    const { data, error } = await supabase
      .from('admins')
      .select('email')
      .eq('email', email)
      .single()
    setIsAdmin(!!data && !error)
  }

  return { user, isAdmin }
}
