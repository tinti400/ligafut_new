// src/app/api/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { usuario, senha } = await req.json();

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, usuario, nome, id_time")
    .eq("usuario", usuario)
    .eq("senha", senha)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
  }

  return NextResponse.json(data);
}
