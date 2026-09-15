import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioGrupo } from "../../../formulario-grupo";
import { atualizarGrupoPlanoConta } from "../../../actions";

export default async function EditarGrupoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const grupo = await prisma.grupoPlanoConta.findUnique({ where: { id } });
  if (!grupo) notFound();

  const acaoComId = atualizarGrupoPlanoConta.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar grupo</h2>
      <FormularioGrupo action={acaoComId} valoresIniciais={{ nome: grupo.nome, ordem: grupo.ordem }} />
    </div>
  );
}
