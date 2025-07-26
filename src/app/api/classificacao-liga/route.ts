import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const temporada = Number(searchParams.get('temporada'))
    const divisao = Number(searchParams.get('divisao'))

    if (!temporada || !divisao) {
      return NextResponse.json({ error: 'Temporada e divisão são obrigatórios.' }, { status: 400 })
    }

    const classificacao = await prisma.classificacao.findMany({
      where: {
        temporada: temporada,
        divisao: divisao
      },
      include: { times: true },
      orderBy: [{ pontos: 'desc' }, { saldo_gols: 'desc' }]
    })

    return NextResponse.json(classificacao)
  } catch (error) {
    console.error('Erro ao buscar classificação:', error)
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 })
  }
}
