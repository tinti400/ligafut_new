'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface Time {
  id: string
  nome: string
  logo_url: string
}

interface Jogador {
  id: string
  nome: string
  posicao: string
  valor: number
  id_time: string
}

export default function AcaoRouboPage() {
  const { isAdmin, loading: loadingAdmin } = useAdmin()
  const [vez, setVez] = useState<number>(0)
  const [ordem, setOrdem] = useState<Time[]>([])
  const [tempoRestante, setTempoRestante] = useState<number>(240)
  const [jogadoresAlvo, setJogadoresAlvo] = useState<Jogador[]>([])
  const [idTime, setIdTime] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [alvoSelecionado, setAlvoSelecionado] = useState<string>('')
  const [roubos, setRoubos] = useState<any>({})
  const [limitePerda, setLimitePerda] = useState<number>(5)
  const [mostrarJogadores, setMostrarJogadores] = useState(false)
  const [ordemSorteada, setOrdemSorteada] = useState(false)
  const [bloqueioBotao, setBloqueioBotao] = useState(false)
  const [bloqueados, setBloqueados] = useState<string[]>([])

  useEffect(() => {
    const id = localStorage.getItem('id_time')
    if (id) setIdTime(id)
    carregarEvento()

    const canal = supabase
      .channel('evento-roubo')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'configuracoes',
        filter: 'id=eq.56f3af29-a4ac-4a76-aeb3-35400aa2a773'
      }, () => {
        carregarEvento()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [])

  useEffect(() => {
    if (!ordemSorteada || tempoRestante <= 0) return
    const timer = setInterval(() => setTempoRestante((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [tempoRestante, ordemSorteada])

  async function carregarEvento() {
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data) {
      setVez(parseInt(data.vez) || 0)
      setRoubos(data.roubos || {})
      setLimitePerda(data.limite_perda || 5)
      setBloqueados(data.jogadores_bloqueados || [])

      if (data.ordem?.length) {
        const { data: times } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', data.ordem)

        const ordemCompleta = data.ordem.map((id: string) =>
          times?.find((t: Time) => t.id === id)
        ).filter(Boolean)

        setOrdem(ordemCompleta)
        setOrdemSorteada(true)
      } else {
        setOrdem([])
        setOrdemSorteada(false)
      }
    }
    setLoading(false)
  }

  async function carregarJogadoresDoAlvo() {
    if (!alvoSelecionado) return
    const { data } = await supabase
      .from('elenco')
      .select('id, nome, posicao, valor, id_time')
      .eq('id_time', alvoSelecionado)

    if (data) {
      const filtrados = data.filter(j => !bloqueados.includes(j.id))
      setJogadoresAlvo(filtrados)
      setMostrarJogadores(true)
    }
  }

  async function roubarJogador(jogador: Jogador) {
    if (bloqueioBotao) return
    setBloqueioBotao(true)

    const valorPago = Math.floor(jogador.valor * 0.5)

    await supabase.from('elenco')
      .update({ id_time: idTime })
      .eq('id', jogador.id)

    const { data: timeRoubado } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', jogador.id_time)
      .single()

    const { data: meuTime } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()

    await supabase.from('times')
      .update({ saldo: (timeRoubado?.saldo || 0) + valorPago })
      .eq('id', jogador.id_time)

    await supabase.from('times')
      .update({ saldo: (meuTime?.saldo || 0) - valorPago })
      .eq('id', idTime)

    const atualizado = { ...roubos }
    if (!atualizado[idTime]) atualizado[idTime] = {}
    if (!atualizado[idTime][alvoSelecionado]) atualizado[idTime][alvoSelecionado] = 0
    atualizado[idTime][alvoSelecionado]++

    await supabase.from('configuracoes')
      .update({ roubos: atualizado })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

    await supabase.from('bid').insert({
      tipo_evento: 'roubo',
      descricao: ${jogador.nome} foi roubado por ${idTime},
      id_time1: idTime,
      id_time2: jogador.id_time,
      valor: valorPago,
      data_evento: new Date().toISOString()
    })

    setMostrarJogadores(false)
    setJogadoresAlvo(jogadoresAlvo.filter(j => j.id !== jogador.id))
    setBloqueioBotao(false)
  }

  async function sortearOrdem() {
    const { data: times } = await supabase
      .from('times')
      .select('id, nome, logo_url')

    if (times) {
      const embaralhado = [...times]
        .map(t => ({ ...t, rand: Math.random() }))
        .sort((a, b) => a.rand - b.rand)
        .map(({ rand, ...rest }) => rest)

      const idsSorteados = embaralhado.map(t => t.id)

      await supabase
        .from('configuracoes')
        .update({ ordem: idsSorteados, vez: '0' })
        .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

      setOrdem(embaralhado)
      setVez(0)
      setTempoRestante(240)
      setOrdemSorteada(true)
    }
  }

  async function passarVez() {
    const novaVez = vez + 1
    await supabase
      .from('configuracoes')
      .update({ vez: novaVez.toString() })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
    setVez(novaVez)
    setTempoRestante(240)
    setAlvoSelecionado('')
    setJogadoresAlvo([])
    setMostrarJogadores(false)
  }

  async function limparSorteio() {
    await supabase
      .from('configuracoes')
      .update({ ordem: null, vez: '0' })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
    setOrdem([])
    setOrdemSorteada(false)
    setVez(0)
    setTempoRestante(240)
    alert('🧹 Sorteio da ordem dos times foi limpo com sucesso!')
  }

  async function finalizarEvento() {
    await supabase.from('configuracoes')
      .update({ ativo: false, fase: 'finalizado' })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
    alert('✅ Evento finalizado!')
  }

  const podeRoubar = (alvoId: string) => {
    const roubosDoAlvo = Object.values(roubos).map((r: any) => r[alvoId] || 0).reduce((a: number, b: number) => a + b, 0)
    const meusRoubos = roubos[idTime]?.[alvoId] || 0
    return roubosDoAlvo < 3 && meusRoubos < 2
  }

  return (
    <div className="p-6 text-white max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">⚔️ Fase de Ação - Evento de Roubo</h1>

      {loading || loadingAdmin ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <>
          {isAdmin && (
            <>
              <button onClick={sortearOrdem} className="w-full bg-yellow-500 py-2 rounded mb-2 hover:bg-yellow-600 transition">🎲 Sortear Ordem dos Times</button>
              <button onClick={limparSorteio} className="w-full bg-gray-600 py-2 rounded mb-2 hover:bg-gray-700 transition">🧹 Limpar Sorteio</button>
              <button onClick={finalizarEvento} className="w-full bg-red-700 py-2 rounded mb-2 hover:bg-red-800 transition">🛑 Finalizar Evento</button>
              <button onClick={passarVez} className="w-full bg-red-600 py-2 rounded mt-2 hover:bg-red-700 transition">⏭️ Passar para Próximo Time</button>
            </>
          )}

          {idTime === ordem[vez]?.id && !isAdmin && (
            <button onClick={passarVez} className="w-full bg-red-600 py-2 rounded mt-4 hover:bg-red-700 transition">⏭️ Encerrar Minha Vez</button>
          )}

          {ordemSorteada ? (
            <>
              <div className="bg-gray-800 p-4 rounded mb-4 text-center">
                <p className="text-xl font-bold">🎯 Time da vez:</p>
                {ordem[vez] && (
                  <div className="flex items-center justify-center gap-2">
                    <img src={ordem[vez].logo_url} alt="Logo" className="h-8 w-8" />
                    <p className="text-green-400 text-xl mb-2">{ordem[vez].nome}</p>
                  </div>
                )}
                <p>⏳ Tempo restante: <strong>{tempoRestante}s</strong></p>
              </div>

              {idTime === ordem[vez]?.id && (
                <>
                  <select
                    value={alvoSelecionado}
                    onChange={(e) => setAlvoSelecionado(e.target.value)}
                    className="w-full p-2 rounded mb-2 text-white bg-gray-800"
                  >
                    <option value="">🎯 Selecione um time para roubar</option>
                    {ordem.filter(t => t.id !== idTime && podeRoubar(t.id)).map((time, idx) => (
                      <option key={idx} value={time.id}>{time.nome}</option>
                    ))}
                  </select>

                  <button onClick={carregarJogadoresDoAlvo} className="w-full bg-blue-600 py-2 rounded mb-2 hover:bg-blue-700 transition">🔎 Ver Jogadores Disponíveis</button>

                  {mostrarJogadores && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {jogadoresAlvo.map(j => (
                        <div key={j.id} className="bg-gray-700 p-2 rounded flex flex-col justify-between hover:bg-gray-600 transition">
                          <div className="text-center">
                            <p className="font-bold text-sm">{j.nome}</p>
                            <p className="text-xs">{j.posicao}</p>
                            <p className="text-xs">R$ {j.valor.toLocaleString('pt-BR')}</p>
                          </div>
                          <button onClick={() => roubarJogador(j)} className="bg-green-600 mt-2 px-2 py-1 rounded text-xs hover:bg-green-700 transition">✅ Roubar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="text-center text-yellow-300 font-bold">⚠️ Sorteie a ordem para iniciar o evento!</p>
          )}
        </>
      )}
    </div>
  )
}