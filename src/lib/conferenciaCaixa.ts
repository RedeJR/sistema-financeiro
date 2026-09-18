import "server-only";
import { prisma } from "@/lib/prisma";
import type { StatusConferenciaCaixa } from "@/generated/prisma/client";

export type { StatusConferenciaCaixa };

export type LinhaConferenciaCaixa = {
  id: string;
  posto: string;
  postoId: string;
  inicio: Date;
  fim: Date;
  valorTotal: number;
  status: StatusConferenciaCaixa;
};

// Lista os relatórios de caixa já baixados (ver
// conferencia-caixa/relatorio/exportar/route.ts, que cria/atualiza esses
// registros) — pra "as meninas" acompanharem o que já foi conferido contra
// o caixa físico e o que ainda falta.
export async function buscarConferenciasCaixa(params: {
  postoId?: string;
  status?: StatusConferenciaCaixa;
}): Promise<LinhaConferenciaCaixa[]> {
  const { postoId, status } = params;

  const registros = await prisma.conferenciaCaixa.findMany({
    where: {
      ...(postoId ? { postoId } : {}),
      ...(status ? { status } : {}),
    },
    include: { posto: true },
    orderBy: { inicio: "desc" },
  });

  return registros.map((r) => ({
    id: r.id,
    posto: r.posto.nome,
    postoId: r.postoId,
    inicio: r.inicio,
    fim: r.fim,
    valorTotal: Number(r.valorTotal),
    status: r.status,
  }));
}
