'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function PunicoesAdminPage() {
  const [times, setTimes] = useState<any[]>([])
  const [punicoesAtuais, setPunicoesAtuais] = useState<any[]>([])
  const [idTime, setIdTime] = useState('')
  const [tipo, setTipo] = useState<'desconto_pontos' | 'multa_dinheiro' | 'bloqueio_leilao' | 'bloqueio_mercado'>('desconto_pontos')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    carregarTimes()
    carregarPunicoes()
  }, [])

  async function carregarTimes() {
    const { data, error } = await supabase.from('times').select('id, nome').order('nome', { ascending: true })
    if (!error && data) setTimes(data)
  }

  async function carregarPunicoes() {
    const { data, error } = await supabase.from('punicoes').select('*').eq('ativo', true).order('created_at', { ascending: false })
    if (!error && data) setPunicoesAtuais(data)
  }

  async function aplicarPunicao() {
    if (!idTime || !tipo || !motivo || (tipo !== 'bloqueio_leilao' && tipo !== 'bloqueio_mercado' && !valor)) {
      toast.error('Preencha todos os campos obrigatórios!')
      return
    }

    setCarregando(true)

    const time = times.find((t) => t.id === idTime)
    if (!time) {
      toast.error('Time não encontrado.')
      setCarregando(false)
      return
    }

    const valorNumerico = valor ? parseInt(valor) : null

    // 1. Inserir punição
    const { error } = await supabase.from('punicoes').insert({
      id_time: idTime,
      nome_time: time.nome,
      tipo_punicao: tipo,
      valor: valorNumerico,
      motivo,
      ativo: true
    })

    if (error) {
      toast.error('Erro ao aplicar punição.')
      setCarregando(false)
      return
    }

    // 2. Executar efeito da punição
    if (tipo === 'desconto_pontos') {
      await supabase.rpc('remover_pontos_classificacao', {
        id_time_param: idTime,
        pontos_remover: valorNumerico
      })
    }

    if (tipo === 'multa_dinheiro') {
      await supabase.rpc('descontar_dinheiro', {
        id_time_param: idTime,
        valor_multa: valorNumerico
      })
    }

    toast.success('Punição aplicada com sucesso!')
    setIdTime('')
    setTipo('desconto_pontos')
    setValor('')
    setMotivo('')
    carregarPunicoes()
    setCarregando(false)
  }

  async function removerPunicao(id: string) {
    const { error } = await supabase.from('punicoes').update({ ativo: false }).eq('id', id)
    if (!error) {
      toast.success('Punição removida.')
      carregarPunicoes()
    }
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">⚠️ Painel de Punições</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <div>
          <label className="block mb-1 font-medium">👥 Time:</label>
          <select
            value={idTime}
            onChange={(e) => setIdTime(e.target.value)}
            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
          >
            <option value="">Selecione um time</option>
            {times.map((time) => (
              <option key={time.id} value={time.id}>{time.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1 font-medium">🚨 Tipo de Punição:</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as any)}
            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
          >
            <option value="desconto_pontos">Desconto de Pontos</option>
            <option value="multa_dinheiro">Multa em Dinheiro</option>
            <option value="bloqueio_leilao">Bloqueio de Leilão</option>
            <option value="bloqueio_mercado">Bloqueio de Mercado</option>
          </select>
        </div>

        {(tipo === 'desconto_pontos' || tipo === 'multa_dinheiro') && (
          <div>
            <label className="block mb-1 font-medium">
              {tipo === 'desconto_pontos' ? '📉 Pontos a Remover:' : '💰 Valor da Multa (R$):'}
            </label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
              placeholder={tipo === 'desconto_pontos' ? '-3' : '-1000000'}
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block mb-1 font-medium">📝 Motivo:</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
            placeholder="Explique o motivo da punição..."
          />
        </div>
      </div>

      <button
        onClick={aplicarPunicao}
        disabled={carregando}
        className="mt-6 bg-red-600 hover:bg-red-700 px-6 py-2 rounded text-white font-bold disabled:opacity-50"
      >
        {carregando ? 'Aplicando...' : 'Aplicar Punição'}
      </button>

      <div className="mt-10">
        <h2 className="text-xl font-bold mb-3">📋 Punições Ativas</h2>
        {punicoesAtuais.length === 0 ? (
          <p className="text-zinc-400">Nenhuma punição ativa no momento.</p>
        ) : (
          <ul className="space-y-3">
            {punicoesAtuais.map((p) => (
              <li key={p.id} className="bg-zinc-800 p-4 rounded flex justify-between items-start">
                <div>
                  <p className="font-bold">{p.nome_time}</p>
                  <p className="text-sm text-zinc-400">Tipo: {p.tipo_punicao}</p>
                  {p.valor && <p className="text-sm text-zinc-400">Valor: {p.valor}</p>}
                  <p className="text-sm text-zinc-400">Motivo: {p.motivo}</p>
                </div>
                <button onClick={() => removerPunicao(p.id)} className="text-red-400 text-sm hover:underline">
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

