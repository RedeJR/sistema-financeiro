import "server-only";
import { prisma } from "@/lib/prisma";

// Padronização do plano de contas por fornecedor (pedido da usuária: "para
// que não ocorra divergências" — o mesmo fornecedor às vezes cai em contas
// diferentes por descuido de quem lança). Não é travado: é só uma sugestão
// que já vem preenchida ao escolher o fornecedor num lançamento NOVO — dá
// pra trocar se o caso for mesmo diferente (ver onChange do Fornecedor em
// formulario-conta-a-pagar.tsx e formulario-despesa-avulsa.tsx).
//
// Critério: conta do plano de contas mais usada historicamente por aquele
// fornecedor (todas as ContaAPagar dele, pagas ou não) — maioria simples,
// sem peso por valor nem por data.
export async function sugestaoPlanoContaPorFornecedor(): Promise<Record<string, string>> {
  const grupos = await prisma.contaAPagar.groupBy({
    by: ["fornecedorId", "planoContaId"],
    _count: { _all: true },
  });

  const melhorPorFornecedor = new Map<string, { planoContaId: string; count: number }>();
  for (const g of grupos) {
    const atual = melhorPorFornecedor.get(g.fornecedorId);
    if (!atual || g._count._all > atual.count) {
      melhorPorFornecedor.set(g.fornecedorId, { planoContaId: g.planoContaId, count: g._count._all });
    }
  }

  return Object.fromEntries([...melhorPorFornecedor].map(([fornecedorId, v]) => [fornecedorId, v.planoContaId]));
}
