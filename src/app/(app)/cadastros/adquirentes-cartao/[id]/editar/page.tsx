import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioAdquirente } from "../../formulario-adquirente";
import { atualizarAdquirenteCartao } from "../../actions";

export default async function EditarAdquirenteCartaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const adquirente = await prisma.adquirenteCartao.findUnique({ where: { id } });
  if (!adquirente) notFound();

  const acaoComId = atualizarAdquirenteCartao.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar adquirente</h2>
      <FormularioAdquirente action={acaoComId} valoresIniciais={{ nome: adquirente.nome }} />
    </div>
  );
}
