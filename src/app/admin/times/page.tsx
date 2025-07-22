'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Time = {
  id: string
  nome: string
  saldo: number
}

type Session = {
  usuario_id: number
  id_time: string
  nome_time: string
  usuario: string
  isAdmin: boolean
} | null

export default function AdminTimesPage() {
  const [user, setUser] = useState<Session>(null)
  const [loading, setLoading] = useState(true)
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<Time | null>(null)
  const [valorAdicionar, setValorAdicionar] = useState<number>(1000000)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) {
      setUser(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (user?.isAdmin) carregarTimes()
  }, [user])

  const carregarTimes = async () => {
    const { data, error } = await supabase.from('times').select('id, nome, saldo')
    if (!error) setTimes(data || [])
  }

  const adicionarSaldo = async () => {
    if (!timeSelecionado) return
    const novo = (timeSelecionado.saldo || 0) + valorAdicionar
    const { error } = await supabase
      .from('times')
      .update({ saldo: novo })
      .eq('id', timeSelecionado.id)
    if (!error) {
      toast.success(`✅ Adicionado R$ ${valorAdicionar.toLocaleString()} ao saldo de ${timeSelecionado.nome}`)
      carregarTimes()
      setTimeSelecionado(null)
    } else {
      toast.error('Erro ao adicionar saldo.')
    }
  }

  const atualizarSaldo = async () => {
    if (!timeSelecionado) return
    const { error } = await supabase
      .from('times')
      .update({ saldo: novoSaldo })
      .eq('id', timeSelecionado.id)
    if (!error) {
      toast.success(`✅ Saldo do time ${timeSelecionado.nome} atualizado para R$ ${novoSaldo.toLocaleString()}`)
      carregarTimes()
      setTimeSelecionado(null)
    } else {
      toast.error('Erro ao atualizar saldo.')
    }
  }

  if (loading) return <p className="text-center mt-10 text-white">🔄 Carregando sessão...</p>
  if (!user) return <p className="text-center mt-10 text-white">🔒 Faça login para acessar.</p>
  if (!user.isAdmin) return <p className="text-center mt-10 text-red-400">❌ Acesso restrito a administradores.</p>

  return (
    <div className="p-6 max-w-2xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">⚙️ Administração de Caixas dos Times</h1>

      <div className="mb-4">
        <label className="block mb-1 font-semibold">Selecione um time:</label>
        <select
          value={time
