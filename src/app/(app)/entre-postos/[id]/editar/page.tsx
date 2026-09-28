import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioMovimentacao } from "../../formulario-movimentacao";
import { atualizarMovimentacao } from "../../actions";

const paraData = (d: Date) => d.toISOString().slice(0, 10);
const paraEdicao = (n: unknown) => Number(n).toFixed(2).replace(".", ",");

export default async function EditarMovimentacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const { id } = await params;
  const [movimentacao, postos] = await Promise.all([
    prisma.movimentacaoEntrePostos.findUnique({ where: { id } }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!movimentacao) notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar movimentação</h2>
      <FormularioMovimentacao
        postos={postos}
        action={atualizarMovimentacao.bind(null, id)}
        valoresIniciais={{
          data: paraData(movimentacao.data),
          postoOrigemId: movimentacao.postoOrigemId,
          postoDestinoId: movimentacao.postoDestinoId,
          valor: paraEdicao(movimentacao.valor),
          tipo: movimentacao.tipo,
          statusManual: movimentacao.statusManual,
          observacao: movimentacao.observacao,
        }}
      />
    </div>
  );
}
