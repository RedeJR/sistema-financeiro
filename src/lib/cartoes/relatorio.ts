import "server-only";
import { prisma } from "@/lib/prisma";

export type LinhaCaixa = {
  id: string;
  dataVenda: Date;
  horaVenda: string;
  adquirente: string;
  tipoVenda: string;
  valorBruto: number;
  taxaRs: number | null;
  valorLiquido: number | null;
};

export type ResumoAdquirente = {
  adquirente: string;
  qtd: number;
  totalBruto: number;
  totalTaxa: number;
  totalLiquido: number;
};

export type RelatorioCaixa = {
  linhas: LinhaCaixa[];
  resumo: ResumoAdquirente[];
  totalBruto: number;
};

// Combina dataVenda (só a data) + horaVenda ("HH:MM", pode ser "") num
// datetime real, do mesmo jeito que o protótipo em Python fazia — pra
// comparar contra o turno pedido (que pode virar o dia, ex: 06:00 de um dia
// até 06:00 do dia seguinte).
function paraDatetime(dataVenda: Date, horaVenda: string): Date {
  const dt = new Date(dataVenda);
  const [hh, mm] = horaVenda ? horaVenda.split(":").map(Number) : [0, 0];
  dt.setUTCHours(hh || 0, mm || 0, 0, 0);
  return dt;
}

export async function buscarRelatorioCaixa(params: {
  postoId: string;
  inicio: Date;
  fim: Date;
}): Promise<RelatorioCaixa> {
  const { postoId, inicio, fim } = params;

  // Folga de 1 dia de cada lado pra não perder venda cujo horário empurra o
  // datetime real pro dia anterior/seguinte à data de venda pura — o filtro
  // exato acontece depois, em JS, comparando o datetime combinado.
  const dataMin = new Date(inicio);
  dataMin.setUTCDate(dataMin.getUTCDate() - 1);
  const dataMax = new Date(fim);
  dataMax.setUTCDate(dataMax.getUTCDate() + 1);

  const transacoes = await prisma.transacaoCartao.findMany({
    where: { postoId, dataVenda: { gte: dataMin, lte: dataMax } },
    include: { adquirente: true },
  });

  const linhas: LinhaCaixa[] = transacoes
    .filter((t) => {
      const dt = paraDatetime(t.dataVenda, t.horaVenda);
      return dt >= inicio && dt <= fim;
    })
    .map((t) => ({
      id: t.id,
      dataVenda: t.dataVenda,
      horaVenda: t.horaVenda,
      adquirente: t.adquirente.nome,
      tipoVenda: t.tipoVenda,
      valorBruto: Number(t.valorBruto),
      taxaRs: t.taxaRs !== null ? Number(t.taxaRs) : null,
      valorLiquido: t.valorLiquido !== null ? Number(t.valorLiquido) : null,
    }))
    .sort((a, b) => paraDatetime(a.dataVenda, a.horaVenda).getTime() - paraDatetime(b.dataVenda, b.horaVenda).getTime());

  const porAdquirente = new Map<string, ResumoAdquirente>();
  for (const l of linhas) {
    const atual = porAdquirente.get(l.adquirente) ?? {
      adquirente: l.adquirente,
      qtd: 0,
      totalBruto: 0,
      totalTaxa: 0,
      totalLiquido: 0,
    };
    atual.qtd += 1;
    atual.totalBruto += l.valorBruto;
    atual.totalTaxa += l.taxaRs ?? 0;
    atual.totalLiquido += l.valorLiquido ?? 0;
    porAdquirente.set(l.adquirente, atual);
  }

  const resumo = [...porAdquirente.values()].sort((a, b) => a.adquirente.localeCompare(b.adquirente));
  const totalBruto = resumo.reduce((s, r) => s + r.totalBruto, 0);

  return { linhas, resumo, totalBruto };
}
