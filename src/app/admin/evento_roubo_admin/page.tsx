'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function EventoRouboAdminPage() {
  const [limiteBloqueios, setLimiteBloqueios] = useState(3)
  const [limitePerda, setLimitePerda] = useState(5)
  const [limiteRoubo, setLimiteRoubo] = useState(5)
  const [loading, setLoading] = useState(true)

  const idEvento = '56f3af29-a4ac-4a76-aeb3-35400aa2a773'

  useEffect(() => {
    carregarConfig()
  }, [])

  async function carregarConfig() {
    const { data } = await supabase
      .from('configuracoes')
      .select('*')
      .eq('id', idEvento)
      .single()

    if (data) {
      setLimiteBloqueios(data.limite_bloqueios || 3)
      setLimitePerda(data.limite_perda || 5)
      setLimiteRoubo(data.limite_roubo || 5)
    }
    setLoading(false)
  }

  async function iniciarEvento() {
    const { data: times } = await supabase
      .from('times')
      .select('id, nome')

    if (!times) return

    const palmeiras = times.find(t => t.nome.trim().toLowerCase() === 'palmeiras')
    const restantes = times.filter(t => t.id !== palmeiras?.id)
    const novaOrdem = palmeiras ? [palmeiras.id, ...embaralhar(restantes.map(t => t.id))] : embaralhar(times.map(t => t.id))

    await supabase
      .from('configuracoes')
      .update({
        ativo: true,
        fase: 'bloqueio',
        ordem: novaOrdem,
        vez: '0',
        roubos: {},
        bloqueios: {},
        ultimos_bloqueios: {},
        ja_perderam: {},
        concluidos: [],
        inicio: new Date().toISOString(),
        limite_bloqueios: limiteBloqueios,
        limite_perda: limitePerda,
        limite_roubo: limiteRoubo
      })
      .eq('id', idEvento)

    alert('✅ Evento iniciado com sucesso!')
    window.location.reload()
  }

  function embaralhar(array: any[]) {
    return array.sort(() => Math.random() - 0.5)
  }

  return (
    <div className="p-6 bg-gray-900 text-white rounded shadow-md max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">⚙️ Configurar Evento de Roubo</h1>

      {loading ? (
        <p className="text-center">Carregando configurações...</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block mb-1">🔒 Limite de Bloqueios</label>
            <input
              type="number"
              min={1}
              max={5}
              value={limiteBloqueios}
              onChange={(e) => setLimiteBloqueios(parseInt(e.target.value))}
              className="border p-2 rounded w-full text-black"
            />
          </div>

          <div>
            <label className="block mb-1">❌ Limite de Perda por Time</label>
            <input
              type="number"
              min={1}
              max={10}
              value={limitePerda}
              onChange={(e) => setLimitePerda(parseInt(e.target.value))}
              className="border p-2 rounded w-full text-black"
            />
          </div>

          <div>
            <label className="block mb-1">⚔️ Limite Total de Roubos</label>
            <input
              type="number"
              min={1}
              max={10}
              value={limiteRoubo}
              onChange={(e) => setLimiteRoubo(parseInt(e.target.value))}
              className="border p-2 rounded w-full text-black"
            />
          </div>

          <button
            onClick={iniciarEvento}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded mt-4"
          >
            ✅ Salvar e Iniciar Evento
          </button>
        </div>
      )}
    </div>
  )
}
