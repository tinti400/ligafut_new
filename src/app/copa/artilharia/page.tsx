"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";
import { FiAward, FiRefreshCw, FiTrendingUp, FiTarget } from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || "2025-26";

type GolArtilharia = {
  id: string;
  copa_id: string | null;
  jogo_id: string | null;
  id_time: string | null;
  id_jogador: string | null;
  nome_jogador: string | null;
  nome_time: string | null;
  gols: number | null;
  minuto: number | null;
  created_at: string | null;
};

type CopaJogoHistorico = {
  id: string;
  copa_id: string;
  id_time1: string | null;
  id_time2: string | null;
  eventos_simulacao: any[] | null;
};

type Time = {
  id: string;
  nome: string;
  logo?: string | null;
  logo_url?: string | null;
};

type JogadorElenco = {
  id: string;
  nome: string;
  id_time: string;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
  imagem_url?: string | null;
  foto?: string | null;
};

type RankingArtilheiro = {
  id_jogador: string;
  nome_jogador: string;
  id_time: string;
  nome_time: string;
  gols: number;
  minutos: number[];
  ultimo_gol?: string | null;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
  imagem_url?: string | null;
  logo_time?: string | null;
};

function dinheiro(valor?: number | null) {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR")}`;
}

function fotoJogador(j?: RankingArtilheiro) {
  return j?.imagem_url || "/default-player.png";
}

