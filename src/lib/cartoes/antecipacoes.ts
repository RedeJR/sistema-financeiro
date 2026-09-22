import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda } from "./normalizar";

export type AjusteAntecipacao = {
  postoId: string;
  postoNome: string;
  adquirenteId: string;
  adquirenteNome: string;
  data: string; // YYYY-MM-DD
  delta: number; // + no dia em que o dinheiro caiu, − nos dias do período antecipado
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Ajuste do "esperado" de recebimento por causa de antecipação de recebíveis
// (ver AntecipacaoCartao no schema). A adquirente antecipa um valor dentro de
// um período de recebíveis futuros sem dizer quais vendas, então:
//  - no dia em que o dinheiro caiu, soma o líquido recebido;
//  - nos dias do período, tira o valor cheio proporcionalmente ao esperado de
//    CRÉDITO de cada dia (débito e pix já pagam em 1 dia, não são antecipados).
// Se o sistema tem menos crédito no período do que foi antecipado (ex: faltam
// vendas importadas), tira no máximo o que existe. Só devolve os ajustes que
// caem dentro de [dataInicio, dataFim], mas calcula a proporção sobre o
// período inteiro.
export async function calcularAjustesAntecipacao(params: {
  postoId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<AjusteAntecipacao[]> {
  const { postoId, dataInicio, dataFim } = params;

  const antecipacoes = await prisma.antecipacaoCartao.findMany({
    where: {
      ...(postoId ? { postoId } : {}),
      OR: [
        { dataRecebimento: { gte: dataInicio, lte: dataFim } },
        { periodoDe: { lte: dataFim }, periodoAte: { gte: dataInicio } },
      ],
    },
    include: { posto: true, adquirente: true },
    orderBy: [{ dataRecebimento: "asc" }, { createdAt: "asc" }],
  });
  if (antecipacoes.length === 0) return [];

  // Esperado de crédito por dia (posto|adquirente), sobre a união dos períodos.
  const restante = new Map<string, Map<string, number>>();
  const grupos = new Map<string, { postoId: string; adquirenteId: string; nome: string; de: Date; ate: Date }>();
  for (const a of antecipacoes) {
    const k = `${a.postoId}|${a.adquirenteId}`;
    const g = grupos.get(k);
    if (!g) grupos.set(k, { postoId: a.postoId, adquirenteId: a.adquirenteId, nome: a.adquirente.nome, de: a.periodoDe, ate: a.periodoAte });
    else {
      if (a.periodoDe < g.de) g.de = a.periodoDe;
      if (a.periodoAte > g.ate) g.ate = a.periodoAte;
    }
  }
  for (const [k, g] of grupos) {
    const linhas = await prisma.transacaoCartao.groupBy({
      by: ["dataPagamento", "tipoVenda"],
      where: {
        postoId: g.postoId,
        adquirenteId: g.adquirenteId,
        dataPagamento: { gte: g.de, lte: g.ate },
        valorLiquido: { not: null },
      },
      _sum: { valorLiquido: true },
    });
    const porDia = new Map<string, number>();
    for (const l of linhas) {
      if (!l.dataPagamento || classificarModalidadeVenda(l.tipoVenda, g.nome) !== "CREDITO") continue;
      const d = iso(l.dataPagamento);
      porDia.set(d, (porDia.get(d) ?? 0) + Number(l._sum.valorLiquido ?? 0));
    }
    restante.set(k, porDia);
  }

  const ajustes: AjusteAntecipacao[] = [];
  const dentro = (d: string) => d >= iso(dataInicio) && d <= iso(dataFim);
  for (const a of antecipacoes) {
    const base = { postoId: a.postoId, postoNome: a.posto.nome, adquirenteId: a.adquirenteId, adquirenteNome: a.adquirente.nome };
    const recebimento = iso(a.dataRecebimento);
    if (dentro(recebimento)) ajustes.push({ ...base, data: recebimento, delta: Number(a.valorLiquido) });

    const dias = restante.get(`${a.postoId}|${a.adquirenteId}`)!;
    const de = iso(a.periodoDe);
    const ate = iso(a.periodoAte);
    const diasDoPeriodo = [...dias.keys()].filter((d) => d >= de && d <= ate);
    const disponivel = diasDoPeriodo.reduce((s, d) => s + dias.get(d)!, 0);
    if (disponivel <= 0) continue;
    const fator = Math.min(Number(a.valorFace), disponivel) / disponivel;
    for (const d of diasDoPeriodo) {
      const reducao = dias.get(d)! * fator;
      dias.set(d, dias.get(d)! - reducao);
      if (dentro(d)) ajustes.push({ ...base, data: d, delta: -reducao });
    }
  }
  return ajustes;
}
