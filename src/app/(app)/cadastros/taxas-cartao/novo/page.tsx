import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioTaxaCartao } from "../formulario-taxa-cartao";
import { criarTaxaCartao } from "../actions";

export default async function NovaTaxaCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string }>;
}) {
  await exigirPermissao("CADASTROS", "editar");
  const { postoId } = await searchParams;

  const [postos, adquirentes, bancos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova taxa de cartão</h2>
      <FormularioTaxaCartao
        postos={postos}
        adquirentes={adquirentes}
        bancos={bancos}
        action={criarTaxaCartao}
        valoresIniciais={
          postoId
            ? {
                postoId,
                adquirenteId: "",
                taxaDebito: null,
                prazoDebitoDias: 1,
                taxaCreditoVista: null,
                prazoCreditoVistaDias: 1,
                taxaCreditoParcelado: null,
                prazoCreditoParceladoDias: 30,
                taxaPix: null,
                prazoPixDias: 1,
                taxaCreditoPrePago: null,
                prazoCreditoPrePagoDias: 1,
                domicilioBancoId: null,
                observacao: null,
              }
            : undefined
        }
      />
    </div>
  );
}
