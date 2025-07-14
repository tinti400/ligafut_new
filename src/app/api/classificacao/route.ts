// src/app/api/classificacao/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("classificacao_com_nome")
    .select("*")
    .eq("temporada", 1); // Mantém o filtro da temporada, mas remove o filtro de divisão

  if (error) {
    console.error("Erro ao buscar classificação:", error);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  // Formatar estrutura esperada no front
  const formatado = data.map((item) => ({
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
      logo_url: item.logo_url || "/logo_padrao.png", // padrão se não tiver logo
    },
  }));

  return NextResponse.json(formatado);
}
