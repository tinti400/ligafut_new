"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { FiRefreshCw, FiAward, FiTrendingUp, FiTarget } from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || "2025-26";

type Time = {
  id: string;
  nome: string;
  logo?: string | null;
  logo_url?: string | null;
  escudo?: string | null;
};

type Jogador = {
  id: string;
  id_time?: string | null;
  nome: string;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
  imagem_url?: string | null;
  foto?: string | null;
};

type EventoGol = {
  minuto?: number;
  tipo?: string;
  time_id?: string | null;
  time_nome?: string | null;
  jogador_id?: string | null;
  id_jogador?: string | null;
  jogador?: string | null;
  assistencia_id?: string | null;
  id_assistencia?: string | null;
  assistencia?: string | null;
  logo?: string | null;
};

type JogoLiga = {
  id: string;
  rodada?: number | null;
  id_time1?: string | null;
  id_time2?: string | null;
  gols_time1?: number | null;
  gols_time2?: number | null;
  status?: string | null;
  eventos_simulacao?: EventoGol[] | null;
};

type LinhaArtilharia = {
  key: string;
  jogador_id?: string | null;
  nome: string;
  id_time?: string | null;
  time_nome: string;
  foto?: string | null;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
  gols: number;
  jogos: Set<string>;
  rodadas: number[];
};

function dinheiro(v?: number | null) {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR")}`;
}

function fotoJogador(j?: Jogador | null) {
  return (
    j?.imagem_url ||
    j?.foto ||
    "/default-player.png"
  );
}

function logoTime(time?: Time | null) {
  return time?.logo_url || time?.logo || time?.escudo || "/default.png";
}

