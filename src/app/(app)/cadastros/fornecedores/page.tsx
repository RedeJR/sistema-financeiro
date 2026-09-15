import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoFornecedor, excluirFornecedor } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const [fornecedores, podeEditar] = await Promise.all([
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
    podeEditarModulo("CADASTROS"),
  ]);

  return (
    <div className="space-y-4">
      <ErroFormulario
        mensagem={erro === "em-uso" ? "Não é possível excluir: esse fornecedor está sendo usado em Contas a Pagar." : null}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {fornecedores.length} fornecedor{fornecedores.length === 1 ? "" : "es"} cadastrado
          {fornecedores.length === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <Link
            href="/cadastros/fornecedores/novo"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + Novo fornecedor
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nome</th>
              <th className="px-4 py-2 text-left font-medium">CNPJ/CPF</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {fornecedores.map((f) => (
              <tr key={f.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2">{f.nome}</td>
                <td className="px-4 py-2 text-foreground/70">{f.documento ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      f.ativo
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {f.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {podeEditar && (
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/cadastros/fornecedores/${f.id}/editar`}
                        className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        Editar
                      </Link>
                      <form action={alternarAtivoFornecedor}>
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {f.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={excluirFornecedor}>
                        <input type="hidden" name="id" value={f.id} />
                        <ConfirmSubmitButton confirmMessage={`Excluir o fornecedor "${f.nome}"? Essa ação não pode ser desfeita.`}>
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {fornecedores.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 4 : 3} className="px-4 py-6 text-center text-foreground/50">
                  Nenhum fornecedor cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
