import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateTable } from '@/lib/ligafut/calculateTable'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type TimeDb = {
  id: string
  nome: string
  logo: string | null
}

const TIMES_FIXOS = [
  'Cruzeiro',
  'Atletico-MG',
  'Palmeiras',
  'Corinthians',
  'Vasco',
  'Botafogo',
]

function normalizarNome(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ competicaoId: string }> }
) {
  try {
    const { competicaoId } = await params

    if (!competicaoId || competicaoId === 'undefined') {
      return NextResponse.json(
        { error: 'competicaoId inválido ou não informado.' },
        { status: 400 }
      )
    }

    // 1) Buscar jogos da competição
    const { data: jogos, error: jogosError } = await supabase
      .from('competicao_jogos')
      .select('*')
      .eq('competicao_id', competicaoId)
      .order('rodada', { ascending: true })

    if (jogosError) throw jogosError

    // 2) Calcular classificação com base nos jogos finalizados
    const classificacaoBase = calculateTable(jogos || [])

    // 3) Buscar todos os times oficiais para garantir logo + times zerados
    const { data: timesDb, error: timesError } = await supabase
      .from('times')
      .select('id, nome, logo')
      .in('nome', TIMES_FIXOS)

    if (timesError) throw timesError

    const times = (timesDb || []) as TimeDb[]

    const mapaTimes = new Map(
      times.map((t) => [normalizarNome(t.nome), t])
    )

    const classificacaoComTodos = TIMES_FIXOS.map((nomeFixo) => {
      const timeDb = mapaTimes.get(normalizarNome(nomeFixo))

      const existente = classificacaoBase.find(
        (item: any) => normalizarNome(item.nome_time) === normalizarNome(nomeFixo)
      )

      return {
        posicao: 0,
        time_id: existente?.time_id || timeDb?.id || `placeholder-${nomeFixo}`,
        nome_time: timeDb?.nome || nomeFixo,
        pontos: existente?.pontos || 0,
        jogos: existente?.jogos || 0,
        vitorias: existente?.vitorias || 0,
        empates: existente?.empates || 0,
        derrotas: existente?.derrotas || 0,
        gols_pro: existente?.gols_pro || 0,
        gols_contra: existente?.gols_contra || 0,
        saldo_gols: existente?.saldo_gols || 0,
        logo: timeDb?.logo || null,
      }
    })

    // 4) Ordenar tabela
    classificacaoComTodos.sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos
      if (b.vitorias !== a.vitorias) return b.vitorias - a.vitorias
      if (b.saldo_gols !== a.saldo_gols) return b.saldo_gols - a.saldo_gols
      if (b.gols_pro !== a.gols_pro) return b.gols_pro - a.gols_pro
      return a.nome_time.localeCompare(b.nome_time)
    })

    const classificacaoFinal = classificacaoComTodos.map((item, index) => ({
      ...item,
      posicao: index + 1,
    }))

    return NextResponse.json({
      ok: true,
      classificacao: classificacaoFinal,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Erro ao buscar classificação.' },
      { status: 500 }
    )
  }
}