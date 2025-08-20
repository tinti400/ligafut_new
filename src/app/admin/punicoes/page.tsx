'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TipoPunicao = 'desconto_pontos' | 'multa_dinheiro' | 'bloqueio_leilao' | 'bloqueio_mercado'

export default function PunicoesAdminPage() {
  const [times, setTimes] = useState<Array<{ id: string; nome: string }>>([])
  const [punicoesAtuais, setPunicoesAtuais] = useState<any[]>([])
  const [idTime, setIdTime] = useState('')
  const [tipo, setTipo] = useState<TipoPunicao>('desconto_pontos')
  const [valor, setValor] = useState('') // pontos (int) ou valor R$ (number)
  const [motivo, setMotivo] = useState('')
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    carregarTimes()
    carregarPunicoes()
  }, [])

  async function carregarTimes() {
    const { data, error } = await supabase
      .from('times')
      .select('id, nome')
      .order('nome', { ascending: true })
    if (error) {
      toast.error('Erro ao carregar times')
      return
    }
    setTimes(data || [])
  }

  async function carregarPunicoes() {
    const { data, error } = await supabase
      .from('punicoes')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Erro ao carregar punições')
      return
    }
    setPunicoesAtuais(data || [])
  }

  const precisaValor = useMemo(
    () => tipo === 'desconto_pontos' || tipo === 'multa_dinheiro',
    [tipo]
  )

  function parseNumeroPositivo(s: string) {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  async function aplicarPunicao() {
    if (!idTime) return toast.error('Selecione um time')
    if (!tipo) return toast.error('Selecione um tipo de punição')
    if (!motivo.trim()) return toast.error('Informe o motivo')

    let valorNumerico: number | null = null

    if (precisaValor) {
      const parsed = parseNumeroPositivo(valor)
      if (parsed === null) {
        return toast.error(
          tipo === 'desconto_pontos'
            ? 'Informe um número de pontos > 0'
            : 'Informe um valor de multa (R$) > 0'
        )
      }
      // Pontos precisam ser inteiros
      valorNumerico = tipo === 'desconto_pontos' ? Math.floor(parsed) : parsed
    }

    setCarregando(true)

    // Descobre nome do time
    const time = times.find((t) => t.id === idTime)
    if (!time) {
      setCarregando(false)
      return toast.error('Time não encontrado')
    }

    // 1) Insere registro na tabela punicoes
    {
      const { error } = await supabase.from('punicoes').insert({
        id_time: idTime,
        nome_time: time.nome,
        tipo_punicao: tipo,
        valor: valorNumerico,
        motivo,
        ativo: true
      })
      if (error) {
        setCarregando(false)
        return toast.error('Erro ao aplicar punição')
      }
    }

    // 2) Executa efeito prático via RPC
    try {
      if (tipo === 'desconto_pontos') {
        const { error } = await supabase.rpc('remover_pontos_classificacao', {
          id_time_param: idTime,
          pontos_remover: valorNumerico
        })
        if (error) throw error
      } else if (tipo === 'multa_dinheiro') {
        const { error } = await supabase.rpc('descontar_dinheiro', {
          id_time_param: idTime,
          valor_multa: valorNumerico
        })
        if (error) throw error
      } else if (tipo === 'bloqueio_leilao' || tipo === 'bloqueio_mercado') {
        // Aqui você pode, se quiser, escrever uma flag em `configuracoes` para bloquear
        // Exemplo: await supabase.from('configuracoes').upsert({...})
      }

      toast.success('Punição aplicada com sucesso!')
      setIdTime('')
      setTipo('desconto_pontos')
      setValor('')
      setMotivo('')
      carregarPunicoes()
    } catch (e: any) {
      toast.error(`Falha ao executar efeito: ${e?.message || 'erro'}`)
    } finally {
      setCarregando(false)
    }
  }

  async function removerPunicao(id: string) {
    const { error } = await supabase.from('punicoes').update({ ativo: false }).eq('id', id)
    if (error) return toast.error('Não foi possível remover a punição')
    toast.success('Punição removida')
    carregarPunicoes()
  }

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-6">
      <h1 className="text-2xl font-bold mb-6">⚠️ Painel de Punições</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block mb-1 font-medium">👥 Time</label>
          <select
            value={idTime}
            onChange={(e) => setIdTime(e.target.value)}
            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
          >
            <option value="">Selecione um time</option>
            {times.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1 font-medium">🚨 Tipo de Punição</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoPunicao)}
            className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
          >
            <option value="desconto_pontos">Desconto de Pontos</option>
            <option value="multa_dinheiro">Multa em Dinheiro</option>
            <option value="bloqueio_leilao">Bloqueio de Leilão</option>
            <option value="bloqueio_mercado">Bloqueio de Mercado</option>
          </select>
        </div>

        {precisaValor && (
          <div>
            <label className="block mb-1 font-medium">
              {tipo === 'desconto_pontos' ? '📉 Pontos a remover' : '💰 Valor da multa (R$)'}
            </label>
            <input
              type="number"
              min={1}
              step={tipo === 'desconto_pontos' ? 1 : '0.01'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full p-2 rounded bg-zinc-800 border border-zinc-700"
              placeholder={tipo === 'desconto_pontos' ? 'Ex.: 3' : 'Ex.: 1000000'}
            />
          </div>
        )}

        <div className="md:col-span-2">
          <label className="block mb-1 font-medium">📝 Motivo</label>
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
        className="mt-6 bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-bold disabled:opacity-50"
      >
        {carregando ? 'Aplicando...' : 'Aplicar Punição'}
      </button>

      <div className="mt-10 max-w-3xl">
        <h2 className="text-xl font-bold mb-3">📋 Punições Ativas</h2>
        {punicoesAtuais.length === 0 ? (
          <p className="text-zinc-400">Nenhuma punição ativa no momento.</p>
        ) : (
          <ul className="space-y-3">
            {punicoesAtuais.map((p) => (
              <li
                key={p.id}
                className="bg-zinc-800 p-4 rounded flex justify-between items-start"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{p.nome_time}</p>
                    <span
                      className={classNames(
                        'text-xs px-2 py-0.5 rounded',
                        p.tipo_punicao === 'desconto_pontos' && 'bg-amber-500/20 text-amber-300',
                        p.tipo_punicao === 'multa_dinheiro' && 'bg-emerald-500/20 text-emerald-300',
                        (p.tipo_punicao === 'bloqueio_leilao' || p.tipo_punicao === 'bloqueio_mercado') &&
                          'bg-red-500/20 text-red-300'
                      )}
                    >
                      {p.tipo_punicao.replace('_', ' ')}
                    </span>
                  </div>

                  {p.tipo_punicao === 'multa_dinheiro' && typeof p.valor === 'number' && (
                    <p className="text-sm text-zinc-300 mt-1">Valor: {fmtBRL(p.valor)}</p>
                  )}

                  {p.tipo_punicao === 'desconto_pontos' && typeof p.valor === 'number' && (
                    <p className="text-sm text-zinc-300 mt-1">Pontos removidos: {p.valor}</p>
                  )}

                  <p className="text-sm text-zinc-400 mt-1">Motivo: {p.motivo}</p>
                </div>

                <button
                  onClick={() => removerPunicao(p.id)}
                  className="text-red-400 text-sm hover:underline"
                >
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