export default function ArtilhariaCopaPage() {
  const [loading, setLoading] = useState(true);
  const [gols, setGols] = useState<GolArtilharia[]>([]);
  const [times, setTimes] = useState<Time[]>([]);
  const [elenco, setElenco] = useState<JogadorElenco[]>([]);
  const [busca, setBusca] = useState("");

  async function carregarDados() {
    setLoading(true);

    try {
      const { data: copaAtual, error: copaError } = await supabase
        .from("copa")
        .select("id, temporada")
        .eq("temporada", TEMPORADA)
        .maybeSingle();

      if (copaError) {
        console.error(copaError);
        toast.error("Erro ao buscar Copa atual.");
      }

      const copaId = copaAtual?.id;

      const [
        { data: golsData, error: golsError },
        { data: jogosHistorico, error: jogosError },
        { data: timesData, error: timesError },
        { data: elencoData, error: elencoError },
      ] = await Promise.all([
        copaId
          ? supabase
              .from("artilharia_copa")
              .select("*")
              .eq("copa_id", copaId)
              .order("created_at", { ascending: false })
          : supabase
              .from("artilharia_copa")
              .select("*")
              .order("created_at", { ascending: false }),

        copaId
          ? supabase
              .from("copa_jogos")
              .select("id, copa_id, id_time1, id_time2, eventos_simulacao")
              .eq("copa_id", copaId)
          : supabase
              .from("copa_jogos")
              .select("id, copa_id, id_time1, id_time2, eventos_simulacao"),

        supabase.from("times").select("id, nome, logo, logo_url"),

        supabase
          .from("elenco")
          .select("id, nome, id_time, posicao, overall, valor, imagem_url, foto"),
      ]);

      if (golsError) {
        console.error(golsError);
        toast.error("Erro ao carregar artilharia.");
      }

      if (jogosError) {
        console.error(jogosError);
        toast.error("Erro ao carregar histórico dos jogos.");
      }

      if (timesError) {
        console.error(timesError);
        toast.error("Erro ao carregar times.");
      }

      if (elencoError) {
        console.error(elencoError);
        toast.error("Erro ao carregar elenco.");
      }

      const golsTabela = (golsData || []) as GolArtilharia[];
      const golsDoHistorico: GolArtilharia[] = [];

      ((jogosHistorico || []) as CopaJogoHistorico[]).forEach((jogo) => {
        const eventos = Array.isArray(jogo.eventos_simulacao)
          ? jogo.eventos_simulacao
          : [];

        eventos
          .filter((evento) => evento?.tipo === "gol")
          .forEach((evento, index) => {
            const idTime =
              evento.id_time ||
              evento.time_id ||
              evento.timeId ||
              null;

            const idJogador =
              evento.id_jogador ||
              evento.jogador_id ||
              evento.jogadorId ||
              null;

            const nomeJogador =
              evento.jogador ||
              evento.nome_jogador ||
              evento.nomeJogador ||
              "Jogador";

            const nomeTimeEvento =
              evento.nome_time ||
              evento.time ||
              null;

            golsDoHistorico.push({
              id: `historico_${jogo.id}_${index}`,
              copa_id: jogo.copa_id,
              jogo_id: jogo.id,
              id_time: idTime,
              id_jogador: idJogador,
              nome_jogador: nomeJogador,
              nome_time: nomeTimeEvento,
              gols: 1,
              minuto: Number(evento.minuto || 0),
              created_at: null,
            });
          });
      });

      const chavesTabela = new Set(
        golsTabela.map(
          (g) =>
            `${g.jogo_id}_${g.id_jogador || g.nome_jogador}_${g.minuto}`,
        ),
      );

      const historicoSemDuplicar = golsDoHistorico.filter((g) => {
        const chave = `${g.jogo_id}_${g.id_jogador || g.nome_jogador}_${g.minuto}`;
        return !chavesTabela.has(chave);
      });

      setGols([...golsTabela, ...historicoSemDuplicar]);
      setTimes((timesData || []) as Time[]);
      setElenco((elencoData || []) as JogadorElenco[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro inesperado ao carregar artilharia.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const timesMap = useMemo(() => {
    const map: Record<string, Time> = {};

    times.forEach((t) => {
      map[t.id] = t;
    });

    return map;
  }, [times]);

  const elencoMap = useMemo(() => {
    const map: Record<string, JogadorElenco> = {};

    elenco.forEach((j) => {
      map[j.id] = j;
    });

    return map;
  }, [elenco]);

  const ranking = useMemo(() => {
    const map: Record<string, RankingArtilheiro> = {};

    gols.forEach((g) => {
      const jogadorId = g.id_jogador || `${g.nome_jogador}_${g.id_time}`;
      const timeId = g.id_time || "";
      const jogadorElenco = g.id_jogador ? elencoMap[g.id_jogador] : undefined;
      const time = timeId ? timesMap[timeId] : undefined;

      if (!map[jogadorId]) {
        map[jogadorId] = {
          id_jogador: jogadorId,
          nome_jogador: g.nome_jogador || jogadorElenco?.nome || "Jogador",
          id_time: timeId,
          nome_time: g.nome_time || time?.nome || "Time",
          gols: 0,
          minutos: [],
          ultimo_gol: g.created_at,
          posicao: jogadorElenco?.posicao || null,
          overall: jogadorElenco?.overall || null,
          valor: jogadorElenco?.valor || null,
          imagem_url: jogadorElenco?.imagem_url || jogadorElenco?.foto || null,
          logo_time: time?.logo_url || time?.logo || null,
        };
      }

      map[jogadorId].gols += Number(g.gols || 1);

      if (g.minuto !== null && g.minuto !== undefined) {
        map[jogadorId].minutos.push(Number(g.minuto));
      }

      if (
        g.created_at &&
        (!map[jogadorId].ultimo_gol ||
          g.created_at > map[jogadorId].ultimo_gol!)
      ) {
        map[jogadorId].ultimo_gol = g.created_at;
      }
    });

    return Object.values(map).sort((a, b) => {
      return (
        b.gols - a.gols ||
        Number(b.overall || 0) - Number(a.overall || 0) ||
        String(a.nome_jogador).localeCompare(String(b.nome_jogador), "pt-BR")
      );
    });
  }, [gols, elencoMap, timesMap]);

  const rankingFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();

    if (!q) return ranking;

    return ranking.filter(
      (r) =>
        r.nome_jogador.toLowerCase().includes(q) ||
        r.nome_time.toLowerCase().includes(q) ||
        String(r.posicao || "").toLowerCase().includes(q),
    );
  }, [ranking, busca]);

  const totalGols = ranking.reduce((acc, r) => acc + r.gols, 0);
  const lider = ranking[0];

  if (loading) {
    return (
      <div className="min-h-screen p-6 text-white">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          Carregando artilharia...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 text-zinc-100 space-y-6">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-yellow-500/10 via-white/[0.04] to-emerald-500/10 p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
              <FiAward className="text-yellow-300" />
              Artilharia da Copa LigaFut
            </h1>

            <p className="text-sm text-zinc-400 mt-1">
              Ranking de goleadores da Copa • temporada {TEMPORADA}
            </p>
          </div>

          <button
            onClick={carregarDados}
            className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/20 flex items-center gap-2"
          >
            <FiRefreshCw />
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Total de gols</div>
            <div className="text-2xl font-black text-emerald-300">
              {totalGols}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Jogadores que marcaram</div>
            <div className="text-2xl font-black">{ranking.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Artilheiro atual</div>
            <div className="truncate text-lg font-black text-yellow-300">
              {lider?.nome_jogador || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-xs text-zinc-400">Clube do artilheiro</div>
            <div className="truncate text-lg font-black">
              {lider?.nome_time || "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar jogador, time ou posição..."
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 outline-none focus:border-emerald-400/60"
        />
      </div>

      {rankingFiltrado.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-400">
          Nenhum gol registrado ainda.
        </div>
      ) : (
        <div className="grid gap-4">
          {rankingFiltrado.map((jogador, index) => {
            const posicao = index + 1;

            const destaque =
              posicao === 1
                ? "border-yellow-400/40 bg-yellow-500/10"
                : posicao <= 3
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03]";

            return (
              <div
                key={jogador.id_jogador}
                className={`rounded-3xl border ${destaque} p-4 shadow-xl`}
              >
                <div className="grid gap-4 md:grid-cols-[80px_1fr_auto] md:items-center">
                  <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                    <img
                      src={fotoJogador(jogador)}
                      alt={jogador.nome_jogador}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/default-player.png";
                      }}
                    />

                    <div className="absolute left-1 top-1 rounded-lg bg-black/70 px-2 py-1 text-xs font-black text-yellow-300">
                      #{posicao}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-black">
                        {jogador.nome_jogador}
                      </h2>

                      {jogador.posicao && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-xs font-bold text-zinc-300">
                          {jogador.posicao}
                        </span>
                      )}

                      {jogador.overall ? (
                        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs font-black text-yellow-300">
                          OVR {jogador.overall}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                      {jogador.logo_time && (
                        <img
                          src={jogador.logo_time}
                          className="h-6 w-6 rounded-full object-contain bg-black/40"
                          alt=""
                        />
                      )}

                      <span className="font-bold text-zinc-200">
                        {jogador.nome_time}
                      </span>

                      {jogador.valor !== null && jogador.valor !== undefined ? (
                        <span className="flex items-center gap-1 text-emerald-300">
                          <FiTrendingUp />
                          {dinheiro(jogador.valor)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {jogador.minutos
                        .slice()
                        .sort((a, b) => a - b)
                        .slice(0, 12)
                        .map((m, idx) => (
                          <span
                            key={`${jogador.id_jogador}_${m}_${idx}`}
                            className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-zinc-300"
                          >
                            ⚽ {m}'
                          </span>
                        ))}

                      {jogador.minutos.length > 12 && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-zinc-500">
                          +{jogador.minutos.length - 12} gols
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-emerald-300">
                      <FiTarget />
                      <span className="text-xs font-bold uppercase">Gols</span>
                    </div>

                    <div className="text-4xl font-black text-white">
                      {jogador.gols}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
        Esta página lê os gols salvos na tabela{" "}
        <strong>artilharia_copa</strong> e também os gols existentes no histórico
        dos jogos em <strong>copa_jogos.eventos_simulacao</strong>. Assim, jogos
        já preenchidos também entram no ranking.
      </div>
    </div>
  );
}