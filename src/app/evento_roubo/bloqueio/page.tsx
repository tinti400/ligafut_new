'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/** ================== Supabase ================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/** ================== Tipos ================== */
interface Jogador {
  id: string
  nome: string
  posicao: string
}

interface Bloqueado {
  id: string
  nome: string
  posicao: string
}

/**
 * Documento em `configuracoes` (id fixo do evento):
 * {
 *   id: '56f3af29-a4ac-4a76-aeb3-35400aa2a773',
 *   limite_bloqueios: number,
 *   bloqueios: Record<id_time, Bloqueado[]>,
 *   bloqueios_anteriores: Record<id_time, Bloqueado[]>
 * }
 */
const CONFIG_ID = '56f3af29-a4ac-4a76-aeb3-35400aa2a773'

export default function BloqueioPage() {
  const [jogadores, setJogadores] = useState<Jogador[]>([])
  const [bloqueadosAtuais, setBloqueadosAtuais] = useState<Bloqueado[]>([])
  const [bloqueadosAnteriores, setBloqueadosAnteriores] = useState<Bloqueado[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])

  // Limite base (config) e bônus por patrocinador
  const [limiteBase, setLimiteBase] = useState<number>(3)
  const [bonusExtra, setBonusExtra] = useState<number>(0) // +1 se Ambev master

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const idTime =
    typeof window !== 'undefined' ? localStorage.getItem('id_time') || '' : ''

  /** ================== Carregamento ================== */
  useEffect(() => {
    if (!idTime) return
    ;(async () => {
      setLoading(true)
      await Promise.all([carregarConfig(), carregarElenco(), checarPatrocinioBonus()])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idTime])

  async function carregarConfig() {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('limite_bloqueios, bloqueios, bloqueios_anteriores')
      .eq('id', CONFIG_ID)
      .single()

    if (error) {
      console.error('Erro ao carregar configuracoes:', error)
      return
    }

    if (data) {
      setLimiteBase(data.limite_bloqueios ?? 3)

      const atual: Record<string, Bloqueado[]> = data.bloqueios || {}
      setBloqueadosAtuais(atual?.[idTime] ?? [])

      const anteriores: Record<string, Bloqueado[]> = data.bloqueios_anteriores || {}
      setBloqueadosAnteriores(anteriores?.[idTime] ?? [])
    }
  }

  async function carregarElenco() {
    const { data, error } = await supabase
      .from('elenco')
      .select('id, nome, posicao')
      .eq('id_time', idTime)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao carregar elenco:', error)
      return
    }
    setJogadores(data || [])
  }

  /**
   * Bônus por patrocinador:
   * — se `id_patrocinio_master` contém "ambev", concede **+1** bloqueio.
   * Busca pelo **id_time** (e faz fallback para id_time_uuid se necessário).
   */
  async function checarPatrocinioBonus() {
    // Prioriza buscar por id_time (conforme pedido)
    let { data, error } = await supabase
      .from('patrocinios_escolhidos')
      .select('id_patrocinio_master')
      .eq('id_time', idTime)
      .order('criado_em', { ascending: false })
      .limit(1)

    // Fallback: alguns esquemas usam id_time_uuid
    if ((!data || data.length === 0) && !error) {
      const fb = await supabase
        .from('patrocinios_escolhidos')
        .select('id_patrocinio_master')
        .eq('id_time_uuid', idTime)
        .order('criado_em', { ascending: false })
        .limit(1)
      data = fb.data
      error = fb.error
    }

    if (error) {
      console.error('Erro ao checar patrocinio:', error)
      setBonusExtra(0)
      return
    }

    const registro = data?.[0]
    const master = (registro?.id_patrocinio_master || '').toString().toLowerCase()

    // Regra: Ambev (ex.: "ambev_master_1/2/3") => +1 bloqueio
    const extra =
      master.includes('ambev') ? 1 : 0

    setBonusExtra(extra)
  }

  /** ================== Derivados ================== */
  const limiteBloqueios = useMemo(
    () => limiteBase + bonusExtra,
    [limiteBase, bonusExtra]
  )

  const setIdsBloqueadosAtuais = useMemo(
    () => new Set(bloqueadosAtuais.map((b) => b.id)),
    [bloqueadosAtuais]
  )
  const setIdsBloqueadosAnteriores = useMemo(
    () => new Set(bloqueadosAnteriores.map((b) => b.id)),
    [bloqueadosAnteriores]
  )

  const jogadoresDisponiveis = useMemo(() => {
    return jogadores.filter(
      (j) => !setIdsBloqueadosAtuais.has(j.id) && !setIdsBloqueadosAnteriores.has(j.id)
    )
  }, [jogadores, setIdsBloqueadosAtuais, setIdsBloqueadosAnteriores])

  const totalJaMarcados = bloqueadosAtuais.length + selecionados.length
  const restantes = Math.max(limiteBloqueios - totalJaMarcados, 0)

  /** ================== Interações ================== */
  function toggleSelecionado(id: string) {
    if (!selecionados.includes(id)) {
      if (totalJaMarcados >= limiteBloqueios) return
      setSelecionados((prev) => [...prev, id])
    } else {
      setSelecionados((prev) => prev.filter((x) => x !== id))
    }
  }

  async function confirmarBloqueio() {
    if (!idTime) {
      alert('⚠️ ID do time não encontrado. Faça login novamente.')
      return
    }
    if (selecionados.length === 0) {
      alert('Selecione pelo menos um jogador!')
      return
    }

    const mapaJogador = new Map(jogadores.map((j) => [j.id, j]))
    const novosBloqueios: Bloqueado[] = selecionados
      .map((id) => {
        const j = mapaJogador.get(id)
        return j ? { id: j.id, nome: j.nome, posicao: j.posicao } : null
      })
      .filter(Boolean) as Bloqueado[]

    setSalvando(true)

    const { data: cfg, error: errCfg } = await supabase
      .from('configuracoes')
      .select('bloqueios')
      .eq('id', CONFIG_ID)
      .single()

    if (errCfg) {
      console.error('Erro ao ler config atual:', errCfg)
      setSalvando(false)
      alert('Erro ao salvar. Tente novamente.')
      return
    }

    const atual: Record<string, Bloqueado[]> = (cfg?.bloqueios || {}) as any
    const listaAtualDoTime = Array.isArray(atual[idTime]) ? atual[idTime] : []

    const setExistentes = new Set(listaAtualDoTime.map((b) => b.id))
    const mesclados = [
      ...listaAtualDoTime,
      ...novosBloqueios.filter((b) => !setExistentes.has(b.id)),
    ]

    // Aplica o limite final (com extra se houver)
    const respeitandoLimite = mesclados.slice(0, limiteBloqueios)

    const novoObjeto = { ...atual, [idTime]: respeitandoLimite }

    const { error: errUpdate } = await supabase
      .from('configuracoes')
      .update({ bloqueios: novoObjeto })
      .eq('id', CONFIG_ID)

    setSalvando(false)

    if (errUpdate) {
      console.error('Erro ao atualizar bloqueios:', errUpdate)
      alert('Erro ao salvar bloqueios. Tente novamente.')
      return
    }

    setBloqueadosAtuais(respeitandoLimite)
    setSelecionados([])
    alert('✅ Jogadores bloqueados com sucesso!')
  }

  /** ================== UI ================== */
  return (
    <div className="p-6 text-white max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-4 text-center">🛡️ Bloqueio de Jogadores</h1>

      {!idTime ? (
        <p className="text-center text-red-400">
          ⚠️ ID do time não encontrado. Faça login novamente.
        </p>
      ) : loading ? (
        <p className="text-center">Carregando...</p>
      ) : (
        <>
          <div className="mb-4 text-center">
            <p className="mb-2">
              Limite base: <strong>{limiteBase}</strong>
              {bonusExtra > 0 && (
                <>
                  {' '}• bônus do patrocinador: <strong>+{bonusExtra}</strong>
                </>
              )}
            </p>
            <p className="mb-2">
              Limite total nesta rodada: <strong>{limiteBloqueios}</strong>
            </p>

            {bloqueadosAtuais.length > 0 && (
              <div className="bg-gray-800 p-3 rounded mb-2">
                <p className="font-semibold mb-2 text-green-400">
                  🔒 Já bloqueados nesta rodada:
                </p>
                <ul className="flex flex-wrap gap-2 justify-center">
                  {bloqueadosAtuais.map((j) => (
                    <li key={j.id} className="bg-green-700 px-2 py-1 rounded text-xs">
                      {j.nome} ({j.posicao})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {bloqueadosAnteriores.length > 0 && (
              <div className="bg-gray-900 p-3 rounded mb-2 border border-yellow-600">
                <p className="font-semibold mb-2 text-yellow-400">
                  ⚠️ Protegidos no evento anterior (cooldown):
                </p>
                <ul className="flex flex-wrap gap-2 justify-center">
                  {bloqueadosAnteriores.map((j) => (
                    <li key={j.id} className="bg-yellow-700 px-2 py-1 rounded text-xs">
                      {j.nome} ({j.posicao})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-sm text-gray-300">
              Restantes nesta rodada: <strong>{restantes}</strong>
            </p>
          </div>

          {bloqueadosAtuais.length >= limiteBloqueios ? (
            <div className="text-center text-green-400 font-bold">
              ✅ Você já atingiu o limite de bloqueios!
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {jogadoresDisponiveis.map((j) => {
                  const selecionado = selecionados.includes(j.id)
                  return (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => toggleSelecionado(j.id)}
                      className={`p-2 rounded border cursor-pointer text-center transition-colors ${
                        selecionado
                          ? 'bg-green-600 border-green-400'
                          : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                      }`}
                    >
                      <p className="font-semibold">{j.nome}</p>
                      <p className="text-xs text-gray-300">{j.posicao}</p>
                    </button>
                  )
                })}

                {jogadoresDisponiveis.length === 0 && (
                  <div className="col-span-2 text-center text-gray-300 py-6">
                    Nenhum jogador disponível para bloqueio.
                  </div>
                )}
              </div>

              <button
                onClick={confirmarBloqueio}
                disabled={selecionados.length === 0 || salvando}
                className={`w-full text-white py-2 rounded font-bold ${
                  selecionados.length === 0 || salvando
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {salvando ? 'Salvando...' : '✅ Confirmar Bloqueio'}
              </button>
            </>
          )}
        </>
      )}

      {/* ====== Dica para a fase de ROUBO ======
        Para não mostrar jogadores bloqueados/cooldown do time-alvo:

        const setBloq = new Set((config.bloqueios?.[id_time_alvo] || []).map((b: Bloqueado) => b.id))
        const setCd   = new Set((config.bloqueios_anteriores?.[id_time_alvo] || []).map((b: Bloqueado) => b.id))
        const elencoDisponivel = elencoAlvo.filter((j: Jogador) => !setBloq.has(j.id) && !setCd.has(j.id))
      */}
    </div>
  )
}
