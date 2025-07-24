'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAdmin } from '@/hooks/useAdmin'
import { FiLock } from 'react-icons/fi'

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
  const [ordem, setOrdem] = useState<Time[]>([])
  const [vez, setVez] = useState<number>(0)
  const [tempoRestante, setTempoRestante] = useState<number>(240)
  const [jogadoresAlvo, setJogadoresAlvo] = useState<Jogador[]>([])
  const [idTime, setIdTime] = useState<string>('')

  const [bloqueios, setBloqueios] = useState<Record<string, { nome: string }[]>>({})
  const [roubos, setRoubos] = useState<Record<string, string[]>>({})

  useEffect(() => {
    const storedId = localStorage.getItem('id_time')
    if (storedId) setIdTime(storedId)
  }, [])

  useEffect(() => {
    buscarDadosEvento()
  }, [])

  useEffect(() => {
    if (ordem.length === 0) return
    const timeAtual = ordem[vez]
    if (!timeAtual) return

    buscarElencoAlvo(timeAtual.id)
    setTempoRestante(240)

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

  async function buscarDadosEvento() {
    const { data } = await supabase
      .from('configuracoes')
      .select('ordem, vez, bloqueios, roubos')
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
      .single()

    if (data?.ordem) setOrdem(data.ordem)
    if (data?.vez) setVez(data.vez)
    if (data?.bloqueios) setBloqueios(data.bloqueios)
    if (data?.roubos) setRoubos(data.roubos)
  }

  async function buscarElencoAlvo(id_time: string) {
    const { data } = await supabase
      .from('elenco')
      .select('*')
      .eq('id_time', id_time)

    if (data) setJogadoresAlvo(data)
  }

  async function atualizarDadosEvento(campo: string, valor: any) {
    await supabase
      .from('configuracoes')
      .update({ [campo]: valor })
      .eq('id', '56f3af29-a4ac-4a76-aeb3-35400aa2a773')
  }

  async function proximaVez() {
    const novaVez = vez + 1
    setVez(novaVez)
    await atualizarDadosEvento('vez', novaVez)
  }

  async function sortearOrdem() {
    const { data } = await supabase.from('times').select('id, nome, logo_url')
    if (!data) return

    const sorteada = data.sort(() => Math.random() - 0.5)
    setOrdem(sorteada)
    setVez(0)
    setRoubos({})
    await atualizarDadosEvento('ordem', sorteada)
    await atualizarDadosEvento('vez', 0)
    await atualizarDadosEvento('roubos', {})
  }

  const handleRoubar = async (jogador: Jogador) => {
    const timeAlvo = ordem[vez]
    if (!timeAlvo || !idTime) return

    const confirmacao = confirm(`Deseja realmente roubar ${jogador.nome}?`)
    if (!confirmacao) return

    const jaRoubados = roubos[timeAlvo.id] || []
    const totalPerdidos = Object.values(roubos).flat().filter(id => jogador.id_time === timeAlvo.id).length
    const roubadosPorEsseTime = jaRoubados.filter(id => id === idTime).length

    if (totalPerdidos >= 3 || roubadosPorEsseTime >= 2) {
      alert('Limite de roubos atingido para este time.')
      return
    }

    const { data: jogadorOriginal } = await supabase
      .from('elenco')
      .select('*')
      .eq('id', jogador.id)
      .single()

    if (!jogadorOriginal) return

    // Atualiza id_time do jogador
    await supabase
      .from('elenco')
      .update({ id_time: idTime })
      .eq('id', jogador.id)

    // Atualiza saldos (50%)
    const valorPago = jogador.valor * 0.5

    const { data: saldoComprador } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', idTime)
      .single()

    const { data: saldoVendido } = await supabase
      .from('times')
      .select('saldo')
      .eq('id', timeAlvo.id)
      .single()

    await supabase
      .from('times')
      .update({ saldo: (saldoComprador?.saldo || 0) - valorPago })
      .eq('id', idTime)

    await supabase
      .from('times')
      .update({ saldo: (saldoVendido?.saldo || 0) + valorPago })
      .eq('id', timeAlvo.id)

    // Registrar no BID
    await supabase.from('bid').insert([{
      nome: jogador.nome,
      posicao: jogador.posicao,
      valor: jogador.valor,
      id_origem: timeAlvo.id,
      id_destino: idTime,
      tipo_evento: 'roubo'
    }])

    // Atualiza controle de roubos
    const novosRoubos = { ...roubos }
    if (!novosRoubos[timeAlvo.id]) novosRoubos[timeAlvo.id] = []
    novosRoubos[timeAlvo.id].push(idTime)

    setRoubos(novosRoubos)
    await atualizarDadosEvento('roubos', novosRoubos)

    buscarElencoAlvo(timeAlvo.id)
  }

  const timeAlvo = ordem[vez]
  if (!timeAlvo) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h2>⏱️ Tempo restante: {tempoRestante}s</h2>
      <h3>🎯 Time alvo: {timeAlvo.nome}</h3>

      {isAdmin && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={sortearOrdem} style={{ marginRight: 10 }}>🎲 Sortear Ordem</button>
          <button onClick={proximaVez}>⏭️ Passar Vez (ADM)</button>
        </div>
      )}

      {!isAdmin && (
        <button onClick={proximaVez} style={{ marginBottom: 10 }}>✅ Finalizar Minha Vez</button>
      )}

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
