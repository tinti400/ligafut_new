'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UseAdminResult = {
  isAdmin: boolean
  loading: boolean
  email?: string | null
  reason?: string | null
  refresh: () => Promise<void>
}

const norm = (s?: string | null) => (s || '').trim().toLowerCase()

export function useAdmin(): UseAdminResult {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  const findEmail = useCallback(async (): Promise<string | null> => {
    // 1) Supabase Auth
    try {
      const { data } = await supabase.auth.getUser()
      if (data?.user?.email) return norm(data.user.email)
    } catch {}

    // 2) localStorage (chaves comuns)
    const lsEmail = norm(localStorage.getItem('email'))
    if (lsEmail) return lsEmail
    const lsEmail2 = norm(localStorage.getItem('Email'))
    if (lsEmail2) return lsEmail2

    // 3) objeto user/usuario salvo
    try {
      const raw = localStorage.getItem('user') || localStorage.getItem('usuario')
      if (raw) {
        const obj = JSON.parse(raw)
        const e = norm(obj?.email || obj?.Email || obj?.e_mail)
        if (e) return e
      }
    } catch {}

    // 4) query param ?email=
    const urlEmail = norm(new URLSearchParams(window.location.search).get('email'))
    if (urlEmail) return urlEmail

    return null
  }, [])

  const checkAdmin = useCallback(async () => {
    setLoading(true)
    setReason(null)
    try {
      const found = await findEmail()
      setEmail(found)

      if (!found) {
        setIsAdmin(false)
        setReason('Sem e-mail para validar (não autenticado e sem cache).')
        return
      }

      // cache para próximas visitas
      localStorage.setItem('email', found)

      // consulta admins ignorando caixa e sem estourar erro quando não encontra
      const { data, error, status } = await supabase
        .from('admins')
        .select('email')
        .ilike('email', found) // exato, case-insensitive
        .maybeSingle()

      if (error) {
        setIsAdmin(false)
        setReason(`Erro consultando admins (HTTP ${status}): ${error.message}`)
        return
      }

      setIsAdmin(!!data)
      if (!data) setReason(`E-mail "${found}" não consta na tabela admins.`)
    } catch (e: any) {
      setIsAdmin(false)
      setReason(e?.message || 'Falha inesperada ao verificar admin.')
    } finally {
      setLoading(false)
    }
  }, [findEmail])

  useEffect(() => {
    checkAdmin()
  }, [checkAdmin])

  const refresh = useCallback(async () => {
    await checkAdmin()
  }, [checkAdmin])

  return useMemo(
    () => ({ isAdmin, loading, email, reason, refresh }),
    [isAdmin, loading, email, reason, refresh]
  )
}
