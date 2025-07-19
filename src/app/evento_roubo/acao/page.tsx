'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

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
  const [vez, setVez] = useState<number>(0)
  const [ordem, setOrdem] = useState<Time[]>([])
  const [tempoRestante, setTempoRestante] = useState<number>(240)
  const [jogadoresAlvo, setJogadoresAlvo] = useState<Jogador[]>([])
  const [idTime, setIdTime] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [alvoSelecionado, setAlvoSelecionado] = useState<string>('')
  const [jogadorSelecionado, setJogadorSelecionado] = useState<string>('')
  const [roubos, setRoubos] = useState<any>({})
  const [limitePerda, setLimitePerda] = useState<number>(5)

  useEffect(() => {
    const id = localStorage.getItem('id_time')
    if (id) setIdTime(id)
    carregarEvento()
  }, [])

  useEffect(() => {
    if (tempoRestante <= 0) return
    const timer = setInterval(() => setTempoRestante((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [tempoRestante])

  async function carregarEvento() {
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data) {
      setVez(parseInt(data.vez) || 0)
      if (data.ordem) {
        const { data: times } = await supabase
          .from('times')
          .select('id, nome, logo_url')
          .in('id', data.ordem)
        setOrdem(times || [])
      }
      setRoubos(data.roubos || {})
      setLimitePerda(data.limite_perda || 5)
    }
    setLoading(false)
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
  }

  async function sortearOrdem() {
    const { data: times } = await supabase
      .from('times')
      .select('id, nome, logo_url')
    if (times) {
      const embaralhado = times.sort(() => Math.random() - 0.5)
      await supabase
        .from('configuracoes')
        .update({ ordem: embaralhado.map(t => t.id), vez: '0' })
        .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      setOrdem(embaralhado)
      setVez(0)
      setTempoRestante(240)
    }
  }

  async function carregarJogadoresDoAlvo() {
    if (!alvoSelecionado) return
    const { data } = await supabase
      .from('elenco')
      .select('id, nome, posicao, valor, id_time')
      .eq('id_time', alvoSelecionado)
    if (data) setJogadoresAlvo(data)
  }

  async function roubarJogador() {
    if (!jogadorSelecionado || !idTime) return

    const jogador = jogadoresAlvo.find(j => j.id === jogadorSelecionado)
    if (!jogador) return

    await supabase
      .from('elenco')
      .update({ id_time: idTime })
      .eq('id', jogador.id)

    const valorPago = Math.floor(jogador.valor * 0.5)

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

    await supabase
      .from('times')
      .update({ saldo: (timeRoubado?.saldo || 0) + valorPago })
      .eq('id', jogador.id_time)

    await supabase
      .from('times')
      .update({ saldo: (meuTime?.saldo || 0) - valorPago })
      .eq('id', idTime)

    const atualizado = { ...roubos }
    if (!atualizado[idTime]) atualizado[idTime] = {}
    if (!atualizado[idTime][alvoSelecionado]) atualizado[idTime][alvoSelecionado] = 0
    atualizado[idTime][alvoSelecionado]++

    await supabase
      .from('configuracoes')
      .update({ roubos: atualizado })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')

    await supabase
      .from('bid')
      .insert({
        tipo_evento: 'roubo',
        descricao: `${jogador.nome} foi roubado por ${idTime}`,
        id_time1: idTime,
        id_time2: jogador.id_time,
        valor: valorPago,
        data_evento: new Date().toISOString()
      })

    alert('✅ Jogador roubado com sucesso!')
    window.location.reload()
  }

  async function finalizarEvento() {
    await supabase
      .from('configuracoes')
      .update({ ativo: false, fase: 'finalizado' })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
    alert('✅ Evento finalizado!')
    window.location.reload()
  }

  const podeRoubar = (alvoId: string) => {
    const roubosDoAlvo = Object.values(roubos).map((r: any) => r[alvoId] || 0).reduce((a: any, b: any) => a + b, 0)
    const meusRoubos = roubos[idTime]?.[alvoId] || 0
    return roubosDoAlvo < limitePerda && meusRoubos < 2
  }

  return (
    <div className="p-6 text-white max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">⚔️ Fase de Ação - Evento de Roubo</h1>

      {loading ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <>
          <button
            onClick={sortearOrdem}
            className="w-full bg-yellow-500 py-2 rounded mb-4"
          >
            🎲 Sortear Ordem dos Times
          </button>

          <button
            onClick={finalizarEvento}
            className="w-full bg-red-700 py-2 rounded mb-4"
          >
            🛑 Finalizar Evento
          </button>

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
                className="w-full p-2 rounded mb-2 text-black"
              >
                <option value="">🎯 Selecione um time para roubar</option>
                {ordem.filter(t => t.id !== idTime && podeRoubar(t.id)).map((time, idx) => (
                  <option key={idx} value={time.id}>{time.nome}</option>
                ))}
              </select>

              <button
                onClick={carregarJogadoresDoAlvo}
                className="w-full bg-blue-600 py-2 rounded mb-2"
              >
                🔎 Ver Jogadores Disponíveis
              </button>

              {jogadoresAlvo.length > 0 && (
                <>
                  <select
                    value={jogadorSelecionado}
                    onChange={(e) => setJogadorSelecionado(e.target.value)}
                    className="w-full p-2 rounded mb-2 text-black"
                  >
                    <option value="">👤 Selecione um jogador para roubar</option>
                    {jogadoresAlvo.map(j => (
                      <option key={j.id} value={j.id}>{j.nome} ({j.posicao}) - R$ {j.valor.toLocaleString('pt-BR')}</option>
                    ))}
                  </select>

                  <button
                    onClick={roubarJogador}
                    className="w-full bg-green-600 py-2 rounded"
                  >
                    ✅ Roubar Jogador
                  </button>
                </>
              )}
            </>
          )}

          <button
            onClick={passarVez}
            className="w-full bg-red-600 py-2 rounded mt-4"
          >
            ⏭️ Passar para Próximo Time
          </button>

          <div className="mt-6 bg-gray-800 p-4 rounded">
            <h2 className="text-xl font-bold mb-2">📋 Fila de Times:</h2>
            <ol className="list-decimal ml-4">
              {ordem.map((t, idx) => (
                <li key={idx} className={idx === vez ? 'text-green-400 font-bold' : ''}>
                  <div className="flex items-center gap-2">
                    <img src={t.logo_url} alt="Logo" className="h-5 w-5" />
                    {t.nome}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  )
}
