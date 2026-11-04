import "server-only";
import { prisma } from "@/lib/prisma";

// Vínculo de uma Venda a Prazo com o crédito que entrou no extrato do posto. O pagamento de cliente cai como
// crédito (PIX, TED, depósito) no extrato do posto, no valor total informado pela assistente e perto da data
// prevista. O automático só liga quando NÃO há dúvida: o crédito é o único candidato da venda e a venda é a
// única dona dele, e só olha crédito ainda sem categoria (ou já marcado como Venda a Prazo / Outros). Qualquer
// outro caso fica pra ligar na mão, na tela Vincular.

const DIA_MS = 86_400_000;
const TOLERANCIA = 0.02;
// A data prevista nem sempre é cumprida: aceita crédito de poucos dias antes até duas semanas depois.
const DIAS_ANTES = 5;
const DIAS_DEPOIS = 15;
const CATEGORIA_NOME = "VENDA A PRAZO";
const CATEGORIAS_AUTOMATICO = [CATEGORIA_NOME, "OUTROS"];

export type CandidatoCredito = {
  id: string;
  data: Date;
  descricao: string;
  valor: number;
  categoriaNome: string | null;
  bancoNome: string;
};

type VendaBase = { id: string; postoId: string; valor: unknown; dataPagamento: Date };

async function buscarCandidatos(venda: VendaBase, somenteAutomatico: boolean): Promise<CandidatoCredito[]> {
  const alvo = Number(venda.valor);
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId: venda.postoId,
      data: { gte: new Date(venda.dataPagamento.getTime() - DIAS_ANTES * DIA_MS), lte: new Date(venda.dataPagamento.getTime() + DIAS_DEPOIS * DIA_MS) },
      valor: { gte: (alvo - TOLERANCIA).toFixed(2), lte: (alvo + TOLERANCIA).toFixed(2) },
      vendasAPrazo: { none: {} },
      ...(somenteAutomatico ? { OR: [{ categoriaId: null }, { categoria: { nome: { in: CATEGORIAS_AUTOMATICO } } }] } : {}),
    },
    include: { categoria: true, banco: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: Number(l.valor), categoriaNome: l.categoria?.nome ?? null, bancoNome: l.banco.nome }));
}

// Créditos do extrato candidatos a pagar essa venda (qualquer categoria) — alimenta a tela Vincular.
export async function sugerirCandidatosDaVenda(vendaId: string): Promise<CandidatoCredito[]> {
  const venda = await prisma.vendaAPrazo.findUniqueOrThrow({ where: { id: vendaId } });
  if (venda.lancamentoExtratoId) return [];
  return buscarCandidatos(venda, false);
}

// Liga e recategoriza o crédito como "VENDA A PRAZO" — assim ele entra no detalhamento da categoria no
// Fechamento de Extratos e não fica em "Outros".
export async function vincularVenda(params: { vendaId: string; lancamentoExtratoId: string }) {
  const categoria = await prisma.categoriaExtrato.findUnique({ where: { nome: CATEGORIA_NOME } });
  await prisma.$transaction([
    prisma.vendaAPrazo.update({ where: { id: params.vendaId }, data: { lancamentoExtratoId: params.lancamentoExtratoId } }),
    ...(categoria ? [prisma.lancamentoExtrato.update({ where: { id: params.lancamentoExtratoId }, data: { categoriaId: categoria.id } })] : []),
  ]);
}

// Desfaz o vínculo; não mexe na categoria do crédito (pode ter sido ajustada por outro motivo).
export async function desvincularVenda(vendaId: string) {
  await prisma.vendaAPrazo.update({ where: { id: vendaId }, data: { lancamentoExtratoId: null } });
}

export async function rodarVinculoAutomaticoVendasAPrazo(): Promise<{ vinculos: number }> {
  const abertas = await prisma.vendaAPrazo.findMany({ where: { lancamentoExtratoId: null } });
  if (abertas.length === 0) return { vinculos: 0 };

  const candidatosPorVenda = new Map<string, CandidatoCredito[]>();
  const vendasPorCredito = new Map<string, string[]>();
  for (const v of abertas) {
    const cands = await buscarCandidatos(v, true);
    candidatosPorVenda.set(v.id, cands);
    for (const c of cands) vendasPorCredito.set(c.id, [...(vendasPorCredito.get(c.id) ?? []), v.id]);
  }

  let vinculos = 0;
  for (const [vendaId, cands] of candidatosPorVenda) {
    if (cands.length !== 1) continue;
    const credito = cands[0];
    if ((vendasPorCredito.get(credito.id) ?? []).length !== 1) continue;
    await vincularVenda({ vendaId, lancamentoExtratoId: credito.id });
    vinculos++;
  }
  return { vinculos };
}
