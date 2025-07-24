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
  saldo?: number
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
  const [timeComprador, setTimeComprador] = useState<Time | null>(null)

  useEffect(() => {
    const storedId = localStorage.getItem('id_time')
    if (storedId) setIdTime(storedId)
  }, [])

  useEffect(() => {
    const buscarOrdemEBloqueios = async () => {
      const { data: ordemData } = await supabase.from('evento_multa').select('ordem').single()
      if (ordemData?.ordem) setOrdem(ordemData.ordem)

      const { data: bloqueiosData } = await supabase
        .from('configuracoes')
        .select('bloqueios')
        .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
        .single()
      if (bloqueiosData?.bloqueios) setBloqueios(bloqueiosData.bloqueios)
    }

    buscarOrdemEBloqueios()
  }, [])

  useEffect(() => {
    if (!idTime) return
    const buscarTime = async () => {
      const { data } = await supabase.from('times').select('*').eq('id', idTime).single()
      if (data) setTimeComprador(data)
    }
    buscarTime()
  }, [idTime])

  useEffect(() => {
    if (ordem.length === 0) return
    const timeAlvo = ordem[vez]

    const buscarElenco = async () => {
      const { data } = await supabase.from('elenco').select('*').eq('id_time', timeAlvo.id)
      if (data) setJogadoresAlvo(data)
    }

    buscarElenco()
    setTempoRestante(240)

    const intervalo = setInterval(() => {
      setTempoRestante((prev) => {
        if (prev <= 1) {
          clearInterval(intervalo)
          if (vez < ordem.length - 1) setVez((v) => v + 1)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(intervalo)
  }, [vez, ordem])

  const handleRoubar = async (jogador: Jogador) => {
    const confirmacao = confirm(`Deseja realmente roubar ${jogador.nome}?`)
    if (!confirmacao || !timeComprador) return

    const timeAlvo = ordem[vez]
    const metadeValor = jogador.valor * 0.5

    // Atualiza saldo comprador
    const novoSaldoComprador = (timeComprador.saldo || 0) - metadeValor
    await supabase.from('times').update({ saldo: novoSaldoComprador }).eq('id', timeComprador.id)

    // Atualiza saldo time alvo
    const { data: alvoData } = await supabase.from('times').select('saldo').eq('id', timeAlvo.id).single()
    const novoSaldoAlvo = (alvoData?.saldo || 0) + metadeValor
    await supabase.from('times').update({ saldo: novoSaldoAlvo }).eq('id', timeAlvo.id)

    // Remove do elenco original
    await supabase.from('elenco').delete().eq('id', jogador.id)

    // Adiciona ao elenco do time que roubou
    await supabase.from('elenco').insert([
      {
        nome: jogador.nome,
        posicao: jogador.posicao,
        valor: jogador.valor,
        id_time: timeComprador.id
      }
    ])

    // Publica no BID
    await supabase.from('bid').insert([
      {
        nome: jogador.nome,
        posicao: jogador.posicao,
        valor: jogador.valor,
        origem: timeAlvo.nome,
        destino: timeComprador.nome,
        data: new Date()
      }
    ])

    // Registra movimentação
    await supabase.from('movimentacoes').insert([
      {
        id_time: timeComprador.id,
        tipo: 'Compra por Roubo',
        descricao: `Comprou ${jogador.nome} do ${timeAlvo.nome} por R$ ${metadeValor.toLocaleString('pt-BR')}`,
        valor: metadeValor * -1,
        data: new Date()
      },
      {
        id_time: timeAlvo.id,
        tipo: 'Venda por Roubo',
        descricao: `Perdeu ${jogador.nome} para ${timeComprador.nome} e recebeu R$ ${metadeValor.toLocaleString('pt-BR')}`,
        valor: metadeValor,
        data: new Date()
      }
    ])

    toast.success(`${jogador.nome} roubado com sucesso!`)
  }

  const timeAlvo = ordem[vez]

  return (
    <div style={{ padding: 20 }}>
      <h2>⏱️ Tempo restante: {tempoRestante}s</h2>
      <h3>🎯 Time alvo: {timeAlvo?.nome}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {jogadoresAlvo.map((jogador) => {
          const bloqueado = bloqueios?.[timeAlvo?.id]?.some((j) => j.nome === jogador.nome)
          return (
            <div
              key={jogador.id}
              style={{
                border: '1px solid #ccc',
                padding: 10,
                borderRadius: 8,
                width: 200,
                backgroundColor: '#f9f9f9',
                opacity: bloqueado ? 0.5 : 1,
                position: 'relative'
              }}
            >
              <strong>{jogador.nome}</strong>{' '}
              {bloqueado && (
                <FiLock
                  title="Jogador bloqueado"
                  style={{ color: 'red', marginLeft: 6 }}
                />
              )}
              <p>{jogador.posicao}</p>
              <p>R$ {jogador.valor.toLocaleString('pt-BR')}</p>
              <button
                onClick={() => handleRoubar(jogador)}
                disabled={bloqueado}
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
    </div>
  )
}

