import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, type ModalidadeVenda } from "./normalizar";

// Como se dividem as vendas de cada adquirente de um posto (Cadastros > Taxas de Cartão):
// % de débito, crédito e Pix sobre o valor bruto vendido naquela adquirente (soma 100%), e
// quanto a adquirente pesa no posto inteiro — nos últimos 30 dias até a venda mais recente
// importada do posto. É a base pra conferir se as taxas cadastradas fazem sentido.
// As três modalidades são as mesmas dos relatórios de vendas: débito, crédito e Pix.

const JANELA_DIAS = 30;

export type MixPosto = {
  de: Date;
  ate: Date; // data da venda mais recente importada do posto
  total: number;
  // adquirenteId -> % de cada modalidade sobre as vendas da própria adquirente, e % da adquirente no posto
  porAdquirente: Map<string, Record<ModalidadeVenda, number> & { parteDoPosto: number }>;
};

export async function buscarMixVendas(postoIds: string[]): Promise<Map<string, MixPosto>> {
  const resultado = new Map<string, MixPosto>();
  if (postoIds.length === 0) return resultado;

  const ultimas = await prisma.transacaoCartao.groupBy({
    by: ["postoId"],
    where: { postoId: { in: postoIds } },
    _max: { dataVenda: true },
  });
  const janelas = ultimas.flatMap((u) =>
    u._max.dataVenda ? [{ postoId: u.postoId, ate: u._max.dataVenda, de: new Date(u._max.dataVenda.getTime() - (JANELA_DIAS - 1) * 86400000) }] : []
  );
  if (janelas.length === 0) return resultado;

  const [grupos, adquirentes] = await Promise.all([
    prisma.transacaoCartao.groupBy({
      by: ["postoId", "adquirenteId", "tipoVenda"],
      where: { OR: janelas.map((j) => ({ postoId: j.postoId, dataVenda: { gte: j.de, lte: j.ate } })) },
      _sum: { valorBruto: true },
    }),
    prisma.adquirenteCartao.findMany({ select: { id: true, nome: true } }),
  ]);
  const nomeAdquirente = new Map(adquirentes.map((a) => [a.id, a.nome]));

  for (const j of janelas) {
    const doPosto = grupos.filter((g) => g.postoId === j.postoId);
    const valores = new Map<string, Record<ModalidadeVenda, number>>();
    let total = 0;
    for (const g of doPosto) {
      const valor = Number(g._sum.valorBruto ?? 0);
      const nome = nomeAdquirente.get(g.adquirenteId) ?? "";
      // SAQPAY: nos relatórios de vendas cai em débito (convenção das voucher), mas aqui conta como Pix.
      const modalidade = nome === "SAQPAY" ? "PIX" : classificarModalidadeVenda(g.tipoVenda, nome);
      const atual = valores.get(g.adquirenteId) ?? { DEBITO: 0, CREDITO: 0, PIX: 0 };
      atual[modalidade] += valor;
      valores.set(g.adquirenteId, atual);
      total += valor;
    }
    const porAdquirente: MixPosto["porAdquirente"] = new Map();
    for (const [id, v] of valores) {
      const soma = v.DEBITO + v.CREDITO + v.PIX;
      const pct = (x: number) => (soma > 0 ? (x / soma) * 100 : 0);
      porAdquirente.set(id, { DEBITO: pct(v.DEBITO), CREDITO: pct(v.CREDITO), PIX: pct(v.PIX), parteDoPosto: total > 0 ? (soma / total) * 100 : 0 });
    }
    resultado.set(j.postoId, { de: j.de, ate: j.ate, total, porAdquirente });
  }
  return resultado;
}
