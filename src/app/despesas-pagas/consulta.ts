import "server-only";
import { prisma } from "@/lib/prisma";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export type FiltrosDespesasPagas = {
  postoId?: string;
  fornecedorId?: string;
  planoContaId?: string;
  bancoId?: string;
  de?: string;
  ate?: string;
};

export async function buscarDespesasPagas(filtros: FiltrosDespesasPagas) {
  const { postoId, fornecedorId, planoContaId, bancoId, de, ate } = filtros;
  return prisma.contaAPagar.findMany({
    where: {
      paga: true,
      // Combustível é aba própria (Combustíveis a Pagar), com baixa
      // automática pela conciliação — não deveria aparecer misturado aqui
      // também. Pra ver o que já foi baixado, é em Conciliação de Extratos
      // (seção "Conciliados").
      combustivel: false,
      ...(postoId ? { postoId } : {}),
      ...(fornecedorId ? { fornecedorId } : {}),
      ...(planoContaId ? { planoContaId } : {}),
      ...(bancoId ? { bancoPagamentoId: bancoId } : {}),
      ...(de || ate
        ? {
            dataPagamento: {
              ...(de ? { gte: dataUTC(de) } : {}),
              ...(ate ? { lte: dataUTC(ate) } : {}),
            },
          }
        : {}),
    },
    include: {
      posto: true,
      fornecedor: true,
      planoConta: { include: { grupo: true } },
      bancoPagamento: true,
    },
    orderBy: { dataPagamento: "desc" },
  });
}
