import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { excluirAntecipacao } from "./actions";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default async function AntecipacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; adquirenteId?: string }>;
}) {
  const { postoId, adquirenteId } = await searchParams;

  const [postos, adquirentes, antecipacoes, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.antecipacaoCartao.findMany({
      where: { ...(postoId ? { postoId } : {}), ...(adquirenteId ? { adquirenteId } : {}) },
      include: { posto: true, adquirente: true },
      orderBy: [{ dataRecebimento: "desc" }, { createdAt: "desc" }],
    }),
    podeEditarModulo("CARTOES"),
  ]);

  const totais = antecipacoes.reduce(
    (acc, a) => ({ face: acc.face + Number(a.valorFace), liquido: acc.liquido + Number(a.valorLiquido) }),
    { face: 0, liquido: 0 }
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/60">
        Antecipações de recebíveis feitas nas adquirentes. Em Recebimentos (por data de pagamento) e no Resumo
        mensal, o líquido entra como esperado no dia em que caiu e o valor antecipado sai dos dias do período —
        proporcionalmente ao crédito esperado de cada dia, já que a adquirente não diz quais vendas foram
        antecipadas.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos os postos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adquirenteId" className="text-foreground/60">
            Adquirente
          </label>
          <select
            id="adquirenteId"
            name="adquirenteId"
            defaultValue={adquirenteId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todas</option>
            {adquirentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {(postoId || adquirenteId) && (
          <Link href="/cartoes/antecipacoes" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {podeEditar && (
          <Link
            href="/cartoes/antecipacoes/novo"
            className="ml-auto rounded-md bg-foreground px-4 py-1.5 font-medium text-background hover:opacity-90"
          >
            + Nova antecipação
          </Link>
        )}
      </form>

      {antecipacoes.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma antecipação cadastrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
              <tr>
                <th className="px-4 py-1.5 text-left font-medium">Caiu em</th>
                <th className="px-4 py-1.5 text-left font-medium">Posto</th>
                <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                <th className="px-4 py-1.5 text-left font-medium">Recebíveis de</th>
                <th className="px-4 py-1.5 text-right font-medium">Valor</th>
                <th className="px-4 py-1.5 text-right font-medium">Desconto</th>
                <th className="px-4 py-1.5 text-right font-medium">%</th>
                <th className="px-4 py-1.5 text-right font-medium">Líquido recebido</th>
                <th className="px-4 py-1.5 text-left font-medium">Obs.</th>
                {podeEditar && <th className="px-4 py-1.5 text-right font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {antecipacoes.map((a) => {
                const face = Number(a.valorFace);
                const liquido = Number(a.valorLiquido);
                const desconto = face - liquido;
                return (
                  <tr key={a.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(a.dataRecebimento)}</td>
                    <td className="px-4 py-1.5">{a.posto.nome}</td>
                    <td className="px-4 py-1.5">{a.adquirente.nome}</td>
                    <td className="px-4 py-1.5 whitespace-nowrap">
                      {formatarData(a.periodoDe)} a {formatarData(a.periodoAte)}
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(face)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(desconto)}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">
                      {face > 0 ? `${((desconto / face) * 100).toFixed(2).replace(".", ",")}%` : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(liquido)}</td>
                    <td className="px-4 py-1.5 text-foreground/70">{a.observacao ?? "—"}</td>
                    {podeEditar && (
                      <td className="px-4 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/cartoes/antecipacoes/${a.id}/editar`}
                            className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            Editar
                          </Link>
                          <form action={excluirAntecipacao}>
                            <input type="hidden" name="id" value={a.id} />
                            <ConfirmSubmitButton
                              confirmMessage={`Excluir a antecipação de ${a.adquirente.nome} em ${a.posto.nome} (${formatarData(a.dataRecebimento)})? Essa ação não pode ser desfeita.`}
                            >
                              Excluir
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-blue-950/10 font-semibold dark:border-white/10 dark:bg-blue-950/25">
                <td className="px-4 py-1.5" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.face)}</td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.face - totais.liquido)}</td>
                <td></td>
                <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totais.liquido)}</td>
                <td colSpan={podeEditar ? 2 : 1}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
