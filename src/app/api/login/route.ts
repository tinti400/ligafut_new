/// src/app/api/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { usuario, senha } = await req.json();

    if (!usuario || !senha) {
      return NextResponse.json({ error: "Usuário e senha são obrigatórios." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("usuarios")
      .select("id, usuario, nome, id_time, nome_time")
      .eq("usuario", usuario)
      .eq("senha", senha)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    return NextResponse.json({
      sucesso: true,
      id: data.id,
      usuario: data.usuario,
      nome: data.nome,
      id_time: data.id_time,
      nome_time: data.nome_time
    });
  } catch (err: any) {
    console.error("Erro inesperado na API de login:", err.message);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
