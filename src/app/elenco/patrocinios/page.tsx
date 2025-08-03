'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Categoria = 'master' | 'fornecedor' | 'secundario'

interface Patrocinio {
  id: string
  nome: string
  categoria: Categoria
  valor_fixo: number
  beneficio: string
  divisao: number
}

export default function PatrociniosPage() {
  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [patrocinioSelecionado, setPatrocinioSelecionado] = useState<Record<Categoria, string>>({
    master: '',
    fornecedor: '',
    secundario: ''
  })

  const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {}

  useEffect(() => {
    async function buscarPatrocinios() {
      if (!user?.id_time) return

      const { data: time, error: erroTime } = await supabase
        .from('times')
        .select('divisao')
        .eq('id', user.id_time)
        .single()

      if (erroTime || !time) return

      const { data, error } = await supabase
        .from('patrocinios')
        .select('*')
        .eq('divisao', time.divisao)

      if (!error && data) setPatrocinios(data)
    }

    buscarPatrocinios()
  }, [])

  const handleSelecionar = (categoria: Categoria, id: string) => {
    setPatrocinioSelecionado((prev) => ({ ...prev, [categoria]: id }))
  }

  const formatarValor = (valor: number) =>
    valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    })

  const salvarPatrocinios = async () => {
    if (!user?.id_time) {
      toast.error('Usuário não encontrado.')
      return
    }

    const master = patrocinios.find(p => p.id === patrocinioSelecionado.master)
    const fornecedor = patrocinios.find(p => p.id === patrocinioSelecionado.fornecedor)
    const secundario = patrocinios.find(p => p.id === patrocinioSelecionado.secundario)

    const totalPatrocinio =
      (master?.valor_fixo || 0) +
      (fornecedor?.valor_fixo || 0) +
      (secundario?.valor_fixo || 0)

    const { error: erroUpsert } = await supabase
      .from('patrocinios_escolhidos')
      .upsert({
        id_time: user.id_time,
        id_patrocinio_master: patrocinioSelecionado.master,
        id_patrocinio_fornecedor: patrocinioSelecionado.fornecedor,
        id_patrocinio_secundario: patrocinioSelecionado.secundario,
      }, { onConflict: 'id_time' })

    if (erroUpsert) {
      toast.error('Erro ao salvar patrocinadores.')
      return
    }

    const { error: erroSaldo } = await supabase.rpc('incrementar_saldo', {
      id_time_param: user.id_time,
      valor_param: totalPatrocinio
    })

    if (erroSaldo) {
      toast.error('Erro ao atualizar o saldo do time.')
    } else {
      toast.success('Patrocinadores salvos e saldo atualizado com sucesso!')
    }
  }

  const categorias: Categoria[] = ['master', 'fornecedor', 'secundario']

  return (
    <div className="p-4 text-white min-h-screen bg-gradient-to-br from-zinc-900 to-zinc-800">
      <h1 className="text-3xl font-extrabold text-center mb-8 text-yellow-400 drop-shadow">
        💼 Escolha seus Patrocinadores
      </h1>

      {categorias.map((categoria) => (
        <div key={categoria} className="mb-10">
          <h2 className="text-green-400 text-2xl font-bold mb-4 capitalize">
            {categoria === 'master' && '🏆 Patrocínio Master'}
            {categoria === 'fornecedor' && '🛍️ Fornecedor de Material'}
            {categoria === 'secundario' && '📢 Patrocínio Secundário'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {patrocinios
              .filter(p => p.categoria === categoria)
              .map(p => (
                <div
                  key={p.id}
                  className={`rounded-lg border-2 p-4 shadow transition-all cursor-pointer hover:scale-105 hover:border-green-400 ${
                    patrocinioSelecionado[categoria] === p.id ? 'border-green-500 bg-zinc-800' : 'border-zinc-700 bg-zinc-900'
                  }`}
                  onClick={() => handleSelecionar(categoria, p.id)}
                >
                  <h3 className="text-xl font-semibold mb-2 text-white">{p.nome}</h3>
                  <p className="text-sm text-gray-300 mb-1">
                    💰 Valor Fixo: <strong className="text-white">{formatarValor(p.valor_fixo)}</strong>
                  </p>
                  
                  {p.beneficio && p.beneficio !== 'nenhum' && (
                    <p className="text-sm text-green-400 mb-1">
                      🎯 Benefício: <strong>{p.beneficio}</strong>
                    </p>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center mt-10">
        <button
          onClick={salvarPatrocinios}
          className="bg-green-600 hover:bg-green-700 px-8 py-3 rounded-lg text-white text-lg font-bold shadow-lg"
        >
          ✅ Salvar Patrocínios
        </button>
      </div>
    </div>
  )
}

