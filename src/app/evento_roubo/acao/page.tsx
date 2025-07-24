'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import { FiLock } from 'react-icons/fi'
import toast from 'react-hot-toast'

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
  const { isAdmin } = useAdmin()
  const [vez, setVez] = useState<number>(0)
  const [ordem, setOrdem] = useState<Time[]>([])
  const [tempoRestante, setTempoRestante] = useState<number>(240)
  const [jogadoresAlvo, setJogadoresAlvo] = useState<Jogador[]>([])
  const [idTime, setIdTime] = useState<string>('')
  const [bloqueios, setBloqueios] = useState<Record<string, { nome: string }[]>>({})
  const [roubosPorTime, setRoubosPorTime] = useState<Record<string, number>>({})
  const [roubosNaVez, setRoubosNaVez] = useState<number>(0)

  useEffect(() => {
    const storedId = localStorage.getItem('id_time')
    if (storedId) setIdTime(storedId)
  }, [])

  useEffect(() => {
    buscarOrdem()
    buscarBloqueios()
    buscarRoubos()
  }, [])

  useEffect(() => {
    if (ordem.length === 0 || vez >= ordem.length) return
    const timeAtual = ordem[vez]

    const buscarElenco = async () => {
      const { data } = await supabase
        .from('elenco')
        .select('*')
        .eq('id_time', timeAtual.id)

      if (data) setJogadoresAlvo(data)
    }

    buscarElenco()
    setTempoRestante(240)
    setRoubosNaVez(0)

    const intervalo = setInterval(() => {
      setTempoRestante((prev) => {
        if (prev <= 1) {
          clearInterval(intervalo)
          proximaVez()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(intervalo)
  }, [vez, ordem])

  const buscarOrdem = async () => {
    const { data } = await supabase.from('evento_multa').select('ordem').single()
    if (data?.ordem) setOrdem(data.ordem)
  }

  const buscarBloqueios = async () => {
    const { data } = await supabase
      .from('configuracoes')
      .select('bloqueios')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data?.bloqueios) setBloqueios(data.bloqueios)
  }

  const buscarRoubos = async () => {
    const { data } = await supabase.from('bid').select('id_time_origem')
    const contagem: Record<string, number> = {}

    data?.forEach((r) => {
      contagem[r.id_time_origem] = (contagem[r.id_time_origem] || 0) + 1
    })

    setRoubosPorTime(contagem)
  }

  const proximaVez = () => {
    if (vez < ordem.length - 1) setVez((v) => v + 1)
  }

  const handleSortearOrdem = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url')
    if (!times) return

    const sorteada = times.sort(() => 0.5 - Math.random())
    await supabase.from('evento_multa').upsert({ id: 1, ordem: sorteada })

    toast.success('Ordem sorteada')
    setOrdem(sorteada)
    setVez(0)
  }

  const handleRoubar = async (jogador: Jogador) => {
    const timeAlvo = ordem[vez]
    const bloqueado = bloqueios?.[timeAlvo.id]?.some((j) => j.nome === jogador.nome)
    const totalRoubos = roubosPorTime[timeAlvo.id] || 0

    if (bloqueado || totalRoubos >= 3 || roubosNaVez >= 2) {
      toast.error('Não é possível roubar esse jogador.')
      return
    }

    const confirmacao = confirm(`Deseja realmente roubar ${jogador.nome}?`)
    if (!confirmacao) return

    const valorRoubo = jogador.valor * 0.5

    const { error: erroRemover } = await supabase.from('elenco').delete().eq('id', jogador.id)
    const { error: erroAdicionar } = await supabase.from('elenco').insert({
      nome: jogador.nome,
      posicao: jogador.posicao,
      valor: jogador.valor,
      id_time: idTime
    })

    await supabase.from('times')
      .update({ saldo: supabase.rpc('incrementar_saldo', { time_id: timeAlvo.id, valor: valorRoubo }) })
      .eq('id', timeAlvo.id)

    await supabase.from('times')
      .update({ saldo: supabase.rpc('decrementar_saldo', { time_id: idTime, valor: valorRoubo }) })
      .eq('id', idTime)

    await supabase.from('bid').insert({
      nome: jogador.nome,
      posicao: jogador.posicao,
      valor: jogador.valor,
      id_time_origem: timeAlvo.id,
      id_time_destino: idTime,
      tipo: 'roubo'
    })

    toast.success(`${jogador.nome} foi roubado com sucesso!`)

    setRoubosPorTime((prev) => ({
      ...prev,
      [timeAlvo.id]: (prev[timeAlvo.id] || 0) + 1
    }))
    setRoubosNaVez((r) => r + 1)
    setJogadoresAlvo((prev) => prev.filter((j) => j.id !== jogador.id))
  }

  const timeAlvo = ordem[vez]

  if (!timeAlvo) return <p>Evento finalizado.</p>

  const totalRoubos = roubosPorTime[timeAlvo.id] || 0
  const exibirTime = totalRoubos < 3

  return (
    <div style={{ padding: 20 }}>
      <h2>⏱ Tempo restante: {tempoRestante}s</h2>
      <h3>🎯 Time alvo: {timeAlvo.nome}</h3>
      <h4>🔢 Roubos do time: {totalRoubos}/3 | Roubos nesta vez: {roubosNaVez}/2</h4>

      {isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={handleSortearOrdem}>🎲 Sortear Ordem</button>
          <button onClick={proximaVez} style={{ marginLeft: 10 }}>⏭ Passar Vez</button>
        </div>
      )}

      {!isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={proximaVez}>✅ Finalizar minha vez</button>
        </div>
      )}

      {exibirTime && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {jogadoresAlvo.map((jogador) => {
            const bloqueado = bloqueios?.[timeAlvo.id]?.some((j) => j.nome === jogador.nome)
            return (
              <div key={jogador.id} style={{
                border: '1px solid #ccc',
                padding: 10,
                borderRadius: 8,
                width: 200,
                backgroundColor: '#f9f9f9',
                opacity: bloqueado ? 0.5 : 1,
                position: 'relative'
              }}>
                <strong>{jogador.nome}</strong>{' '}
                {bloqueado && <FiLock title="Jogador bloqueado" style={{ color: 'red', marginLeft: 6 }} />}
                <p>{jogador.posicao}</p>
                <p>R$ {jogador.valor.toLocaleString('pt-BR')}</p>
                <button
                  onClick={() => handleRoubar(jogador)}
                  disabled={bloqueado || totalRoubos >= 3 || roubosNaVez >= 2}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '6px 0',
                    backgroundColor: bloqueado ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: bloqueado ? 'not-allowed' : 'pointer'
                  }}
                >
                  Roubar
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

