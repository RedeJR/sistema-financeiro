import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { GraficoBarras } from "@/components/ui/grafico-barras";

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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const dataSelecionada = data || hojeISO();

  // Painel de Contas a Pagar é dado financeiro de verdade — só mostra pra
  // quem tem permissão de visualizar o módulo (mesma checagem de
  // exigirPermissao, mas sem redirecionar a home inteira: quem não pode ver
  // só não vê essa seção).
  const usuario = await usuarioAtual();
  const podeVerContasAPagar = !!usuario?.permissoes.find(
    (p) => p.modulo === "CONTAS_A_PAGAR"
  )?.podeVisualizar;

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
    </div>
  );
}
