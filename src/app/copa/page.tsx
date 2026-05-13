"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";
import { useAdmin } from "@/hooks/useAdmin";
import {
  FiRefreshCw,
  FiSave,
  FiShuffle,
  FiTrash2,
  FiAward,
} from "react-icons/fi";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const TEMPORADA = process.env.NEXT_PUBLIC_TEMPORADA || "2025-26";

const COPA_PARTICIPACAO_POR_JOGO = 3_000_000;
const COPA_VITORIA = 8_000_000;
const COPA_EMPATE = 4_000_000;
const COPA_DERROTA = 2_500_000;
const COPA_GOL_MARCADO = 400_000;
const COPA_GOL_SOFRIDO = 40_000;

const GRUPOS = ["A", "B", "C", "D"] as const;
const FASES_MATA_MATA = ["quartas", "semi", "final"] as const;

type Time = {
  id: string;
  nome: string;
  logo?: string | null;
  logo_url?: string | null;
  overall?: number | null;
  valor?: number | null;
  saldo?: number | null;
  divisao?: string | number | null;
};

type Copa = {
  id: string;
  temporada: string;
  nome: string;
  formato: string;
  status: string;
  campeao_id?: string | null;
};

type Participante = {
  id: string;
  copa_id: string;
  id_time: string;
  pote: number | null;
  grupo: string | null;
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

type FichaTecnica = {
  posse_time1: number;
  posse_time2: number;
  finalizacoes_time1: number;
  finalizacoes_time2: number;
  finalizacoes_certas_time1: number;
  finalizacoes_certas_time2: number;
  escanteios_time1: number;
  escanteios_time2: number;
  faltas_time1: number;
  faltas_time2: number;
  amarelos_time1: number;
  amarelos_time2: number;
  vermelhos_time1: number;
  vermelhos_time2: number;
  defesas_time1: number;
  defesas_time2: number;
};

type NotaJogador = {
  jogador_id?: string | null;
  id_time: string;
  time_nome: string;
  nome: string;
  posicao?: string | null;
  overall?: number | null;
  nota: number;
  gols: number;
  assistencias: number;
  destaque?: string | null;
};

type Jogo = {
  id: string;
  copa_id: string;
  fase: string;
  grupo: string | null;
  rodada: number | null;
  ordem: number | null;
  id_time1: string | null;
  id_time2: string | null;
  gols_time1: number | null;
  gols_time2: number | null;
  bonus_pago: boolean | null;
  jogo_tipo: string | null;
  confronto_id: string | null;
  vencedor_id: string | null;
  status: string | null;

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
  ficha_tecnica?: FichaTecnica | null;
  notas_jogadores?: NotaJogador[] | null;
  metodo_resultado?: "manual" | "manual_com_historia" | "simulado" | null;
  play_time1?: boolean | null;
  play_time2?: boolean | null;
  play_solicitado_por?: string | null;
};

type Classificacao = {
  id: string;
  grupo: string;
  pts: number;
  j: number;
  v: number;
  e: number;
  d: number;
  gp: number;
  gc: number;
  sg: number;
};

function dinheiro(valor: number) {
  return `R$ ${Number(valor || 0).toLocaleString("pt-BR")}`;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cloneGrupos(grupos: Record<string, string[]>) {
  return {
    A: [...(grupos.A || [])],
    B: [...(grupos.B || [])],
    C: [...(grupos.C || [])],
    D: [...(grupos.D || [])],
  };
}

function vazioGrupos() {
  return { A: [], B: [], C: [], D: [] } as Record<string, string[]>;
}

function clampGol(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 99) return 99;
  return Math.floor(n);
}

function gerarJogosIdaVolta(ids: string[]) {
  const jogos: { rodada: number; time1: string; time2: string }[] = [];
  const pares: [string, string][] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pares.push([ids[i], ids[j]]);
    }
  }

  pares.forEach((p, idx) => {
    jogos.push({ rodada: idx + 1, time1: p[0], time2: p[1] });
  });

  pares.forEach((p, idx) => {
    jogos.push({ rodada: idx + 7, time1: p[1], time2: p[0] });
  });

  return jogos;
}

function normalizarPosicao(pos?: string | null) {
  return String(pos || "")
    .toUpperCase()
    .trim();
}

