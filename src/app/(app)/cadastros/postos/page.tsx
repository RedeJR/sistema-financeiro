import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoPosto, excluirPosto } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";

export default async function PostosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const [postos, podeEditar] = await Promise.all([
    prisma.posto.findMany({ orderBy: { nome: "asc" } }),
    podeEditarModulo("CADASTROS"),
  ]);

  return (
    <div className="space-y-4">
      <ErroFormulario
        mensagem={erro === "em-uso" ? "Não é possível excluir: esse posto está sendo usado em Contas a Pagar." : null}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {postos.length} posto{postos.length === 1 ? "" : "s"} cadastrado
          {postos.length === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <Link
            href="/cadastros/postos/novo"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + Novo posto
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nome</th>
              <th className="px-4 py-2 text-left font-medium">CNPJ</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {postos.map((posto) => (
              <tr key={posto.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2">{posto.nome}</td>
                <td className="px-4 py-2 text-foreground/70">{posto.cnpj ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      posto.ativo
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {posto.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {podeEditar && (
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/cadastros/postos/${posto.id}/editar`}
                        className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Editar
                      </Link>
                      <form action={alternarAtivoPosto}>
                        <input type="hidden" name="id" value={posto.id} />
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {posto.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={excluirPosto}>
                        <input type="hidden" name="id" value={posto.id} />
                        <ConfirmSubmitButton confirmMessage={`Excluir o posto "${posto.nome}"? Essa ação não pode ser desfeita.`}>
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {postos.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 4 : 3} className="px-4 py-6 text-center text-foreground/50">
                  Nenhum posto cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
