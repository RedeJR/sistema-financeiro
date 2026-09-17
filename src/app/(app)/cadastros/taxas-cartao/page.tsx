import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoTaxaCartao, excluirTaxaCartao } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

function fmtPct(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  return `${Number(valor).toFixed(2).replace(".", ",")}%`;
}

export default async function TaxasCartaoPage() {
  const [postos, taxas, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.taxaCartao.findMany({
      include: { adquirente: true, domicilioBanco: true },
      orderBy: [{ adquirente: { nome: "asc" } }],
    }),
    podeEditarModulo("CADASTROS"),
  ]);

  const taxasPorPosto = new Map<string, typeof taxas>();
  for (const t of taxas) {
    const lista = taxasPorPosto.get(t.postoId) ?? [];
    lista.push(t);
    taxasPorPosto.set(t.postoId, lista);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Taxas de cartão por posto/adquirente — base pra futura Conciliação de Cartões. Taxa em branco = não
        contratado.
      </p>

      {postos.map((posto) => {
        const lista = taxasPorPosto.get(posto.id) ?? [];
        return (
          <div key={posto.id} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="flex items-center justify-between border-b border-black/10 bg-black/5 px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <span className="text-sm font-semibold text-foreground/80">{posto.nome}</span>
              {podeEditar && (
                <Link
                  href={`/cadastros/taxas-cartao/novo?postoId=${posto.id}`}
                  className="text-xs text-foreground/60 underline"
                >
                  + Nova taxa
                </Link>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                    <th className="px-4 py-1.5 text-right font-medium">Débito</th>
                    <th className="px-4 py-1.5 text-right font-medium">Crédito à vista</th>
                    <th className="px-4 py-1.5 text-right font-medium">Crédito parcelado</th>
                    <th className="px-4 py-1.5 text-right font-medium">PIX</th>
                    <th className="px-4 py-1.5 text-left font-medium">Domicílio</th>
                    <th className="px-4 py-1.5 text-left font-medium">Observação</th>
                    <th className="px-4 py-1.5 text-left font-medium">Status</th>
                    {podeEditar && <th className="px-4 py-1.5 text-right font-medium">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t) => (
                    <tr key={t.id} className="border-t border-black/5 dark:border-white/10">
                      <td className="px-4 py-1.5">{t.adquirente.nome}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {fmtPct(t.taxaDebito)}
                        {t.taxaDebito !== null && (
                          <span className="text-foreground/50"> (D+{t.prazoDebitoDias})</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {fmtPct(t.taxaCreditoVista)}
                        {t.taxaCreditoVista !== null && (
                          <span className="text-foreground/50"> (D+{t.prazoCreditoVistaDias})</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {fmtPct(t.taxaCreditoParcelado)}
                        {t.taxaCreditoParcelado !== null && (
                          <span className="text-foreground/50"> (D+{t.prazoCreditoParceladoDias})</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">
                        {fmtPct(t.taxaPix)}
                        {t.taxaPix !== null && <span className="text-foreground/50"> (D+{t.prazoPixDias})</span>}
                      </td>
                      <td className="px-4 py-1.5 text-foreground/70">{t.domicilioBanco?.nome ?? "—"}</td>
                      <td className="px-4 py-1.5 text-foreground/70">{t.observacao ?? "—"}</td>
                      <td className="px-4 py-1.5">
                        <span
                          className={
                            t.ativo
                              ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                              : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                          }
                        >
                          {t.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      {podeEditar && (
                        <td className="px-4 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/cadastros/taxas-cartao/${t.id}/editar`}
                              className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Editar
                            </Link>
                            <form action={alternarAtivoTaxaCartao}>
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                type="submit"
                                className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {t.ativo ? "Desativar" : "Ativar"}
                              </button>
                            </form>
                            <form action={excluirTaxaCartao}>
                              <input type="hidden" name="id" value={t.id} />
                              <ConfirmSubmitButton
                                confirmMessage={`Excluir a taxa de ${t.adquirente.nome} em ${posto.nome}? Essa ação não pode ser desfeita.`}
                              >
                                Excluir
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {lista.length === 0 && (
                    <tr>
                      <td
                        colSpan={podeEditar ? 8 : 7}
                        className="px-4 py-4 text-center text-sm text-foreground/50"
                      >
                        Nenhuma taxa cadastrada pra esse posto.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
