import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import {
  alternarAtivoGrupoPlanoConta,
  excluirGrupoPlanoConta,
  alternarAtivoPlanoConta,
  excluirPlanoConta,
} from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

function Status({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={
        ativo
          ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
          : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
      }
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

export default async function PlanoDeContasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const [grupos, podeEditar] = await Promise.all([
    prisma.grupoPlanoConta.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { orderBy: { nome: "asc" } } },
    }),
    podeEditarModulo("CADASTROS"),
  ]);
  const totalContas = grupos.reduce((soma, g) => soma + g.contas.length, 0);

  return (
    <div className="space-y-4">
      {erro === "grupo-com-contas" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Não é possível excluir um grupo que ainda tem contas — exclua ou
          mova as contas dele primeiro.
        </p>
      )}
      {erro === "conta-em-uso" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Não é possível excluir: essa conta está sendo usada em Contas a Pagar.
        </p>
      )}
      <p className="text-sm text-foreground/60">
        Plano de contas contábil, usado nas Contas a Pagar (não é a lista de
        categorias de extrato — veja{" "}
        <Link href="/cadastros/categorias-extrato" className="underline">
          Categorias de Extrato
        </Link>
        ).
      </p>
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {grupos.length} grupo{grupos.length === 1 ? "" : "s"}, {totalContas} conta
          {totalContas === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <div className="flex gap-2">
            <Link
              href="/cadastros/plano-de-contas/contas/novo"
              className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              + Nova conta
            </Link>
            <Link
              href="/cadastros/plano-de-contas/grupos/novo"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              + Novo grupo
            </Link>
          </div>
        )}
      </div>

      {grupos.length === 0 && (
        <p className="text-center text-foreground/50">Nenhum grupo cadastrado ainda.</p>
      )}

      <div className="space-y-6">
        {grupos.map((grupo) => (
          <div key={grupo.id} className="rounded-lg border border-black/10 dark:border-white/15">
            <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-black/5 px-4 py-2 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{grupo.nome}</h3>
                <Status ativo={grupo.ativo} />
                <span className="text-xs text-foreground/50">
                  {grupo.contas.length} conta{grupo.contas.length === 1 ? "" : "s"}
                </span>
              </div>
              {podeEditar && (
                <div className="flex items-center gap-1">
                  <Link
                    href={`/cadastros/plano-de-contas/contas/novo?grupoId=${grupo.id}`}
                    className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    + Conta
                  </Link>
                  <Link
                    href={`/cadastros/plano-de-contas/grupos/${grupo.id}/editar`}
                    className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    Editar grupo
                  </Link>
                  <form action={alternarAtivoGrupoPlanoConta}>
                    <input type="hidden" name="id" value={grupo.id} />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      {grupo.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </form>
                  <form action={excluirGrupoPlanoConta}>
                    <input type="hidden" name="id" value={grupo.id} />
                    <ConfirmSubmitButton
                      confirmMessage={
                        grupo.contas.length > 0
                          ? `O grupo "${grupo.nome}" tem ${grupo.contas.length} conta(s) — exclua ou mova as contas antes.`
                          : `Excluir o grupo "${grupo.nome}"?`
                      }
                    >
                      Excluir
                    </ConfirmSubmitButton>
                  </form>
                </div>
              )}
            </div>

            {grupo.contas.length === 0 ? (
              <p className="px-4 py-4 text-sm text-foreground/50">Nenhuma conta neste grupo.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {grupo.contas.map((conta) => (
                    <tr key={conta.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-4 py-2 text-foreground/50">{conta.codigo ?? "—"}</td>
                      <td className="px-4 py-2">{conta.nome}</td>
                      <td className="px-4 py-2">
                        <Status ativo={conta.ativo} />
                      </td>
                      {podeEditar && (
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/cadastros/plano-de-contas/contas/${conta.id}/editar`}
                              className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Editar
                            </Link>
                            <form action={alternarAtivoPlanoConta}>
                              <input type="hidden" name="id" value={conta.id} />
                              <button
                                type="submit"
                                className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {conta.ativo ? "Desativar" : "Ativar"}
                              </button>
                            </form>
                            <form action={excluirPlanoConta}>
                              <input type="hidden" name="id" value={conta.id} />
                              <ConfirmSubmitButton
                                confirmMessage={`Excluir a conta "${conta.nome}"? Essa ação não pode ser desfeita.`}
                              >
                                Excluir
                              </ConfirmSubmitButton>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
