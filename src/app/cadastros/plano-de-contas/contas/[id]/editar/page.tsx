import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioConta } from "../../../formulario-conta";
import { atualizarPlanoConta } from "../../../actions";

export default async function EditarContaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const [conta, grupos] = await Promise.all([
    prisma.planoConta.findUnique({ where: { id } }),
    prisma.grupoPlanoConta.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
  ]);
  if (!conta) notFound();

  const acaoComId = atualizarPlanoConta.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar conta</h2>
      <FormularioConta
        action={acaoComId}
        grupos={grupos}
        valoresIniciais={{ nome: conta.nome, grupoId: conta.grupoId, codigo: conta.codigo }}
      />
    </div>
  );
}
