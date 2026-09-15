import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { statusDiarioPorPosto } from "@/lib/conciliacao";
import { GraficoBarras } from "@/components/ui/grafico-barras";
import { FaixaStatusDiario } from "@/components/ui/faixa-status-diario";

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

// N dias atrás, no mesmo referencial UTC-meia-noite usado pelas datas do
// banco — período padrão do painel de conciliação. 45 dias dá folga
// suficiente pra um "sem conciliar desde tal dia" aparecer inteiro na faixa,
// mesmo se o buraco começou há um mês.
function diasAtras(n: number): string {
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - n));
  return d.toISOString().slice(0, 10);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; concPostoId?: string; concBancoId?: string; concDe?: string; concAte?: string }>;
}) {
  const { data, concPostoId, concBancoId, concDe, concAte } = await searchParams;
  const dataSelecionada = data || hojeISO();
  const concDeSelecionada = concDe || diasAtras(45);
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

  // Painel de conciliação: uma linha por posto, uma faixa de dias do
  // período — ver src/lib/conciliacao.ts (statusDiarioPorPosto) e o
  // componente FaixaStatusDiario pro porquê desse formato (não é gráfico de
  // valor, é "bater o olho e achar o buraco").
  let postosConciliacao: { id: string; nome: string }[] = [];
  let bancosConciliacao: { id: string; nome: string }[] = [];
  let linhasStatus: Awaited<ReturnType<typeof statusDiarioPorPosto>> = [];

  if (podeVerConciliacao) {
    const [postos, bancos, status] = await Promise.all([
      prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      statusDiarioPorPosto({
        postoId: concPostoId || undefined,
        bancoId: concBancoId || undefined,
        de: concDeSelecionada,
        ate: concAteSelecionada,
      }),
    ]);
    postosConciliacao = postos;
    bancosConciliacao = bancos;
    linhasStatus = status;
  }

  const qsConciliacaoExtratos = new URLSearchParams({
    ...(concPostoId ? { postoId: concPostoId } : {}),
    ...(concBancoId ? { bancoId: concBancoId } : {}),
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
                <label htmlFor="concBancoId" className="text-foreground/60">
                  Banco
                </label>
                <select
                  id="concBancoId"
                  name="concBancoId"
                  defaultValue={concBancoId ?? ""}
                  className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
                >
                  <option value="">Todos</option>
                  {bancosConciliacao.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
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
            {formatarDataExibicao(concDeSelecionada)} até {formatarDataExibicao(concAteSelecionada)} — cada
            quadradinho é um dia. Passe o mouse pra ver os valores; um buraco na faixa (ou os últimos dias em
            amarelo) é extrato que ainda não chegou ou não foi categorizado como &quot;Despesas Pagas&quot;.
          </p>

          {linhasStatus.length > 0 ? (
            <FaixaStatusDiario linhas={linhasStatus} />
          ) : (
            <p className="py-10 text-center text-sm text-foreground/50">
              Nenhum dado de despesa paga ou extrato nesse período.
            </p>
          )}

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
