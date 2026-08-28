import "server-only";
import { prisma } from "@/lib/prisma";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export type FiltrosDespesasPagas = {
  postoId?: string;
  // "1" = filtra pelo posto DONO da despesa (postoId puro); ausente/qualquer
  // outro valor = filtra por quem PAGOU (postoPagamentoId ?? postoId),
  // padrão já usado em todo o resto do sistema — ver checkbox em page.tsx.
  postoDono?: string;
  fornecedorId?: string;
  planoContaId?: string;
  bancoId?: string;
  de?: string;
  ate?: string;
  q?: string;
};

export async function buscarDespesasPagas(filtros: FiltrosDespesasPagas) {
  const { postoId, postoDono, fornecedorId, planoContaId, bancoId, de, ate, q } = filtros;
  const busca = q?.trim();
  return prisma.contaAPagar.findMany({
    where: {
      paga: true,
      // Combustível é aba própria (Combustíveis a Pagar), com baixa
      // automática pela conciliação — não deveria aparecer misturado aqui
      // também. Pra ver o que já foi baixado, é em Conciliação de Extratos
      // (seção "Conciliados").
      combustivel: false,
      // Por padrão filtra pelo posto PAGADOR, não pelo dono da despesa —
      // mesmo critério já usado em conciliacao.ts e relatorios/consulta.ts.
      // Sem isso, filtrar por um posto que só paga despesas de outros (ex:
      // OLIVEIRA pagando contas da SUL AMERICA) não trazia nada, porque a
      // despesa em si pertence a outro posto. postoDono="1" inverte pra
      // buscar pelo dono mesmo, pra quando é isso que a usuária quer ver.
      // Vai dentro de um AND (em vez de OR direto no objeto) porque "busca"
      // também usa OR mais abaixo — duas chaves OR no mesmo objeto se
      // sobrescreveriam (a segunda apagaria a primeira).
      ...(postoId
        ? postoDono === "1"
          ? { postoId }
          : { AND: [{ OR: [{ postoPagamentoId: postoId }, { postoPagamentoId: null, postoId }] }] }
        : {}),
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
      ...(busca
        ? {
            OR: [
              { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
              { descricao: { contains: busca, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      posto: true,
      // Posto que efetivamente pagou, quando diferente do dono da despesa —
      // ver ContaAPagar.postoPagamentoId e o agrupamento em page.tsx.
      postoPagamento: true,
      fornecedor: true,
      planoConta: { include: { grupo: true } },
      bancoPagamento: true,
    },
    orderBy: { dataPagamento: "desc" },
  });
}
