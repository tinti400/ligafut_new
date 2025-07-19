// src/app/api/classificacao/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const temporada = parseInt(searchParams.get('temporada') || '1', 10)

    const { data, error } = await supabase
      .from("classificacao_com_nome")
      .select("*")
      .eq("temporada", temporada)

    if (error) {
      console.error("Erro ao buscar classificação:", error)
      return NextResponse.json({ erro: error.message }, { status: 500 })
    }

    const formatado = (data || []).map((item: any) => ({
      id_time: item.id_time,
      pontos: item.pontos,
      vitorias: item.vitorias,
      empates: item.empates,
      derrotas: item.derrotas,
      gols_pro: item.gols_pro,
      gols_contra: item.gols_contra,
      saldo_gols: item.saldo_gols,
      divisao: item.divisao,
      times: {
        nome: item.nome_time,
        logo_url: item.logo_url || "/logo_padrao.png",
      },
    }))

    return NextResponse.json(formatado)
  } catch (err: any) {
    console.error("Erro inesperado:", err)
    return NextResponse.json({ erro: err.message }, { status: 500 })
  }
}
