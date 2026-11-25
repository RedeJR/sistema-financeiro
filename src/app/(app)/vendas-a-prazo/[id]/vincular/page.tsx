import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { sugerirCandidatosDaVenda } from "@/lib/vendasAPrazo/vinculo";
import { resumoRecebimento } from "@/lib/vendasAPrazo/recebimento";
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
    include: {
      posto: true,
      creditos: { include: { lancamentoExtrato: { include: { categoria: true, banco: true } } } },
    },
  });
  if (!venda) notFound();

  const ligados = venda.creditos
    .map((c) => c.lancamentoExtrato)
    .sort((a, b) => a.data.getTime() - b.data.getTime());
  const valor = Number(venda.valor);
  const resumo = resumoRecebimento(valor, ligados.map((l) => Number(l.valor)));
  const completo = resumo.situacao === "COMPLETO";
  const candidatos = completo ? [] : await sugerirCandidatosDaVenda(id);

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
          {formatarData(venda.dataPagamento)}. Ligue essa venda aos créditos que entraram no banco — o cliente pode ter pago de uma vez ou picado, em
          dias diferentes. Só aparecem créditos que o extrato já considera &quot;VENDA A PRAZO&quot;.
        </p>
      </div>

      <section aria-label="Resumo" className="flex flex-wrap gap-4 text-sm">
        <div className="min-w-[160px] rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
          <p className="text-foreground/60">Valor da venda</p>
          <p className="text-lg font-bold">{formatarMoeda(valor)}</p>
        </div>
        <div className="min-w-[160px] rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
          <p className="text-foreground/60">Já recebido ({ligados.length} crédito{ligados.length === 1 ? "" : "s"})</p>
          <p className="text-lg font-bold text-[#14693A] dark:text-green-400">{formatarMoeda(resumo.recebido)}</p>
        </div>
        <div className="min-w-[160px] rounded-lg border border-black/10 px-4 py-3 dark:border-white/15">
          <p className="text-foreground/60">{resumo.falta < 0 ? "Entrou a mais" : "Falta receber"}</p>
          <p className={`text-lg font-bold ${completo ? "" : "text-[#A12727] dark:text-red-400"}`}>{formatarMoeda(Math.abs(resumo.falta))}</p>
        </div>
      </section>

      {completo && (
        <p className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
          Venda totalmente recebida
          {resumo.diferenca > 0 ? ` (diferença de ${formatarMoeda(resumo.diferenca)} aceita)` : ""}.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
        <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
          Créditos já ligados a essa venda
        </div>
        <div className="space-y-1.5 p-3">
          {ligados.length === 0 && <p className="text-sm text-foreground/50">Nenhum crédito ligado ainda.</p>}
          {ligados.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">
                  {formatarData(l.data)} — {formatarMoeda(Number(l.valor))}
                </p>
                <p className="text-foreground/60">
                  {l.banco.nome} · {l.categoria?.nome ?? "sem categoria"} · {l.descricao}
                </p>
              </div>
              <form action={desvincularDoExtrato}>
                <input type="hidden" name="vendaId" value={venda.id} />
                <input type="hidden" name="lancamentoExtratoId" value={l.id} />
                <button type="submit" className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  Desvincular
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>

      {!completo && (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
          <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
            Créditos de {venda.posto.nome} categorizados como Venda a Prazo, ainda sem venda
          </div>
          <div className="p-3">
            {candidatos.length === 0 ? (
              <p className="text-sm text-foreground/50">
                Nenhum crédito categorizado como &quot;VENDA A PRAZO&quot; e ainda sem venda no extrato de {venda.posto.nome} entre{" "}
                {formatarData(venda.periodoDe)} e 45 dias depois de {formatarData(venda.dataPagamento)}. Se o cliente já pagou, confira se o extrato
                foi importado e se o crédito está categorizado como Venda a Prazo (Extratos).
              </p>
            ) : (
              <div className="space-y-1.5">
                {candidatos.map((c) => {
                  const igualAoQueFalta = Math.abs(c.valor - resumo.falta) <= 0.02;
                  const maiorQueFalta = c.valor > resumo.falta + 1;
                  return (
                    <form
                      key={c.id}
                      action={vincularAoExtrato}
                      className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                        igualAoQueFalta ? "border-blue-500/50 bg-blue-500/5" : "border-black/10 dark:border-white/15"
                      }`}
                    >
                      <input type="hidden" name="vendaId" value={venda.id} />
                      <input type="hidden" name="lancamentoExtratoId" value={c.id} />
                      <div>
                        <p className="font-medium">
                          {formatarData(c.data)} — {formatarMoeda(c.valor)}
                          {igualAoQueFalta && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">igual ao que falta</span>}
                          {maiorQueFalta && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-300">maior que o que falta</span>}
                        </p>
                        <p className="text-foreground/60">
                          {c.bancoNome} · {c.categoriaNome ?? "sem categoria"} · {c.descricao}
                        </p>
                      </div>
                      <button type="submit" className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">
                        Vincular
                      </button>
                    </form>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
