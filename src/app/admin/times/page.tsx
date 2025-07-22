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

export default function AdminTimesPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<Time | null>(null)
  const [valorAdicionar, setValorAdicionar] = useState<number>(1000000)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)
  const [logado, setLogado] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      setLogado(true)
      setIsAdmin(user.isAdmin === true)
      if (user.isAdmin) carregarTimes()
    }
  }, [])

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
      toast.success(`💰 R$ ${valorAdicionar.toLocaleString()} adicionado ao saldo de ${timeSelecionado.nome}`)
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
      toast.success(`✏️ Saldo de ${timeSelecionado.nome} atualizado para R$ ${novoSaldo.toLocaleString()}`)
      carregarTimes()
      setTimeSelecionado(null)
    } else {
      toast.error('Erro ao atualizar saldo.')
    }
  }

  if (!logado)
    return <p className="text-center mt-10 text-white text-lg font-semibold">🔒 Faça login para acessar.</p>

  if (!isAdmin)
    return <p className="text-center mt-10 text-red-500 text-lg font-semibold">❌ Acesso restrito a administradores.</p>

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <div className="max-w-2xl mx-auto bg-zinc-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-center text-green-400">⚙️ Painel de Administração</h1>

        <div className="mb-6">
          <label className="block mb-2 text-white text-lg">🧩 Selecione um time:</label>
          <select
            value={timeSelecionado?.id || ''}
            onChange={(e) => {
              const time = times.find((t) => t.id === e.target.value)
              setTimeSelecionado(time || null)
              setNovoSaldo(time?.saldo || 0)
            }}
            className="w-full p-3 rounded text-black text-lg"
          >
            <option value="">-- Escolha um time --</option>
            {times.map((time) => (
              <option key={time.id} value={time.id}>
                {time.nome} — ID: {time.id}
              </option>
            ))}
          </select>
        </div>

        {timeSelecionado && (
          <div className="bg-zinc-700 p-5 rounded-lg text-white">
            <h2 className="text-xl font-bold text-yellow-400 mb-2">🏷️ {timeSelecionado.nome}</h2>
            <p className="mb-4 text-lg text-white">
              💰 Saldo atual: <strong className="text-green-400">R$ {timeSelecionado.saldo.toLocaleString()}</strong>
            </p>

            <div className="mb-6">
              <label className="block mb-1 text-white">➕ Adicionar saldo</label>
              <input
                type="number"
                value={valorAdicionar}
                onChange={(e) => setValorAdicionar(Number(e.target.value))}
                className="w-full p-2 rounded text-black mb-2"
              />
              <button
                onClick={adicionarSaldo}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded w-full font-semibold text-white"
              >
                ✅ Adicionar R$ {valorAdicionar.toLocaleString()}
              </button>
            </div>

            <hr className="border-zinc-500 my-4" />

            <div>
              <label className="block mb-1 text-white">✏️ Atualizar saldo manualmente</label>
              <input
                type="number"
                value={novoSaldo}
                onChange={(e) => setNovoSaldo(Number(e.target.value))}
                className="w-full p-2 rounded text-black mb-2"
              />
              <button
                onClick={atualizarSaldo}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded w-full font-semibold text-white"
              >
                💾 Atualizar para R$ {novoSaldo.toLocaleString()}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
