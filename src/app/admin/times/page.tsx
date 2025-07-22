'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useSession } from '@/hooks/useSession'
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
  const { user, isAdmin } = useSession()
  const [times, setTimes] = useState<Time[]>([])
  const [timeSelecionado, setTimeSelecionado] = useState<Time | null>(null)
  const [valorAdicionar, setValorAdicionar] = useState<number>(1000000)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)

  useEffect(() => {
    if (isAdmin) carregarTimes()
  }, [isAdmin])

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

  if (!user) return <p className="text-center mt-10 text-white">🔒 Faça login para acessar.</p>
  if (!isAdmin) return <p className="text-center mt-10 text-red-400">❌ Acesso restrito a administradores.</p>

  return (
    <div className="p-6 max-w-2xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">⚙️ Administração de Times</h1>

      <div className="mb-4">
        <label className="block mb-1 font-semibold">Selecione um time:</label>
        <select
          value={timeSelecionado?.id || ''}
          onChange={(e) => {
            const time = times.find((t) => t.id === e.target.value)
            setTimeSelecionado(time || null)
            setNovoSaldo(time?.saldo || 0)
          }}
          className="w-full p-2 rounded text-black"
        >
          <option value="">Selecione...</option>
          {times.map((time) => (
            <option key={time.id} value={time.id}>
              {time.nome} (ID: {time.id})
            </option>
          ))}
        </select>
      </div>

      {timeSelecionado && (
        <>
          <div className="mb-4 p-4 bg-zinc-800 rounded">
            <h2 className="text-xl font-semibold mb-2">💼 {timeSelecionado.nome}</h2>
            <p className="mb-2">Saldo atual: <strong>R$ {timeSelecionado.saldo.toLocaleString()}</strong></p>

            <div className="mb-2">
              <label className="block mb-1">➕ Adicionar saldo:</label>
              <input
                type="number"
                value={valorAdicionar}
                onChange={(e) => setValorAdicionar(Number(e.target.value))}
                className="w-full p-2 rounded text-black mb-2"
              />
              <button
                onClick={adicionarSaldo}
                className="bg-green-600 px-4 py-2 rounded text-white font-semibold hover:bg-green-700"
              >
                ✅ Adicionar saldo
              </button>
            </div>

            <hr className="my-3 border-zinc-600" />

            <div>
              <label className="block mb-1">✏️ Atualizar saldo manualmente:</label>
              <input
                type="number"
                value={novoSaldo}
                onChange={(e) => setNovoSaldo(Number(e.target.value))}
                className="w-full p-2 rounded text-black mb-2"
              />
              <button
                onClick={atualizarSaldo}
                className="bg-blue-600 px-4 py-2 rounded text-white font-semibold hover:bg-blue-700"
              >
                ✏️ Atualizar saldo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
