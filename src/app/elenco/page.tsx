'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { pagarBonusPatrocinador } from '@/utils/patrocinios'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function JogosPage() {
  const [rodadas, setRodadas] = useState<any[]>([])
  const [editandoRodada, setEditandoRodada] = useState<string | null>(null)
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null)
  const [golsMandante, setGolsMandante] = useState(0)
  const [golsVisitante, setGolsVisitante] = useState(0)
  const [isSalvando, setIsSalvando] = useState(false)
  const [timesMap, setTimesMap] = useState<any>({})
  const [classificacao, setClassificacao] = useState<any[]>([])
  const temporada = 2025 // ou variável dinâmica

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    const { data: dadosRodadas } = await supabase.from('rodadas').select('*')
    const { data: dadosTimes } = await supabase.from('times').select('id, nome')
    const { data: dadosClassificacao } = await supabase
      .from('classificacao')
      .select('id_time, posicao')
      .eq('temporada', temporada)

    const map: any = {}
    dadosTimes?.forEach((t) => {
      map[t.id] = { nome: t.nome }
    })

    setRodadas(dadosRodadas || [])
    setTimesMap(map)
    setClassificacao(dadosClassificacao || [])
  }

  const salvarResultado = async () => {
    if (isSalvando || editandoRodada === null || editandoIndex === null) return

    const confirmar = confirm('Deseja salvar o resultado e calcular a renda?')
    if (!confirmar) return

    setIsSalvando(true)

    const { data: rodadaAtualizada, error: erroRodada } = await supabase
      .from('rodadas')
      .select('jogos')
      .eq('id', editandoRodada)
      .single()

    if (erroRodada || !rodadaAtualizada) {
      toast.error('Erro ao buscar rodada atualizada!')
      setIsSalvando(false)
      return
    }

    const jogoDoBanco = rodadaAtualizada.jogos[editandoIndex]

    if (jogoDoBanco?.bonus_pago === true) {
      toast.error('❌ Bônus já foi pago para esse jogo!')
      setIsSalvando(false)
      return
    }

    const rodada = rodadas.find((r) => r.id === editandoRodada)
    if (!rodada) return

    const novaLista = [...rodada.jogos]
    const jogo = novaLista[editandoIndex]

    const publico = Math.floor(Math.random() * 30000) + 10000
    const precoMedio = 80
    const renda = publico * precoMedio

    const mandanteId = jogo.mandante
    const visitanteId = jogo.visitante

    // 💰 Atualiza saldo dos clubes com base na renda
    await supabase.rpc('atualizar_saldo', {
      id_time: mandanteId,
      valor: renda * 0.95,
    })
    await supabase.rpc('atualizar_saldo', {
      id_time: visitanteId,
      valor: renda * 0.05,
    })

    // 💸 Descontar salários e registrar como DESPESA
    const descontarSalariosComRegistro = async (timeId: string): Promise<number> => {
      const { data: elenco } = await supabase
        .from('elenco')
        .select('salario')
        .eq('id_time', timeId)

      if (!elenco) return 0

      const totalSalarios = elenco.reduce((acc, jogador) => acc + (jogador.salario || 0), 0)

      await supabase.rpc('atualizar_saldo', {
        id_time: timeId,
        valor: -totalSalarios,
      })

      const dataAgora = new Date().toISOString()

      await supabase.from('movimentacoes').insert({
        id_time: timeId,
        tipo: 'salario',
        valor: totalSalarios,
        descricao: 'Desconto de salários após partida',
        data: dataAgora,
      })

      await supabase.from('bid').insert({
        tipo_evento: 'despesas',
        descricao: 'Desconto de salários após a partida',
        id_time1: timeId,
        valor: -totalSalarios,
        data_evento: dataAgora,
      })

      return totalSalarios
    }

    const salariosMandante = await descontarSalariosComRegistro(mandanteId)
    const salariosVisitante = await descontarSalariosComRegistro(visitanteId)

    // 🏆 Premiar por desempenho da rodada
    const premiarPorJogo = async (id_time: string, golsPro: number, golsContra: number): Promise<number> => {
      const tipo = golsPro > golsContra ? 'vitoria' : golsPro === golsContra ? 'empate' : 'derrota'
      const { data: patrocinio } = await supabase
        .from('patrocinios_escolhidos')
        .select('valor_fixo, beneficio')
        .eq('id_time', id_time)
        .maybeSingle()

      if (!patrocinio) return 0
      if (patrocinio.beneficio !== tipo) return 0

      const valor = Number(patrocinio.valor_fixo || 0)

      await supabase.rpc('atualizar_saldo', {
        id_time,
        valor,
      })

      return valor
    }

    const premiacaoMandante: number = await premiarPorJogo(mandanteId, golsMandante, golsVisitante)
    const premiacaoVisitante: number = await premiarPorJogo(visitanteId, golsVisitante, golsMandante)

    // 📊 Registrar BID de receita (renda + bônus)
    await supabase.from('bid').insert([
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus)',
        id_time1: mandanteId,
        valor: renda * 0.95 + premiacaoMandante,
        data_evento: new Date().toISOString(),
      },
      {
        tipo_evento: 'receita_partida',
        descricao: 'Receita da partida (renda + bônus)',
        id_time1: visitanteId,
        valor: renda * 0.05 + premiacaoVisitante,
        data_evento: new Date().toISOString(),
      },
    ])

    // ✅ Atualiza o número de jogos dos jogadores
    const atualizarJogosElenco = async (timeId: string) => {
      const { data: jogadores } = await supabase
        .from('elenco')
        .select('id, jogos')
        .eq('id_time', timeId)

      if (!jogadores) return

      const updates = jogadores.map((jogador) =>
        supabase
          .from('elenco')
          .update({ jogos: (jogador.jogos || 0) + 1 })
          .eq('id', jogador.id)
      )

      await Promise.all(updates)
    }

    await atualizarJogosElenco(mandanteId)
    await atualizarJogosElenco(visitanteId)

    // 🏅 Pagar bônus de patrocinador
    const posMandante = classificacao.find((c) => c.id_time === mandanteId)?.posicao || 20
    const posVisitante = classificacao.find((c) => c.id_time === visitanteId)?.posicao || 20

    const bonusMandante = await pagarBonusPatrocinador(mandanteId, golsMandante, golsVisitante, posMandante)
    const bonusVisitante = await pagarBonusPatrocinador(visitanteId, golsVisitante, golsMandante, posVisitante)

    // Atualiza o jogo na rodada
    novaLista[editandoIndex] = {
      ...jogo,
      gols_mandante: golsMandante,
      gols_visitante: golsVisitante,
      renda,
      publico,
      bonus_pago: true,
    }

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodada.id)
    await fetch(`/api/classificacao?temporada=${temporada}`)
    await fetch('/api/atualizar-moral')
    await carregarDados()

    const mandanteNome = timesMap[mandanteId]?.nome || 'Mandante'
    const visitanteNome = timesMap[visitanteId]?.nome || 'Visitante'

    toast.success(
      `🎟️ Público: ${publico.toLocaleString()} | 💰 Renda: R$ ${renda.toLocaleString()}
💵 ${mandanteNome}: R$ ${(renda * 0.95).toLocaleString()} + bônus
💵 ${visitanteNome}: R$ ${(renda * 0.05).toLocaleString()} + bônus`,
      { duration: 8000 }
    )

    setEditandoRodada(null)
    setEditandoIndex(null)
    setIsSalvando(false)
  }

  return (
    <div className="p-6 text-white">
      {/* aqui você coloca o layout da rodada e os campos de edição */}
    </div>
  )
}
