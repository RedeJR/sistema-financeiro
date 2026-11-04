import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { sugerirCandidatosDaVenda } from "@/lib/vendasAPrazo/vinculo";
import { vincularAoExtrato, desvincularDoExtrato } from "../../actions";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export const metadata = { title: "Vendas a Prazo - Vincular ao extrato" };

export default async function VincularVendaAPrazoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const { id } = await params;

  const venda = await prisma.vendaAPrazo.findUnique({
    where: { id },
    include: { posto: true, lancamentoExtrato: { include: { categoria: true, banco: true } } },
  });
  if (!venda) notFound();

  const candidatos = await sugerirCandidatosDaVenda(id);
  const valor = Number(venda.valor);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/vendas-a-prazo" className="text-sm text-foreground/60 underline">
          ← Voltar pra Vendas a Prazo
        </Link>
        <h2 className="text-lg font-bold tracking-tight">
          Vincular ao extrato — {venda.cliente}, {formatarMoeda(valor)}
        </h2>
        <p className="text-sm text-foreground/60">
          {venda.posto.nome} · abastecimentos de {formatarData(venda.periodoDe)} a {formatarData(venda.periodoAte)} · pagamento previsto em{" "}
          {formatarData(venda.dataPagamento)}. Ligue essa venda ao crédito que entrou no banco — a categoria dele vira &quot;VENDA A PRAZO&quot;
          automaticamente.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
        <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
          Crédito no extrato de {venda.posto.nome} ({formatarMoeda(valor)})
        </div>
        <div className="p-3">
          {venda.lancamentoExtrato ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {formatarData(venda.lancamentoExtrato.data)} — {formatarMoeda(Number(venda.lancamentoExtrato.valor))}
                </p>
                <p className="text-foreground/60">
                  {venda.lancamentoExtrato.banco.nome} · {venda.lancamentoExtrato.categoria?.nome ?? "sem categoria"} · {venda.lancamentoExtrato.descricao}
                </p>
              </div>
              <form action={desvincularDoExtrato}>
                <input type="hidden" name="vendaId" value={venda.id} />
                <button type="submit" className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  Desvincular
                </button>
              </form>
            </div>
          ) : candidatos.length === 0 ? (
            <p className="text-sm text-foreground/50">
              Nenhum crédito de {formatarMoeda(valor)} encontrado no extrato de {venda.posto.nome} entre 5 dias antes e 15 dias depois de{" "}
              {formatarData(venda.dataPagamento)}. O cliente pode não ter pago ainda, ter pago um valor diferente, ou o extrato ainda não foi
              importado.
            </p>
          ) : (
            <div className="space-y-1.5">
              {candidatos.map((c) => (
                <form key={c.id} action={vincularAoExtrato} className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15">
                  <input type="hidden" name="vendaId" value={venda.id} />
                  <input type="hidden" name="lancamentoExtratoId" value={c.id} />
                  <div>
                    <p className="font-medium">
                      {formatarData(c.data)} — {formatarMoeda(c.valor)}
                    </p>
                    <p className="text-foreground/60">
                      {c.bancoNome} · {c.categoriaNome ?? "sem categoria"} · {c.descricao}
                    </p>
                  </div>
                  <button type="submit" className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">
                    Vincular
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
