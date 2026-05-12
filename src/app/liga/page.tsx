"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";
import { useAdmin } from "@/hooks/useAdmin";
import {
  FiAward,
  FiRefreshCw,
  FiSave,
  FiTrash2,
  FiUsers,
  FiCalendar,
  FiCheckCircle,
  FiPlay,
} from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || "2025-26";

/**
 * Premiação da Liga — ajuste livre.
 * Mantive parecido com o que você já vinha usando na LigaFut.
 */
const LIGA_PARTICIPACAO_POR_JOGO = 1_000_000;
const LIGA_VITORIA = 9_000_000;
const LIGA_EMPATE = 6_000_000;
const LIGA_DERROTA = 2_500_000;
const LIGA_GOL_MARCADO = 150_000;
const LIGA_GOL_SOFRIDO = 30_000;

type Time = {
  id: string;
  nome: string;
  logo?: string | null;
  logo_url?: string | null;
  escudo?: string | null;
  overall?: number | null;
  valor?: number | null;
  saldo?: number | null;
  divisao?: string | number | null;
};

type Liga = {
  id: string;
  nome: string;
  temporada: string;
  status: string;
  campeao_id?: string | null;
  criado_em?: string | null;
};

type ParticipanteLiga = {
  id: string;
  liga_id: string;
  id_time: string;
};

type JogadorElenco = {
  id?: string;
  nome: string;
  posicao?: string | null;
  overall?: number | null;
  valor?: number | null;
};

type EventoSimulacao = {
  minuto: number;
  tipo:
    | "gol"
    | "chance"
    | "cartao"
    | "vermelho"
    | "penalti"
    | "defesa"
    | "fim"
    | "info";
  time_id?: string | null;
  time_nome?: string | null;
  jogador_id?: string | null;
  id_jogador?: string | null;
  jogador?: string | null;
  assistencia_id?: string | null;
  id_assistencia?: string | null;
  assistencia?: string | null;
  logo?: string | null;
  texto: string;
};

type JogoLiga = {
  id: string;
  liga_id: string;
  rodada: number | null;
  ordem: number | null;

  id_time1: string | null;
  id_time2: string | null;

  gols_time1: number | null;
  gols_time2: number | null;

  vencedor_id: string | null;
  status: string | null;
  bonus_pago: boolean | null;

  publico?: number | null;
  renda?: number | null;
  receita_time1?: number | null;
  receita_time2?: number | null;
  premiacao_time1?: number | null;
  premiacao_time2?: number | null;
  participacao_time1?: number | null;
  participacao_time2?: number | null;
  salarios_time1?: number | null;
  salarios_time2?: number | null;

  simulado?: boolean | null;
  simulando?: boolean | null;
  eventos_simulacao?: EventoSimulacao[] | null;
  metodo_resultado?: "manual" | "manual_com_historia" | "simulado" | null;
  play_time1?: boolean | null;
  play_time2?: boolean | null;
  play_solicitado_por?: string | null;
};

type Classificacao = {
  id: string;
  pts: number;
  j: number;
  v: number;
  e: number;
  d: number;
  gp: number;
  gc: number;
  sg: number;
  aproveitamento: number;
};

type Aba = "participantes" | "classificacao" | "rodadas" | "artilharia";

function dinheiro(valor: number) {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR")}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function clampGol(v: unknown) {
  const n = Number(v);

  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 99) return 99;

  return Math.floor(n);
}

function normalizarPosicao(pos?: string | null) {
  return String(pos || "").toUpperCase().trim();
}

function pesoArtilheiro(j: JogadorElenco) {
  const pos = normalizarPosicao(j.posicao);
  const overall = Number(j.overall || 60);

  let pesoPosicao = 1;

  if (
    ["CA", "SA", "PD", "PE", "ATA", "ATACANTE", "PONTA"].some((p) =>
      pos.includes(p),
    )
  ) {
    pesoPosicao = 5;
  } else if (["MEI", "MC", "MD", "ME", "VOL"].some((p) => pos.includes(p))) {
    pesoPosicao = 3;
  } else if (["LD", "LE", "ZAG"].some((p) => pos.includes(p))) {
    pesoPosicao = 1.3;
  } else if (["GL", "GOL"].some((p) => pos.includes(p))) {
    pesoPosicao = 0.25;
  }

  return Math.max(1, pesoPosicao * Math.max(40, overall));
}

function escolherJogadorPonderado(jogadores: JogadorElenco[]) {
  if (!jogadores.length) return null;

  const total = jogadores.reduce((acc, j) => acc + pesoArtilheiro(j), 0);
  let sorteio = Math.random() * total;

  for (const j of jogadores) {
    sorteio -= pesoArtilheiro(j);
    if (sorteio <= 0) return j;
  }

  return jogadores[jogadores.length - 1];
}

function escolherAssistenteDoGol(
  jogadores: JogadorElenco[],
  artilheiro?: JogadorElenco | null,
) {
  const candidatos = jogadores.filter((j) => j.id && j.id !== artilheiro?.id);

  if (!candidatos.length) return null;

  if (Math.random() < 0.15) return null;

  return escolherJogadorPonderado(candidatos);
}

function gerarMinutosGols(total: number) {
  const minutos = new Set<number>();

  while (minutos.size < total) {
    minutos.add(Math.floor(Math.random() * 88) + 2);
  }

  return Array.from(minutos).sort((a, b) => a - b);
}

function limitarPlacar(gols: number) {
  return Math.max(0, Math.min(6, Math.floor(gols)));
}

/**
 * Algoritmo estilo Campeonato Brasileiro.
 * - todos contra todos
 * - ida e volta
 * - cada time joga uma vez por rodada
 * - se quantidade ímpar, cria folga
 */
function gerarRodadasBrasileirao(idsOriginais: string[]) {
  const ids = shuffle(Array.from(new Set(idsOriginais)));

  if (ids.length < 2) return [];

  const temFolga = ids.length % 2 !== 0;
  const times = temFolga ? [...ids, "__FOLGA__"] : [...ids];

  const totalTimes = times.length;
  const rodadasIda = totalTimes - 1;
  const jogosPorRodada = totalTimes / 2;

  let lista = [...times];
  const jogos: Array<{
    rodada: number;
    ordem: number;
    id_time1: string;
    id_time2: string;
    jogo_tipo: "ida" | "volta";
  }> = [];

  for (let rodada = 1; rodada <= rodadasIda; rodada++) {
    let ordem = 1;

    for (let i = 0; i < jogosPorRodada; i++) {
      const mandanteBase = lista[i];
      const visitanteBase = lista[totalTimes - 1 - i];

      if (mandanteBase !== "__FOLGA__" && visitanteBase !== "__FOLGA__") {
        const inverterMando = rodada % 2 === 0;

        const id_time1 = inverterMando ? visitanteBase : mandanteBase;
        const id_time2 = inverterMando ? mandanteBase : visitanteBase;

        jogos.push({
          rodada,
          ordem,
          id_time1,
          id_time2,
          jogo_tipo: "ida",
        });

        ordem++;
      }
    }

    const fixo = lista[0];
    const resto = lista.slice(1);
    resto.unshift(resto.pop()!);
    lista = [fixo, ...resto];
  }

  const jogosVolta = jogos.map((j) => ({
    rodada: j.rodada + rodadasIda,
    ordem: j.ordem,
    id_time1: j.id_time2,
    id_time2: j.id_time1,
    jogo_tipo: "volta" as const,
  }));

  return [...jogos, ...jogosVolta];
}

