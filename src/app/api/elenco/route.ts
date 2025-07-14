import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔐 Conexão com o Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 📥 GET /api/elenco?id_time=XXX
export async function GET(req: NextRequest) {
  const id_time = req.nextUrl.searchParams.get("id_time");

  // 🚫 Verificação do parâmetro
  if (!id_time) {
    return NextResponse.json({ error: "id_time é obrigatório" }, { status: 400 });
  }

  // 🔄 Busca no Supabase
  const { data, error } = await supabase
    .from("elencos") // Certifique-se de que sua tabela se chama "elencos"
    .select("*")
    .eq("id_time", id_time);

  // ❌ Tratamento de erro
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ✅ Retorno dos dados
  return NextResponse.json(data);
}
