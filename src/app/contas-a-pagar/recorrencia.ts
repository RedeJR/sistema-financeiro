import "server-only";
import { prisma } from "@/lib/prisma";
import { adicionarDias, adicionarMeses, hojeUTC } from "@/lib/datas";

function indiceMes(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

// Gera a(s) ocorrência(s) que faltam de cada despesa recorrente — mensal ou
// semanal (ver FrequenciaRecorrencia no schema) — até o fim do ano corrente
// (inclusive), assim a previsão dos próximos meses/semanas já aparece na
// tela, sem esperar a data chegar. Chamado sob demanda ao abrir a listagem —
// não existe job agendado; se o sistema ficar dias sem ser aberto, ele
// também "recupera o atraso" do que faltou gerar.
export async function gerarOcorrenciasRecorrentesPendentes(): Promise<void> {
  const hoje = hojeUTC();
  const fimDoAno = new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31));
  const indiceLimite = indiceMes(fimDoAno);

  const ultimasOcorrencias = await prisma.contaAPagar.findMany({
    where: { recorrente: true, grupoRecorrenciaId: { not: null } },
    orderBy: { dataVencimento: "desc" },
    distinct: ["grupoRecorrenciaId"],
  });

  for (const ultima of ultimasOcorrencias) {
    if (ultima.frequenciaRecorrencia === "SEMANAL") {
      // Dados antigos (lançados antes de existir recorrência semanal) nunca
      // caem aqui — frequenciaRecorrencia só é "SEMANAL" quando a usuária
      // escolheu isso explicitamente, e nesse caso sempre veio com pelo
      // menos um dia marcado (ver validação em actions.ts). O `size === 0`
      // é só defesa contra dado inconsistente, pra não entrar num loop
      // gerando nada até o fim do ano à toa.
      const diasEscolhidos = new Set(ultima.diasSemanaRecorrencia);
      if (diasEscolhidos.size === 0) continue;

      let anterior = ultima;
      let cursor = adicionarDias(ultima.dataVencimento, 1);
      while (cursor <= fimDoAno) {
        if (diasEscolhidos.has(cursor.getUTCDay())) {
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
              frequenciaRecorrencia: "SEMANAL",
              diasSemanaRecorrencia: ultima.diasSemanaRecorrencia,
              grupoRecorrenciaId: anterior.grupoRecorrenciaId,
            },
          });
        }
        cursor = adicionarDias(cursor, 1);
      }
      continue;
    }

    // Mensal (padrão — inclusive despesas antigas, criadas antes de existir
    // a coluna frequenciaRecorrencia, que ficam com ela null).
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
          frequenciaRecorrencia: "MENSAL",
          grupoRecorrenciaId: anterior.grupoRecorrenciaId,
        },
      });
      cursor = adicionarMeses(cursor, 1);
    }
  }
}
