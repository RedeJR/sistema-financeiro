import "server-only";
import { prisma } from "@/lib/prisma";

export type LinhaFechamento = {
  posto: string;
  postoId: string;
  adquirente: string;
  qtd: number;
  totalBruto: number;
  totalLiquido: number;
  taxa: number; // totalBruto - totalLiquido
};

// Fechamento de vendas por posto/adquirente no período (data da venda) —
// bruto, líquido e taxa (bruto − líquido), sem comparar com extrato (isso
// é a aba Recebimentos). Sem postoId, traz todos os postos ativos
// agrupados (uso: fechamento do mês pra rede inteira).
export async function buscarFechamentoCartoes(params: {
  postoId?: string;
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaFechamento[]> {
  const { postoId, adquirenteId, dataInicio, dataFim } = params;

  const transacoes = await prisma.transacaoCartao.findMany({
    where: {
      dataVenda: { gte: dataInicio, lte: dataFim },
      ...(postoId ? { postoId } : {}),
      ...(adquirenteId ? { adquirenteId } : {}),
    },
    include: { adquirente: true, posto: true },
  });

  const grupos = new Map<string, LinhaFechamento>();
  for (const t of transacoes) {
    const chave = `${t.postoId}|${t.adquirenteId}`;
    const grupo = grupos.get(chave) ?? {
      posto: t.posto.nome,
      postoId: t.postoId,
      adquirente: t.adquirente.nome,
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

  const resultado = [...grupos.values()].map((g) => ({ ...g, taxa: g.totalBruto - g.totalLiquido }));
  return resultado.sort((a, b) => a.posto.localeCompare(b.posto) || a.adquirente.localeCompare(b.adquirente));
}
