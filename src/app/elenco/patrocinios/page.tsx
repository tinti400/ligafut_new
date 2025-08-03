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
  descricao_beneficio: string
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
      if (!user?.id_time) {
        console.error('⚠️ id_time não encontrado no localStorage')
        return
      }

      const { data: time, error: erroTime } = await supabase
        .from('times')
        .select('divisao')
        .eq('id', user.id_time)
        .single()

      if (erroTime || !time) {
        console.error('Erro ao buscar divisão do time:', erroTime)
        return
      }

      const { data, error } = await supabase
        .from('patrocinios')
        .select('*')
        .eq('divisao', time.divisao)

      if (error) {
        console.error('Erro ao buscar patrocinadores:', error)
      } else {
        setPatrocinios(data)
      }
    }

    buscarPatrocinios()
  }, [])

  const handleSelecionar = (categoria: Categoria, id: string) => {
    setPatrocinioSelecionado((prev) => ({ ...prev, [categoria]: id }))
  }

  const salvarPatrocinios = async () => {
    if (!user?.id_time) {
      toast.error('Usuário não encontrado.')
      return
    }

    const { error } = await supabase
      .from('patrocinios_escolhidos')
      .upsert({
        id_time: user.id_time,
        id_patrocinio_master: patrocinioSelecionado.master,
        id_patrocinio_fornecedor: patrocinioSelecionado.fornecedor,
        id_patrocinio_secundario: patrocinioSelecionado.secundario,
      }, { onConflict: 'id_time' })

    if (error) {
      console.error('Erro ao salvar patrocinadores:', error)
      toast.error('Erro ao salvar patrocinadores.')
    } else {
      toast.success('Patrocinadores salvos com sucesso!')
    }
  }

  const categorias: Categoria[] = ['master', 'fornecedor', 'secundario']

  return (
    <div className="p-4 text-white min-h-screen bg-zinc-900">
      <h1 className="text-2xl font-bold text-center mb-6 text-yellow-400">
        💼 Escolha seus Patrocinadores
      </h1>

      {categorias.map((categoria) => (
        <div key={categoria} className="mb-6">
          <h2 className="text-green-400 text-xl font-semibold mb-2 capitalize">
            {categoria === 'master' && 'Patrocínio Master'}
            {categoria === 'fornecedor' && 'Fornecedor de Material'}
            {categoria === 'secundario' && 'Patrocínio Secundário'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {patrocinios
              .filter(p => p.categoria === categoria)
              .map(p => (
                <div
                  key={p.id}
                  className={`border rounded-md p-4 cursor-pointer hover:bg-zinc-800 ${
                    patrocinioSelecionado[categoria] === p.id ? 'border-green-400' : 'border-zinc-600'
                  }`}
                  onClick={() => handleSelecionar(categoria, p.id)}
                >
                  <h3 className="text-lg font-bold">{p.nome}</h3>
                  <p className="text-sm text-gray-300 mt-1">💰 Valor Fixo: R${(p.valor_fixo / 1_000_000).toFixed(1)} mi</p>
                  {p.descricao_beneficio && (
                    <p className="text-sm text-yellow-300 mt-1">🎁 {p.descricao_beneficio}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center mt-8">
        <button
          onClick={salvarPatrocinios}
          className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white font-bold"
        >
          Salvar Patrocinios
        </button>
      </div>
    </div>
  )
}

