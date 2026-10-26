import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoAdquirenteCartao, excluirAdquirenteCartao } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { BOTAO_EDITAR, CABECALHO_TABELA, CARTAO } from "@/lib/estilo";

export const metadata = { title: "Cadastros - Adquirentes de Cartão" };

export default async function AdquirentesCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const [adquirentes, podeEditar] = await Promise.all([
    prisma.adquirenteCartao.findMany({ orderBy: { nome: "asc" } }),
    podeEditarModulo("CADASTROS"),
  ]);

  return (
    <div className="space-y-6">
      <ErroFormulario
        mensagem={erro === "em-uso" ? "Não é possível excluir: essa adquirente está em uso." : null}
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {adquirentes.length} adquirente{adquirentes.length === 1 ? "" : "s"} cadastrada
          {adquirentes.length === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <Link
            href="/cadastros/adquirentes-cartao/novo"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            + Nova adquirente
          </Link>
        )}
      </div>

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              <th className="px-4 py-2.5 text-left">Nome</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {adquirentes.map((a) => (
              <tr key={a.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-3">{a.nome}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      a.ativo
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {a.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/cadastros/adquirentes-cartao/${a.id}/editar`}
                        className={BOTAO_EDITAR}
                      >
                        Editar
                      </Link>
                      <form action={alternarAtivoAdquirenteCartao}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {a.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={excluirAdquirenteCartao}>
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Excluir a adquirente "${a.nome}"? Essa ação não pode ser desfeita.`}
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {adquirentes.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 3 : 2} className="px-4 py-6 text-center text-foreground/50">
                  Nenhuma adquirente cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
