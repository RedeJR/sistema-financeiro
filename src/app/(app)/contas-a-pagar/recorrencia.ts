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
//
// Usa upsert em cima da constraint única (grupoRecorrenciaId,
// dataVencimento) — ver schema.prisma — em vez de create simples: sem isso,
// duas chamadas dessa função rodando por perto (duas abas abertas ao mesmo
// tempo, por exemplo) liam a "última ocorrência" antes de qualquer uma das
// duas ter gravado a próxima, e cada uma criava a mesma data de novo. Foi
// exatamente o que gerou ~700 linhas duplicadas em produção (achado numa
// checagem em 2026-08-28, ver histórico da migração
// trava_recorrencia_duplicada). Com upsert, a segunda chamada só confirma
// que a linha já existe (update vazio) em vez de duplicar — a constraint no
// banco garante isso mesmo com as duas rodando ao mesmo tempo de verdade.
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
    // Campos que não mudam entre ocorrências geradas — sempre os da despesa
    // original (`ultima`), nunca dos que forem sendo criados no meio do
    // caminho, então não precisa encadear "anterior" a cada volta do loop.
    const base = {
      postoId: ultima.postoId,
      fornecedorId: ultima.fornecedorId,
      planoContaId: ultima.planoContaId,
      numeroDocumento: ultima.numeroDocumento,
      valor: ultima.valor,
      descricao: ultima.descricao,
      recorrente: true as const,
      grupoRecorrenciaId: ultima.grupoRecorrenciaId!,
    };

    if (ultima.frequenciaRecorrencia === "SEMANAL") {
      // Dados antigos (lançados antes de existir recorrência semanal) nunca
      // caem aqui — frequenciaRecorrencia só é "SEMANAL" quando a usuária
      // escolheu isso explicitamente, e nesse caso sempre veio com pelo
      // menos um dia marcado (ver validação em actions.ts). O `size === 0`
      // é só defesa contra dado inconsistente, pra não entrar num loop
      // gerando nada até o fim do ano à toa.
      const diasEscolhidos = new Set(ultima.diasSemanaRecorrencia);
      if (diasEscolhidos.size === 0) continue;

      let cursor = adicionarDias(ultima.dataVencimento, 1);
      while (cursor <= fimDoAno) {
        if (diasEscolhidos.has(cursor.getUTCDay())) {
          await prisma.contaAPagar.upsert({
            where: {
              grupoRecorrenciaId_dataVencimento: { grupoRecorrenciaId: base.grupoRecorrenciaId, dataVencimento: cursor },
            },
            update: {},
            create: {
              ...base,
              dataEmissao: cursor,
              dataVencimento: cursor,
              frequenciaRecorrencia: "SEMANAL",
              diasSemanaRecorrencia: ultima.diasSemanaRecorrencia,
            },
          });
        }
        cursor = adicionarDias(cursor, 1);
      }
      continue;
    }

    // Mensal (padrão — inclusive despesas antigas, criadas antes de existir
    // a coluna frequenciaRecorrencia, que ficam com ela null).
    let cursor = adicionarMeses(ultima.dataVencimento, 1);
    while (indiceMes(cursor) <= indiceLimite) {
      await prisma.contaAPagar.upsert({
        where: {
          grupoRecorrenciaId_dataVencimento: { grupoRecorrenciaId: base.grupoRecorrenciaId, dataVencimento: cursor },
        },
        update: {},
        create: { ...base, dataEmissao: cursor, dataVencimento: cursor, frequenciaRecorrencia: "MENSAL" },
      });
      cursor = adicionarMeses(cursor, 1);
    }
  }
}
