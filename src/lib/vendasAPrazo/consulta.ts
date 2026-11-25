import "server-only";
import { emLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { resumoRecebimento, type ResumoRecebimento } from "./recebimento";

// Consulta compartilhada entre a lista de Vendas a Prazo e o relatório (PDF): mesmos filtros, mesma situação.

export type Situacao = "CONCILIADA" | "PARCIAL" | "A_RECEBER" | "ATRASADA";

export const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "A_RECEBER", rotulo: "A receber" },
  { valor: "ATRASADA", rotulo: "Atrasada (sem crédito no extrato)" },
  { valor: "PARCIAL", rotulo: "Parcial (recebida em parte)" },
  { valor: "CONCILIADA", rotulo: "Conciliada" },
];

export type FiltrosVendasAPrazo = {
  postoIds: string[];
  q?: string;
  situacao?: string;
  de?: string; // pagamento de
  ate?: string; // pagamento até
  pde?: string; // período do abastecimento de
  pate?: string; // período do abastecimento até
};

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export async function buscarVendasAPrazo(filtros: FiltrosVendasAPrazo, hoje: Date) {
  const { postoIds, q, de, ate, pde, pate } = filtros;
  const situacaoFiltro = SITUACOES.find((s) => s.valor === filtros.situacao)?.valor;

  const brutas = await prisma.vendaAPrazo.findMany({
    where: {
      ...emLista("postoId", postoIds),
      ...(q?.trim() ? { cliente: { contains: q.trim(), mode: "insensitive" as const } } : {}),
      ...(de || ate ? { dataPagamento: { ...(de ? { gte: dataUTC(de) } : {}), ...(ate ? { lte: dataUTC(ate) } : {}) } } : {}),
      // Período do abastecimento: pega toda venda cujo período encosta no intervalo escolhido.
      ...(pde ? { periodoAte: { gte: dataUTC(pde) } } : {}),
      ...(pate ? { periodoDe: { lte: dataUTC(pate) } } : {}),
    },
    include: { posto: true, creditos: { include: { lancamentoExtrato: { include: { banco: true } } } } },
    orderBy: [{ dataPagamento: "asc" }, { cliente: "asc" }],
  });

  // Cada venda pode estar paga por vários créditos (pagamento picado): conciliada quando a soma fecha o valor,
  // parcial enquanto falta, e atrasada/a receber só se nenhum crédito foi ligado ainda.
  const todas = brutas.map((v) => {
    const resumo: ResumoRecebimento = resumoRecebimento(Number(v.valor), v.creditos.map((c) => Number(c.lancamentoExtrato.valor)));
    const situacao: Situacao =
      resumo.situacao === "COMPLETO" ? "CONCILIADA" : resumo.situacao === "PARCIAL" ? "PARCIAL" : v.dataPagamento < hoje ? "ATRASADA" : "A_RECEBER";
    return { ...v, resumo, situacao };
  });
  const vendas = situacaoFiltro ? todas.filter((v) => v.situacao === situacaoFiltro) : todas;
  return { todas, vendas, situacaoFiltro };
}

export type VendaAPrazoConsultada = Awaited<ReturnType<typeof buscarVendasAPrazo>>["todas"][number];

// O que ainda falta entrar no extrato dessa venda (0 se está conciliada).
export function faltaReceber(v: VendaAPrazoConsultada): number {
  return v.situacao === "CONCILIADA" ? 0 : Math.max(0, v.resumo.falta);
}
