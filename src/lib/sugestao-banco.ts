import "server-only";
import { prisma } from "@/lib/prisma";

// Mesmo raciocínio de sugestao-plano-conta.ts, agora pro banco: o banco
// mais usado historicamente por aquele fornecedor (contas já pagas, pelo
// banco em que saiu o dinheiro; contas ainda em aberto, pelo banco previsto
// que foi escolhido no lançamento). Só uma sugestão que já vem preenchida
// ao escolher o fornecedor num lançamento NOVO — a usuária troca na hora se
// for diferente.
export async function sugestaoBancoPorFornecedor(): Promise<Record<string, string>> {
  const [pagas, previstas] = await Promise.all([
    prisma.contaAPagar.groupBy({
      by: ["fornecedorId", "bancoPagamentoId"],
      where: { bancoPagamentoId: { not: null } },
      _count: { _all: true },
    }),
    prisma.contaAPagar.groupBy({
      by: ["fornecedorId", "bancoPrevistoId"],
      where: { bancoPrevistoId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const contagem = new Map<string, Map<string, number>>();
  function soma(fornecedorId: string, bancoId: string | null, n: number) {
    if (!bancoId) return;
    const porBanco = contagem.get(fornecedorId) ?? new Map<string, number>();
    porBanco.set(bancoId, (porBanco.get(bancoId) ?? 0) + n);
    contagem.set(fornecedorId, porBanco);
  }
  for (const g of pagas) soma(g.fornecedorId, g.bancoPagamentoId, g._count._all);
  for (const g of previstas) soma(g.fornecedorId, g.bancoPrevistoId, g._count._all);

  const resultado: Record<string, string> = {};
  for (const [fornecedorId, porBanco] of contagem) {
    let melhor: string | null = null;
    let max = 0;
    for (const [bancoId, n] of porBanco) {
      if (n > max) {
        max = n;
        melhor = bancoId;
      }
    }
    if (melhor) resultado[fornecedorId] = melhor;
  }
  return resultado;
}
