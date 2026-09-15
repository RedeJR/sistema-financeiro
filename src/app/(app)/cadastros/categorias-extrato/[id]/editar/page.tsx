import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioCategoriaExtrato } from "../../formulario-categoria-extrato";
import { atualizarCategoriaExtrato } from "../../actions";

export default async function EditarCategoriaExtratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const categoria = await prisma.categoriaExtrato.findUnique({ where: { id } });
  if (!categoria) notFound();

  const acaoComId = atualizarCategoriaExtrato.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar categoria</h2>
      <FormularioCategoriaExtrato
        action={acaoComId}
        valoresIniciais={{
          nome: categoria.nome,
          tipo: categoria.tipo,
          ordem: categoria.ordem,
        }}
      />
    </div>
  );
}
