'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Categoria = 'master' | 'fornecedor' | 'secundario'

export default function PatrociniosPage() {
  const [patrocinios, setPatrocinios] = useState<any[]>([])
  const [meuTime, setMeuTime] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const [selecionado, setSelecionado] = useState<{
    master: string
    fornecedor: string
    secundario: string
  }>({ master: '', fornecedor: '', secundario: '' })

  useEffect(() => {
    async function init() {
      const { data: patros, error: errorPatros } = await supabase
        .from('patrocinios')
        .select('*')
        .order('categoria')
        .order('valor_fixo', { ascending: false })

      if (errorPatros) {
        console.error('❌ Erro ao carregar patrocínios:', errorPatros)
        toast.error('Erro ao carregar patrocínios')
      } else {
        setPatrocinios(patros || [])
      }

      const userStr = localStorage.getItem('user')
      if (!userStr) return

      const user = JSON.parse(userStr)
      const { data: time, error: errorTime } = await supabase
        .from('times')
        .select('*')
        .eq('id', user.time_id)
        .single()

      if (errorTime) return

      setMeuTime(time)
      setSelecionado({
        master: time.patrocinio_master_id || '',
        fornecedor: time.patrocinio_fornecedor_id || '',
        secundario: time.patrocinio_secundario_id || '',
      })
    }

    init()
  }, [])

  async function salvarEscolhas() {
    if (!meuTime) return

    const selecionados = [selecionado.master, selecionado.fornecedor, selecionado.secundario]
    const patrosSelecionados = patrocinios.filter(p => selecionados.includes(p.id))
    const valorTotal = patrosSelecionados.reduce((acc, p) => acc + (p.valor_fixo || 0), 0)

    await supabase
      .from('times')
      .update({
        patrocinio_master_id: selecionado.master,
        patrocinio_fornecedor_id: selecionado.fornecedor,
        patrocinio_secundario_id: selecionado.secundario,
      })
      .eq('id', meuTime.id)

    await supabase.rpc('atualizar_saldo', {
      id_time: meuTime.id,
      valor: valorTotal,
    })

    const nomes = patrosSelecionados.map(p => p.nome).join(', ')
    await supabase.from('bid').insert({
      tipo_evento: 'Patrocínio',
      descricao: `Time ${meuTime.nome} fechou com: ${nomes}`,
      id_time1: meuTime.id,
      valor: valorTotal,
    })

    toast.success('✅ Patrocínios salvos com sucesso!')
  }

  const categorias: Categoria[] = ['master', 'fornecedor', 'secundario']

  return (
    <div className="p-4 text-white min-h-screen bg-zinc-900">
      <h1 className="text-2xl font-bold text-center mb-6 text-yellow-400">
        💼 Escolha seus Patrocinadores
      </h1>

      {categorias.map((categoria) => (
        <div key={categoria} className="mb-8">
          <h2 className="text-xl font-semibold capitalize mb-4 text-green-400">
            {categoria === 'master'
              ? 'Patrocínio Master'
              : categoria === 'fornecedor'
              ? 'Fornecedor de Material'
              : 'Patrocínio Secundário'}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {patrocinios
              .filter((p) => p.categoria === categoria && String(p.divisao) === String(meuTime?.divisao))
              .map((p) => (
                <div
                  key={p.id}
                  className={`border rounded p-4 bg-zinc-800 hover:border-green-400 transition cursor-pointer ${
                    selecionado[categoria] === p.id ? 'border-green-400' : 'border-zinc-600'
                  }`}
                  onClick={() =>
                    setSelecionado((prev) => ({
                      ...prev,
                      [categoria]: p.id,
                    }))
                  }
                >
                  <h3 className="text-lg font-bold">{p.nome}</h3>
                  <p className="text-sm mt-1">💰 R$ {Number(p.valor_fixo).toLocaleString('pt-BR')}</p>
                  <p className="text-sm mt-2 text-gray-400">{p.descricao_beneficio}</p>
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="text-center mt-8">
        <button
          onClick={salvarEscolhas}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-semibold"
        >
          Salvar Patrocínios
        </button>
      </div>
    </div>
  )
}

