import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioPosto } from "../../formulario-posto";
import { atualizarPosto } from "../../actions";

export default async function EditarPostoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const posto = await prisma.posto.findUnique({ where: { id } });
  if (!posto) notFound();

  const acaoComId = atualizarPosto.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar posto</h2>
      <FormularioPosto
        action={acaoComId}
        valoresIniciais={{ nome: posto.nome, cnpj: posto.cnpj }}
      />
    </div>
  );
}
