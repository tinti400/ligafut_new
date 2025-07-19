'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAdmin } from '@/hooks/useAdmin';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Jogo = {
  mandante: string;
  visitante: string;
  gols_mandante?: number;
  gols_visitante?: number;
};

type Rodada = {
  id: string;
  numero: number;
  temporada: number;
  divisao: number;
  jogos: Jogo[];
};

type Time = {
  id: string;
  nome: string;
  logo_url: string;
};

export default function Jogos() {
  const { isAdmin, loading } = useAdmin();
  const [rodadas, setRodadas] = useState<Rodada[]>([]);
  const [timesMap, setTimesMap] = useState<Record<string, Time>>({});
  const [temporada, setTemporada] = useState(1);
  const [divisao, setDivisao] = useState(1);
  const [timeSelecionado, setTimeSelecionado] = useState<string>('');

  const [editandoRodada, setEditandoRodada] = useState<string | null>(null);
  const [editandoIndex, setEditandoIndex] = useState<number | null>(null);
  const [golsMandante, setGolsMandante] = useState<number>(0);
  const [golsVisitante, setGolsVisitante] = useState<number>(0);

  const temporadasDisponiveis = [1, 2];
  const divisoesDisponiveis = [1, 2, 3];

  const carregarDados = async () => {
    const { data: times } = await supabase.from('times').select('id, nome, logo_url');
    const map: Record<string, Time> = {};
    times?.forEach((t) => {
      map[t.id] = { ...t, logo_url: t.logo_url || '' };
    });
    setTimesMap(map);

    const { data: rodadasData } = await supabase
      .from('rodadas')
      .select('*')
      .eq('temporada', temporada)
      .eq('divisao', divisao)
      .order('numero', { ascending: true });

    setRodadas((rodadasData || []) as Rodada[]);
  };

  useEffect(() => {
    carregarDados();
  }, [temporada, divisao]);

  const salvarResultado = async () => {
    if (editandoRodada === null || editandoIndex === null) return;

    const rodada = rodadas.find((r) => r.id === editandoRodada);
    if (!rodada) return;

    const novaLista = [...rodada.jogos];
    novaLista[editandoIndex] = {
      ...novaLista[editandoIndex],
      gols_mandante: golsMandante,
      gols_visitante: golsVisitante,
    };

    await supabase.from('rodadas').update({ jogos: novaLista }).eq('id', rodada.id);
    await carregarDados();
    setEditandoRodada(null);
    setEditandoIndex(null);
  };

  const gerarRodadas = async (temporada: number, divisao: number) => {
    await supabase.from('rodadas').delete().eq('temporada', temporada).eq('divisao', divisao);

    const { data: times } = await supabase.from('times').select('id').eq('divisao', divisao);
    if (!times || times.length < 2) return;

    const ids = times.map((t) => t.id);
    const jogosTurno: Jogo[] = [];
    const jogosReturno: Jogo[] = [];

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        jogosTurno.push({ mandante: ids[i], visitante: ids[j] });
        jogosReturno.push({ mandante: ids[j], visitante: ids[i] });
      }
    }

    const todosJogos = [...jogosTurno, ...jogosReturno].sort(() => Math.random() - 0.5);
    const jogosPorRodada = Math.floor(ids.length / 2) || 1;

    let rodadaNum = 1;
    for (let i = 0; i < todosJogos.length; i += jogosPorRodada) {
      await supabase.from('rodadas').insert({
        numero: rodadaNum++,
        temporada,
        divisao,
        jogos: todosJogos.slice(i, i + jogosPorRodada),
      });
    }
  };

  const rodadasFiltradas = !timeSelecionado
    ? rodadas
    : rodadas
        .map((rodada) => ({
          ...rodada,
          jogos: rodada.jogos.filter(
            (jogo) => jogo.mandante === timeSelecionado || jogo.visitante === timeSelecionado
          ),
        }))
        .filter((rodada) => rodada.jogos.length > 0);

  if (loading) return <p className="text-center text-white">🔄 Verificando permissões...</p>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4 text-white">📅 Jogos da LigaFut</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {temporadasDisponiveis.map((temp) => (
          <button
            key={temp}
            onClick={() => setTemporada(temp)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              temporada === temp ? 'bg-green-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Temporada {temp}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {divisoesDisponiveis.map((div) => (
          <button
            key={div}
            onClick={() => setDivisao(div)}
            className={`px-4 py-2 rounded-lg font-semibold ${
              divisao === div ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-gray-300'
            }`}
          >
            Divisão {div}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="mb-4">
          <button
            onClick={async () => {
              if (!confirm('⚠️ Gerar rodadas para TODAS divisões desta temporada?')) return;
              for (const div of divisoesDisponiveis) {
                await gerarRodadas(temporada, div);
              }
              await carregarDados();
              alert('✅ Rodadas geradas para todas as divisões!');
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
          >
            ➕ Gerar Rodadas Automáticas (Todas)
          </button>
        </div>
      )}

      <select
        className="mb-6 p-2 bg-zinc-800 text-white rounded-lg"
        onChange={(e) => setTimeSelecionado(e.target.value)}
        value={timeSelecionado}
      >
        <option value="">Todos os times</option>
        {Object.values(timesMap).map((time) => (
          <option key={time.id} value={time.id}>
            {time.nome}
          </option>
        ))}
      </select>

      {rodadasFiltradas.map((rodada) => (
        <div key={rodada.id} className="bg-zinc-800 rounded-xl p-4 mb-6 shadow-md">
          <h2 className="text-xl font-semibold text-white mb-3">🏁 Rodada {rodada.numero}</h2>

          <div className="space-y-2">
            {rodada.jogos.map((jogo, index) => {
              const mandante = timesMap[jogo.mandante];
              const visitante = timesMap[jogo.visitante];
              const estaEditando = editandoRodada === rodada.id && editandoIndex === index;

              return (
                <div
                  key={index}
                  className="flex items-center justify-between bg-zinc-700 text-white px-4 py-2 rounded-lg"
                >
                  <div className="flex items-center w-1/3 justify-end gap-2">
                    {mandante?.logo_url && (
                      <img src={mandante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                    )}
                    <span className="font-medium text-right">{mandante?.nome || '???'}</span>
                  </div>

                  <div className="w-1/3 text-center text-zinc-300 font-bold">
                    {estaEditando ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={golsMandante}
                          onChange={(e) => setGolsMandante(Number(e.target.value))}
                          className="w-10 text-black text-center rounded"
                        />
                        <span>x</span>
                        <input
                          type="number"
                          value={golsVisitante}
                          onChange={(e) => setGolsVisitante(Number(e.target.value))}
                          className="w-10 text-black text-center rounded"
                        />
                      </div>
                    ) : jogo.gols_mandante !== undefined && jogo.gols_visitante !== undefined ? (
                      `${jogo.gols_mandante} x ${jogo.gols_visitante}`
                    ) : (
                      '🆚'
                    )}
                  </div>

                  <div className="flex items-center w-1/3 justify-start gap-2">
                    <span className="font-medium text-left">{visitante?.nome || '???'}</span>
                    {visitante?.logo_url && (
                      <img src={visitante.logo_url} alt="logo" className="h-6 w-6 rounded-full" />
                    )}

                    {isAdmin && !estaEditando && (
                      <button
                        onClick={() => {
                          setEditandoRodada(rodada.id);
                          setEditandoIndex(index);
                          setGolsMandante(jogo.gols_mandante ?? 0);
                          setGolsVisitante(jogo.gols_visitante ?? 0);
                        }}
                        className="ml-2 text-sm text-yellow-300"
                      >
                        📝
                      </button>
                    )}

                    {isAdmin && estaEditando && (
                      <button
                        onClick={salvarResultado}
                        className="ml-2 text-sm text-green-400 font-semibold"
                      >
                        💾 Salvar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
