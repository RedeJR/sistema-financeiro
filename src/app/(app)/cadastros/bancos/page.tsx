import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { alternarAtivoBanco, excluirBanco } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { BuscaCadastro } from "@/components/ui/busca-cadastro";
import { casaBusca } from "@/lib/busca";
import { BOTAO_EDITAR, CABECALHO_TABELA, CARTAO } from "@/lib/estilo";

export const metadata = { title: "Cadastros - Bancos" };

export default async function BancosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; q?: string }>;
}) {
  const { erro, q } = await searchParams;
  const termo = (q ?? "").trim();
  const [bancos, podeEditar] = await Promise.all([
    prisma.banco.findMany({ orderBy: { nome: "asc" } }),
    podeEditarModulo("CADASTROS"),
  ]);
  const visiveis = bancos.filter((b) => casaBusca(termo, [b.nome, b.codigoArquivo], []));

  return (
    <div className="space-y-6">
      <ErroFormulario mensagem={erro === "em-uso" ? "Não é possível excluir: esse banco está em uso." : null} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {bancos.length} banco{bancos.length === 1 ? "" : "s"} cadastrado
          {bancos.length === 1 ? "" : "s"}.
        </p>
        {podeEditar && (
          <Link
            href="/cadastros/bancos/novo"
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            + Novo banco
          </Link>
        )}
      </div>

      <BuscaCadastro caminho="/cadastros/bancos" termo={termo} exibidos={visiveis.length} total={bancos.length} placeholder="Buscar banco pelo nome..." />

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              <th className="px-4 py-2.5 text-left">Nome</th>
              <th className="px-4 py-2.5 text-left">Código no arquivo</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((b) => (
              <tr key={b.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-4 py-3">{b.nome}</td>
                <td className="px-4 py-2 font-mono text-xs text-foreground/70">{b.codigoArquivo}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      b.ativo
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                    }
                  >
                    {b.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/cadastros/bancos/${b.id}/editar`}
                        className={BOTAO_EDITAR}
                      >
                        Editar
                      </Link>
                      <form action={alternarAtivoBanco}>
                        <input type="hidden" name="id" value={b.id} />
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          {b.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <form action={excluirBanco}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmSubmitButton confirmMessage={`Excluir o banco "${b.nome}"? Essa ação não pode ser desfeita.`}>
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 4 : 3} className="px-4 py-6 text-center text-foreground/50">
                  {termo ? "Nada encontrado para essa busca." : "Nenhum banco cadastrado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
