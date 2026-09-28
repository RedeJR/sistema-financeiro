import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioMovimentacao } from "../formulario-movimentacao";
import { criarMovimentacao } from "../actions";

export default async function NovaMovimentacaoPage() {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const postos = await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova movimentação</h2>
      <FormularioMovimentacao postos={postos} action={criarMovimentacao} />
    </div>
  );
}
