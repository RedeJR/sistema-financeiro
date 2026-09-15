import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioFornecedor } from "../../formulario-fornecedor";
import { atualizarFornecedor } from "../../actions";

export default async function EditarFornecedorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id } });
  if (!fornecedor) notFound();

  const acaoComId = atualizarFornecedor.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar fornecedor</h2>
      <FormularioFornecedor
        action={acaoComId}
        valoresIniciais={{ nome: fornecedor.nome, documento: fornecedor.documento }}
      />
    </div>
  );
}
