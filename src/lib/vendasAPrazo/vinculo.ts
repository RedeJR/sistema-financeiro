import "server-only";
import { prisma } from "@/lib/prisma";

// Vínculo de uma Venda a Prazo com os créditos que entraram no extrato do posto. O cliente pode pagar de uma vez
// (um crédito com o valor total, perto da data prevista) ou picado, em dias diferentes — por isso uma venda aceita
// vários créditos (VendaAPrazoCredito) e fica "parcial" até a soma fechar o valor.
//
// O automático só liga quando NÃO há dúvida: o crédito tem o valor total, é o único candidato da venda e a venda é
// a única dona dele, e só olha crédito ainda sem categoria (ou já marcado como Venda a Prazo / Outros). Qualquer
// outro caso (inclusive pagamento picado) fica pra ligar na mão, na tela Vincular — que só oferece créditos que o
// extrato já considera "VENDA A PRAZO".

const DIA_MS = 86_400_000;
const TOLERANCIA = 0.02;
// A data prevista nem sempre é cumprida: o automático aceita crédito de poucos dias antes até duas semanas depois.
const DIAS_ANTES = 5;
const DIAS_DEPOIS = 15;
// Na tela manual a janela é bem mais larga: pagamento picado costuma se arrastar por semanas depois da data prevista.
const DIAS_DEPOIS_MANUAL = 45;
const MAXIMO_CANDIDATOS = 100;
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

async function buscarCandidatosAutomatico(venda: VendaBase): Promise<CandidatoCredito[]> {
  const alvo = Number(venda.valor);
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId: venda.postoId,
      data: { gte: new Date(venda.dataPagamento.getTime() - DIAS_ANTES * DIA_MS), lte: new Date(venda.dataPagamento.getTime() + DIAS_DEPOIS * DIA_MS) },
      valor: { gte: (alvo - TOLERANCIA).toFixed(2), lte: (alvo + TOLERANCIA).toFixed(2) },
      creditosVendaAPrazo: { none: {} },
      OR: [{ categoriaId: null }, { categoria: { nome: { in: CATEGORIAS_AUTOMATICO } } }],
    },
    include: { categoria: true, banco: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: Number(l.valor), categoriaNome: l.categoria?.nome ?? null, bancoNome: l.banco.nome }));
}

// Créditos do extrato que a assistente pode ligar a essa venda: só os que o extrato já considera "VENDA A PRAZO",
// do mesmo posto, ainda sem ligação com nenhuma venda. A janela vai do início dos abastecimentos até 45 dias depois
// da data prevista.
export async function sugerirCandidatosDaVenda(vendaId: string): Promise<CandidatoCredito[]> {
  const venda = await prisma.vendaAPrazo.findUniqueOrThrow({ where: { id: vendaId } });
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId: venda.postoId,
      valor: { gt: 0 },
      data: { gte: venda.periodoDe, lte: new Date(venda.dataPagamento.getTime() + DIAS_DEPOIS_MANUAL * DIA_MS) },
      categoria: { nome: CATEGORIA_NOME },
      creditosVendaAPrazo: { none: {} },
    },
    include: { categoria: true, banco: true },
    orderBy: { data: "asc" },
    take: MAXIMO_CANDIDATOS,
  });
  return lancamentos.map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: Number(l.valor), categoriaNome: l.categoria?.nome ?? null, bancoNome: l.banco.nome }));
}

// Liga o crédito à venda (sem tirar os que já estavam) e garante a categoria "VENDA A PRAZO" — assim ele entra no
// detalhamento da categoria no Fechamento de Extratos e não fica em "Outros". Recusa crédito de outro posto ou que
// já pagou outra venda.
export async function vincularVenda(params: { vendaId: string; lancamentoExtratoId: string }): Promise<{ ok: boolean }> {
  const [venda, lancamento, categoria] = await Promise.all([
    prisma.vendaAPrazo.findUnique({ where: { id: params.vendaId } }),
    prisma.lancamentoExtrato.findUnique({ where: { id: params.lancamentoExtratoId }, include: { creditosVendaAPrazo: true } }),
    prisma.categoriaExtrato.findUnique({ where: { nome: CATEGORIA_NOME } }),
  ]);
  if (!venda || !lancamento || venda.postoId !== lancamento.postoId) return { ok: false };
  if (lancamento.creditosVendaAPrazo.some((c) => c.vendaId !== venda.id)) return { ok: false };
  await prisma.$transaction([
    prisma.vendaAPrazoCredito.upsert({
      where: { vendaId_lancamentoExtratoId: { vendaId: venda.id, lancamentoExtratoId: lancamento.id } },
      update: {},
      create: { vendaId: venda.id, lancamentoExtratoId: lancamento.id },
    }),
    ...(categoria && lancamento.categoriaId !== categoria.id
      ? [prisma.lancamentoExtrato.update({ where: { id: lancamento.id }, data: { categoriaId: categoria.id } })]
      : []),
  ]);
  return { ok: true };
}

// Desfaz a ligação de UM crédito; não mexe na categoria dele (pode ter sido ajustada por outro motivo).
export async function desvincularCredito(params: { vendaId: string; lancamentoExtratoId: string }) {
  await prisma.vendaAPrazoCredito.deleteMany({ where: { vendaId: params.vendaId, lancamentoExtratoId: params.lancamentoExtratoId } });
}

export async function rodarVinculoAutomaticoVendasAPrazo(): Promise<{ vinculos: number }> {
  // Só vendas sem nenhum crédito ligado: venda com pagamento parcial é decidida na mão.
  const abertas = await prisma.vendaAPrazo.findMany({ where: { creditos: { none: {} } } });
  if (abertas.length === 0) return { vinculos: 0 };

  const candidatosPorVenda = new Map<string, CandidatoCredito[]>();
  const vendasPorCredito = new Map<string, string[]>();
  for (const v of abertas) {
    const cands = await buscarCandidatosAutomatico(v);
    candidatosPorVenda.set(v.id, cands);
    for (const c of cands) vendasPorCredito.set(c.id, [...(vendasPorCredito.get(c.id) ?? []), v.id]);
  }

  let vinculos = 0;
  for (const [vendaId, cands] of candidatosPorVenda) {
    if (cands.length !== 1) continue;
    const credito = cands[0];
    if ((vendasPorCredito.get(credito.id) ?? []).length !== 1) continue;
    const r = await vincularVenda({ vendaId, lancamentoExtratoId: credito.id });
    if (r.ok) vinculos++;
  }
  return { vinculos };
}
