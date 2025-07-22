'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import useSession from '@/hooks/useSession' // ✅ Correto agora!

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Time {
  id: string
  nome: string
  logo_url?: string
  saldo: number
}

export default function TimesAdminPage() {
  const [times, setTimes] = useState<Time[]>([])
  const [novoTime, setNovoTime] = useState('')
  const [loading, setLoading] = useState(false)
  const { isAdmin } = useSession() // ✅ Correto agora!

  useEffect(() => {
    if (isAdmin) buscarTimes()
  }, [isAdmin])

  async function buscarTimes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('times')
      .select('*')
      .order('nome', { ascending: true })

    if (error) {
      toast.error('Erro ao buscar times')
      setLoading(false)
      return
    }

    setTimes(data || [])
    setLoading(false)
  }

  async function adicionarTime() {
    if (!novoTime) return toast.error('Digite o nome do time')

    const { data, error } = await supabase
      .from('times')
      .insert({ nome: novoTime, saldo: 250_000_000 })
      .select()
      .single()

    if (error) {
      toast.error('Erro ao adicionar time')
      return
    }

    // Registrar movimentação no BID
    await supabase.from('bid').insert({
      tipo_evento: 'criação',
      descricao: `Time ${novoTime} criado com saldo inicial`,
      id_time1: data.id,
      valor: 250_000_000,
      data_evento: new Date().toISOString()
    })

    toast.success('Time adicionado com sucesso')
    setNovoTime('')
    buscarTimes()
  }

  if (!isAdmin) return <div className="p-4">Acesso restrito</div>

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Times Cadastrados</h1>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={novoTime}
          onChange={(e) => setNovoTime(e.target.value)}
          placeholder="Nome do novo time"
          className="border px-3 py-2 rounded w-64"
        />
        <button
          onClick={adicionarTime}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Adicionar Time
        </button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {times.map((time) => (
            <li
              key={time.id}
              className="border p-3 rounded flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                {time.logo_url && (
                  <img src={time.logo_url} alt={time.nome} className="w-8 h-8 rounded-full" />
                )}
                <span>{time.nome}</span>
              </div>
              <span className="text-sm text-gray-600">
                Saldo: R$ {time.saldo.toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
