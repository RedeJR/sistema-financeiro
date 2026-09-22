import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioAntecipacao } from "../../formulario-antecipacao";
import { atualizarAntecipacao } from "../../actions";

const paraData = (d: Date) => d.toISOString().slice(0, 10);
const paraEdicao = (n: unknown) => Number(n).toFixed(2).replace(".", ",");

export default async function EditarAntecipacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("CARTOES", "editar");
  const { id } = await params;
  const [antecipacao, postos, adquirentes] = await Promise.all([
    prisma.antecipacaoCartao.findUnique({ where: { id } }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!antecipacao) notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar antecipação</h2>
      <FormularioAntecipacao
        postos={postos}
        adquirentes={adquirentes}
        action={atualizarAntecipacao.bind(null, id)}
        valoresIniciais={{
          postoId: antecipacao.postoId,
          adquirenteId: antecipacao.adquirenteId,
          dataRecebimento: paraData(antecipacao.dataRecebimento),
          periodoDe: paraData(antecipacao.periodoDe),
          periodoAte: paraData(antecipacao.periodoAte),
          valorFace: paraEdicao(antecipacao.valorFace),
          valorLiquido: paraEdicao(antecipacao.valorLiquido),
          observacao: antecipacao.observacao,
        }}
      />
    </div>
  );
}
