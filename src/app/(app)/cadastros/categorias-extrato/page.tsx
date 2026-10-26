import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoCategoriaExtrato, excluirCategoriaExtrato } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { BOTAO_EDITAR, CABECALHO_TABELA, CARTAO } from "@/lib/estilo";

export const metadata = { title: "Cadastros - Categorias de Extrato" };

export default async function CategoriasExtratoPage() {
  const [categorias, podeEditar] = await Promise.all([
    prisma.categoriaExtrato.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    }),
    podeEditarModulo("CADASTROS"),
  ]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Categorias usadas pra classificar linhas de extrato bancário na
        conciliação (não é o plano de contas contábil — veja{" "}
        <Link href="/cadastros/plano-de-contas" className="underline">
          Plano de Contas
        </Link>
        ).
      </p>
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {categorias.length} categoria{categorias.length === 1 ? "" : "s"} cadastrada
          {categorias.length === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <Link
            href="/cadastros/categorias-extrato/novo"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            + Nova categoria
          </Link>
        )}
      </div>

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              <th className="px-4 py-2.5 text-left">Ordem</th>
              <th className="px-4 py-2.5 text-left">Nome</th>
              <th className="px-4 py-2.5 text-left">Tipo</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {categorias.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-2 text-foreground/50">{c.ordem}</td>
                <td className="px-4 py-3">{c.nome}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.tipo === "ADQUIRENTE" || c.tipo === "VOUCHER"
                        ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {c.tipo === "ADQUIRENTE" ? "Adquirente" : c.tipo === "VOUCHER" ? "Voucher" : "Padrão"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      c.ativo
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/cadastros/categorias-extrato/${c.id}/editar`}
                        className={BOTAO_EDITAR}
                      >
                        Editar
                      </Link>
                      <form action={alternarAtivoCategoriaExtrato}>
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {c.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={excluirCategoriaExtrato}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmSubmitButton confirmMessage={`Excluir a categoria "${c.nome}"? Essa ação não pode ser desfeita.`}>
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {categorias.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 5 : 4} className="px-4 py-6 text-center text-foreground/50">
                  Nenhuma categoria cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
