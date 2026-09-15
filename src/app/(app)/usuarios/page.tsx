import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, exigirUsuario, podeEditarModulo } from "@/lib/auth";
import { formatarCpf } from "@/lib/cpf";
import { alternarAtivoUsuario, excluirUsuario } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

const MENSAGENS_ERRO: Record<string, string> = {
  "auto-desativar": "Você não pode desativar seu próprio usuário.",
  "auto-excluir": "Você não pode excluir seu próprio usuário.",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  await exigirPermissao("USUARIOS", "visualizar");
  const usuarioLogado = await exigirUsuario();
  const podeEditar = await podeEditarModulo("USUARIOS");
  const { erro } = await searchParams;

  const usuarios = await prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    include: { permissoes: true },
  });

  return (
    <div className="space-y-4">
      {erro && MENSAGENS_ERRO[erro] && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {MENSAGENS_ERRO[erro]}
        </p>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        {podeEditar && (
          <Link
            href="/usuarios/novo"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + Novo usuário
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Nome</th>
              <th className="px-4 py-2 text-left font-medium">CPF</th>
              <th className="px-4 py-2 text-left font-medium">Módulos liberados</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              {podeEditar && <th className="px-4 py-2 text-right font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const modulosComAcesso = u.permissoes.filter((p) => p.podeVisualizar || p.podeEditar).length;
              const souEu = u.id === usuarioLogado.id;
              return (
                <tr key={u.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-4 py-2">
                    {u.nome} {souEu && <span className="text-xs text-foreground/40">(você)</span>}
                  </td>
                  <td className="px-4 py-2 text-foreground/70">{formatarCpf(u.cpf)}</td>
                  <td className="px-4 py-2 text-foreground/70">{modulosComAcesso}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        u.ativo
                          ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-400"
                          : "rounded-full bg-black/10 px-2 py-0.5 text-xs text-foreground/60 dark:bg-white/10"
                      }
                    >
                      {u.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/usuarios/${u.id}/editar`}
                          className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          Editar
                        </Link>
                        {!souEu && (
                          <>
                            <form action={alternarAtivoUsuario}>
                              <input type="hidden" name="id" value={u.id} />
                              <button
                                type="submit"
                                className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
                              >
                                {u.ativo ? "Desativar" : "Ativar"}
                              </button>
                            </form>
                            <form action={excluirUsuario}>
                              <input type="hidden" name="id" value={u.id} />
                              <ConfirmSubmitButton confirmMessage={`Excluir o usuário "${u.nome}"? Essa ação não pode ser desfeita.`}>
                                Excluir
                              </ConfirmSubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
