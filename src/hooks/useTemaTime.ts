'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { temasTimes, TemaTime } from '@/config/temasTimes'
import { useAuth } from '@/context/AuthContext'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function useTemaTime() {
  const { user } = useAuth()

  const [tema, setTema] = useState<TemaTime | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const carregarTema = async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('time_id')
        .eq('id', user.id)
        .single()

      if (!error && data?.time_id) {
        setTema(temasTimes[data.time_id])
      }

      setLoading(false)
    }

    carregarTema()
  }, [user])

  return { tema, loading }
}