function pesoArtilheiro(j: JogadorElenco) {
  const pos = normalizarPosicao(j.posicao);
  const overall = Number(j.overall || 60);

  let pesoPosicao = 1;
  if (
    ["CA", "SA", "PD", "PE", "ATA", "ATACANTE", "PONTA"].some((p) =>
      pos.includes(p),
    )
  )
    pesoPosicao = 5;
  else if (["MEI", "MC", "MD", "ME", "VOL"].some((p) => pos.includes(p)))
    pesoPosicao = 3;
  else if (["LD", "LE", "ZAG"].some((p) => pos.includes(p))) pesoPosicao = 1.3;
  else if (["GL", "GOL"].some((p) => pos.includes(p))) pesoPosicao = 0.25;

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

  // Em alguns gols pode não haver assistência, como rebote, pênalti ou jogada individual.
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

export default function CopaPage() {
  const { isAdmin } = useAdmin();

  const [times, setTimes] = useState<Time[]>([]);
  const [copa, setCopa] = useState<Copa | null>(null);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [jogos, setJogos] = useState<Jogo[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aba, setAba] = useState<"selecao" | "grupos" | "jogos" | "mata">(
    "selecao",
  );
  const [sorteandoAoVivo, setSorteandoAoVivo] = useState(false);
  const [sorteioConfirmavel, setSorteioConfirmavel] = useState(false);
  const [previewGrupos, setPreviewGrupos] =
    useState<Record<string, string[]>>(vazioGrupos());
  const [poteAtual, setPoteAtual] = useState<number | null>(null);
  const [grupoAtual, setGrupoAtual] = useState<string | null>(null);
  const [timeAtual, setTimeAtual] = useState<string | null>(null);
  const [passoSorteio, setPassoSorteio] = useState(0);

  // Narração em tempo real estilo Brasfoot
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

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && aba === "selecao") {
      setAba("grupos");
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
          // ignora localStorage que não esteja em JSON
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

    if (timesErr) toast.error("Erro ao carregar times da tabela times.");

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

    let copaAtual: Copa | null = null;
    const { data: copaData, error: copaErr } = await supabase
      .from("copa")
      .select("*")
      .eq("temporada", TEMPORADA)
      .maybeSingle();

    if (copaErr) {
      toast.error("Erro ao carregar Copa.");
    }

    copaAtual = (copaData as Copa | null) || null;

    if (!copaAtual && isAdmin) {
      const { data: nova, error } = await supabase
        .from("copa")
        .insert({
          temporada: TEMPORADA,
          nome: "Copa LigaFut",
          formato: "champions",
          status: "selecao",
        })
        .select("*")
        .single();

      if (error) toast.error("Erro ao criar Copa da temporada.");
      copaAtual = (nova as Copa | null) || null;
    }

    setCopa(copaAtual);

    if (copaAtual?.id) {
      const [
        { data: parts, error: partsErr },
        { data: jogosData, error: jogosErr },
      ] = await Promise.all([
        supabase
          .from("copa_participantes")
          .select("*")
          .eq("copa_id", copaAtual.id),
        supabase
          .from("copa_jogos")
          .select("*")
          .eq("copa_id", copaAtual.id)
          .order("fase", { ascending: true })
          .order("grupo", { ascending: true })
          .order("rodada", { ascending: true })
          .order("ordem", { ascending: true }),
      ]);

      if (partsErr) toast.error("Erro ao carregar participantes.");
      if (jogosErr) toast.error("Erro ao carregar jogos.");

      setParticipantes((parts || []) as Participante[]);
      setSelecionados((parts || []).map((p: any) => p.id_time));
      setJogos((jogosData || []) as Jogo[]);
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
    return timesMap[id]?.logo_url || timesMap[id]?.logo || "/default.png";
  }

  async function buscarJogadoresDoTime(
    timeId: string,
  ): Promise<JogadorElenco[]> {
    const { data, error } = await supabase
      .from("elenco")
      .select("id,nome,posicao,overall,valor")
      .eq("id_time", timeId);

    if (error) {
      console.error("Erro ao buscar elenco para simulação:", error);
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

    if (!jogadores.length) {
      return mandante ? 58 : 54;
    }

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

    // Ajuste para evitar muitos 0x0 e placares absurdos.
    if (g1 === 0 && g2 === 0 && Math.random() < 0.45) {
      if (Math.random() * (forca1 + forca2) < forca1) g1 = 1;
      else g2 = 1;
    }

    return {
      g1: limitarPlacar(g1),
      g2: limitarPlacar(g2),
    };
  }

  function numeroAleatorio(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function clampNota(nota: number) {
    return Math.max(4, Math.min(10, Number(nota.toFixed(1))));
  }

  function gerarFichaTecnicaIlustrativa(
    jogo: Jogo,
    g1: number,
    g2: number,
    eventos: EventoSimulacao[],
  ): FichaTecnica {
    const amarelos = eventos.filter((e) => e.tipo === "cartao").length;
    const vermelhos = eventos.filter((e) => e.tipo === "vermelho").length;
    const defesas = eventos.filter((e) => e.tipo === "defesa").length;

    const diff = g1 - g2;
    const posseTime1 = Math.max(
      38,
      Math.min(62, 50 + diff * 3 + numeroAleatorio(-6, 6)),
    );
    const posseTime2 = 100 - posseTime1;

    const finalizacoesTime1 = Math.max(g1 + 3, g1 * 3 + numeroAleatorio(6, 14));
    const finalizacoesTime2 = Math.max(g2 + 3, g2 * 3 + numeroAleatorio(6, 14));
    const certasTime1 = Math.min(
      finalizacoesTime1,
      Math.max(g1, g1 + numeroAleatorio(2, 6)),
    );
    const certasTime2 = Math.min(
      finalizacoesTime2,
      Math.max(g2, g2 + numeroAleatorio(2, 6)),
    );

    return {
      posse_time1: posseTime1,
      posse_time2: posseTime2,
      finalizacoes_time1: finalizacoesTime1,
      finalizacoes_time2: finalizacoesTime2,
      finalizacoes_certas_time1: certasTime1,
      finalizacoes_certas_time2: certasTime2,
      escanteios_time1: numeroAleatorio(2, 9),
      escanteios_time2: numeroAleatorio(2, 9),
      faltas_time1: numeroAleatorio(6, 18),
      faltas_time2: numeroAleatorio(6, 18),
      amarelos_time1: Math.floor(amarelos / 2) + numeroAleatorio(0, 2),
      amarelos_time2: Math.ceil(amarelos / 2) + numeroAleatorio(0, 2),
      vermelhos_time1: vermelhos > 0 && Math.random() < 0.5 ? 1 : 0,
      vermelhos_time2: vermelhos > 0 && Math.random() >= 0.5 ? 1 : 0,
      defesas_time1: Math.max(
        0,
        defesas + certasTime2 - g2 - numeroAleatorio(0, 2),
      ),
      defesas_time2: Math.max(
        0,
        defesas + certasTime1 - g1 - numeroAleatorio(0, 2),
      ),
    };
  }

  async function gerarNotasJogadoresIlustrativas(
    jogo: Jogo,
    g1: number,
    g2: number,
    eventos: EventoSimulacao[],
  ): Promise<NotaJogador[]> {
    if (!jogo.id_time1 || !jogo.id_time2) return [];

    const [jogadores1, jogadores2] = await Promise.all([
      buscarJogadoresDoTime(jogo.id_time1),
      buscarJogadoresDoTime(jogo.id_time2),
    ]);

    const golsPorJogador: Record<string, number> = {};
    const assistenciasPorJogador: Record<string, number> = {};

    eventos
      .filter((e) => e.tipo === "gol")
      .forEach((evento) => {
        const jogadorId =
          evento.jogador_id ||
          evento.id_jogador ||
          (evento as any).jogadorId ||
          null;
        const assistenciaId =
          evento.assistencia_id ||
          evento.id_assistencia ||
          (evento as any).assistenciaId ||
          (evento as any).id_assistente ||
          (evento as any).assistente_id ||
          null;

        if (jogadorId)
          golsPorJogador[jogadorId] = (golsPorJogador[jogadorId] || 0) + 1;
        if (assistenciaId && assistenciaId !== jogadorId) {
          assistenciasPorJogador[assistenciaId] =
            (assistenciasPorJogador[assistenciaId] || 0) + 1;
        }
      });

    const montarNotas = (
      jogadores: JogadorElenco[],
      timeId: string,
      timeNome: string,
      golsPro: number,
      golsContra: number,
    ) => {
      return jogadores.map((jogador) => {
        const id = jogador.id || "";
        const gols = id ? golsPorJogador[id] || 0 : 0;
        const assistencias = id ? assistenciasPorJogador[id] || 0 : 0;
        const pos = normalizarPosicao(jogador.posicao);

        let nota = 6 + Math.random() * 1.2;
        nota += gols * 1.4;
        nota += assistencias * 0.8;
        if (golsPro > golsContra) nota += 0.45;
        if (golsPro === golsContra) nota += 0.15;
        if (golsPro < golsContra) nota -= 0.35;

        const defensorOuGoleiro =
          pos.includes("GL") ||
          pos.includes("GOL") ||
          pos.includes("ZAG") ||
          pos.includes("LD") ||
          pos.includes("LE") ||
          pos.includes("LATERAL");

        if (defensorOuGoleiro && golsContra === 0) nota += 0.9;
        if (defensorOuGoleiro && golsContra <= 2) nota += 0.25;
        if (defensorOuGoleiro && golsContra > 4) nota -= 0.8;

        let destaque: string | null = null;
        if (gols >= 2) destaque = "Decisivo";
        else if (gols === 1) destaque = "Fez gol";
        else if (assistencias >= 2) destaque = "Garçom";
        else if (assistencias === 1) destaque = "Assistência";
        else if (defensorOuGoleiro && golsContra === 0)
          destaque = "Defesa segura";

        return {
          jogador_id: id || null,
          id_time: timeId,
          time_nome: timeNome,
          nome: jogador.nome,
          posicao: jogador.posicao || null,
          overall: jogador.overall || null,
          nota: clampNota(nota),
          gols,
          assistencias,
          destaque,
        } as NotaJogador;
      });
    };

    const notas = [
      ...montarNotas(
        jogadores1,
        jogo.id_time1,
        nomeTime(jogo.id_time1),
        g1,
        g2,
      ),
      ...montarNotas(
        jogadores2,
        jogo.id_time2,
        nomeTime(jogo.id_time2),
        g2,
        g1,
      ),
    ];

    return notas.sort(
      (a, b) =>
        b.nota - a.nota || b.gols - a.gols || b.assistencias - a.assistencias,
    );
  }

  async function gerarHistoriaDoPlacar(
    jogo: Jogo,
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
        texto: `🔥 ${Math.floor(Math.random() * 20) + 5}' Começo intenso, os dois times tentam acelerar o jogo.`,
      },
      {
        minuto: Math.floor(Math.random() * 25) + 25,
        tipo: "defesa",
        texto: `🧤 ${Math.floor(Math.random() * 25) + 25}' Grande defesa! O goleiro evita um gol quase certo.`,
      },
      {
        minuto: Math.floor(Math.random() * 25) + 50,
        tipo: "cartao",
        texto: `🟨 ${Math.floor(Math.random() * 25) + 50}' Cartão amarelo após falta dura no meio-campo.`,
      },
      {
        minuto: Math.floor(Math.random() * 15) + 75,
        tipo: "chance",
        texto: `🚨 ${Math.floor(Math.random() * 15) + 75}' Pressão nos minutos finais, a torcida sente que pode sair mais um gol.`,
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
    jogo: Jogo,
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

  async function simularPartida(
    jogo: Jogo,
    origem: "admin" | "consenso" = "admin",
  ) {
    if (!jogo.id_time1 || !jogo.id_time2) return;
    if (origem === "admin" && !isAdmin) return;

    if (origem === "consenso" && !(jogo.play_time1 && jogo.play_time2)) {
      toast.error("A simulação só começa quando os dois times apertarem play.");
      return;
    }

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;
    if (temPlacar) {
      toast.error(
        "Esse jogo já tem placar. Apague o resultado antes de simular novamente.",
      );
      return;
    }

    setSalvando(jogo.id);
    toast.loading("🎮 Simulando partida estilo Brasfoot...", {
      id: `sim-${jogo.id}`,
    });

    try {
      await supabase
        .from("copa_jogos")
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
      const eventosHistoria = await gerarHistoriaDoPlacar(
        jogo,
        g1,
        g2,
        "simulado",
      );
      const delay = Math.max(
        650,
        Math.min(1100, Math.floor(16000 / Math.max(1, eventosHistoria.length))),
      );

      toast.loading("🎙️ Narração ao vivo em andamento...", {
        id: `sim-${jogo.id}`,
      });
      await exibirNarracaoAoVivo(jogo, eventosHistoria, delay);

      await salvarPlacar(
        jogo,
        g1,
        g2,
        "simulado",
        eventosHistoria,
        origem === "consenso",
      );

      toast.success(
        `🎮 Simulação concluída! ${nomeTime(jogo.id_time1)} ${g1} x ${g2} ${nomeTime(jogo.id_time2)}`,
        { id: `sim-${jogo.id}`, duration: 7000 },
      );
    } catch (error: any) {
      console.error("Erro ao simular partida:", error);
      await supabase
        .from("copa_jogos")
        .update({ simulando: false })
        .eq("id", jogo.id);
      toast.error(error?.message || "Erro ao simular partida.", {
        id: `sim-${jogo.id}`,
      });
    } finally {
      setSalvando(null);
    }
  }

  async function solicitarPlaySimulacao(jogo: Jogo) {
    if (!jogo.id_time1 || !jogo.id_time2) return;

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;
    if (temPlacar) {
      toast.error("Esse jogo já tem placar salvo.");
      return;
    }

    if (jogo.simulando || salvando === jogo.id || jogoAoVivo === jogo.id) {
      toast.error("Esse jogo já está em processo de simulação.");
      return;
    }

    if (!idTimeLogado) {
      toast.error(
        "Não encontrei o time logado. Verifique se o login salva id_time no localStorage.",
      );
      return;
    }

    const ehTime1 = idTimeLogado === jogo.id_time1;
    const ehTime2 = idTimeLogado === jogo.id_time2;

    if (!ehTime1 && !ehTime2) {
      toast.error("Você só pode apertar play nos jogos do seu próprio time.");
      return;
    }

    const updatePayload: Partial<Jogo> = {
      play_time1: ehTime1 ? true : !!jogo.play_time1,
      play_time2: ehTime2 ? true : !!jogo.play_time2,
      play_solicitado_por: idTimeLogado,
      metodo_resultado: "simulado",
    };

    setSalvando(jogo.id);

    try {
      const { data: jogoAtualizado, error } = await supabase
        .from("copa_jogos")
        .update(updatePayload)
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (error || !jogoAtualizado) {
        console.error("Erro ao registrar play:", error);
        toast.error(error?.message || "Erro ao registrar play.");
        return;
      }

      const atualizado = jogoAtualizado as Jogo;
      setJogos((prev) => prev.map((j) => (j.id === jogo.id ? atualizado : j)));

      if (atualizado.play_time1 && atualizado.play_time2) {
        toast.success("▶️ Os dois times deram play. Iniciando simulação!");
        await simularPartida(atualizado, "consenso");
      } else {
        const outroTime = ehTime1
          ? nomeTime(jogo.id_time2)
          : nomeTime(jogo.id_time1);
        toast.success(
          `▶️ Play confirmado. Aguardando ${outroTime} também confirmar.`,
        );
      }
    } catch (error: any) {
      console.error("Erro inesperado no play:", error);
      toast.error(error?.message || "Erro inesperado ao confirmar play.");
    } finally {
      setSalvando(null);
    }
  }

  async function garantirCopaAtual() {
    if (!isAdmin) {
      toast.error("Apenas admin pode alterar a Copa.");
      return null;
    }

    if (copa?.id) return copa;

    const { data: existente, error: erroBusca } = await supabase
      .from("copa")
      .select("*")
      .eq("temporada", TEMPORADA)
      .maybeSingle();

    if (erroBusca) {
      console.error("Erro ao buscar copa:", erroBusca);
      toast.error("Erro ao buscar Copa da temporada.");
      return null;
    }

    if (existente?.id) {
      setCopa(existente as Copa);
      return existente as Copa;
    }

    const { data: nova, error: erroCriar } = await supabase
      .from("copa")
      .insert({
        temporada: TEMPORADA,
        nome: "Copa LigaFut",
        formato: "champions",
        status: "selecao",
      })
      .select("*")
      .single();

    if (erroCriar || !nova) {
      console.error("Erro ao criar copa:", erroCriar);
      toast.error("Erro ao criar Copa da temporada.");
      return null;
    }

    setCopa(nova as Copa);
    return nova as Copa;
  }

  async function buscarParticipantesAtualizados(copaId: string) {
    const { data, error } = await supabase
      .from("copa_participantes")
      .select("*")
      .eq("copa_id", copaId);

    if (error) {
      console.error("Erro ao buscar participantes:", error);
      toast.error("Erro ao buscar participantes salvos.");
      return [] as Participante[];
    }

    const lista = (data || []) as Participante[];
    setParticipantes(lista);
    setSelecionados(lista.map((p) => p.id_time));
    return lista;
  }

  async function salvarParticipantes() {
    const copaBase = await garantirCopaAtual();
    if (!copaBase) return;

    if (selecionados.length !== 16) {
      toast.error("Selecione exatamente 16 times.");
      return;
    }

    const temJogos = jogos.length > 0;
    if (
      temJogos &&
      !confirm(
        "Isso vai recriar os participantes e pode bagunçar a copa atual. Continuar?",
      )
    )
      return;

    await supabase
      .from("copa_participantes")
      .delete()
      .eq("copa_id", copaBase.id);
    await supabase.from("copa_jogos").delete().eq("copa_id", copaBase.id);

    const ordenados = selecionados
      .map((id) => timesMap[id])
      .filter(Boolean)
      .sort(
        (a, b) =>
          Number(b.overall || 0) - Number(a.overall || 0) ||
          Number(b.valor || 0) - Number(a.valor || 0),
      );

    const rows = ordenados.map((t, idx) => ({
      copa_id: copaBase.id,
      id_time: t.id,
      pote: Math.floor(idx / 4) + 1,
      grupo: null,
    }));

    const { error } = await supabase.from("copa_participantes").insert(rows);

    if (error) {
      console.error("Erro ao salvar participantes:", error);
      toast.error(error.message || "Erro ao salvar participantes.");
      return;
    }

    await supabase
      .from("copa")
      .update({ status: "potes", campeao_id: null })
      .eq("id", copaBase.id);

    setCopa({ ...copaBase, status: "potes", campeao_id: null });
    setParticipantes(
      rows.map((r, idx) => ({
        id: `local_${idx}`,
        copa_id: copaBase.id,
        id_time: r.id_time,
        pote: r.pote,
        grupo: null,
      })),
    );
    setPreviewGrupos(vazioGrupos());
    setSorteioConfirmavel(false);
    setPassoSorteio(0);
    toast.success("Participantes salvos e potes definidos!");
    setAba("selecao");
    await carregarTudo();
  }

  function montarListaSorteio(listaParticipantes = participantes) {
    // Novo sorteio: NÃO separa por potes.
    // Usa os 16 times selecionados/salvos, embaralha tudo e distribui:
    // Grupo A recebe 1, depois B, C, D, repetindo até completar 4 por grupo.
    const idsSalvos = listaParticipantes.map((p) => p.id_time).filter(Boolean);
    const idsSelecionados = selecionados.filter(Boolean);
    const baseIds = idsSalvos.length === 16 ? idsSalvos : idsSelecionados;
    const unicos = Array.from(new Set(baseIds));

    if (unicos.length !== 16) {
      toast.error("Selecione exatamente 16 times antes de sortear.");
      return null;
    }

    return shuffle(unicos);
  }

  async function iniciarSorteioAnimado() {
    const copaBase = await garantirCopaAtual();
    if (!copaBase) return;

    let participantesBase = participantes;
    if (participantesBase.length !== 16) {
      participantesBase = await buscarParticipantesAtualizados(copaBase.id);
    }

    const listaSorteio = montarListaSorteio(participantesBase);
    if (!listaSorteio) return;

    const jogosComPlacar = jogos.some(
      (j) => j.gols_time1 !== null || j.gols_time2 !== null,
    );

    if (
      jogosComPlacar &&
      !confirm(
        "Já existem placares salvos. O sorteio ainda será só teste, mas confirmar depois apagará os jogos atuais. Continuar?",
      )
    ) {
      return;
    }

    setAba("selecao");
    setSorteandoAoVivo(true);
    setSorteioConfirmavel(false);
    setPreviewGrupos(vazioGrupos());
    setPoteAtual(null);
    setGrupoAtual(null);
    setTimeAtual(null);
    setPassoSorteio(0);

    const grupoTimes: Record<string, string[]> = vazioGrupos();

    for (let idx = 0; idx < listaSorteio.length; idx++) {
      const grupo = GRUPOS[idx % GRUPOS.length];
      const idTime = listaSorteio[idx];

      setPoteAtual(null);
      setGrupoAtual(grupo);
      setTimeAtual(idTime);
      setPassoSorteio(idx + 1);

      await sleep(2000);

      grupoTimes[grupo].push(idTime);
      setPreviewGrupos(cloneGrupos(grupoTimes));
    }

    setPoteAtual(null);
    setGrupoAtual(null);
    setTimeAtual(null);
    setSorteandoAoVivo(false);
    setSorteioConfirmavel(true);
    toast.success(
      "Sorteio teste concluído. Agora confirme para salvar no banco.",
    );
  }

  function reiniciarSorteioTeste() {
    if (sorteandoAoVivo) {
      toast.error("Aguarde o sorteio atual terminar para reiniciar.");
      return;
    }

    setPreviewGrupos(vazioGrupos());
    setSorteioConfirmavel(false);
    setPoteAtual(null);
    setGrupoAtual(null);
    setTimeAtual(null);
    setPassoSorteio(0);
    toast("Sorteio teste reiniciado.");
  }

  async function confirmarSorteioEGerarJogos() {
    const copaBase = await garantirCopaAtual();
    if (!copaBase) return;

    const totalPreview = GRUPOS.reduce(
      (acc, g) => acc + (previewGrupos[g]?.length || 0),
      0,
    );

    if (!sorteioConfirmavel || totalPreview !== 16) {
      toast.error("Faça o sorteio ao vivo completo antes de confirmar.");
      return;
    }

    const gruposCom4 = GRUPOS.every(
      (g) => (previewGrupos[g] || []).length === 4,
    );
    if (!gruposCom4) {
      toast.error("Todos os grupos precisam ter 4 times.");
      return;
    }

    const jogosComPlacar = jogos.some(
      (j) => j.gols_time1 !== null || j.gols_time2 !== null,
    );

    if (
      jogosComPlacar &&
      !confirm(
        "Confirmar este sorteio apagará os jogos atuais e placares salvos. Continuar?",
      )
    ) {
      return;
    }

    await supabase.from("copa_jogos").delete().eq("copa_id", copaBase.id);

    // Garante que os participantes existem no banco mesmo se o admin clicou direto em
    // "Sorteio ao vivo" usando apenas os selecionados na tela.
    await supabase
      .from("copa_participantes")
      .delete()
      .eq("copa_id", copaBase.id);

    const participantesInsert: any[] = [];
    GRUPOS.forEach((g) => {
      previewGrupos[g].forEach((idTime, idx) => {
        participantesInsert.push({
          copa_id: copaBase.id,
          id_time: idTime,
          pote: idx + 1,
          grupo: g,
        });
      });
    });

    const { error: partError } = await supabase
      .from("copa_participantes")
      .insert(participantesInsert);

    if (partError) {
      console.error("Erro ao salvar participantes do sorteio:", partError);
      toast.error(
        partError.message || "Erro ao salvar participantes do sorteio.",
      );
      return;
    }

    const jogosInsert: any[] = [];

    GRUPOS.forEach((g) => {
      const jogosGrupo = gerarJogosIdaVolta(previewGrupos[g]);
      jogosGrupo.forEach((j, idx) => {
        jogosInsert.push({
          copa_id: copaBase.id,
          fase: "grupos",
          grupo: g,
          rodada: j.rodada,
          ordem: idx + 1,
          id_time1: j.time1,
          id_time2: j.time2,
          gols_time1: null,
          gols_time2: null,
          bonus_pago: false,
          jogo_tipo: idx < 6 ? "ida" : "volta",
          confronto_id: `grupo_${g}_${Math.floor(idx % 6) + 1}`,
          vencedor_id: null,
          status: "pendente",
          ficha_tecnica: null,
          notas_jogadores: [],
        });
      });
    });

    const { error } = await supabase.from("copa_jogos").insert(jogosInsert);
    if (error) {
      console.error("Erro ao confirmar sorteio e gerar jogos:", error);
      toast.error(error.message || "Erro ao confirmar sorteio e gerar jogos.");
      return;
    }

    await supabase
      .from("copa")
      .update({ status: "grupos", campeao_id: null })
      .eq("id", copaBase.id);

    await supabase.from("bid").insert({
      tipo_evento: "Sistema",
      descricao:
        "Copa Champions confirmada: sorteio ao vivo, 4 grupos de 4 times, ida e volta.",
      valor: null,
      data_evento: new Date().toISOString(),
    });

    toast.success("Sorteio confirmado! Jogos ida e volta gerados.");
    setSorteioConfirmavel(false);
    setAba("grupos");
    await carregarTudo();
  }

  async function sortearGruposEGerarJogos() {
    await iniciarSorteioAnimado();
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

    async function resolverJogadorPorNome(
      timeId?: string | null,
      nome?: string | null,
    ) {
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

      // Compatibilidade com gols antigos que tinham apenas nome do jogador.
      if (!jogadorId && evento.jogador && evento.time_id) {
        jogadorId = await resolverJogadorPorNome(
          evento.time_id,
          evento.jogador,
        );
      }

      // Compatibilidade com assistências salvas apenas com nome.
      if (!assistenciaId && evento.assistencia && evento.time_id) {
        assistenciaId = await resolverJogadorPorNome(
          evento.time_id,
          evento.assistencia,
        );
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

        if (error || !jogador) {
          console.error("Erro ao buscar jogador para valorização:", error);
          return;
        }

        const valorAtual = Number(jogador.valor || 0);
        if (!valorAtual || valorAtual <= 0) return;

        const fatorGol = Math.pow(1.0005, quantidadeGols); // +0,05% por gol
        const fatorAssistencia = Math.pow(1.00025, quantidadeAssistencias); // +0,025% por assistência
        const fatorTotal = fatorGol * fatorAssistencia;

        const novoValor =
          direcao === "valorizar"
            ? Math.round(valorAtual * fatorTotal)
            : Math.round(valorAtual / fatorTotal);

        const { error: updateError } = await supabase
          .from("elenco")
          .update({ valor: Math.max(0, novoValor) })
          .eq("id", jogadorId);

        if (updateError) {
          console.error(
            "Erro ao atualizar valorização do jogador:",
            updateError,
          );
        }
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

    // Tabelamento defensivo LigaFut:
    // 0 gols sofridos = +0,5%
    // 1 ou 2 gols sofridos = +0,10%
    // 3, 4 ou 5 gols sofridos = sem alteração
    // mais de 5 gols sofridos = -0,5%
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

    if (error || !jogadores) {
      console.error("Erro ao buscar defesa para valorização:", error);
      return;
    }

    const defensores = ((jogadores || []) as any[]).filter((jogador) =>
      ehDefensorOuGoleiro(jogador.posicao),
    );

    if (!defensores.length) return;

    await Promise.all(
      defensores.map(async (jogador) => {
        const valorAtual = Number(jogador.valor || 0);
        if (!valorAtual || valorAtual <= 0) return;

        const novoValor =
          direcao === "valorizar"
            ? Math.round(valorAtual * fator)
            : Math.round(valorAtual / fator);

        const { error: updateError } = await supabase
          .from("elenco")
          .update({ valor: Math.max(0, novoValor) })
          .eq("id", jogador.id);

        if (updateError) {
          console.error(
            "Erro ao atualizar valorização defensiva:",
            updateError,
          );
        }
      }),
    );
  }

  async function premiarTime(
    timeId: string,
    golsPro: number,
    golsContra: number,
  ) {
    const base =
      golsPro > golsContra
        ? COPA_VITORIA
        : golsPro < golsContra
          ? COPA_DERROTA
          : COPA_EMPATE;
    const valor = Math.round(
      base + golsPro * COPA_GOL_MARCADO - golsContra * COPA_GOL_SOFRIDO,
    );

    await supabase.rpc("atualizar_saldo", { id_time: timeId, valor });
    await supabase.from("movimentacoes").insert({
      id_time: timeId,
      tipo: "premiacao_copa",
      valor,
      descricao: "Premiação por desempenho na Copa",
      data: new Date().toISOString(),
    });

    await supabase.from("bid").insert({
      tipo_evento: "bonus",
      descricao: "Premiação por desempenho na Copa",
      id_time1: timeId,
      valor,
      data_evento: new Date().toISOString(),
    });

    return valor;
  }

  async function salvarPlacar(
    jogo: Jogo,
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

      const fichaTecnica = gerarFichaTecnicaIlustrativa(
        jogo,
        g1,
        g2,
        eventosHistoria,
      );
      const notasJogadores = await gerarNotasJogadoresIlustrativas(
        jogo,
        g1,
        g2,
        eventosHistoria,
      );

      // 1. Salva o placar PRIMEIRO e exige retorno do Supabase.
      // Se não retornar o jogo, a tela avisa o erro real e não faz pagamento.
      const { data: jogoAtualizado, error: erroPlacar } = await supabase
        .from("copa_jogos")
        .update({
          gols_time1: g1,
          gols_time2: g2,
          vencedor_id,
          status: "finalizado",
          simulando: false,
          simulado: metodoResultado === "simulado",
          metodo_resultado: metodoResultado,
          eventos_simulacao: eventosHistoria,
          ficha_tecnica: fichaTecnica,
          notas_jogadores: notasJogadores,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (erroPlacar || !jogoAtualizado) {
        console.error("Erro real ao salvar placar:", erroPlacar);
        toast.error(erroPlacar?.message || "Erro ao salvar placar no banco.");
        return;
      }

      // Atualiza a tela na hora, antes mesmo do recarregamento.
      // Isso faz a classificação do grupo subir imediatamente.
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
                ficha_tecnica: fichaTecnica,
                notas_jogadores: notasJogadores,
              }
            : j,
        ),
      );

      // 2. Se já pagou antes, só altera placar/classificação. Não paga novamente.
      if (jogo.bonus_pago) {
        toast.success("Placar atualizado. Gerando história ao vivo...");
        if (metodoResultado === "manual_com_historia") {
          void exibirNarracaoAoVivo(
            { ...jogo, gols_time1: g1, gols_time2: g2 },
            eventosHistoria,
            Math.max(
              650,
              Math.min(
                1100,
                Math.floor(14000 / Math.max(1, eventosHistoria.length)),
              ),
            ),
          );
        }
        await carregarTudo();
        return;
      }

      const participacaoTime1 = COPA_PARTICIPACAO_POR_JOGO;
      const participacaoTime2 = COPA_PARTICIPACAO_POR_JOGO;

      // 3. Só premiação + participação. Estádio/renda removidos.
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
          tipo: "participacao_copa",
          valor: participacaoTime1,
          descricao: "Participação fixa por jogo da Copa",
          data: agora,
        },
        {
          id_time: jogo.id_time2,
          tipo: "participacao_copa",
          valor: participacaoTime2,
          descricao: "Participação fixa por jogo da Copa",
          data: agora,
        },
        {
          id_time: jogo.id_time1,
          tipo: "salario_copa",
          valor: salariosTime1,
          descricao: "Desconto de salários após jogo da Copa",
          data: agora,
        },
        {
          id_time: jogo.id_time2,
          tipo: "salario_copa",
          valor: salariosTime2,
          descricao: "Desconto de salários após jogo da Copa",
          data: agora,
        },
      ]);

      await supabase.from("bid").insert([
        {
          tipo_evento: "bonus",
          descricao: `Premiação da Copa: ${nomeTime(jogo.id_time1)}`,
          id_time1: jogo.id_time1,
          valor: participacaoTime1 + premiacaoTime1 - salariosTime1,
          data_evento: agora,
        },
        {
          tipo_evento: "bonus",
          descricao: `Premiação da Copa: ${nomeTime(jogo.id_time2)}`,
          id_time1: jogo.id_time2,
          valor: participacaoTime2 + premiacaoTime2 - salariosTime2,
          data_evento: agora,
        },
      ]);

      // Valoriza 0,05% por gol marcado e 0,025% por assistência.
      // Também valoriza/desvaloriza goleiros, zagueiros e laterais pelo desempenho defensivo.
      // Fica aqui para acontecer apenas na primeira confirmação do placar,
      // evitando valorizar de novo quando o placar já estiver com bonus_pago.
      await ajustarValorizacaoGolsEAssistencias(eventosHistoria, "valorizar");
      await ajustarValorizacaoDefensiva(jogo.id_time1, g2, "valorizar");
      await ajustarValorizacaoDefensiva(jogo.id_time2, g1, "valorizar");

      // 4. Marca os valores pagos no mesmo jogo, mantendo o placar salvo.
      const { data: jogoPago, error: erroBonus } = await supabase
        .from("copa_jogos")
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
          ficha_tecnica: fichaTecnica,
          notas_jogadores: notasJogadores,
          publico: null,
          renda: 0,
          receita_time1: 0,
          receita_time2: 0,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (erroBonus || !jogoPago) {
        console.error("Erro ao marcar bônus pago:", erroBonus);
        toast.error("Placar salvo, mas houve erro ao marcar premiação paga.");
        await carregarTudo();
        return;
      }

      setJogos((prev) =>
        prev.map((j) => (j.id === jogo.id ? (jogoPago as Jogo) : j)),
      );

      if (metodoResultado === "manual_com_historia") {
        toast.success("Placar salvo! Narração ao vivo iniciada.");
        void exibirNarracaoAoVivo(
          { ...jogo, gols_time1: g1, gols_time2: g2 },
          eventosHistoria,
          Math.max(
            650,
            Math.min(
              1100,
              Math.floor(14000 / Math.max(1, eventosHistoria.length)),
            ),
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

  async function excluirPlacar(jogo: Jogo) {
    if (!isAdmin || !jogo.id_time1 || !jogo.id_time2) return;

    const temPlacar = jogo.gols_time1 !== null || jogo.gols_time2 !== null;
    if (!temPlacar) {
      toast("Esse jogo ainda não tem placar salvo.");
      return;
    }

    if (
      !confirm(
        "Deseja apagar o placar e estornar a premiação, participação e salários desse jogo?",
      )
    )
      return;

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

        // Estorna a valorização dos gols, assistências e desempenho defensivo desse jogo.
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
            tipo: "estorno_copa",
            valor: estornoTime1,
            descricao: "Estorno de premiação, participação e salários da Copa",
            data: agora,
          },
          {
            id_time: jogo.id_time2,
            tipo: "estorno_copa",
            valor: estornoTime2,
            descricao: "Estorno de premiação, participação e salários da Copa",
            data: agora,
          },
        ]);

        await supabase.from("bid").insert([
          {
            tipo_evento: "estorno_copa",
            descricao: `Estorno do jogo ${nomeTime(jogo.id_time1)} x ${nomeTime(jogo.id_time2)}`,
            id_time1: jogo.id_time1,
            valor: estornoTime1,
            data_evento: agora,
          },
          {
            tipo_evento: "estorno_copa",
            descricao: `Estorno do jogo ${nomeTime(jogo.id_time2)} x ${nomeTime(jogo.id_time1)}`,
            id_time1: jogo.id_time2,
            valor: estornoTime2,
            data_evento: agora,
          },
        ]);
      }

      const { data: jogoLimpo, error } = await supabase
        .from("copa_jogos")
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
          ficha_tecnica: null,
          notas_jogadores: [],
          metodo_resultado: null,
          play_time1: false,
          play_time2: false,
          play_solicitado_por: null,
        })
        .eq("id", jogo.id)
        .select("*")
        .single();

      if (error || !jogoLimpo) {
        console.error("Erro real ao apagar placar:", error);
        toast.error(error?.message || "Erro ao apagar placar no banco.");
        return;
      }

      setJogos((prev) =>
        prev.map((j) => (j.id === jogo.id ? (jogoLimpo as Jogo) : j)),
      );

      toast.success("Placar apagado e valores estornados!");
      await carregarTudo();
    } catch (err) {
      console.error("Erro inesperado ao apagar placar:", err);
      toast.error("Erro inesperado ao apagar placar.");
    } finally {
      setSalvando(null);
    }
  }

  const classificacao = useMemo(() => {
    const map: Record<string, Record<string, Classificacao>> = {};

    jogos
      .filter((j) => j.fase === "grupos")
      .forEach((j) => {
        const grupo = j.grupo || "A";
        if (!j.id_time1 || !j.id_time2) return;

        map[grupo] ||= {};

        const ensure = (id: string) => {
          map[grupo][id] ||= {
            id,
            grupo,
            pts: 0,
            j: 0,
            v: 0,
            e: 0,
            d: 0,
            gp: 0,
            gc: 0,
            sg: 0,
          };
          return map[grupo][id];
        };

        const a = ensure(j.id_time1);
        const b = ensure(j.id_time2);

        if (j.gols_time1 === null || j.gols_time2 === null) return;

        a.j++;
        b.j++;
        a.gp += j.gols_time1;
        a.gc += j.gols_time2;
        b.gp += j.gols_time2;
        b.gc += j.gols_time1;

        if (j.gols_time1 > j.gols_time2) {
          a.v++;
          b.d++;
          a.pts += 3;
        } else if (j.gols_time2 > j.gols_time1) {
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
      });

    const out: Record<string, Classificacao[]> = {};
    Object.keys(map).forEach((g) => {
      out[g] = Object.values(map[g]).sort(
        (a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp,
      );
    });

    return out;
  }, [jogos]);

  async function gerarQuartas() {
    if (!isAdmin || !copa) return;

    const jogosGrupos = jogos.filter((j) => j.fase === "grupos");

    if (jogosGrupos.length !== 48) {
      toast.error("A fase de grupos precisa ter 48 jogos.");
      return;
    }

    const todosFinalizados = jogosGrupos.every(
      (j) => j.gols_time1 !== null && j.gols_time2 !== null,
    );
    if (!todosFinalizados) {
      toast.error("Todos os jogos dos grupos precisam ter placar.");
      return;
    }

    for (const g of GRUPOS) {
      if ((classificacao[g] || []).length < 4) {
        toast.error(`Grupo ${g} ainda não está completo.`);
        return;
      }
    }

    await supabase
      .from("copa_jogos")
      .delete()
      .eq("copa_id", copa.id)
      .eq("fase", "quartas");
    await supabase
      .from("copa_jogos")
      .delete()
      .eq("copa_id", copa.id)
      .eq("fase", "semi");
    await supabase
      .from("copa_jogos")
      .delete()
      .eq("copa_id", copa.id)
      .eq("fase", "final");

    const A1 = classificacao.A[0].id;
    const A2 = classificacao.A[1].id;
    const B1 = classificacao.B[0].id;
    const B2 = classificacao.B[1].id;
    const C1 = classificacao.C[0].id;
    const C2 = classificacao.C[1].id;
    const D1 = classificacao.D[0].id;
    const D2 = classificacao.D[1].id;

    const chaves = [
      [A1, B2],
      [B1, A2],
      [C1, D2],
      [D1, C2],
    ];

    const rows: any[] = [];

    chaves.forEach(([t1, t2], idx) => {
      const confronto = `quartas_${idx + 1}`;
      rows.push({
        copa_id: copa.id,
        fase: "quartas",
        ordem: idx + 1,
        id_time1: t1,
        id_time2: t2,
        jogo_tipo: "ida",
        confronto_id: confronto,
        status: "pendente",
        bonus_pago: false,
      });
      rows.push({
        copa_id: copa.id,
        fase: "quartas",
        ordem: idx + 1,
        id_time1: t2,
        id_time2: t1,
        jogo_tipo: "volta",
        confronto_id: confronto,
        status: "pendente",
        bonus_pago: false,
      });
    });

    const { error } = await supabase.from("copa_jogos").insert(rows);
    if (error) {
      toast.error("Erro ao gerar quartas.");
      return;
    }

    await supabase.from("copa").update({ status: "quartas" }).eq("id", copa.id);
    toast.success("Quartas geradas!");
    setAba("mata");
    await carregarTudo();
  }

  function vencedoresFase(fase: string) {
    const jogosFase = jogos.filter((j) => j.fase === fase);
    const confrontos = Array.from(
      new Set(jogosFase.map((j) => j.confronto_id).filter(Boolean)),
    ) as string[];
    const vencedores: string[] = [];

    confrontos.forEach((c) => {
      const partidas = jogosFase.filter((j) => j.confronto_id === c);
      if (partidas.length < 2 && fase !== "final") return;
      if (partidas.some((j) => j.gols_time1 === null || j.gols_time2 === null))
        return;

      const ids = Array.from(
        new Set(
          partidas.flatMap((j) => [j.id_time1, j.id_time2]).filter(Boolean),
        ),
      ) as string[];
      if (ids.length !== 2) return;

      const placar: Record<string, number> = { [ids[0]]: 0, [ids[1]]: 0 };

      partidas.forEach((j) => {
        if (!j.id_time1 || !j.id_time2) return;
        placar[j.id_time1] += j.gols_time1 || 0;
        placar[j.id_time2] += j.gols_time2 || 0;
      });

      if (placar[ids[0]] > placar[ids[1]]) vencedores.push(ids[0]);
      else if (placar[ids[1]] > placar[ids[0]]) vencedores.push(ids[1]);
    });

    return vencedores;
  }

  async function gerarProximaFase(
    faseAtual: "quartas" | "semi",
    proximaFase: "semi" | "final",
  ) {
    if (!isAdmin || !copa) return;

    const vencedores = vencedoresFase(faseAtual);
    const esperado = faseAtual === "quartas" ? 4 : 2;

    if (vencedores.length !== esperado) {
      toast.error(
        "Ainda faltam confrontos decididos. Em caso de empate no agregado, ajuste o placar.",
      );
      return;
    }

    await supabase
      .from("copa_jogos")
      .delete()
      .eq("copa_id", copa.id)
      .eq("fase", proximaFase);
    if (proximaFase === "semi")
      await supabase
        .from("copa_jogos")
        .delete()
        .eq("copa_id", copa.id)
        .eq("fase", "final");

    const rows: any[] = [];

    for (let i = 0; i < vencedores.length; i += 2) {
      const confronto = `${proximaFase}_${i / 2 + 1}`;

      rows.push({
        copa_id: copa.id,
        fase: proximaFase,
        ordem: i / 2 + 1,
        id_time1: vencedores[i],
        id_time2: vencedores[i + 1],
        jogo_tipo: proximaFase === "final" ? "unico" : "ida",
        confronto_id: confronto,
        status: "pendente",
        bonus_pago: false,
      });

      if (proximaFase !== "final") {
        rows.push({
          copa_id: copa.id,
          fase: proximaFase,
          ordem: i / 2 + 1,
          id_time1: vencedores[i + 1],
          id_time2: vencedores[i],
          jogo_tipo: "volta",
          confronto_id: confronto,
          status: "pendente",
          bonus_pago: false,
        });
      }
    }

    const { error } = await supabase.from("copa_jogos").insert(rows);
    if (error) {
      toast.error(`Erro ao gerar ${proximaFase}.`);
      return;
    }

    await supabase
      .from("copa")
      .update({ status: proximaFase })
      .eq("id", copa.id);
    toast.success(`${proximaFase.toUpperCase()} gerada!`);
    setAba("mata");
    await carregarTudo();
  }

  async function definirCampeao() {
    if (!isAdmin || !copa) return;

    const final = jogos.find((j) => j.fase === "final");

    if (
      !final ||
      !final.id_time1 ||
      !final.id_time2 ||
      final.gols_time1 === null ||
      final.gols_time2 === null
    ) {
      toast.error("A final precisa ter placar.");
      return;
    }

    if (final.gols_time1 === final.gols_time2) {
      toast.error("Final empatada. Ajuste o placar para definir campeão.");
      return;
    }

    const campeaoId =
      final.gols_time1 > final.gols_time2 ? final.id_time1 : final.id_time2;

    await supabase
      .from("copa")
      .update({ campeao_id: campeaoId, status: "finalizada" })
      .eq("id", copa.id);
    await supabase.from("bid").insert({
      tipo_evento: "campeao_copa",
      descricao: `🏆 ${nomeTime(campeaoId)} é campeão da Copa LigaFut ${TEMPORADA}`,
      id_time1: campeaoId,
      valor: null,
      data_evento: new Date().toISOString(),
    });

    toast.success(`🏆 Campeão: ${nomeTime(campeaoId)}`);
    await carregarTudo();
  }

  function CardJogo({ jogo }: { jogo: Jogo }) {
    const [g1, setG1] = useState<string>(
      jogo.gols_time1 === null ? "" : String(jogo.gols_time1),
    );
    const [g2, setG2] = useState<string>(
      jogo.gols_time2 === null ? "" : String(jogo.gols_time2),
    );

    const eventos = Array.isArray(jogo.eventos_simulacao)
      ? jogo.eventos_simulacao
      : [];
    const ficha = jogo.ficha_tecnica || null;
    const notas = Array.isArray(jogo.notas_jogadores)
      ? jogo.notas_jogadores
      : [];
    const notasTime1 = notas
      .filter((n) => n.id_time === jogo.id_time1)
      .slice(0, 11);
    const notasTime2 = notas
      .filter((n) => n.id_time === jogo.id_time2)
      .slice(0, 11);
    const eventosLive = eventosAoVivo[jogo.id] || [];
    const placarLive = placarAoVivo[jogo.id];
    const minutoLive = minutoAoVivo[jogo.id];
    const estaAoVivo = jogoAoVivo === jogo.id || eventosLive.length > 0;
    const temPlacar = jogo.gols_time1 !== null && jogo.gols_time2 !== null;
    const meuTime1 = !!idTimeLogado && idTimeLogado === jogo.id_time1;
    const meuTime2 = !!idTimeLogado && idTimeLogado === jogo.id_time2;
    const possoDarPlay = !isAdmin && !temPlacar && (meuTime1 || meuTime2);
    const meuPlayConfirmado =
      (meuTime1 && jogo.play_time1) || (meuTime2 && jogo.play_time2);
    const aguardandoPlayAdversario =
      (jogo.play_time1 || jogo.play_time2) &&
      !(jogo.play_time1 && jogo.play_time2);

    return (
      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoTime(jogo.id_time1)}
              className="h-8 w-8 rounded-full object-contain bg-black/40"
              alt=""
            />
            <span className="truncate font-bold">
              {nomeTime(jogo.id_time1)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2">
            <input
              disabled={!isAdmin || salvando === jogo.id}
              value={g1}
              onChange={(e) => setG1(e.target.value)}
              inputMode="numeric"
              className="w-12 rounded-lg bg-black/50 border border-white/10 p-2 text-center font-bold outline-none focus:border-emerald-400/60 disabled:opacity-60"
              placeholder="-"
            />
            <span className="text-zinc-400">x</span>
            <input
              disabled={!isAdmin || salvando === jogo.id}
              value={g2}
              onChange={(e) => setG2(e.target.value)}
              inputMode="numeric"
              className="w-12 rounded-lg bg-black/50 border border-white/10 p-2 text-center font-bold outline-none focus:border-emerald-400/60 disabled:opacity-60"
              placeholder="-"
            />
          </div>

          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="truncate text-right font-bold">
              {nomeTime(jogo.id_time2)}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoTime(jogo.id_time2)}
              className="h-8 w-8 rounded-full object-contain bg-black/40"
              alt=""
            />
          </div>

          {isAdmin && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => salvarPlacar(jogo, clampGol(g1), clampGol(g2))}
                disabled={salvando === jogo.id}
                className="rounded-lg bg-emerald-500/20 px-3 py-2 text-emerald-300 font-bold hover:bg-emerald-500/30 disabled:opacity-50"
                title="Salvar placar"
              >
                <FiSave />
              </button>

              <button
                onClick={() => simularPartida(jogo)}
                disabled={salvando === jogo.id || temPlacar}
                className="rounded-lg bg-violet-500/20 px-3 py-2 text-violet-300 font-bold hover:bg-violet-500/30 disabled:opacity-50"
                title="Simular partida automaticamente"
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
                        Math.min(
                          950,
                          Math.floor(12000 / Math.max(1, eventos.length)),
                        ),
                      ),
                    )
                  }
                  disabled={salvando === jogo.id || jogoAoVivo === jogo.id}
                  className="rounded-lg bg-sky-500/20 px-3 py-2 text-sky-300 font-bold hover:bg-sky-500/30 disabled:opacity-50"
                  title="Rever história em tempo real"
                >
                  🎙️
                </button>
              )}

              <button
                onClick={() => excluirPlacar(jogo)}
                disabled={
                  salvando === jogo.id ||
                  (jogo.gols_time1 === null && jogo.gols_time2 === null)
                }
                className="rounded-lg bg-rose-500/20 px-3 py-2 text-rose-300 font-bold hover:bg-rose-500/30 disabled:opacity-50"
                title="Excluir placar e estornar"
              >
                <FiTrash2 />
              </button>
            </div>
          )}

          {possoDarPlay && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => solicitarPlaySimulacao(jogo)}
                disabled={
                  salvando === jogo.id ||
                  !!meuPlayConfirmado ||
                  jogoAoVivo === jogo.id
                }
                className={`rounded-lg px-3 py-2 font-black disabled:opacity-50 ${
                  meuPlayConfirmado
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
                }`}
                title="Confirmar simulação por acordo entre os dois times"
              >
                {meuPlayConfirmado ? "✅ Play" : "▶️ Play"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span>{jogo.fase.toUpperCase()}</span>
          {jogo.grupo && <span>Grupo {jogo.grupo}</span>}
          {jogo.rodada && <span>Rodada {jogo.rodada}</span>}
          {jogo.jogo_tipo && <span>{jogo.jogo_tipo}</span>}
          {jogo.play_time1 && (
            <span className="text-emerald-300">
              ▶️ {nomeTime(jogo.id_time1)} confirmou play
            </span>
          )}
          {jogo.play_time2 && (
            <span className="text-emerald-300">
              ▶️ {nomeTime(jogo.id_time2)} confirmou play
            </span>
          )}
          {aguardandoPlayAdversario && (
            <span className="text-yellow-300">aguardando adversário</span>
          )}
          {jogo.bonus_pago && (
            <span className="text-emerald-300">valores pagos</span>
          )}
          {jogo.publico ? (
            <span>Público: {Number(jogo.publico).toLocaleString("pt-BR")}</span>
          ) : null}
          {jogo.renda ? (
            <span>Renda: {dinheiro(Number(jogo.renda))}</span>
          ) : null}
          {jogo.metodo_resultado === "simulado" && (
            <span className="text-violet-300">simulado</span>
          )}
          {jogo.metodo_resultado === "manual_com_historia" && (
            <span className="text-sky-300">história gerada</span>
          )}
        </div>

        {estaAoVivo && eventosLive.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 via-black/30 to-emerald-500/10 p-3 shadow-[0_0_35px_rgba(139,92,246,0.18)]">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.25em] text-violet-300">
                  🎙️ Tempo real
                </div>
                <div className="text-sm text-zinc-300">
                  {minutoLive ? `${minutoLive}' de jogo` : "Pré-jogo"}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-center text-lg font-black text-white">
                {nomeTime(jogo.id_time1)} {placarLive?.g1 ?? 0}
                <span className="mx-2 text-zinc-500">x</span>
                {placarLive?.g2 ?? 0} {nomeTime(jogo.id_time2)}
              </div>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {eventosLive.slice(-8).map((ev, idx) => (
                <div
                  key={`live-${ev.minuto}-${idx}`}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    ev.tipo === "gol"
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                      : ev.tipo === "cartao"
                        ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-100"
                        : "border-white/10 bg-white/[0.04] text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ev.tipo === "gol" && (ev.logo || ev.time_id) ? (
                      <img
                        src={ev.logo || logoTime(ev.time_id)}
                        className="h-7 w-7 rounded-full object-contain bg-black/40 ring-1 ring-white/15"
                        alt={ev.time_nome || "Time"}
                      />
                    ) : null}

                    <span>{ev.texto}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {temPlacar && ficha && (
          <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-black text-emerald-300">
              📋 Ficha técnica e notas dos jogadores
            </summary>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-sm font-black text-white">
                  Ficha técnica
                </div>
                <div className="space-y-2 text-xs text-zinc-300">
                  {[
                    [
                      "Posse de bola",
                      `${ficha.posse_time1}%`,
                      `${ficha.posse_time2}%`,
                    ],
                    [
                      "Finalizações",
                      ficha.finalizacoes_time1,
                      ficha.finalizacoes_time2,
                    ],
                    [
                      "No alvo",
                      ficha.finalizacoes_certas_time1,
                      ficha.finalizacoes_certas_time2,
                    ],
                    [
                      "Escanteios",
                      ficha.escanteios_time1,
                      ficha.escanteios_time2,
                    ],
                    ["Faltas", ficha.faltas_time1, ficha.faltas_time2],
                    ["Amarelos", ficha.amarelos_time1, ficha.amarelos_time2],
                    ["Vermelhos", ficha.vermelhos_time1, ficha.vermelhos_time2],
                    ["Defesas", ficha.defesas_time1, ficha.defesas_time2],
                  ].map(([label, a, b]) => (
                    <div
                      key={String(label)}
                      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg bg-black/25 px-3 py-2"
                    >
                      <span className="text-left font-black">{a}</span>
                      <span className="text-center text-zinc-500">{label}</span>
                      <span className="text-right font-black">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 text-sm font-black text-white">
                  Notas ilustrativas
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { titulo: nomeTime(jogo.id_time1), lista: notasTime1 },
                    { titulo: nomeTime(jogo.id_time2), lista: notasTime2 },
                  ].map((grupo) => (
                    <div key={grupo.titulo} className="space-y-1">
                      <div className="mb-1 text-xs font-black text-zinc-400">
                        {grupo.titulo}
                      </div>

                      {grupo.lista.map((n) => (
                        <div
                          key={`${n.jogador_id || n.nome}-${n.id_time}`}
                          className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-black/25 px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-bold text-zinc-100">
                              {n.nome}
                            </div>
                            <div className="truncate text-[10px] text-zinc-500">
                              {n.posicao || "POS"}{" "}
                              {n.gols ? `• ${n.gols} gol` : ""}{" "}
                              {n.assistencias
                                ? `• ${n.assistencias} assist.`
                                : ""}{" "}
                              {n.destaque ? `• ${n.destaque}` : ""}
                            </div>
                          </div>

                          <div
                            className={`rounded-lg px-2 py-1 font-black ${
                              n.nota >= 8
                                ? "bg-emerald-500/20 text-emerald-300"
                                : n.nota < 6
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-white/10 text-zinc-200"
                            }`}
                          >
                            {n.nota.toFixed(1)}
                          </div>
                        </div>
                      ))}

                      {!grupo.lista.length && (
                        <div className="rounded-lg bg-black/25 px-2 py-2 text-xs text-zinc-500">
                          Sem notas salvas.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        )}

        {eventos.length > 0 && (
          <details className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-black text-emerald-300">
              📜 Ver história do jogo ({eventos.length} eventos)
            </summary>

            <div className="mt-3 space-y-2">
              {eventos.map((ev, idx) => (
                <div
                  key={`${ev.minuto}-${idx}`}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-200"
                >
                  <div className="flex items-center gap-2">
                    {ev.tipo === "gol" && (ev.logo || ev.time_id) ? (
                      <img
                        src={ev.logo || logoTime(ev.time_id)}
                        className="h-7 w-7 rounded-full object-contain bg-black/40 ring-1 ring-white/15"
                        alt={ev.time_nome || "Time"}
                      />
                    ) : null}

                    <span>{ev.texto}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }

  function BlocoClassificacao({ grupo }: { grupo: string }) {
    const rows = classificacao[grupo] || [];

    return (
      <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-black sm:text-xl">Grupo {grupo}</h2>
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300 sm:text-xs">
            Top 2 passa
          </span>
        </div>

        <div className="space-y-2 sm:hidden">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              className={`rounded-2xl border border-white/10 p-3 ${
                idx < 2 ? "bg-emerald-500/10" : "bg-black/20"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-black">
                    {idx + 1}
                  </div>
                  <img
                    src={logoTime(r.id)}
                    className="h-8 w-8 shrink-0 rounded-full bg-black/40 object-contain"
                    alt=""
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black">
                      {nomeTime(r.id)}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      J {r.j} • V {r.v} • E {r.e} • D {r.d}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-lg font-black text-emerald-300">
                    {r.pts}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    pts
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <div className="text-zinc-500">SG</div>
                  <div className="font-black">{r.sg}</div>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <div className="text-zinc-500">GP</div>
                  <div className="font-black">{r.gp}</div>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-2 py-2">
                  <div className="text-zinc-500">GC</div>
                  <div className="font-black">{r.gc}</div>
                </div>
              </div>
            </div>
          ))}

          {!rows.length && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-400">
              Grupo ainda sem jogos ou placares.
            </div>
          )}
        </div>

        <div className="hidden w-full overflow-x-auto rounded-xl border border-white/10 sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/[0.04] text-zinc-400">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Time</th>
                <th className="px-2 py-2 text-center">PTS</th>
                <th className="px-2 py-2 text-center">J</th>
                <th className="px-2 py-2 text-center">V</th>
                <th className="px-2 py-2 text-center">E</th>
                <th className="px-2 py-2 text-center">D</th>
                <th className="px-2 py-2 text-center">SG</th>
                <th className="px-2 py-2 text-center">GP</th>
                <th className="px-2 py-2 text-center">GC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className={`border-t border-white/10 ${idx < 2 ? "bg-emerald-500/10" : ""}`}
                >
                  <td className="px-2 py-2 font-bold">{idx + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={logoTime(r.id)}
                        className="h-6 w-6 rounded-full object-contain bg-black/40"
                        alt=""
                      />
                      <span className="font-bold">{nomeTime(r.id)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-black">{r.pts}</td>
                  <td className="px-2 py-2 text-center">{r.j}</td>
                  <td className="px-2 py-2 text-center">{r.v}</td>
                  <td className="px-2 py-2 text-center">{r.e}</td>
                  <td className="px-2 py-2 text-center">{r.d}</td>
                  <td className="px-2 py-2 text-center">{r.sg}</td>
                  <td className="px-2 py-2 text-center">{r.gp}</td>
                  <td className="px-2 py-2 text-center">{r.gc}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-zinc-400"
                    colSpan={10}
                  >
                    Grupo ainda sem jogos ou placares.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const totalJogosGrupos = jogos.filter((j) => j.fase === "grupos").length;
  const jogosGruposFinalizados = jogos.filter(
    (j) =>
      j.fase === "grupos" && j.gols_time1 !== null && j.gols_time2 !== null,
  ).length;

  if (loading) return <div className="p-6 text-white">Carregando Copa...</div>;

  return (
    <div className="w-full max-w-full overflow-x-hidden px-3 py-4 text-zinc-100 space-y-6 sm:px-4 md:px-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <FiAward className="text-yellow-300 drop-shadow" /> Copa LigaFut —
              Champions
            </h1>
            <p className="text-sm text-zinc-400">
              4 grupos de 4 times • ida e volta • top 2 passam • mata-mata por
              agregado • temporada {TEMPORADA}
            </p>
          </div>

          <button
            onClick={carregarTudo}
            className="rounded-xl bg-white/10 px-4 py-2 font-bold hover:bg-white/20 flex items-center gap-2"
          >
            <FiRefreshCw /> Atualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Status</div>
            <div className="font-black">{copa?.status || "sem copa"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Participantes</div>
            <div className="font-black">{participantes.length}/16</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Jogos de grupos</div>
            <div className="font-black">
              {jogosGruposFinalizados}/{totalJogosGrupos || 48}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-zinc-400">Campeão</div>
            <div className="font-black text-yellow-300">
              {copa?.campeao_id ? nomeTime(copa.campeao_id) : "-"}
            </div>
          </div>
        </div>

        {copa?.campeao_id && (
          <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200 font-black">
            🏆 Campeão: {nomeTime(copa.campeao_id)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        {(isAdmin
          ? [
              ["selecao", "Seleção e Sorteio"],
              ["grupos", "Grupos"],
              ["jogos", "Jogos"],
              ["mata", "Mata-Mata"],
            ]
          : [
              ["grupos", "Grupos"],
              ["jogos", "Jogos"],
              ["mata", "Mata-Mata"],
            ]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id as any)}
            className={`rounded-xl px-4 py-2 text-sm font-black ${
              aba === id
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-black/20 text-zinc-300 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "selecao" && (
        <>
          {isAdmin && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <h2 className="text-xl font-black">1. Selecionar 16 times</h2>
              <p className="text-sm text-zinc-400">
                Aparecem aqui somente os times que possuem o campo{" "}
                <strong>divisao</strong> preenchido.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {timesComDivisao.map((t) => {
                  const checked = selecionados.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        if (checked)
                          setSelecionados((prev) =>
                            prev.filter((x) => x !== t.id),
                          );
                        else {
                          if (selecionados.length >= 16) {
                            toast.error("Limite de 16 times.");
                            return;
                          }
                          setSelecionados((prev) => [...prev, t.id]);
                        }
                      }}
                      className={`rounded-xl border p-3 text-left transition ${
                        checked
                          ? "border-emerald-500 bg-emerald-500/20"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.logo_url || t.logo || "/default.png"}
                          className="h-8 w-8 object-contain"
                          alt=""
                        />
                        <div className="min-w-0">
                          <div className="truncate font-bold text-sm">
                            {t.nome}
                          </div>
                          <div className="text-xs text-zinc-400">
                            Divisão {t.divisao ?? "-"} • OVR {t.overall || "-"}{" "}
                            • {dinheiro(Number(t.valor || t.saldo || 0))}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                <button
                  onClick={() => {
                    const ids = timesComDivisao.slice(0, 16).map((t) => t.id);
                    setSelecionados(ids);
                    toast.success(
                      `${ids.length} times com divisão selecionados.`,
                    );
                  }}
                  className="w-full justify-center sm:w-auto rounded-xl bg-yellow-500/20 px-4 py-2 text-yellow-300 font-black hover:bg-yellow-500/30"
                >
                  Selecionar 16 com divisão
                </button>

                <button
                  onClick={() => {
                    setSelecionados([]);
                    toast("Seleção limpa.");
                  }}
                  className="w-full justify-center sm:w-auto rounded-xl bg-white/10 px-4 py-2 text-white font-black hover:bg-white/20"
                >
                  Limpar seleção
                </button>

                <button
                  onClick={salvarParticipantes}
                  className="w-full justify-center sm:w-auto rounded-xl bg-emerald-500/20 px-4 py-2 text-emerald-300 font-black hover:bg-emerald-500/30"
                >
                  Salvar participantes ({selecionados.length}/16)
                </button>

                <button
                  onClick={iniciarSorteioAnimado}
                  disabled={sorteandoAoVivo}
                  className="w-full justify-center sm:w-auto rounded-xl bg-sky-500/20 px-4 py-2 text-sky-300 font-black hover:bg-sky-500/30 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiShuffle />{" "}
                  {sorteandoAoVivo ? "Sorteando..." : "Sorteio ao vivo"}
                </button>

                <button
                  onClick={reiniciarSorteioTeste}
                  disabled={sorteandoAoVivo}
                  className="w-full justify-center sm:w-auto rounded-xl bg-white/10 px-4 py-2 text-white font-black hover:bg-white/20 disabled:opacity-50"
                >
                  Reiniciar sorteio
                </button>

                <button
                  onClick={confirmarSorteioEGerarJogos}
                  disabled={sorteandoAoVivo || !sorteioConfirmavel}
                  className="w-full justify-center sm:w-auto rounded-xl bg-emerald-500/20 px-4 py-2 text-emerald-300 font-black hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  Confirmar sorteio
                </button>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-emerald-500/10 p-4 overflow-hidden">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-lg font-black">
                      🎥 Sorteio ao vivo dos grupos
                    </div>
                    <div className="text-xs text-zinc-400">
                      Delay de 2 segundos por time. O sistema embaralha os 16
                      selecionados e preenche A, B, C e D, um time por grupo,
                      até completar 4 em cada.
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black">
                    {sorteandoAoVivo ? (
                      <span className="text-sky-300">
                        Sorteando {passoSorteio}/16
                      </span>
                    ) : sorteioConfirmavel ? (
                      <span className="text-emerald-300">
                        Pronto para confirmar
                      </span>
                    ) : (
                      <span className="text-zinc-300">Aguardando sorteio</span>
                    )}
                  </div>
                </div>

                {(sorteandoAoVivo ||
                  sorteioConfirmavel ||
                  passoSorteio > 0) && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="text-xs uppercase tracking-[0.25em] text-zinc-500 font-black">
                      Agora
                    </div>
                    <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-white/10 grid place-items-center text-2xl animate-pulse">
                          🏆
                        </div>
                        <div>
                          <div className="text-sm text-zinc-400">
                            {grupoAtual
                              ? `Sorteando para o Grupo ${grupoAtual}`
                              : "Sorteio finalizado"}
                          </div>
                          <div className="text-xl font-black text-white">
                            {timeAtual
                              ? nomeTime(timeAtual)
                              : "Aguardando confirmação"}
                          </div>
                        </div>
                      </div>

                      {timeAtual && (
                        <img
                          src={logoTime(timeAtual)}
                          className="h-16 w-16 rounded-2xl object-contain bg-black/40 ring-1 ring-white/15 shadow-[0_0_35px_rgba(59,130,246,0.35)]"
                          alt=""
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {GRUPOS.map((g) => (
                    <div
                      key={g}
                      className="rounded-2xl border border-white/10 bg-black/25 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-black">Grupo {g}</div>
                        <div className="text-xs text-zinc-400">
                          {previewGrupos[g]?.length || 0}/4
                        </div>
                      </div>

                      <div className="space-y-2 min-h-[176px]">
                        {(previewGrupos[g] || []).map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 animate-[pulse_0.7s_ease-in-out_1]"
                          >
                            <img
                              src={logoTime(id)}
                              className="h-7 w-7 object-contain"
                              alt=""
                            />
                            <span className="truncate text-sm font-bold">
                              {nomeTime(id)}
                            </span>
                          </div>
                        ))}

                        {Array.from({
                          length: Math.max(
                            0,
                            4 - (previewGrupos[g]?.length || 0),
                          ),
                        }).map((_, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-2 text-sm text-zinc-500"
                          >
                            Aguardando time...
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((pote) => (
              <div
                key={pote}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <h3 className="font-black mb-3">Pote {pote}</h3>
                <div className="space-y-2">
                  {participantes
                    .filter((p) => p.pote === pote)
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoTime(p.id_time)}
                          className="h-6 w-6 object-contain"
                          alt=""
                        />
                        <span className="truncate">{nomeTime(p.id_time)}</span>
                        {p.grupo && (
                          <span className="ml-auto text-emerald-300">
                            Grupo {p.grupo}
                          </span>
                        )}
                      </div>
                    ))}
                  {!participantes.filter((p) => p.pote === pote).length && (
                    <div className="text-sm text-zinc-500">Vazio</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === "grupos" && (
        <div className="grid xl:grid-cols-2 gap-4">
          {GRUPOS.map((g) => (
            <BlocoClassificacao key={g} grupo={g} />
          ))}
        </div>
      )}

      {aba === "jogos" && (
        <div className="grid xl:grid-cols-2 gap-4">
          {GRUPOS.map((g) => (
            <div
              key={g}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <h2 className="text-xl font-black mb-4">Jogos — Grupo {g}</h2>
              <div className="space-y-3">
                {jogos
                  .filter((j) => j.fase === "grupos" && j.grupo === g)
                  .map((j) => (
                    <CardJogo key={j.id} jogo={j} />
                  ))}
                {!jogos.filter((j) => j.fase === "grupos" && j.grupo === g)
                  .length && (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-zinc-400">
                    Nenhum jogo gerado para este grupo.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === "mata" && (
        <>
          {isAdmin && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-wrap gap-2">
              <button
                onClick={gerarQuartas}
                className="rounded-xl bg-violet-500/20 px-4 py-2 text-violet-300 font-black hover:bg-violet-500/30"
              >
                Gerar Quartas
              </button>
              <button
                onClick={() => gerarProximaFase("quartas", "semi")}
                className="rounded-xl bg-violet-500/20 px-4 py-2 text-violet-300 font-black hover:bg-violet-500/30"
              >
                Gerar Semifinal
              </button>
              <button
                onClick={() => gerarProximaFase("semi", "final")}
                className="rounded-xl bg-violet-500/20 px-4 py-2 text-violet-300 font-black hover:bg-violet-500/30"
              >
                Gerar Final
              </button>
              <button
                onClick={definirCampeao}
                className="rounded-xl bg-yellow-500/20 px-4 py-2 text-yellow-300 font-black hover:bg-yellow-500/30"
              >
                Definir Campeão
              </button>
            </div>
          )}

          {FASES_MATA_MATA.map((fase) => {
            const lista = jogos.filter((j) => j.fase === fase);
            if (!lista.length) return null;

            return (
              <div
                key={fase}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <h2 className="text-xl font-black mb-4">
                  {fase === "quartas"
                    ? "Quartas de Final"
                    : fase === "semi"
                      ? "Semifinal"
                      : "Final"}
                </h2>
                <div className="space-y-3">
                  {lista.map((j) => (
                    <CardJogo key={j.id} jogo={j} />
                  ))}
                </div>
              </div>
            );
          })}

          {!jogos.some((j) => FASES_MATA_MATA.includes(j.fase as any)) && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-zinc-400">
              Mata-mata ainda não gerado. Finalize a fase de grupos e clique em
              Gerar Quartas.
            </div>
          )}
        </>
      )}
    </div>
  );
}
