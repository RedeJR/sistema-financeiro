import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioBanco } from "../../formulario-banco";
import { atualizarBanco } from "../../actions";

export default async function EditarBancoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const banco = await prisma.banco.findUnique({ where: { id } });
  if (!banco) notFound();

  const acaoComId = atualizarBanco.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar banco</h2>
      <FormularioBanco
        action={acaoComId}
        valoresIniciais={{ nome: banco.nome, codigoArquivo: banco.codigoArquivo }}
      />
    </div>
  );
}
