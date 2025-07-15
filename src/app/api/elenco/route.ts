// src/app/api/elenco/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const id_time = req.nextUrl.searchParams.get("id_time");

    if (!id_time) {
      return NextResponse.json({ error: "id_time é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("elencos")
      .select("*")
      .eq("id_time", id_time);

    if (error) {
      console.error("Erro ao buscar elenco:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Erro inesperado na API elenco:", err.message);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
