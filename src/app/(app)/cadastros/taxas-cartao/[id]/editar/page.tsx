import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioTaxaCartao } from "../../formulario-taxa-cartao";
import { atualizarTaxaCartao } from "../../actions";

export default async function EditarTaxaCartaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("CADASTROS", "editar");

  const { id } = await params;
  const [taxa, postos, adquirentes, bancos] = await Promise.all([
    prisma.taxaCartao.findUnique({ where: { id } }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!taxa) notFound();

  const acaoComId = atualizarTaxaCartao.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar taxa de cartão</h2>
      <FormularioTaxaCartao
        postos={postos}
        adquirentes={adquirentes}
        bancos={bancos}
        action={acaoComId}
        valoresIniciais={{
          postoId: taxa.postoId,
          adquirenteId: taxa.adquirenteId,
          taxaDebito: taxa.taxaDebito?.toString() ?? null,
          prazoDebitoDias: taxa.prazoDebitoDias,
          taxaCreditoVista: taxa.taxaCreditoVista?.toString() ?? null,
          prazoCreditoVistaDias: taxa.prazoCreditoVistaDias,
          taxaCreditoParcelado: taxa.taxaCreditoParcelado?.toString() ?? null,
          prazoCreditoParceladoDias: taxa.prazoCreditoParceladoDias,
          domicilioBancoId: taxa.domicilioBancoId,
          observacao: taxa.observacao,
        }}
      />
    </div>
  );
}
