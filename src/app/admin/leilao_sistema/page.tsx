'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import classNames from 'classnames'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Leilao = {
  id: string
  nome: string
  posicao: string
  overall: number
  nacionalidade?: string | null
  imagem_url?: string | null
  link_sofifa?: string | null
  valor_atual: number
  nome_time_vencedor?: string | null
  fim: string
  criado_em: string
  status: 'ativo' | 'leiloado' | 'cancelado'
  anterior?: string | null
}

export default function LeilaoSistemaPage() {
  const router = useRouter()

  // identidade do time em estado
  const [idTime, setIdTime] = useState<string | null>(null)
  const [nomeTime, setNomeTime] = useState<string | null>(null)

  // dados
  const [leiloes, setLeiloes] = useState<Leilao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [saldo, setSaldo] = useState<number | null>(null)

  // ui
  const [cooldownGlobal, setCooldownGlobal] = useState(false)
  const [cooldownPorLeilao, setCooldownPorLeilao] = useState<Record<string, boolean>>({})
  const [tremores, setTremores] = useState<Record<string, boolean>>({})
  const [erroTela, setErroTela] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const intervaloRef = useRef<NodeJS.Timeout | null>(null)

  // -------- utils ----------
  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const sane = (str: any) => {
    if (typeof str !== 'string') return null
    const s = str.trim()
    if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null
    return s
  }

  // normalizador de URL (https, sem aspas, ignora lixo)
  const normalizeUrl = (u?: string | null) => {
    if (!u) return ''
    let url = String(u).trim().replace(/^"(.*)"$/, '$1')
    if (url.startsWith('//')) url = 'https:' + url
    if (url.startsWith('http://')) url = 'https://' + url.slice(7)
    if (!/^https?:\/\//i.test(url)) return ''
    return url
  }

  // pega imagem do registro, tolerando variações de cabeçalho do Excel
  const pickImagemUrl = (row: any) => {
    const keys = [
      'imagem_url',
      'Imagem_url',
      'Imagem URL',
      'imagem URL',
      'imagemURL',
      'url_imagem',
      'URL_Imagem',
    ]
    for (const k of keys) {
      if (row?.[k]) {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }
    // fallback: se a coluna veio com espaços estranhos
    for (const k in row || {}) {
      if (k && k.replace(/\s+/g, '').toLowerCase() === 'imagem_url') {
        const fixed = normalizeUrl(row[k])
        if (fixed) return fixed
      }
    }
    return row?.imagem_url ? normalizeUrl(row.imagem_url) : ''
  }

  function carregarIdentidadeLocal() {
    try {
      const id_raw = typeof window !== 'undefined' ? localStorage.getItem('id_time') : null
      const nome_raw = typeof window !== 'undefined' ? localStorage.getItem('nome_time') : null

      let id = sane(id_raw)
      let nome = sane(nome_raw)

      if (!id || !nome) {
        const userStr =
          typeof window !== 'undefined'
            ? localStorage.getItem('user') || localStorage.getItem('usuario')
            : null
        if (userStr) {
          try {
            const obj = JSON.parse(userStr)
            if (!id) id = sane(obj?.id_time || obj?.time_id || obj?.idTime)
            if (!nome) nome = sane(obj?.nome_time || obj?.nomeTime || obj?.time_nome || obj?.nome)
          } catch {}
        }
      }

      setIdTime(id || null)
      setNomeTime(nome || null)
    } catch {
      setIdTime(null)
      setNomeTime(null)
    }
  }

  // Se id_time não for UUID, busca pelo nome do time e corrige no localStorage
  async function garantirIdTimeValido() {
    try {
      if (idTime && isUuid(idTime)) return
      if (!nomeTime) return
      const { data, error } = await supabase
        .from('times')
        .select('id')
        .eq('nome', nomeTime)
        .single()
      if (!error && data?.id && isUuid(data.id)) {
        localStorage.setItem('id_time', data.id)
        setIdTime(data.id)
      }
    } catch {
      /* ignore */
    }
  }

  const buscarSaldo = async () => {
    if (!idTime || !isUuid(idTime)) return
    const { data, error } = await supabase.from('times').select('saldo').eq('id', idTime).single()
    if (!error && data) setSaldo(data.saldo)
    else setSaldo(null)
  }

  const buscarLeiloesAtivos = async () => {
    const { data, error } = await supabase
      .from('leiloes_sistema')
      .select('*')
      .eq('status', 'ativo')
      .order('criado_em', { ascending: true })
      .limit(3)

    if (!error && data) {
      // normaliza imagem_url para garantir que a URL do Excel funcione
      const arr = data.map((l: any) => ({
        ...l,
        imagem_url: pickImagemUrl(l) || null,
      }))

      arr.forEach((leilao: any) => {
        if (leilao.nome_time_vencedor !== nomeTime && leilao.anterior === nomeTime) {
          audioRef.current?.play().catch(() => {})
        }
      })
      setLeiloes(arr as Leilao[])
    }
  }

  useEffect(() => {
    carregarIdentidadeLocal()
  }, [])

  useEffect(() => {
    garantirIdTimeValido()
  }, [nomeTime, idTime])

  useEffect(() => {
    ;(async () => {
      await Promise.all([buscarLeiloesAtivos(), buscarSaldo()])
      setCarregando(false)
    })()

    if (intervaloRef.current) clearInterval(intervaloRef.current)
    intervaloRef.current = setInterval(() => {
      buscarLeiloesAtivos()
      buscarSaldo()
    }, 1000)

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTime, nomeTime])

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0')
    const sec = Math.max(0, Math.floor(segundos % 60)).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  const corBorda = (valor: number) => {
    if (valor >= 360_000_000) return 'border-red-500'
    if (valor >= 240_000_000) return 'border-purple-500'
    if (valor >= 120_000_000) return 'border-blue-500'
    return 'border-green-400'
  }

  const travadoPorIdentidade = useMemo(() => {
    if (!idTime || !isUuid(idTime) || !nomeTime)
      return 'Identificação do time inválida. Faça login novamente.'
    return null
  }, [idTime, nomeTime])

  async function darLance(
    leilaoId: string,
    valorAtual: number,
    incremento: number,
    tempoRestante: number
  ) {
    setErroTela(null)

    await garantirIdTimeValido()
    if (travadoPorIdentidade) {
      setErroTela(travadoPorIdentidade)
      return
    }
    if (cooldownGlobal || cooldownPorLeilao[leilaoId]) return

    const novoValor = Number(valorAtual) + Number(incremento)

    if (saldo !== null && novoValor > saldo) {
      setErroTela('Saldo insuficiente para este lance.')
      return
    }

    setCooldownGlobal(true)
    setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: true }))
    setTremores((prev) => ({ ...prev, [leilaoId]: true }))

    try {
      const { data: atual, error: e1 } = await supabase
        .from('leiloes_sistema')
        .select('status, valor_atual, fim')
        .eq('id', leilaoId)
        .single()
      if (e1 || !atual) throw new Error('Não foi possível validar o leilão.')
      if (atual.status !== 'ativo') throw new Error('Leilão não está mais ativo.')
      const fimMs = new Date(atual.fim).getTime()
      if (isNaN(fimMs) || fimMs - Date.now() <= 0) throw new Error('Leilão encerrado.')

      const { error } = await supabase.rpc('dar_lance_no_leilao', {
        p_leilao_id: leilaoId,
        p_valor_novo: novoValor,
        p_id_time_vencedor: idTime,
        p_nome_time_vencedor: nomeTime,
        p_estender: tempoRestante < 15
      })
      if (error) {
        console.error('RPC error:', error)
        throw new Error(error.message || 'Falha ao registrar lance.')
      }

      await buscarLeiloesAtivos()
      await buscarSaldo()
    } catch (err: any) {
      setErroTela(err?.message || 'Erro ao dar lance.')
    } finally {
      setTimeout(() => setCooldownGlobal(false), 300)
      setTimeout(() => {
        setCooldownPorLeilao((prev) => ({ ...prev, [leilaoId]: false }))
        setTremores((prev) => ({ ...prev, [leilaoId]: false }))
      }, 150)
    }
  }

  const finalizarLeilaoAgora = async (leilaoId: string) => {
    if (!confirm('Deseja finalizar esse leilão agora?')) return
    const { error } = await supabase
      .from('leiloes_sistema')
      .update({ status: 'leiloado' })
      .eq('id', leilaoId)

    if (error) alert('Erro ao finalizar leilão: ' + error.message)
    else {
      alert('Leilão finalizado!')
      await buscarLeiloesAtivos()
    }
  }

  if (carregando) return <div className="p-6 text-white">⏳ Carregando...</div>

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
      <audio ref={audioRef} src="/beep.mp3" preload="auto" />

      <div className="mb-4 w-full max-w-6xl">
        <div className="flex flex-col gap-2">
          <div className="text-lg font-semibold text-green-400">
            💳 Saldo atual do seu time: R$ {saldo !== null ? saldo.toLocaleString() : '...'}
          </div>
          {travadoPorIdentidade && (
            <div className="text-sm text-red-400">⚠️ {travadoPorIdentidade}</div>
          )}
          {erroTela && <div className="text-sm text-yellow-300">⚠️ {erroTela}</div>}
        </div>
      </div>

      {leiloes.length === 0 ? (
        <div className="p-6 text-white">⚠️ Nenhum leilão ativo no momento.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
          {leiloes.map((leilao, index) => {
            const tempoFinal = new Date(leilao.fim).getTime()
            const agora = Date.now()
            let tempoRestante = Math.floor((tempoFinal - agora) / 1000)
            if (!isFinite(tempoRestante) || tempoRestante < 0) tempoRestante = 0

            const tremorClass = tremores[leilao.id] ? 'animate-pulse scale-105' : ''
            const borderClass = classNames('border-2 rounded-xl', corBorda(leilao.valor_atual))

            const disabledPorTempo = tempoRestante === 0
            const disabledPorIdentidade = !!travadoPorIdentidade
            const disabledPorCooldown = cooldownGlobal || !!cooldownPorLeilao[leilao.id]

            return (
              <div
                key={leilao.id}
                className={`bg-gray-800 ${borderClass} shadow-2xl p-6 text-center transition-transform duration-300 ${tremorClass}`}
              >
                <h1 className="text-xl font-bold mb-4 text-green-400">⚔️ Leilão #{index + 1}</h1>

                {leilao.imagem_url && (
                  <img
                    src={leilao.imagem_url}
                    alt={leilao.nome}
                    className="w-24 h-24 object-cover rounded-full mx-auto mb-2 border-2 border-green-400"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                      console.warn('Imagem falhou:', leilao.imagem_url)
                    }}
                  />
                )}

                <h2 className="text-xl font-bold mb-1">
                  {leilao.nome} <span className="text-sm">({leilao.posicao})</span>
                </h2>
                <p className="mb-1">
                  ⭐ Overall: <strong>{leilao.overall}</strong>
                </p>
                {leilao.nacionalidade && (
                  <p className="mb-1">
                    🌍 Nacionalidade: <strong>{leilao.nacionalidade}</strong>
                  </p>
                )}
                <p className="mb-2 text-green-400 text-lg font-bold">
                  💰 R$ {Number(leilao.valor_atual).toLocaleString()}
                </p>

                {leilao.nome_time_vencedor && (
                  <p className="mb-3 text-sm text-gray-300">
                    👑 Último lance: <strong>{leilao.nome_time_vencedor}</strong>
                  </p>
                )}

                <div className="text-lg font-mono bg-black text-white inline-block px-4 py-1 rounded-lg mb-3 shadow">
                  ⏱️ {formatarTempo(tempoRestante)}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[4_000_000, 6_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000].map(
                    (inc) => {
                      const disabled =
                        disabledPorTempo ||
                        disabledPorIdentidade ||
                        disabledPorCooldown ||
                        (saldo !== null && Number(leilao.valor_atual) + inc > saldo)

                      return (
                        <button
                          key={inc}
                          onClick={() => darLance(leilao.id, leilao.valor_atual, inc, tempoRestante)}
                          disabled={disabled}
                          title={
                            disabledPorTempo
                              ? '⏱️ Leilão encerrado'
                              : disabledPorIdentidade
                              ? '🔐 Faça login novamente (time não identificado)'
                              : saldo !== null && Number(leilao.valor_atual) + inc > saldo
                              ? '💸 Saldo insuficiente'
                              : disabledPorCooldown
                              ? '⏳ Aguarde um instante...'
                              : ''
                          }
                          className="bg-green-600 hover:bg-green-700 text-white py-1 rounded text-xs font-bold transition disabled:opacity-50"
                        >
                          + R$ {(inc / 1_000_000).toLocaleString()} mi
                        </button>
                      )
                    }
                  )}
                </div>

                {leilao.link_sofifa && (
                  <a
                    href={leilao.link_sofifa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline text-sm hover:text-blue-300 transition"
                  >
                    🔗 Ver no Sofifa
                  </a>
                )}

                {tempoRestante === 0 && (
                  <button
                    onClick={() => finalizarLeilaoAgora(leilao.id)}
                    className="mt-3 bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded text-sm"
                  >
                    Finalizar Leilão
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
