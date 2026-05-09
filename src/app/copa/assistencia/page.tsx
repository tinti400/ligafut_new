"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";
import {
  FiAward,
  FiRefreshCw,
  FiTrendingUp,
  FiTarget,
  FiSearch,
  FiStar,
} from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || "2025-26";

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

type AssistenciaEvento = {
  id: string;
  copa_id: string | null;
  jogo_id: string | null;
  id_time: string | null;
  id_jogador: string | null;
  nome_jogador: string | null;
  nome_time: string | null;
  minuto: number | null;
  created_at: string | null;
};

type RankingAssistencia = {
  id_jogador: string;
  nome_jogador: string;
  id_time: string;
  nome_time: string;
  assistencias: number;
  minutos: number[];
  ultima_assistencia?: string | null;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
  imagem_url?: string | null;
  logo_time?: string | null;
};

function dinheiro(valor?: number | null) {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR")}`;
}

function normalizarTexto(texto?: string | null) {
  return String(texto || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fotoJogador(j?: RankingAssistencia) {
  return j?.imagem_url || "/default-player.png";
}

function medalha(posicao: number) {
  if (posicao === 1) return "🥇";
  if (posicao === 2) return "🥈";
  if (posicao === 3) return "🥉";
  return `#${posicao}`;
}

function extrairIdAssistencia(evento: any) {
  return (
    evento?.id_assistencia ||
    evento?.assistencia_id ||
    evento?.assistenciaId ||
    evento?.id_garcom ||
    evento?.garcom_id ||
    evento?.garcomId ||
    null
  );
}

function extrairNomeAssistencia(evento: any) {
  return (
    evento?.assistencia ||
    evento?.nome_assistencia ||
    evento?.nomeAssistencia ||
    evento?.garcom ||
    evento?.nome_garcom ||
    evento?.nomeGarcom ||
    null
  );
}

function extrairIdTime(evento: any) {
  return (
    evento?.id_time ||
    evento?.time_id ||
    evento?.timeId ||
    evento?.time_id_assistencia ||
    evento?.id_time_assistencia ||
    null
  );
}

export default function AssistenciasCopaPage() {
  const [loading, setLoading] = useState(true);
  const [assistencias, setAssistencias] = useState<AssistenciaEvento[]>([]);
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
        { data: jogosHistorico, error: jogosError },
        { data: timesData, error: timesError },
        { data: elencoData, error: elencoError },
      ] = await Promise.all([
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

      if (jogosError) toast.error("Erro ao carregar histórico dos jogos.");
      if (timesError) toast.error("Erro ao carregar times.");
      if (elencoError) toast.error("Erro ao carregar elenco.");

      const assistenciasHistorico: AssistenciaEvento[] = [];

      ((jogosHistorico || []) as CopaJogoHistorico[]).forEach((jogo) => {
        const eventos = Array.isArray(jogo.eventos_simulacao)
          ? jogo.eventos_simulacao
          : [];

        eventos
          .filter((evento) => evento?.tipo === "gol")
          .forEach((evento, index) => {
            const idAssistencia = extrairIdAssistencia(evento);
            const nomeAssistencia = extrairNomeAssistencia(evento);

            if (!idAssistencia && !nomeAssistencia) return;

            const idTime = extrairIdTime(evento);
            const nomeTimeEvento = evento?.nome_time || evento?.time_nome || evento?.time || null;

            assistenciasHistorico.push({
              id: `assistencia_${jogo.id}_${index}`,
              copa_id: jogo.copa_id,
              jogo_id: jogo.id,
              id_time: idTime,
              id_jogador: idAssistencia,
              nome_jogador: nomeAssistencia || "Jogador",
              nome_time: nomeTimeEvento,
              minuto: Number(evento?.minuto || 0),
              created_at: null,
            });
          });
      });

      setAssistencias(assistenciasHistorico);
      setTimes((timesData || []) as Time[]);
      setElenco((elencoData || []) as JogadorElenco[]);
    } catch (err) {
      console.error(err);
      toast.error("Erro inesperado ao carregar assistências.");
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
    const map: Record<string, RankingAssistencia> = {};

    assistencias.forEach((a) => {
      const jogadorId = a.id_jogador || `${a.nome_jogador}_${a.id_time}`;
      const timeId = a.id_time || "";

      const jogadorElenco =
        (a.id_jogador ? elencoMap[a.id_jogador] : undefined) ||
        elenco.find((j) => {
          const mesmoNome =
            normalizarTexto(j.nome) === normalizarTexto(a.nome_jogador);

          const mesmoTime = !a.id_time || j.id_time === a.id_time;

          return mesmoNome && mesmoTime;
        });

      const timeFinalId = jogadorElenco?.id_time || timeId;
      const time = timeFinalId ? timesMap[timeFinalId] : undefined;

      if (!map[jogadorId]) {
        map[jogadorId] = {
          id_jogador: jogadorId,
          nome_jogador: a.nome_jogador || jogadorElenco?.nome || "Jogador",
          id_time: timeFinalId,
          nome_time: a.nome_time || time?.nome || "Time",
          assistencias: 0,
          minutos: [],
          ultima_assistencia: a.created_at,
          posicao: jogadorElenco?.posicao || null,
          overall: jogadorElenco?.overall || null,
          valor: jogadorElenco?.valor || null,
          imagem_url: jogadorElenco?.imagem_url || jogadorElenco?.foto || null,
          logo_time: time?.logo_url || time?.logo || null,
        };
      }

      map[jogadorId].assistencias += 1;

      if (a.minuto !== null && a.minuto !== undefined) {
        map[jogadorId].minutos.push(Number(a.minuto));
      }

      if (
        a.created_at &&
        (!map[jogadorId].ultima_assistencia ||
          a.created_at > map[jogadorId].ultima_assistencia!)
      ) {
        map[jogadorId].ultima_assistencia = a.created_at;
      }
    });

    return Object.values(map).sort((a, b) => {
      return (
        b.assistencias - a.assistencias ||
        Number(b.overall || 0) - Number(a.overall || 0) ||
        String(a.nome_jogador).localeCompare(String(b.nome_jogador), "pt-BR")
      );
    });
  }, [assistencias, elencoMap, timesMap, elenco]);

  const rankingFiltrado = useMemo(() => {
    const q = normalizarTexto(busca);
    if (!q) return ranking;

    return ranking.filter(
      (r) =>
        normalizarTexto(r.nome_jogador).includes(q) ||
        normalizarTexto(r.nome_time).includes(q) ||
        normalizarTexto(r.posicao).includes(q),
    );
  }, [ranking, busca]);

  const totalAssistencias = ranking.reduce((acc, r) => acc + r.assistencias, 0);
  const lider = ranking[0];
  const top3 = ranking.slice(0, 3);

  if (loading) {
    return (
      <div className="min-h-screen p-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
          Carregando assistências...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 text-zinc-100 space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-sky-400/20 bg-gradient-to-br from-sky-500/15 via-black to-emerald-500/10 p-5 md:p-6 shadow-2xl">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-black text-sky-200">
              <FiAward />
              COPA LIGAFUT
            </div>

            <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-tight">
              Assistências da Copa
            </h1>

            <p className="mt-2 text-sm text-zinc-400">
              Ranking dos garçons da Copa usando os eventos de gol salvos em{" "}
              <strong>copa_jogos.eventos_simulacao</strong> • temporada{" "}
              {TEMPORADA}
            </p>
          </div>

          <button
            onClick={carregarDados}
            className="rounded-2xl bg-white/10 px-5 py-3 font-black hover:bg-white/20 flex items-center justify-center gap-2"
          >
            <FiRefreshCw />
            Atualizar
          </button>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="text-xs text-zinc-400">Total de assistências</div>
            <div className="text-3xl font-black text-sky-300">
              {totalAssistencias}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="text-xs text-zinc-400">Jogadores com assistência</div>
            <div className="text-3xl font-black">{ranking.length}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="text-xs text-zinc-400">Garçom atual</div>
            <div className="truncate text-xl font-black text-sky-300">
              {lider?.nome_jogador || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="text-xs text-zinc-400">Clube do líder</div>
            <div className="truncate text-xl font-black">
              {lider?.nome_time || "-"}
            </div>
          </div>
        </div>
      </div>

      {top3.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {top3.map((jogador, index) => {
            const posicao = index + 1;

            return (
              <div
                key={jogador.id_jogador}
                className={`relative overflow-hidden rounded-[2rem] border p-4 shadow-2xl ${
                  posicao === 1
                    ? "border-sky-400/40 bg-sky-500/10"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-40" />

                {jogador.logo_time && (
                  <img
                    src={jogador.logo_time}
                    alt=""
                    className="absolute -right-8 -bottom-8 h-36 w-36 object-contain opacity-10"
                  />
                )}

                <div className="relative flex items-center gap-4">
                  <div className="relative h-28 w-28 overflow-hidden rounded-3xl border border-white/10 bg-black/50">
                    <img
                      src={fotoJogador(jogador)}
                      alt={jogador.nome_jogador}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/default-player.png";
                      }}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="text-3xl">{medalha(posicao)}</div>
                    <h2 className="truncate text-xl font-black">
                      {jogador.nome_jogador}
                    </h2>

                    <div className="mt-1 flex items-center gap-2 text-sm text-zinc-300">
                      {jogador.logo_time && (
                        <img
                          src={jogador.logo_time}
                          className="h-5 w-5 object-contain"
                          alt=""
                        />
                      )}
                      <span className="truncate">{jogador.nome_time}</span>
                    </div>

                    <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-3 py-2">
                      <FiTarget className="text-sky-300" />
                      <span className="text-2xl font-black">
                        {jogador.assistencias}
                      </span>
                      <span className="text-xs text-sky-200">assist.</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
          <FiSearch className="text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar jogador, time ou posição..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>

      {rankingFiltrado.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-400">
          Nenhuma assistência registrada ainda.
        </div>
      ) : (
        <div className="grid gap-4">
          {rankingFiltrado.map((jogador, index) => {
            const posicao = index + 1;

            const destaque =
              posicao === 1
                ? "border-sky-400/40 bg-gradient-to-r from-sky-500/15 to-white/[0.03]"
                : posicao <= 3
                  ? "border-emerald-400/30 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.03]";

            return (
              <div
                key={jogador.id_jogador}
                className={`relative overflow-hidden rounded-[2rem] border ${destaque} p-4 shadow-xl transition hover:scale-[1.01] hover:bg-white/[0.06]`}
              >
                {jogador.logo_time && (
                  <img
                    src={jogador.logo_time}
                    alt=""
                    className="absolute right-4 top-1/2 h-28 w-28 -translate-y-1/2 object-contain opacity-[0.06]"
                  />
                )}

                <div className="relative grid gap-4 md:grid-cols-[120px_1fr_auto] md:items-center">
                  <div className="relative h-32 w-full md:w-28 overflow-hidden rounded-3xl border border-white/10 bg-black/50 shadow-xl">
                    <img
                      src={fotoJogador(jogador)}
                      alt={jogador.nome_jogador}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "/default-player.png";
                      }}
                    />

                    <div className="absolute left-2 top-2 rounded-xl bg-black/75 px-2 py-1 text-sm font-black text-sky-300">
                      {medalha(posicao)}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-black">
                        {jogador.nome_jogador}
                      </h2>

                      {posicao === 1 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-xs font-black text-sky-300">
                          <FiStar />
                          Garçom
                        </span>
                      )}

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
                          className="h-7 w-7 rounded-full object-contain bg-black/40"
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

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      {jogador.minutos
                        .slice()
                        .sort((a, b) => a - b)
                        .slice(0, 14)
                        .map((m, idx) => (
                          <span
                            key={`${jogador.id_jogador}_${m}_${idx}`}
                            className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-zinc-300"
                          >
                            🎯 {m}'
                          </span>
                        ))}

                      {jogador.minutos.length > 14 && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-zinc-500">
                          +{jogador.minutos.length - 14} assistências
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-sky-500/30 bg-sky-500/10 p-5 text-center shadow-xl">
                    <div className="flex items-center justify-center gap-2 text-sky-300">
                      <FiTarget />
                      <span className="text-xs font-bold uppercase">
                        Assistências
                      </span>
                    </div>

                    <div className="text-5xl font-black text-white">
                      {jogador.assistencias}
                    </div>

                    <div className="mt-1 text-xs text-zinc-400">
                      {jogador.assistencias === 1
                        ? "assistência"
                        : "assistências"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-400">
        Esta página lê as assistências salvas dentro dos eventos de gol em{" "}
        <strong>copa_jogos.eventos_simulacao</strong>. Para aparecer aqui, o
        evento precisa ter campos como <strong>assistencia</strong>,{" "}
        <strong>id_assistencia</strong>, <strong>assistencia_id</strong> ou{" "}
        <strong>garcom</strong>.
      </div>
    </div>
  );
}
