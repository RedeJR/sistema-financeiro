import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioAntecipacao } from "../formulario-antecipacao";
import { criarAntecipacao } from "../actions";

export default async function NovaAntecipacaoPage() {
  await exigirPermissao("CARTOES", "editar");
  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova antecipação</h2>
      <FormularioAntecipacao postos={postos} adquirentes={adquirentes} action={criarAntecipacao} />
    </div>
  );
}
