'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { FaCoins, FaPlus, FaPen, FaCheck, FaSave } from 'react-icons/fa'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminTimesPage() {
  const [times, setTimes] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [novoSaldo, setNovoSaldo] = useState<number>(0)

  useEffect(() => {
    buscarTimes()
  }, [])

  async function buscarTimes() {
    const { data, error } = await supabase.from('times').select('*').order('nome', { ascending: true })
    if (error) {
      toast.error('Erro ao buscar times')
      return
    }
    setTimes(data || [])
  }

  async function adicionarTime() {
    const nome = prompt('Digite o nome do novo time:')
    if (!nome) return
    const confirmado = confirm(`Deseja adicionar o time "${nome}"?`)
    if (!confirmado) return

    const { error, data } = await supabase
      .from('times')
      .insert({ nome, saldo: 250_000_000 })
      .select()
      .single()

    if (error) {
      toast.error('Erro ao adicionar time')
      return
    }

    await registrarBID('Criação de time', data.id, null, 0)
    toast.success('Time adicionado com sucesso!')
    buscarTimes()
  }

  async function atualizarSaldo(id: string) {
    const confirmado = confirm('Tem certeza que deseja atualizar o saldo deste time?')
    if (!confirmado) return

    const { error } = await supabase.from('times').update({ saldo: novoSaldo }).eq('id', id)
    if (error) {
      toast.error('Erro ao atualizar saldo')
      return
    }

    await registrarBID(`Atualização de saldo para R$ ${formatar(novoSaldo)}`, id, null, novoSaldo)
    toast.success('Saldo atualizado com sucesso!')
    setEditingId(null)
    buscarTimes()
  }

  async function registrarBID(descricao: string, id_time1: string, id_time2: string | null, valor: number) {
    await supabase.from('bid').insert({
      tipo_evento: 'sistema',
      descricao,
      id_time1,
      id_time2,
      valor,
      data_evento: new Date().toISOString()
    })
  }

  const formatar = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Administração de Times</h1>
          <button
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center gap-2"
            onClick={adicionarTime}
          >
            <FaPlus /> Adicionar Time
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {times.map((time) => (
            <div key={time.id} className="bg-neutral-800 p-4 rounded shadow-md">
              <h2 className="text-lg font-bold mb-2">{time.nome}</h2>
              <p className="flex items-center gap-2 text-white mb-2">
                <FaCoins className="text-yellow-400" />
                Saldo: <strong>{formatar(time.saldo)}</strong>
              </p>

              {editingId === time.id ? (
                <>
                  <input
                    type="number"
                    className="w-full mb-2 p-2 rounded text-black"
                    value={novoSaldo}
                    onChange={(e) => setNovoSaldo(Number(e.target.value))}
                    placeholder="Novo saldo"
                  />
                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
                    onClick={() => atualizarSaldo(time.id)}
                  >
                    <FaSave /> Atualizar para {formatar(novoSaldo)}
                  </button>
                </>
              ) : (
                <button
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2"
                  onClick={() => {
                    setEditingId(time.id)
                    setNovoSaldo(time.saldo)
                  }}
                >
                  <FaPen /> Editar Saldo
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