export default function LigaArtilhariaPage() {
  const [loading, setLoading] = useState(true);
  const [jogos, setJogos] = useState<JogoLiga[]>([]);
  const [times, setTimes] = useState<Time[]>([]);
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [busca, setBusca] = useState("");

  async function carregar() {
    setLoading(true);

    const { data: ligaAtual } = await supabase
      .from("liga")
      .select("id,temporada")
      .eq("temporada", TEMPORADA)
      .maybeSingle();

    const [{ data: timesData }, { data: elencoData }] = await Promise.all([
      supabase.from("times").select("id,nome,logo,logo_url,escudo"),
      supabase
        .from("elenco")
        .select("id,id_time,nome,posicao,overall,valor,imagem_url,foto"),
    ]);

    setTimes((timesData || []) as Time[]);
    setJogadores((elencoData || []) as Jogador[]);

    if (!ligaAtual?.id) {
      setJogos([]);
      setLoading(false);
      return;
    }

    const { data: jogosData, error } = await supabase
      .from("liga_jogos")
      .select("id,rodada,id_time1,id_time2,gols_time1,gols_time2,status,eventos_simulacao")
      .eq("liga_id", ligaAtual.id)
      .eq("status", "finalizado")
      .order("rodada", { ascending: true });

    if (error) {
      console.error("Erro ao carregar artilharia da Liga:", error);
    }

    setJogos((jogosData || []) as JogoLiga[]);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const timesMap = useMemo(() => {
    const map: Record<string, Time> = {};
    times.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [times]);

  const jogadoresMap = useMemo(() => {
    const map: Record<string, Jogador> = {};
    jogadores.forEach((j) => {
      map[j.id] = j;
    });
    return map;
  }, [jogadores]);

  const ranking = useMemo(() => {
    const map: Record<string, LinhaArtilharia> = {};

    for (const jogo of jogos) {
      const eventos = Array.isArray(jogo.eventos_simulacao)
        ? jogo.eventos_simulacao
        : [];

      for (const evento of eventos) {
        if (evento?.tipo !== "gol") continue;

        const jogadorId =
          evento.jogador_id ||
          evento.id_jogador ||
          (evento as any).jogadorId ||
          null;

        const nome = evento.jogador || "Jogador";
        const idTime = evento.time_id || null;
        const key = jogadorId || `${idTime || "sem_time"}:${nome}`;

        const jogadorBanco = jogadorId ? jogadoresMap[jogadorId] : null;
        const timeBanco = idTime ? timesMap[idTime] : null;

        if (!map[key]) {
          map[key] = {
            key,
            jogador_id: jogadorId,
            nome: jogadorBanco?.nome || nome,
            id_time: jogadorBanco?.id_time || idTime,
            time_nome:
              timeBanco?.nome ||
              evento.time_nome ||
              "Time não encontrado",
            foto: fotoJogador(jogadorBanco),
            posicao: jogadorBanco?.posicao || null,
            overall: jogadorBanco?.overall || null,
            valor: jogadorBanco?.valor || null,
            gols: 0,
            jogos: new Set<string>(),
            rodadas: [],
          };
        }

        map[key].gols += 1;
        map[key].jogos.add(jogo.id);

        if (jogo.rodada && !map[key].rodadas.includes(jogo.rodada)) {
          map[key].rodadas.push(jogo.rodada);
        }
      }
    }

    return Object.values(map)
      .sort(
        (a, b) =>
          b.gols - a.gols ||
          b.jogos.size - a.jogos.size ||
          String(a.nome).localeCompare(String(b.nome), "pt-BR"),
      )
      .filter((linha) => {
        const q = busca.trim().toLowerCase();
        if (!q) return true;

        return (
          linha.nome.toLowerCase().includes(q) ||
          linha.time_nome.toLowerCase().includes(q) ||
          String(linha.posicao || "").toLowerCase().includes(q)
        );
      });
  }, [jogos, jogadoresMap, timesMap, busca]);

  const lider = ranking[0];

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 text-zinc-100 space-y-6 sm:px-4 md:px-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-yellow-500/10 via-white/[0.04] to-emerald-500/10 p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black">
              <FiAward className="text-yellow-300" />
              Artilharia da Liga
            </h1>
            <p className="text-sm text-zinc-400">
              Gols registrados automaticamente pelos eventos da Liga — temporada {TEMPORADA}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/liga"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/20"
            >
              Voltar para Liga
            </Link>

            <Link
              href="/liga/assistencias"
              className="rounded-xl bg-sky-500/20 px-4 py-2 text-sm font-black text-sky-300 hover:bg-sky-500/30"
            >
              Assistências
            </Link>

            <button
              onClick={carregar}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-black hover:bg-emerald-400"
            >
              <FiRefreshCw /> Atualizar
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Líder</div>
            <div className="mt-1 text-lg font-black text-yellow-300">
              {lider?.nome || "-"}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Gols do líder</div>
            <div className="mt-1 text-lg font-black">{lider?.gols || 0}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Jogadores com gol</div>
            <div className="mt-1 text-lg font-black">{ranking.length}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              <FiTrendingUp /> Ranking de Gols
            </h2>
            <p className="text-sm text-zinc-400">
              Cada gol valoriza o atleta em +0,05% no momento em que o placar é salvo.
            </p>
          </div>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar jogador, time ou posição..."
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 md:w-80"
          />
        </div>

        {loading ? (
          <div className="py-10 text-center text-zinc-400">Carregando artilharia...</div>
        ) : ranking.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/25 p-8 text-center text-zinc-400">
            Nenhum gol encontrado ainda. Salve ou simule jogos da Liga para alimentar a artilharia.
          </div>
        ) : (
          <div className="grid gap-3">
            {ranking.map((linha, idx) => {
              const pos = idx + 1;
              const time = linha.id_time ? timesMap[linha.id_time] : null;

              return (
                <div
                  key={linha.key}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border p-3 ${
                    pos === 1
                      ? "border-yellow-400/40 bg-yellow-500/10"
                      : "border-white/10 bg-black/25"
                  }`}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 font-black">
                    {pos}
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={linha.foto || "/default-player.png"}
                      alt={linha.nome}
                      className="h-14 w-14 rounded-2xl bg-white/10 object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/default-player.png";
                      }}
                    />

                    <div className="min-w-0">
                      <div className="truncate text-base font-black">{linha.nome}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span>{linha.posicao || "POS"}</span>
                        <span>OVR {linha.overall || "-"}</span>
                        <span>{dinheiro(linha.valor)}</span>
                      </div>

                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                        <img
                          src={logoTime(time)}
                          alt={linha.time_nome}
                          className="h-5 w-5 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = "/default.png";
                          }}
                        />
                        <span>{linha.time_nome}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-yellow-300">{linha.gols}</div>
                    <div className="text-xs text-zinc-400">
                      gols em {linha.jogos.size} jogo(s)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