export default function LigaPage() {
  const { isAdmin } = useAdmin();

  const [times, setTimes] = useState<Time[]>([]);
  const [liga, setLiga] = useState<Liga | null>(null);
  const [participantes, setParticipantes] = useState<ParticipanteLiga[]>([]);
  const [jogos, setJogos] = useState<JogoLiga[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("classificacao");

  const [jogoAoVivo, setJogoAoVivo] = useState<string | null>(null);
  const [eventosAoVivo, setEventosAoVivo] = useState<
    Record<string, EventoSimulacao[]>
  >({});
  const [placarAoVivo, setPlacarAoVivo] = useState<
    Record<string, { g1: number; g2: number }>
  >({});
  const [minutoAoVivo, setMinutoAoVivo] = useState<Record<string, number>>({});
  const [idTimeLogado, setIdTimeLogado] = useState<string | null>(null);

  const timesMap = useMemo(() => {
    const map: Record<string, Time> = {};

    times.forEach((t) => {
      map[t.id] = t;
    });

    return map;
  }, [times]);

  const timesComDivisao = useMemo(() => {
    return times.filter(
      (t) =>
        t.divisao !== null &&
        t.divisao !== undefined &&
        String(t.divisao).trim() !== "",
    );
  }, [times]);

  const jogosFinalizados = useMemo(() => {
    return jogos.filter((j) => j.gols_time1 !== null && j.gols_time2 !== null)
      .length;
  }, [jogos]);

  const totalRodadas = useMemo(() => {
    return Math.max(0, ...jogos.map((j) => Number(j.rodada || 0)));
  }, [jogos]);

  const rodadaAtual = useMemo(() => {
    const pendente = jogos
      .filter((j) => j.gols_time1 === null || j.gols_time2 === null)
      .sort((a, b) => Number(a.rodada || 0) - Number(b.rodada || 0))[0];

    return pendente?.rodada || totalRodadas || 1;
  }, [jogos, totalRodadas]);

  const jogosPorRodada = useMemo(() => {
    const map: Record<number, JogoLiga[]> = {};

    jogos.forEach((j) => {
      const r = Number(j.rodada || 0);
      map[r] ||= [];
      map[r].push(j);
    });

    Object.keys(map).forEach((r) => {
      map[Number(r)].sort(
        (a, b) => Number(a.ordem || 0) - Number(b.ordem || 0),
      );
    });

    return map;
  }, [jogos]);

  const classificacao = useMemo(() => {
    const map: Record<string, Classificacao> = {};

    const ensure = (id: string) => {
      map[id] ||= {
        id,
        pts: 0,
        j: 0,
        v: 0,
        e: 0,
        d: 0,
        gp: 0,
        gc: 0,
        sg: 0,
        aproveitamento: 0,
      };

      return map[id];
    };

    participantes.forEach((p) => {
      if (p.id_time) ensure(p.id_time);
    });

    jogos.forEach((j) => {
      if (!j.id_time1 || !j.id_time2) return;
      if (j.gols_time1 === null || j.gols_time2 === null) return;

      const a = ensure(j.id_time1);
      const b = ensure(j.id_time2);

      const g1 = Number(j.gols_time1 || 0);
      const g2 = Number(j.gols_time2 || 0);

      a.j++;
      b.j++;

      a.gp += g1;
      a.gc += g2;
      b.gp += g2;
      b.gc += g1;

      if (g1 > g2) {
        a.v++;
        b.d++;
        a.pts += 3;
      } else if (g2 > g1) {
        b.v++;
        a.d++;
        b.pts += 3;
      } else {
        a.e++;
        b.e++;
        a.pts++;
        b.pts++;
      }

      a.sg = a.gp - a.gc;
      b.sg = b.gp - b.gc;

      a.aproveitamento = a.j ? Math.round((a.pts / (a.j * 3)) * 100) : 0;
      b.aproveitamento = b.j ? Math.round((b.pts / (b.j * 3)) * 100) : 0;
    });

    return Object.values(map).sort(
      (a, b) =>
        b.pts - a.pts ||
        b.v - a.v ||
        b.sg - a.sg ||
        b.gp - a.gp ||
        nomeTime(a.id).localeCompare(nomeTime(b.id), "pt-BR"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jogos, participantes, timesMap]);

  const lider = classificacao[0];
  const zonaLibertadores = 4;
  const zonaRebaixamento = 4;

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && aba === "participantes") {
      setAba("classificacao");
    }
  }, [isAdmin, aba]);

  useEffect(() => {
    try {
      const direto =
        localStorage.getItem("id_time") ||
        localStorage.getItem("time_id") ||
        localStorage.getItem("idTime") ||
        localStorage.getItem("timeLogadoId");

      if (direto) {
        setIdTimeLogado(direto);
        return;
      }

      const possiveisUsuarios = [
        localStorage.getItem("usuario"),
        localStorage.getItem("user"),
        localStorage.getItem("ligafut_user"),
      ].filter(Boolean) as string[];

      for (const raw of possiveisUsuarios) {
        try {
          const obj = JSON.parse(raw);
          const id =
            obj?.id_time || obj?.time_id || obj?.idTime || obj?.time?.id;

          if (id) {
            setIdTimeLogado(String(id));
            return;
          }
        } catch {
          // ignora
        }
      }
    } catch {
      setIdTimeLogado(null);
    }
  }, []);

  async function carregarTudo() {
    setLoading(true);

    const { data: timesData, error: timesErr } = await supabase
      .from("times")
      .select("*");

    if (timesErr) toast.error("Erro ao carregar times.");

    const timesNormalizados = ((timesData || []) as any[])
      .filter(
        (t) =>
          t.divisao !== null &&
          t.divisao !== undefined &&
          String(t.divisao).trim() !== "",
      )
      .map((t) => ({
        id: String(t.id),
        nome: t.nome || t.name || t.time || "Sem nome",
        logo: t.logo || null,
        logo_url: t.logo_url || t.logo || t.escudo || "/default.png",
        escudo: t.escudo || null,
        overall: Number(t.overall || t.ovr || 0),
        valor: Number(t.valor || t.value || t.saldo || 0),
        saldo: Number(t.saldo || 0),
        divisao: t.divisao,
      }))
      .sort(
        (a, b) =>
          String(a.divisao).localeCompare(String(b.divisao), "pt-BR", {
            numeric: true,
          }) || String(a.nome).localeCompare(String(b.nome), "pt-BR"),
      );

    setTimes(timesNormalizados as Time[]);

    let ligaAtual: Liga | null = null;

    const { data: ligaData, error: ligaErr } = await supabase
      .from("liga")
      .select("*")
      .eq("temporada", TEMPORADA)
      .maybeSingle();

    if (ligaErr) {
      toast.error("Erro ao carregar Liga.");
    }

    ligaAtual = (ligaData as Liga | null) || null;

    if (!ligaAtual && isAdmin) {
      const { data: nova, error } = await supabase
        .from("liga")
        .insert({
          temporada: TEMPORADA,
          nome: "LigaFut Brasileirão",
          status: "preparacao",
          campeao_id: null,
        })
        .select("*")
        .single();

      if (error) toast.error("Erro ao criar Liga da temporada.");

      ligaAtual = (nova as Liga | null) || null;
    }

    setLiga(ligaAtual);

    if (ligaAtual?.id) {
      const [
        { data: parts, error: partsErr },
        { data: jogosData, error: jogosErr },
      ] = await Promise.all([
        supabase
          .from("liga_participantes")
          .select("*")
          .eq("liga_id", ligaAtual.id),
        supabase
          .from("liga_jogos")
          .select("*")
          .eq("liga_id", ligaAtual.id)
          .order("rodada", { ascending: true })
          .order("ordem", { ascending: true }),
      ]);

      if (partsErr) toast.error("Erro ao carregar participantes da Liga.");
      if (jogosErr) toast.error("Erro ao carregar jogos da Liga.");

      setParticipantes((parts || []) as ParticipanteLiga[]);
      setSelecionados((parts || []).map((p: any) => p.id_time));
      setJogos((jogosData || []) as JogoLiga[]);
    } else {
      setParticipantes([]);
      setSelecionados([]);
      setJogos([]);
    }

    setLoading(false);
  }

  function nomeTime(id?: string | null) {
    if (!id) return "A definir";
    return timesMap[id]?.nome || "Time não encontrado";
  }

  function logoTime(id?: string | null) {
    if (!id) return "/default.png";
    return timesMap[id]?.logo_url || timesMap[id]?.logo || timesMap[id]?.escudo || "/default.png";
  }

  async function garantirLigaAtual() {
    if (!isAdmin) {
      toast.error("Apenas admin pode alterar a Liga.");
      return null;
    }

    if (liga?.id) return liga;

    const { data: existente, error: erroBusca } = await supabase
      .from("liga")
      .select("*")
      .eq("temporada", TEMPORADA)
      .maybeSingle();

    if (erroBusca) {
      toast.error("Erro ao buscar Liga da temporada.");
      return null;
    }

    if (existente?.id) {
      setLiga(existente as Liga);
      return existente as Liga;
    }

    const { data: nova, error: erroCriar } = await supabase
      .from("liga")
      .insert({
        temporada: TEMPORADA,
        nome: "LigaFut Brasileirão",
        status: "preparacao",
        campeao_id: null,
      })
      .select("*")
      .single();

    if (erroCriar || !nova) {
      toast.error("Erro ao criar Liga da temporada.");
      return null;
    }

    setLiga(nova as Liga);
    return nova as Liga;
  }

  async function salvarParticipantes() {
    const ligaBase = await garantirLigaAtual();
    if (!ligaBase) return;

    if (selecionados.length < 4) {
      toast.error("Selecione pelo menos 4 times.");
      return;
    }

    if (selecionados.length % 2 !== 0) {
      toast.error("Para formato Brasileirão, selecione uma quantidade par de times.");
      return;
    }

    if (
      jogos.length > 0 &&
      !confirm(
        "Isso vai apagar participantes e jogos atuais da Liga. Continuar?",
      )
    ) {
      return;
    }

    await supabase.from("liga_jogos").delete().eq("liga_id", ligaBase.id);
    await supabase.from("liga_participantes").delete().eq("liga_id", ligaBase.id);

    const rows = selecionados.map((id) => ({
      liga_id: ligaBase.id,
      id_time: id,
    }));

    const { error } = await supabase.from("liga_participantes").insert(rows);

    if (error) {
      console.error("Erro ao salvar participantes:", error);
      toast.error(error.message || "Erro ao salvar participantes.");
      return;
    }

    await supabase
      .from("liga")
      .update({ status: "participantes", campeao_id: null })
      .eq("id", ligaBase.id);

    toast.success("Participantes da Liga salvos!");
    await carregarTudo();
  }

  async function gerarRodadas() {
    const ligaBase = await garantirLigaAtual();
    if (!ligaBase) return;

    const participantesIds =
      participantes.length > 0 ? participantes.map((p) => p.id_time) : selecionados;

    const ids = Array.from(new Set(participantesIds.filter(Boolean)));

    if (ids.length < 4) {
      toast.error("Salve pelo menos 4 participantes antes de gerar a Liga.");
      return;
    }

    if (ids.length % 2 !== 0) {
      toast.error("A Liga precisa de quantidade par de times.");
      return;
    }

    if (
      jogos.length > 0 &&
      !confirm(
        "Gerar novamente vai apagar todos os jogos e placares da Liga atual. Continuar?",
      )
    ) {
      return;
    }

    const rodadas = gerarRodadasBrasileirao(ids);

    const rows = rodadas.map((j) => ({
      liga_id: ligaBase.id,
      rodada: j.rodada,
      ordem: j.ordem,
      id_time1: j.id_time1,
      id_time2: j.id_time2,
      gols_time1: null,
      gols_time2: null,
      vencedor_id: null,
      status: "pendente",
      bonus_pago: false,
      jogo_tipo: j.jogo_tipo,
      publico: null,
      renda: 0,
      receita_time1: 0,
      receita_time2: 0,
      participacao_time1: 0,
      participacao_time2: 0,
      premiacao_time1: 0,
      premiacao_time2: 0,
      salarios_time1: 0,
      salarios_time2: 0,
      simulado: false,
      simulando: false,
      eventos_simulacao: [],
      metodo_resultado: null,
      play_time1: false,
      play_time2: false,
      play_solicitado_por: null,
    }));

    await supabase.from("liga_jogos").delete().eq("liga_id", ligaBase.id);

    const { error } = await supabase.from("liga_jogos").insert(rows);

    if (error) {
      console.error("Erro ao gerar rodadas:", error);
      toast.error(error.message || "Erro ao gerar rodadas.");
      return;
    }

    await supabase
      .from("liga")
      .update({ status: "em_andamento", campeao_id: null })
      .eq("id", ligaBase.id);

    await supabase.from("bid").insert({
      tipo_evento: "Sistema",
      descricao: `LigaFut gerada em pontos corridos: ${ids.length} times, ida e volta, ${rows.length} jogos.`,
      valor: null,
      data_evento: new Date().toISOString(),
    });

    toast.success(
      `Liga gerada! ${ids.length} times, ${rows.length} jogos e ${Math.max(
        0,
        ...rows.map((r) => Number(r.rodada || 0)),
      )} rodadas.`,
    );

    setAba("rodadas");
    await carregarTudo();
  }

  async function buscarJogadoresDoTime(timeId: string): Promise<JogadorElenco[]> {
    const { data, error } = await supabase
      .from("elenco")
      .select("id,nome,posicao,overall,valor")
      .eq("id_time", timeId);

    if (error) {
      console.error("Erro ao buscar elenco:", error);
      return [];
    }

    return ((data || []) as any[]).map((j) => ({
      id: String(j.id || ""),
      nome: j.nome || "Jogador",
      posicao: j.posicao || null,
      overall: Number(j.overall || 60),
      valor: Number(j.valor || 0),
    }));
  }

  async function calcularForcaTime(timeId: string, mandante = false) {
    const jogadores = await buscarJogadoresDoTime(timeId);

    if (!jogadores.length) return mandante ? 58 : 54;

    const mediaOverall =
      jogadores.reduce((acc, j) => acc + Number(j.overall || 0), 0) /
      jogadores.length;

    const bonusCasa = mandante ? 4 : 0;
    const penalidadeElencoCurto = jogadores.length < 16 ? -6 : 0;
    const fatorAleatorio = Math.random() * 8 - 4;

    return mediaOverall + bonusCasa + penalidadeElencoCurto + fatorAleatorio;
  }

  function gerarPlacarSimulado(forca1: number, forca2: number) {
    const diff = forca1 - forca2;

    const chanceGol1 = Math.max(0.65, Math.min(3.6, 1.55 + diff / 22));
    const chanceGol2 = Math.max(0.45, Math.min(3.3, 1.35 - diff / 24));

    let g1 = 0;
    let g2 = 0;

    for (let minuto = 1; minuto <= 90; minuto++) {
      if (Math.random() < chanceGol1 / 90) g1++;
      if (Math.random() < chanceGol2 / 90) g2++;
    }

    if (g1 === 0 && g2 === 0 && Math.random() < 0.45) {
      if (Math.random() * (forca1 + forca2) < forca1) g1 = 1;
      else g2 = 1;
    }

    return {
      g1: limitarPlacar(g1),
      g2: limitarPlacar(g2),
    };
  }

  async function gerarHistoriaDoPlacar(
    jogo: JogoLiga,
    g1: number,
    g2: number,
    metodo: "manual_com_historia" | "simulado" = "manual_com_historia",
  ): Promise<EventoSimulacao[]> {
    if (!jogo.id_time1 || !jogo.id_time2) return [];

    const [jogadores1, jogadores2] = await Promise.all([
      buscarJogadoresDoTime(jogo.id_time1),
      buscarJogadoresDoTime(jogo.id_time2),
    ]);

    const eventos: EventoSimulacao[] = [];
    const totalGols = Math.max(0, g1 + g2);
    const minutos = gerarMinutosGols(totalGols);

    const filaGols: Array<{
      timeId: string;
      timeNome: string;
      jogadores: JogadorElenco[];
    }> = [];

    for (let i = 0; i < g1; i++) {
      filaGols.push({
        timeId: jogo.id_time1,
        timeNome: nomeTime(jogo.id_time1),
        jogadores: jogadores1,
      });
    }

    for (let i = 0; i < g2; i++) {
      filaGols.push({
        timeId: jogo.id_time2,
        timeNome: nomeTime(jogo.id_time2),
        jogadores: jogadores2,
      });
    }

    shuffle(filaGols).forEach((gol, idx) => {
      const jogador = escolherJogadorPonderado(gol.jogadores);
      const assistente = escolherAssistenteDoGol(gol.jogadores, jogador);
      const minuto = minutos[idx] || Math.floor(Math.random() * 88) + 2;
      const nomeJogador = jogador?.nome || "Jogador";
      const nomeAssistente = assistente?.nome || null;
      const textoAssistencia = nomeAssistente
        ? ` Assistência de ${nomeAssistente}.`
        : "";

      const frases = [
        `${minuto}' GOL! ${nomeJogador} aparece na área e marca para ${gol.timeNome}.${textoAssistencia}`,
        `${minuto}' GOL DO ${gol.timeNome.toUpperCase()}! ${nomeJogador} finaliza com categoria.${textoAssistencia}`,
        `${minuto}' Rede balançando! ${nomeJogador} deixa o dele para ${gol.timeNome}.${textoAssistencia}`,
        `${minuto}' É gol! ${nomeJogador} aproveita a chance e muda o placar.${textoAssistencia}`,
      ];

      eventos.push({
        minuto,
        tipo: "gol",
        time_id: gol.timeId,
        time_nome: gol.timeNome,
        jogador_id: jogador?.id || null,
        id_jogador: jogador?.id || null,
        jogador: nomeJogador,
        assistencia_id: assistente?.id || null,
        id_assistencia: assistente?.id || null,
        assistencia: nomeAssistente,
        logo: logoTime(gol.timeId),
        texto: frases[Math.floor(Math.random() * frases.length)],
      });
    });

    const extrasBase: EventoSimulacao[] = [
      {
        minuto: Math.floor(Math.random() * 20) + 5,
        tipo: "chance",
        texto: `🔥 Começo intenso, os dois times tentam acelerar o jogo.`,
      },
      {
        minuto: Math.floor(Math.random() * 25) + 25,
        tipo: "defesa",
        texto: `🧤 Grande defesa! O goleiro evita um gol quase certo.`,
      },
      {
        minuto: Math.floor(Math.random() * 25) + 50,
        tipo: "cartao",
        texto: `🟨 Cartão amarelo após falta dura no meio-campo.`,
      },
      {
        minuto: Math.floor(Math.random() * 15) + 75,
        tipo: "chance",
        texto: `🚨 Pressão nos minutos finais, a torcida sente que pode sair mais um gol.`,
      },
    ];

    const quantidadeExtras = metodo === "simulado" ? 4 : 3;
    eventos.push(...shuffle(extrasBase).slice(0, quantidadeExtras));

    eventos.sort((a, b) => a.minuto - b.minuto);

    eventos.push({
      minuto: 90,
      tipo: "fim",
      time_id: null,
      time_nome: null,
      jogador: null,
      texto: `🏁 Fim de jogo! ${nomeTime(jogo.id_time1)} ${g1} x ${g2} ${nomeTime(jogo.id_time2)}.`,
    });

    return eventos;
  }

  async function exibirNarracaoAoVivo(
    jogo: JogoLiga,
    eventos: EventoSimulacao[],
    delayPorEvento = 900,
  ) {
    if (!jogo.id_time1 || !jogo.id_time2 || !eventos.length) return;

    const ordenados = [...eventos].sort((a, b) => a.minuto - b.minuto);
    let placar1 = 0;
    let placar2 = 0;

    setJogoAoVivo(jogo.id);
    setEventosAoVivo((prev) => ({ ...prev, [jogo.id]: [] }));
    setPlacarAoVivo((prev) => ({ ...prev, [jogo.id]: { g1: 0, g2: 0 } }));
    setMinutoAoVivo((prev) => ({ ...prev, [jogo.id]: 0 }));

    for (const evento of ordenados) {
      if (evento.tipo === "gol") {
        if (evento.time_id === jogo.id_time1) placar1++;
        if (evento.time_id === jogo.id_time2) placar2++;
      }

      setMinutoAoVivo((prev) => ({ ...prev, [jogo.id]: evento.minuto }));
      setPlacarAoVivo((prev) => ({
        ...prev,
        [jogo.id]: { g1: placar1, g2: placar2 },
      }));
      setEventosAoVivo((prev) => ({
        ...prev,
        [jogo.id]: [...(prev[jogo.id] || []), evento],
      }));

      await sleep(delayPorEvento);
    }

    setPlacarAoVivo((prev) => ({
      ...prev,
      [jogo.id]: {
        g1: Number(jogo.gols_time1 ?? placar1),
        g2: Number(jogo.gols_time2 ?? placar2),
      },
    }));

    await sleep(900);
    setJogoAoVivo(null);
  }

  async function simularPartida(jogo: JogoLiga, origem: "admin" | "consenso" = "admin") {
    if (!jogo.id_time1 || !jogo.id_time2) return;
    if (origem === "admin" && !isAdmin) return;

    if (origem === "consenso" && !(jogo.play_time1 && jogo.play_time2)) {
      toast.error("A simulação só começa quando os dois times apertarem play.");
      return;
    }

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;

    if (temPlacar) {
      toast.error("Esse jogo já tem placar.");
      return;
    }

    setSalvando(jogo.id);
    toast.loading("🎮 Simulando partida da Liga...", { id: `sim-${jogo.id}` });

    try {
      await supabase
        .from("liga_jogos")
        .update({
          simulando: true,
          metodo_resultado: "simulado",
          play_time1: true,
          play_time2: true,
        })
        .eq("id", jogo.id);

      const [forca1, forca2] = await Promise.all([
        calcularForcaTime(jogo.id_time1, true),
        calcularForcaTime(jogo.id_time2, false),
      ]);

      const { g1, g2 } = gerarPlacarSimulado(forca1, forca2);
      const eventosHistoria = await gerarHistoriaDoPlacar(jogo, g1, g2, "simulado");

      const delay = Math.max(
        650,
        Math.min(1100, Math.floor(16000 / Math.max(1, eventosHistoria.length))),
      );

      await exibirNarracaoAoVivo(jogo, eventosHistoria, delay);

      await salvarPlacar(jogo, g1, g2, "simulado", eventosHistoria, origem === "consenso");

      toast.success(
        `🎮 Simulação concluída! ${nomeTime(jogo.id_time1)} ${g1} x ${g2} ${nomeTime(jogo.id_time2)}`,
        { id: `sim-${jogo.id}`, duration: 6000 },
      );
    } catch (error: any) {
      console.error("Erro ao simular:", error);
      await supabase.from("liga_jogos").update({ simulando: false }).eq("id", jogo.id);
      toast.error(error?.message || "Erro ao simular partida.", {
        id: `sim-${jogo.id}`,
      });
    } finally {
      setSalvando(null);
    }
  }

  async function solicitarPlaySimulacao(jogo: JogoLiga) {
    if (!jogo.id_time1 || !jogo.id_time2) return;

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;

    if (temPlacar) {
      toast.error("Esse jogo já tem placar salvo.");
      return;
    }

    if (jogo.simulando || salvando === jogo.id || jogoAoVivo === jogo.id) {
      toast.error("Esse jogo já está em simulação.");
      return;
    }

    if (!idTimeLogado) {
      toast.error("Não encontrei o time logado no localStorage.");
      return;
    }

    const ehTime1 = idTimeLogado === jogo.id_time1;
    const ehTime2 = idTimeLogado === jogo.id_time2;

    if (!ehTime1 && !ehTime2) {
      toast.error("Você só pode apertar play nos jogos do seu próprio time.");
      return;
    }

    const updatePayload: Partial<JogoLiga> = {
      play_time1: ehTime1 ? true : !!jogo.play_time1,
      play_time2: ehTime2 ? true : !!jogo.play_time2,
      play_solicitado_por: idTimeLogado,
      metodo_resultado: "simulado",
    };

    setSalvando(jogo.id);

    try {
      const { data: jogoAtualizado, error } = await supabase
        .from("liga_jogos")
        .update(updatePayload)
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (error || !jogoAtualizado) {
        toast.error(error?.message || "Erro ao registrar play.");
        return;
      }

      const atualizado = jogoAtualizado as JogoLiga;

      setJogos((prev) => prev.map((j) => (j.id === jogo.id ? atualizado : j)));

      if (atualizado.play_time1 && atualizado.play_time2) {
        toast.success("▶️ Os dois times deram play. Iniciando simulação!");
        await simularPartida(atualizado, "consenso");
      } else {
        const outroTime = ehTime1 ? nomeTime(jogo.id_time2) : nomeTime(jogo.id_time1);
        toast.success(`▶️ Play confirmado. Aguardando ${outroTime}.`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Erro inesperado ao confirmar play.");
    } finally {
      setSalvando(null);
    }
  }

  async function somarSalarios(timeId: string) {
    const { data } = await supabase
      .from("elenco")
      .select("salario")
      .eq("id_time", timeId);

    return (data || []).reduce(
      (acc: number, j: any) => acc + Number(j.salario || 0),
      0,
    );
  }

  async function ajustarJogosElenco(timeId: string, delta: number) {
    const { data } = await supabase
      .from("elenco")
      .select("id,jogos")
      .eq("id_time", timeId);

    await Promise.all(
      (data || []).map((j: any) =>
        supabase
          .from("elenco")
          .update({ jogos: Math.max(0, Number(j.jogos || 0) + delta) })
          .eq("id", j.id),
      ),
    );
  }

  async function ajustarValorizacaoGolsEAssistencias(
    eventos: EventoSimulacao[] | null | undefined,
    direcao: "valorizar" | "estornar" = "valorizar",
  ) {
    const golsEventos = (Array.isArray(eventos) ? eventos : []).filter(
      (evento) => evento?.tipo === "gol",
    );

    if (!golsEventos.length) return;

    const golsPorJogador: Record<string, number> = {};
    const assistenciasPorJogador: Record<string, number> = {};

    async function resolverJogadorPorNome(timeId?: string | null, nome?: string | null) {
      if (!timeId || !nome) return null;

      const { data: encontrado } = await supabase
        .from("elenco")
        .select("id")
        .eq("id_time", timeId)
        .ilike("nome", nome)
        .maybeSingle();

      return encontrado?.id || null;
    }

    for (const evento of golsEventos) {
      let jogadorId =
        evento.jogador_id ||
        evento.id_jogador ||
        (evento as any).jogadorId ||
        null;

      let assistenciaId =
        evento.assistencia_id ||
        evento.id_assistencia ||
        (evento as any).assistenciaId ||
        (evento as any).id_assistente ||
        (evento as any).assistente_id ||
        null;

      if (!jogadorId && evento.jogador && evento.time_id) {
        jogadorId = await resolverJogadorPorNome(evento.time_id, evento.jogador);
      }

      if (!assistenciaId && evento.assistencia && evento.time_id) {
        assistenciaId = await resolverJogadorPorNome(evento.time_id, evento.assistencia);
      }

      if (jogadorId) {
        golsPorJogador[jogadorId] = (golsPorJogador[jogadorId] || 0) + 1;
      }

      if (assistenciaId && assistenciaId !== jogadorId) {
        assistenciasPorJogador[assistenciaId] =
          (assistenciasPorJogador[assistenciaId] || 0) + 1;
      }
    }

    const idsJogadores = Array.from(
      new Set([
        ...Object.keys(golsPorJogador),
        ...Object.keys(assistenciasPorJogador),
      ]),
    );

    if (!idsJogadores.length) return;

    await Promise.all(
      idsJogadores.map(async (jogadorId) => {
        const quantidadeGols = golsPorJogador[jogadorId] || 0;
        const quantidadeAssistencias = assistenciasPorJogador[jogadorId] || 0;

        const { data: jogador, error } = await supabase
          .from("elenco")
          .select("id,nome,valor")
          .eq("id", jogadorId)
          .maybeSingle();

        if (error || !jogador) return;

        const valorAtual = Number(jogador.valor || 0);

        if (!valorAtual || valorAtual <= 0) return;

        const fatorGol = Math.pow(1.0005, quantidadeGols);
        const fatorAssistencia = Math.pow(1.00025, quantidadeAssistencias);
        const fatorTotal = fatorGol * fatorAssistencia;

        const novoValor =
          direcao === "valorizar"
            ? Math.round(valorAtual * fatorTotal)
            : Math.round(valorAtual / fatorTotal);

        await supabase
          .from("elenco")
          .update({ valor: Math.max(0, novoValor) })
          .eq("id", jogadorId);
      }),
    );
  }

  function ehDefensorOuGoleiro(posicao?: string | null) {
    const pos = normalizarPosicao(posicao);

    return (
      pos.includes("GL") ||
      pos.includes("GOL") ||
      pos.includes("GOLEIRO") ||
      pos.includes("ZAG") ||
      pos.includes("ZAGUEIRO") ||
      pos.includes("LD") ||
      pos.includes("LE") ||
      pos.includes("LATERAL")
    );
  }

  function fatorDefensivoPorGolsSofridos(golsSofridos: number) {
    const gols = Number(golsSofridos || 0);

    if (gols === 0) return 1.005;
    if (gols <= 2) return 1.001;
    if (gols > 5) return 0.995;

    return 1;
  }

  async function ajustarValorizacaoDefensiva(
    timeId: string,
    golsSofridos: number,
    direcao: "valorizar" | "estornar" = "valorizar",
  ) {
    const fator = fatorDefensivoPorGolsSofridos(golsSofridos);

    if (fator === 1) return;

    const { data: jogadores, error } = await supabase
      .from("elenco")
      .select("id,nome,posicao,valor")
      .eq("id_time", timeId);

    if (error || !jogadores) return;

    const defensores = ((jogadores || []) as any[]).filter((jogador) =>
      ehDefensorOuGoleiro(jogador.posicao),
    );

    await Promise.all(
      defensores.map(async (jogador) => {
        const valorAtual = Number(jogador.valor || 0);

        if (!valorAtual || valorAtual <= 0) return;

        const novoValor =
          direcao === "valorizar"
            ? Math.round(valorAtual * fator)
            : Math.round(valorAtual / fator);

        await supabase
          .from("elenco")
          .update({ valor: Math.max(0, novoValor) })
          .eq("id", jogador.id);
      }),
    );
  }

  async function premiarTime(timeId: string, golsPro: number, golsContra: number) {
    const base =
      golsPro > golsContra
        ? LIGA_VITORIA
        : golsPro < golsContra
          ? LIGA_DERROTA
          : LIGA_EMPATE;

    const valor = Math.round(
      base + golsPro * LIGA_GOL_MARCADO - golsContra * LIGA_GOL_SOFRIDO,
    );

    await supabase.rpc("atualizar_saldo", { id_time: timeId, valor });

    await supabase.from("movimentacoes").insert({
      id_time: timeId,
      tipo: "premiacao_liga",
      valor,
      descricao: "Premiação por desempenho na Liga",
      data: new Date().toISOString(),
    });

    await supabase.from("bid").insert({
      tipo_evento: "bonus",
      descricao: "Premiação por desempenho na Liga",
      id_time1: timeId,
      valor,
      data_evento: new Date().toISOString(),
    });

    return valor;
  }

  async function salvarPlacar(
    jogo: JogoLiga,
    g1: number,
    g2: number,
    metodoResultado: "manual_com_historia" | "simulado" = "manual_com_historia",
    eventosProntos?: EventoSimulacao[],
    autorizadoPorConsenso = false,
  ) {
    if (!jogo.id_time1 || !jogo.id_time2) return;
    if (!isAdmin && !autorizadoPorConsenso) return;

    setSalvando(jogo.id);

    try {
      let vencedor_id: string | null = null;

      if (g1 > g2) vencedor_id = jogo.id_time1;
      if (g2 > g1) vencedor_id = jogo.id_time2;

      const eventosHistoria =
        eventosProntos ||
        (await gerarHistoriaDoPlacar(jogo, g1, g2, metodoResultado));

      /**
       * Primeiro salva o placar.
       * Só depois paga. Isso evita o problema antigo: pagar e não salvar resultado.
       */
      const { data: jogoAtualizado, error: erroPlacar } = await supabase
        .from("liga_jogos")
        .update({
          gols_time1: g1,
          gols_time2: g2,
          vencedor_id,
          status: "finalizado",
          simulando: false,
          simulado: metodoResultado === "simulado",
          metodo_resultado: metodoResultado,
          eventos_simulacao: eventosHistoria,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (erroPlacar || !jogoAtualizado) {
        console.error("Erro real ao salvar placar:", erroPlacar);
        toast.error(erroPlacar?.message || "Erro ao salvar placar no banco.");
        return;
      }

      setJogos((prev) =>
        prev.map((j) =>
          j.id === jogo.id
            ? {
                ...j,
                gols_time1: g1,
                gols_time2: g2,
                vencedor_id,
                status: "finalizado",
                simulando: false,
                simulado: metodoResultado === "simulado",
                metodo_resultado: metodoResultado,
                eventos_simulacao: eventosHistoria,
              }
            : j,
        ),
      );

      if (jogo.bonus_pago) {
        toast.success("Placar atualizado. Premiação não foi paga novamente.");

        if (metodoResultado === "manual_com_historia") {
          void exibirNarracaoAoVivo(
            { ...jogo, gols_time1: g1, gols_time2: g2 },
            eventosHistoria,
            Math.max(
              650,
              Math.min(1100, Math.floor(14000 / Math.max(1, eventosHistoria.length))),
            ),
          );
        }

        await carregarTudo();
        return;
      }

      const participacaoTime1 = LIGA_PARTICIPACAO_POR_JOGO;
      const participacaoTime2 = LIGA_PARTICIPACAO_POR_JOGO;

      const premiacaoTime1 = await premiarTime(jogo.id_time1, g1, g2);
      const premiacaoTime2 = await premiarTime(jogo.id_time2, g2, g1);

      await supabase.rpc("atualizar_saldo", {
        id_time: jogo.id_time1,
        valor: participacaoTime1,
      });

      await supabase.rpc("atualizar_saldo", {
        id_time: jogo.id_time2,
        valor: participacaoTime2,
      });

      const salariosTime1 = await somarSalarios(jogo.id_time1);
      const salariosTime2 = await somarSalarios(jogo.id_time2);

      await supabase.rpc("atualizar_saldo", {
        id_time: jogo.id_time1,
        valor: -salariosTime1,
      });

      await supabase.rpc("atualizar_saldo", {
        id_time: jogo.id_time2,
        valor: -salariosTime2,
      });

      await ajustarJogosElenco(jogo.id_time1, 1);
      await ajustarJogosElenco(jogo.id_time2, 1);

      const agora = new Date().toISOString();

      await supabase.from("movimentacoes").insert([
        {
          id_time: jogo.id_time1,
          tipo: "participacao_liga",
          valor: participacaoTime1,
          descricao: "Participação fixa por jogo da Liga",
          data: agora,
        },
        {
          id_time: jogo.id_time2,
          tipo: "participacao_liga",
          valor: participacaoTime2,
          descricao: "Participação fixa por jogo da Liga",
          data: agora,
        },
        {
          id_time: jogo.id_time1,
          tipo: "salario_liga",
          valor: salariosTime1,
          descricao: "Desconto de salários após jogo da Liga",
          data: agora,
        },
        {
          id_time: jogo.id_time2,
          tipo: "salario_liga",
          valor: salariosTime2,
          descricao: "Desconto de salários após jogo da Liga",
          data: agora,
        },
      ]);

      await supabase.from("bid").insert([
        {
          tipo_evento: "bonus",
          descricao: `Premiação da Liga: ${nomeTime(jogo.id_time1)}`,
          id_time1: jogo.id_time1,
          valor: participacaoTime1 + premiacaoTime1 - salariosTime1,
          data_evento: agora,
        },
        {
          tipo_evento: "bonus",
          descricao: `Premiação da Liga: ${nomeTime(jogo.id_time2)}`,
          id_time1: jogo.id_time2,
          valor: participacaoTime2 + premiacaoTime2 - salariosTime2,
          data_evento: agora,
        },
      ]);

      await ajustarValorizacaoGolsEAssistencias(eventosHistoria, "valorizar");
      await ajustarValorizacaoDefensiva(jogo.id_time1, g2, "valorizar");
      await ajustarValorizacaoDefensiva(jogo.id_time2, g1, "valorizar");

      const { data: jogoPago, error: erroBonus } = await supabase
        .from("liga_jogos")
        .update({
          gols_time1: g1,
          gols_time2: g2,
          vencedor_id,
          status: "finalizado",
          bonus_pago: true,
          participacao_time1: participacaoTime1,
          participacao_time2: participacaoTime2,
          premiacao_time1: premiacaoTime1,
          premiacao_time2: premiacaoTime2,
          salarios_time1: salariosTime1,
          salarios_time2: salariosTime2,
          simulando: false,
          simulado: metodoResultado === "simulado",
          metodo_resultado: metodoResultado,
          eventos_simulacao: eventosHistoria,
          publico: null,
          renda: 0,
          receita_time1: 0,
          receita_time2: 0,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (erroBonus || !jogoPago) {
        toast.error("Placar salvo, mas houve erro ao marcar premiação paga.");
        await carregarTudo();
        return;
      }

      setJogos((prev) =>
        prev.map((j) => (j.id === jogo.id ? (jogoPago as JogoLiga) : j)),
      );

      if (metodoResultado === "manual_com_historia") {
        toast.success("Placar salvo! Narração ao vivo iniciada.");

        void exibirNarracaoAoVivo(
          { ...jogo, gols_time1: g1, gols_time2: g2 },
          eventosHistoria,
          Math.max(
            650,
            Math.min(1100, Math.floor(14000 / Math.max(1, eventosHistoria.length))),
          ),
        );
      } else {
        toast.success("Placar simulado salvo e premiação paga!");
      }

      await carregarTudo();
    } catch (err) {
      console.error("Erro inesperado ao salvar placar:", err);
      toast.error("Erro inesperado ao salvar placar.");
    } finally {
      setSalvando(null);
    }
  }

  async function excluirPlacar(jogo: JogoLiga) {
    if (!isAdmin || !jogo.id_time1 || !jogo.id_time2) return;

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;

    if (!temPlacar) {
      toast("Esse jogo ainda não tem placar salvo.");
      return;
    }

    if (
      !confirm(
        "Deseja apagar o placar e estornar premiação, participação, salários e valorização?",
      )
    ) {
      return;
    }

    setSalvando(jogo.id);

    try {
      if (jogo.bonus_pago) {
        const participacaoTime1 = Number(jogo.participacao_time1 || 0);
        const participacaoTime2 = Number(jogo.participacao_time2 || 0);
        const premiacaoTime1 = Number(jogo.premiacao_time1 || 0);
        const premiacaoTime2 = Number(jogo.premiacao_time2 || 0);
        const salariosTime1 = Number(jogo.salarios_time1 || 0);
        const salariosTime2 = Number(jogo.salarios_time2 || 0);

        const estornoTime1 =
          -(participacaoTime1 + premiacaoTime1) + salariosTime1;
        const estornoTime2 =
          -(participacaoTime2 + premiacaoTime2) + salariosTime2;

        await supabase.rpc("atualizar_saldo", {
          id_time: jogo.id_time1,
          valor: estornoTime1,
        });

        await supabase.rpc("atualizar_saldo", {
          id_time: jogo.id_time2,
          valor: estornoTime2,
        });

        await ajustarJogosElenco(jogo.id_time1, -1);
        await ajustarJogosElenco(jogo.id_time2, -1);

        await ajustarValorizacaoGolsEAssistencias(
          jogo.eventos_simulacao,
          "estornar",
        );

        await ajustarValorizacaoDefensiva(
          jogo.id_time1,
          Number(jogo.gols_time2 || 0),
          "estornar",
        );

        await ajustarValorizacaoDefensiva(
          jogo.id_time2,
          Number(jogo.gols_time1 || 0),
          "estornar",
        );

        const agora = new Date().toISOString();

        await supabase.from("movimentacoes").insert([
          {
            id_time: jogo.id_time1,
            tipo: "estorno_liga",
            valor: estornoTime1,
            descricao: "Estorno de premiação, participação e salários da Liga",
            data: agora,
          },
          {
            id_time: jogo.id_time2,
            tipo: "estorno_liga",
            valor: estornoTime2,
            descricao: "Estorno de premiação, participação e salários da Liga",
            data: agora,
          },
        ]);

        await supabase.from("bid").insert([
          {
            tipo_evento: "estorno_liga",
            descricao: `Estorno do jogo ${nomeTime(jogo.id_time1)} x ${nomeTime(jogo.id_time2)}`,
            id_time1: jogo.id_time1,
            valor: estornoTime1,
            data_evento: agora,
          },
          {
            tipo_evento: "estorno_liga",
            descricao: `Estorno do jogo ${nomeTime(jogo.id_time2)} x ${nomeTime(jogo.id_time1)}`,
            id_time1: jogo.id_time2,
            valor: estornoTime2,
            data_evento: agora,
          },
        ]);
      }

      const { data: jogoLimpo, error } = await supabase
        .from("liga_jogos")
        .update({
          gols_time1: null,
          gols_time2: null,
          bonus_pago: false,
          vencedor_id: null,
          status: "pendente",
          publico: null,
          renda: 0,
          receita_time1: 0,
          receita_time2: 0,
          participacao_time1: 0,
          participacao_time2: 0,
          premiacao_time1: 0,
          premiacao_time2: 0,
          salarios_time1: 0,
          salarios_time2: 0,
          simulado: false,
          simulando: false,
          eventos_simulacao: [],
          metodo_resultado: null,
          play_time1: false,
          play_time2: false,
          play_solicitado_por: null,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (error || !jogoLimpo) {
        toast.error(error?.message || "Erro ao apagar placar.");
        return;
      }

      setJogos((prev) =>
        prev.map((j) => (j.id === jogo.id ? (jogoLimpo as JogoLiga) : j)),
      );

      toast.success("Placar apagado e valores estornados!");
      await carregarTudo();
    } catch (err) {
      console.error("Erro ao apagar placar:", err);
      toast.error("Erro inesperado ao apagar placar.");
    } finally {
      setSalvando(null);
    }
  }

  async function finalizarLiga() {
    if (!isAdmin || !liga?.id) return;

    if (!jogos.length) {
      toast.error("Ainda não existem jogos.");
      return;
    }

    const todosFinalizados = jogos.every(
      (j) => j.gols_time1 !== null && j.gols_time2 !== null,
    );

    if (!todosFinalizados) {
      toast.error("Todos os jogos precisam estar finalizados.");
      return;
    }

    const campeao = classificacao[0];

    if (!campeao) {
      toast.error("Não foi possível identificar campeão.");
      return;
    }

    await supabase
      .from("liga")
      .update({ status: "finalizada", campeao_id: campeao.id })
      .eq("id", liga.id);

    await supabase.from("bid").insert({
      tipo_evento: "Sistema",
      descricao: `🏆 ${nomeTime(campeao.id)} campeão da LigaFut ${TEMPORADA}.`,
      id_time1: campeao.id,
      valor: null,
      data_evento: new Date().toISOString(),
    });

    toast.success(`🏆 Liga finalizada! Campeão: ${nomeTime(campeao.id)}`);
    await carregarTudo();
  }

  function toggleSelecionado(id: string) {
    if (!isAdmin) return;

    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function renderLogo(id?: string | null, size = 36) {
    return (
      <img
        src={logoTime(id)}
        alt={nomeTime(id)}
        className="rounded-full object-cover bg-white/10"
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.src = "/default.png";
        }}
      />
    );
  }

  function JogoCard({ jogo }: { jogo: JogoLiga }) {
    const [g1Local, setG1Local] = useState<number | string>(jogo.gols_time1 ?? 0);
    const [g2Local, setG2Local] = useState<number | string>(jogo.gols_time2 ?? 0);

    useEffect(() => {
      setG1Local(jogo.gols_time1 ?? 0);
      setG2Local(jogo.gols_time2 ?? 0);
    }, [jogo.gols_time1, jogo.gols_time2]);

    const temPlacar = jogo.gols_time1 !== null && jogo.gols_time2 !== null;
    const eventos = Array.isArray(jogo.eventos_simulacao)
      ? jogo.eventos_simulacao
      : [];
    const aoVivo = jogoAoVivo === jogo.id;
    const placarLive = placarAoVivo[jogo.id];
    const eventosLive = eventosAoVivo[jogo.id] || [];
    const minutoLive = minutoAoVivo[jogo.id];

    const possoDarPlay =
      !!idTimeLogado &&
      (idTimeLogado === jogo.id_time1 || idTimeLogado === jogo.id_time2) &&
      !temPlacar;

    const meuPlayConfirmado =
      idTimeLogado === jogo.id_time1 ? jogo.play_time1 : jogo.play_time2;

    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {renderLogo(jogo.id_time1, 34)}
              <span className="truncate font-black">{nomeTime(jogo.id_time1)}</span>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              {isAdmin ? (
                <>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={g1Local}
                    onChange={(e) => setG1Local(e.target.value)}
                    className="w-12 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center font-black text-white outline-none"
                  />
                  <span className="font-black text-zinc-400">x</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={g2Local}
                    onChange={(e) => setG2Local(e.target.value)}
                    className="w-12 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center font-black text-white outline-none"
                  />
                </>
              ) : (
                <div className="text-lg font-black">
                  {aoVivo && placarLive
                    ? `${placarLive.g1} x ${placarLive.g2}`
                    : temPlacar
                      ? `${jogo.gols_time1} x ${jogo.gols_time2}`
                      : "x"}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 min-w-0">
              <span className="truncate text-right font-black">
                {nomeTime(jogo.id_time2)}
              </span>
              {renderLogo(jogo.id_time2, 34)}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {isAdmin && (
              <>
                <button
                  onClick={() =>
                    salvarPlacar(jogo, clampGol(g1Local), clampGol(g2Local))
                  }
                  disabled={salvando === jogo.id}
                  className="rounded-xl bg-emerald-500/20 px-3 py-2 font-bold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  title="Salvar placar"
                >
                  <FiSave />
                </button>

                <button
                  onClick={() => simularPartida(jogo)}
                  disabled={salvando === jogo.id || temPlacar}
                  className="rounded-xl bg-violet-500/20 px-3 py-2 font-bold text-violet-300 hover:bg-violet-500/30 disabled:opacity-50"
                  title="Simular partida"
                >
                  🎮
                </button>

                {eventos.length > 0 && (
                  <button
                    onClick={() =>
                      exibirNarracaoAoVivo(
                        jogo,
                        eventos,
                        Math.max(
                          500,
                          Math.min(950, Math.floor(12000 / Math.max(1, eventos.length))),
                        ),
                      )
                    }
                    disabled={salvando === jogo.id || jogoAoVivo === jogo.id}
                    className="rounded-xl bg-sky-500/20 px-3 py-2 font-bold text-sky-300 hover:bg-sky-500/30 disabled:opacity-50"
                    title="Rever narração"
                  >
                    🎙️
                  </button>
                )}

                <button
                  onClick={() => excluirPlacar(jogo)}
                  disabled={salvando === jogo.id || !temPlacar}
                  className="rounded-xl bg-rose-500/20 px-3 py-2 font-bold text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
                  title="Excluir placar e estornar"
                >
                  <FiTrash2 />
                </button>
              </>
            )}

            {possoDarPlay && (
              <button
                onClick={() => solicitarPlaySimulacao(jogo)}
                disabled={salvando === jogo.id || !!meuPlayConfirmado || aoVivo}
                className={`rounded-xl px-3 py-2 font-black disabled:opacity-50 ${
                  meuPlayConfirmado
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                }`}
                title="Confirmar simulação"
              >
                {meuPlayConfirmado ? "✅ Play" : "▶️ Play"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span>Rodada {jogo.rodada || "-"}</span>
          <span>Jogo {jogo.ordem || "-"}</span>
          {(jogo as any).jogo_tipo && <span>{(jogo as any).jogo_tipo}</span>}
          {jogo.status && <span>Status: {jogo.status}</span>}
          {jogo.bonus_pago && <span className="text-emerald-300">Premiação paga</span>}
          {jogo.play_time1 && <span className="text-emerald-300">▶️ {nomeTime(jogo.id_time1)}</span>}
          {jogo.play_time2 && <span className="text-emerald-300">▶️ {nomeTime(jogo.id_time2)}</span>}
        </div>

        {aoVivo && (
          <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
            <div className="flex items-center justify-between text-sm font-black text-sky-200">
              <span>🎙️ Ao vivo — {minutoLive || 0}'</span>
              {placarLive && (
                <span>
                  {nomeTime(jogo.id_time1)} {placarLive.g1} x {placarLive.g2}{" "}
                  {nomeTime(jogo.id_time2)}
                </span>
              )}
            </div>

            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1 text-sm text-zinc-200">
              {eventosLive.map((ev, idx) => (
                <div key={`${ev.minuto}-${idx}`} className="rounded-lg bg-black/25 p-2">
                  {ev.texto}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-white">Carregando Liga...</div>;
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 text-zinc-100 space-y-6 sm:px-4 md:px-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-white/[0.04] to-yellow-500/10 p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black">
              <FiAward className="text-yellow-300 drop-shadow" />
              LigaFut — Pontos Corridos
            </h1>
            <p className="text-sm text-zinc-400">
              Formato Campeonato Brasileiro • ida e volta • classificação geral • temporada {TEMPORADA}
            </p>
          </div>

          <button
            onClick={carregarTudo}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/20"
          >
            <FiRefreshCw /> Atualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Status</div>
            <div className="font-black">{liga?.status || "sem liga"}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Participantes</div>
            <div className="font-black">{participantes.length}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Jogos</div>
            <div className="font-black">
              {jogosFinalizados}/{jogos.length}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Líder</div>
            <div className="font-black text-yellow-300">
              {lider ? nomeTime(lider.id) : "-"}
            </div>
          </div>
        </div>

        {liga?.campeao_id && (
          <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 font-black text-yellow-200">
            🏆 Campeão: {nomeTime(liga.campeao_id)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        {(isAdmin
          ? [
              ["participantes", "Participantes"],
              ["classificacao", "Classificação"],
              ["rodadas", "Rodadas"],
              ["artilharia", "Artilharia"],
            ]
          : [
              ["classificacao", "Classificação"],
              ["rodadas", "Rodadas"],
              ["artilharia", "Artilharia"],
            ]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id as Aba)}
            className={`rounded-xl px-4 py-2 text-sm font-black transition ${
              aba === id
                ? "bg-emerald-500 text-black"
                : "bg-white/5 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "participantes" && isAdmin && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black">
                  <FiUsers /> Selecionar times da Liga
                </h2>
                <p className="text-sm text-zinc-400">
                  Selecione quantidade par de times. Para Brasileirão clássico, use 20 times.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={salvarParticipantes}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-black hover:bg-emerald-400"
                >
                  <FiSave /> Salvar participantes
                </button>

                <button
                  onClick={gerarRodadas}
                  className="flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2 font-black text-black hover:bg-yellow-300"
                >
                  <FiCalendar /> Gerar rodadas
                </button>

                <button
                  onClick={finalizarLiga}
                  disabled={!jogos.length}
                  className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 font-black text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  <FiCheckCircle /> Finalizar Liga
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-zinc-300">
              Selecionados: <b className="text-white">{selecionados.length}</b>{" "}
              {selecionados.length > 0 && selecionados.length % 2 !== 0 && (
                <span className="ml-2 text-rose-300">
                  A quantidade precisa ser par.
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {timesComDivisao.map((time) => {
                const ativo = selecionados.includes(time.id);

                return (
                  <button
                    key={time.id}
                    onClick={() => toggleSelecionado(time.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      ativo
                        ? "border-emerald-400 bg-emerald-500/15"
                        : "border-white/10 bg-black/20 hover:bg-white/10"
                    }`}
                  >
                    {renderLogo(time.id, 42)}
                    <div className="min-w-0">
                      <div className="truncate font-black">{time.nome}</div>
                      <div className="text-xs text-zinc-400">
                        Divisão {time.divisao || "-"} • OVR {time.overall || "-"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {aba === "classificacao" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Tabela de Classificação</h2>
              <p className="text-sm text-zinc-400">
                Rodada atual: {rodadaAtual}/{totalRodadas || "-"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-300">
                G4
              </span>
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-rose-300">
                Z{zonaRebaixamento}
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
              <thead className="text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3">#</th>
                  <th className="px-3">Time</th>
                  <th className="px-3 text-center">PTS</th>
                  <th className="px-3 text-center">J</th>
                  <th className="px-3 text-center">V</th>
                  <th className="px-3 text-center">E</th>
                  <th className="px-3 text-center">D</th>
                  <th className="px-3 text-center">GP</th>
                  <th className="px-3 text-center">GC</th>
                  <th className="px-3 text-center">SG</th>
                  <th className="px-3 text-center">%</th>
                </tr>
              </thead>

              <tbody>
                {classificacao.map((c, idx) => {
                  const pos = idx + 1;
                  const isG4 = pos <= zonaLibertadores;
                  const isZ4 =
                    classificacao.length >= zonaRebaixamento &&
                    pos > classificacao.length - zonaRebaixamento;

                  return (
                    <tr
                      key={c.id}
                      className={`rounded-xl ${
                        isG4
                          ? "bg-emerald-500/10"
                          : isZ4
                            ? "bg-rose-500/10"
                            : "bg-black/25"
                      }`}
                    >
                      <td className="rounded-l-xl px-3 py-3 font-black">
                        {pos}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {renderLogo(c.id, 32)}
                          <span className="font-black">{nomeTime(c.id)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-black text-yellow-300">
                        {c.pts}
                      </td>
                      <td className="px-3 py-3 text-center">{c.j}</td>
                      <td className="px-3 py-3 text-center">{c.v}</td>
                      <td className="px-3 py-3 text-center">{c.e}</td>
                      <td className="px-3 py-3 text-center">{c.d}</td>
                      <td className="px-3 py-3 text-center">{c.gp}</td>
                      <td className="px-3 py-3 text-center">{c.gc}</td>
                      <td className="px-3 py-3 text-center">{c.sg}</td>
                      <td className="rounded-r-xl px-3 py-3 text-center">
                        {c.aproveitamento}%
                      </td>
                    </tr>
                  );
                })}

                {!classificacao.length && (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-zinc-400">
                      Nenhum participante encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === "rodadas" && (
        <div className="space-y-4">
          {!jogos.length && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-zinc-400">
              Nenhuma rodada gerada ainda.
            </div>
          )}

          {Object.keys(jogosPorRodada)
            .map(Number)
            .sort((a, b) => a - b)
            .map((rodada) => {
              const lista = jogosPorRodada[rodada] || [];
              const finalizados = lista.filter(
                (j) => j.gols_time1 !== null && j.gols_time2 !== null,
              ).length;

              return (
                <div
                  key={rodada}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-black">Rodada {rodada}</h2>
                      <p className="text-sm text-zinc-400">
                        {finalizados}/{lista.length} jogos finalizados
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {lista.map((jogo) => (
                      <JogoCard key={jogo.id} jogo={jogo} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {aba === "artilharia" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-black">Artilharia da Liga</h2>
          <p className="mt-2 text-sm text-zinc-400">
            A artilharia pode usar a mesma lógica da sua página atual, lendo os
            eventos_simulacao de liga_jogos. Nesta primeira versão, a Liga já
            salva jogador, assistência e eventos de gol para alimentar esse ranking.
          </p>

          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-yellow-100">
            Próximo passo: se quiser, eu monto a página completa de artilharia
            lendo diretamente todos os gols da tabela <b>liga_jogos</b>.
          </div>
        </div>
      )}
    </div>
  );
}
