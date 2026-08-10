import "server-only";
import { prisma } from "@/lib/prisma";
import { adicionarMeses, hojeUTC } from "@/lib/datas";

function indiceMes(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

// Gera a(s) ocorrência(s) que faltam de cada despesa recorrente, até o fim
// do ano corrente (inclusive) — assim a previsão dos próximos meses já
// aparece na tela, sem esperar o mês chegar. Chamado sob demanda ao abrir a
// listagem — não existe job agendado; se o sistema ficar dias sem ser
// aberto, ele também "recupera o atraso" de meses passados que faltaram.
export async function gerarOcorrenciasRecorrentesPendentes(): Promise<void> {
  const hoje = hojeUTC();
  const indiceLimite = indiceMes(new Date(Date.UTC(hoje.getUTCFullYear(), 11, 1))); // dezembro do ano corrente

  const ultimasOcorrencias = await prisma.contaAPagar.findMany({
    where: { recorrente: true, grupoRecorrenciaId: { not: null } },
    orderBy: { dataVencimento: "desc" },
    distinct: ["grupoRecorrenciaId"],
  });

  for (const ultima of ultimasOcorrencias) {
    let anterior = ultima;
    let cursor = adicionarMeses(ultima.dataVencimento, 1);

    while (indiceMes(cursor) <= indiceLimite) {
      anterior = await prisma.contaAPagar.create({
        data: {
          postoId: anterior.postoId,
          fornecedorId: anterior.fornecedorId,
          planoContaId: anterior.planoContaId,
          dataEmissao: cursor,
          dataVencimento: cursor,
          numeroDocumento: anterior.numeroDocumento,
          valor: anterior.valor,
          descricao: anterior.descricao,
          recorrente: true,
          grupoRecorrenciaId: anterior.grupoRecorrenciaId,
        },
      });
      cursor = adicionarMeses(cursor, 1);
    }
  }
}
