import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { conferenciaTotalDiario } from "@/lib/conciliacao";
import { GraficoBarras } from "@/components/ui/grafico-barras";
import { GraficoComparativo } from "@/components/ui/grafico-comparativo";

// "Hoje" no fuso de armazenamento (datas de vencimento são gravadas como
// UTC meia-noite, ver ContaAPagar no schema) — pega o dia corrente nesse
// mesmo referencial, pra bater com o que tá no banco.
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatarDataExibicao(iso: string): string {
  return dataUTC(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarDataCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

// Primeiro dia do mês corrente, no mesmo referencial UTC-meia-noite usado
// pelas datas do banco — período padrão do painel de conciliação.
function primeiroDiaDoMes(): string {
  const hoje = new Date();
  return `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; concPostoId?: string; concDe?: string; concAte?: string }>;
}) {
  const { data, concPostoId, concDe, concAte } = await searchParams;
  const dataSelecionada = data || hojeISO();
  const concDeSelecionada = concDe || primeiroDiaDoMes();
  const concAteSelecionada = concAte || hojeISO();

  // Painel de Contas a Pagar é dado financeiro de verdade — só mostra pra
  // quem tem permissão de visualizar o módulo (mesma checagem de
  // exigirPermissao, mas sem redirecionar a home inteira: quem não pode ver
  // só não vê essa seção).
  const usuario = await usuarioAtual();
  const podeVerContasAPagar = !!usuario?.permissoes.find(
    (p) => p.modulo === "CONTAS_A_PAGAR"
  )?.podeVisualizar;

  // Painel de conciliação cruza dado de dois módulos (Despesas Pagas e
  // Extratos) — só mostra pra quem pode ver os dois.
  const podeVerConciliacao =
    !!usuario?.permissoes.find((p) => p.modulo === "DESPESAS_PAGAS")?.podeVisualizar &&
    !!usuario?.permissoes.find((p) => p.modulo === "EXTRATOS")?.podeVisualizar;

  let dadosGrafico: { label: string; valor: number }[] = [];
  let totalGeral = 0;
  let totalContas = 0;

  if (podeVerContasAPagar) {
    const contas = await prisma.contaAPagar.findMany({
      where: { dataVencimento: dataUTC(dataSelecionada) },
      select: { valor: true, posto: { select: { nome: true } } },
    });
    totalContas = contas.length;
    const porPosto = new Map<string, number>();
    for (const c of contas) {
      porPosto.set(c.posto.nome, (porPosto.get(c.posto.nome) ?? 0) + Number(c.valor));
    }
    dadosGrafico = [...porPosto.entries()]
      .map(([label, valor]) => ({ label, valor }))
      .sort((a, b) => b.valor - a.valor);
    totalGeral = dadosGrafico.reduce((s, d) => s + d.valor, 0);
  }

  // Painel de conciliação: reaproveita conferenciaTotalDiario (mesma conta
  // usada em Despesas Pagas e em Conciliação de Extratos — despesas pagas
  // do período x extrato categorizado "Despesas Pagas" no mesmo período,
  // por posto+dia). Ver src/lib/conciliacao.ts.
  let postosConciliacao: { id: string; nome: string }[] = [];
  let dadosComparativo: { label: string; serie1: number; serie2: number }[] = [];
  let linhasFaltando: Awaited<ReturnType<typeof conferenciaTotalDiario>> = [];

  if (podeVerConciliacao) {
    const [postos, conferencia] = await Promise.all([
      prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      conferenciaTotalDiario({ postoId: concPostoId || undefined, de: concDeSelecionada, ate: concAteSelecionada }),
    ]);
    postosConciliacao = postos;

    if (concPostoId) {
      // Um posto só selecionado: "posto x data" de verdade — um grupo por
      // dia, ordenado cronologicamente.
      dadosComparativo = [...conferencia]
        .sort((a, b) => a.data.getTime() - b.data.getTime())
        .map((l) => ({ label: formatarDataCurta(l.data), serie1: l.totalContasPagas, serie2: l.totalExtratoDespesasPagas }));
    } else {
      // "Todos": agrupa por posto (soma o período inteiro) — visão geral
      // pra achar rápido qual posto tem buraco, antes de filtrar um só.
      const porPosto = new Map<string, { serie1: number; serie2: number }>();
      for (const l of conferencia) {
        const atual = porPosto.get(l.postoNome) ?? { serie1: 0, serie2: 0 };
        atual.serie1 += l.totalContasPagas;
        atual.serie2 += l.totalExtratoDespesasPagas;
        porPosto.set(l.postoNome, atual);
      }
      dadosComparativo = [...porPosto.entries()]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => Math.abs(b.serie1 - b.serie2) - Math.abs(a.serie1 - a.serie2));
    }

    linhasFaltando = conferencia
      .filter((l) => Math.abs(l.diferenca) >= 0.01)
      .sort((a, b) => b.data.getTime() - a.data.getTime());
  }

  const qsConciliacaoExtratos = new URLSearchParams({
    ...(concPostoId ? { postoId: concPostoId } : {}),
    de: concDeSelecionada,
    ate: concAteSelecionada,
  }).toString();

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Sistema Financeiro</h1>
        <p className="text-foreground/70">
          Conciliação de extratos bancários e contas a pagar. Comece pelos
          Cadastros — é a base que os outros módulos vão usar.
        </p>
        <Link
          href="/cadastros"
          className="inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Ir para Cadastros →
        </Link>
      </div>

      {podeVerContasAPagar && (
        <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Contas a Pagar do dia</h2>
            <form className="flex items-center gap-2 text-sm">
              <label htmlFor="data" className="text-foreground/60">
                Data
              </label>
              <input
                id="data"
                type="date"
                name="data"
                defaultValue={dataSelecionada}
                className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
              />
              <button
                type="submit"
                className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Ver
              </button>
            </form>
          </div>

          <p className="text-sm text-foreground/60">
            {totalContas} conta{totalContas === 1 ? "" : "s"} vencendo em{" "}
            {formatarDataExibicao(dataSelecionada)} — total {formatarMoeda(totalGeral)}
          </p>

          {dadosGrafico.length > 0 ? (
            <GraficoBarras dados={dadosGrafico} />
          ) : (
            <p className="py-10 text-center text-sm text-foreground/50">
              Nenhuma conta a pagar vencendo nessa data.
            </p>
          )}

          <div className="pt-1 text-right">
            <Link
              href={`/contas-a-pagar?de=${dataSelecionada}&ate=${dataSelecionada}`}
              className="text-sm text-foreground/60 underline"
            >
              Ver essas contas em Contas a Pagar →
            </Link>
          </div>
        </section>
      )}

      {podeVerConciliacao && (
        <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Conciliação — Despesas x Extrato</h2>
            <form className="flex flex-wrap items-end gap-2 text-sm">
              <div className="flex flex-col gap-1">
                <label htmlFor="concPostoId" className="text-foreground/60">
                  Posto
                </label>
                <select
                  id="concPostoId"
                  name="concPostoId"
                  defaultValue={concPostoId ?? ""}
                  className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
                >
                  <option value="">Todos (por posto)</option>
                  {postosConciliacao.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="concDe" className="text-foreground/60">
                  De
                </label>
                <input
                  id="concDe"
                  type="date"
                  name="concDe"
                  defaultValue={concDeSelecionada}
                  className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="concAte" className="text-foreground/60">
                  até
                </label>
                <input
                  id="concAte"
                  type="date"
                  name="concAte"
                  defaultValue={concAteSelecionada}
                  className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
                />
              </div>
              <button
                type="submit"
                className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Ver
              </button>
            </form>
          </div>

          <p className="text-sm text-foreground/60">
            {formatarDataExibicao(concDeSelecionada)} até {formatarDataExibicao(concAteSelecionada)}
            {concPostoId
              ? " — total de contas pagas comparado ao extrato, dia a dia"
              : " — total do período por posto (escolha um posto pra ver dia a dia)"}
            . Toda diferença é o que ainda falta bater — lançar, categorizar ou corrigir.
          </p>

          {dadosComparativo.length > 0 ? (
            <GraficoComparativo dados={dadosComparativo} />
          ) : (
            <p className="py-10 text-center text-sm text-foreground/50">
              Nenhum dado de despesa paga ou extrato nesse período.
            </p>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground/80">
              {linhasFaltando.length === 0
                ? "Tudo batendo nesse período. ✅"
                : `${linhasFaltando.length} dia${linhasFaltando.length === 1 ? "" : "s"} com diferença:`}
            </p>
            {linhasFaltando.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Dia</th>
                      <th className="px-3 py-1.5 text-left font-medium">Posto</th>
                      <th className="px-3 py-1.5 text-right font-medium">Despesas Pagas</th>
                      <th className="px-3 py-1.5 text-right font-medium">Extrato</th>
                      <th className="px-3 py-1.5 text-right font-medium">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFaltando.map((l) => (
                      <tr key={`${l.postoId}|${l.data.toISOString()}`} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-3 py-1.5 whitespace-nowrap">{formatarData(l.data)}</td>
                        <td className="px-3 py-1.5">{l.postoNome}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalContasPagas)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.totalExtratoDespesasPagas)}</td>
                        <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap text-amber-700 dark:text-amber-500">
                          {formatarMoeda(l.diferenca)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="pt-1 text-right">
            <Link href={`/extratos/conciliacao?${qsConciliacaoExtratos}`} className="text-sm text-foreground/60 underline">
              Ver detalhes em Conciliação de Extratos →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
