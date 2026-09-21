import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, ORDEM_MODALIDADE_VENDA, type ModalidadeVenda } from "./normalizar";

export type LinhaVendas = {
  data: string; // YYYY-MM-DD (data da venda)
  adquirente: string;
  adquirenteId: string;
  modalidade: ModalidadeVenda;
  qtd: number;
  totalBruto: number;
  totalLiquido: number;
  taxa: number; // totalBruto - totalLiquido
};

// Listagem crua de vendas por dia/adquirente/modalidade (data da venda),
// sem comparar com extrato — serve pra conferir se o arquivo foi lido certo
// (a mesma pergunta que "Vamos pra Sul" levantava, mas sem misturar com a
// reconciliação de Recebimentos).
export async function buscarVendasCartoes(params: {
  postoId: string;
  adquirenteIds?: string[];
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaVendas[]> {
  const { postoId, adquirenteIds, dataInicio, dataFim } = params;

  const transacoes = await prisma.transacaoCartao.findMany({
    where: {
      postoId,
      dataVenda: { gte: dataInicio, lte: dataFim },
      ...(adquirenteIds && adquirenteIds.length > 0 ? { adquirenteId: { in: adquirenteIds } } : {}),
    },
    include: { adquirente: true },
  });

  const grupos = new Map<string, LinhaVendas>();
  for (const t of transacoes) {
    const data = t.dataVenda.toISOString().slice(0, 10);
    const modalidade = classificarModalidadeVenda(t.tipoVenda, t.adquirente.nome);
    const chave = `${t.adquirenteId}|${data}|${modalidade}`;
    const grupo = grupos.get(chave) ?? {
      data,
      adquirente: t.adquirente.nome,
      adquirenteId: t.adquirenteId,
      modalidade,
      qtd: 0,
      totalBruto: 0,
      totalLiquido: 0,
      taxa: 0,
    };
    grupo.qtd++;
    grupo.totalBruto += Number(t.valorBruto);
    if (t.valorLiquido !== null) grupo.totalLiquido += Number(t.valorLiquido);
    grupos.set(chave, grupo);
  }

  return [...grupos.values()]
    .map((g) => ({ ...g, taxa: g.totalBruto - g.totalLiquido }))
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.adquirente.localeCompare(b.adquirente) ||
        ORDEM_MODALIDADE_VENDA[a.modalidade] - ORDEM_MODALIDADE_VENDA[b.modalidade]
    );
}
