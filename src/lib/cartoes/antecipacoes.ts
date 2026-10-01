import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda } from "./normalizar";

export type AjusteAntecipacao = {
  postoId: string;
  postoNome: string;
  adquirenteId: string;
  adquirenteNome: string;
  data: string; // YYYY-MM-DD
  delta: number; // + no dia em que o dinheiro caiu, − nos dias do período antecipado (líquido)
  deltaBruto: number; // mesma proporção, mas sobre o valor bruto — pra "vendas a receber" (ver aReceber.ts)
};

// Adquirentes de maquininha (débito, crédito, pix): a antecipação atinge só o
// crédito — débito e pix já pagam em 1 dia. As demais (Abastece Aí, SAQPAY,
// Sem Parar, Premmia...) não têm modalidade: qualquer venda com pagamento no
// período pode ter sido antecipada.
const ADQUIRENTES_DE_MAQUININHA = ["CIELO", "GETNET", "PAGSEGURO", "REDE", "STONE"];

function podeSerAntecipada(tipoVenda: string, adquirenteNome: string): boolean {
  if (!ADQUIRENTES_DE_MAQUININHA.some((n) => adquirenteNome.startsWith(n))) return true;
  return classificarModalidadeVenda(tipoVenda, adquirenteNome) === "CREDITO";
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Ajuste do "esperado" de recebimento por causa de antecipação de recebíveis
// (ver AntecipacaoCartao no schema). A adquirente antecipa um valor dentro de
// um período de recebíveis futuros sem dizer quais vendas, então:
//  - no dia em que o dinheiro caiu, soma o líquido recebido;
//  - nos dias do período, tira o valor cheio proporcionalmente ao esperado
//    antecipável de cada dia (crédito nas maquininhas; tudo nas demais).
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

  // Esperado de crédito por dia (posto|adquirente), sobre a união dos períodos
  // — líquido (pra conciliação com extrato) e bruto (pra "vendas a receber",
  // que mostra valor de venda, não o que efetivamente cai no banco) lado a
  // lado, na mesma proporção.
  const restante = new Map<string, Map<string, { liquido: number; bruto: number }>>();
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
      _sum: { valorLiquido: true, valorBruto: true },
    });
    const porDia = new Map<string, { liquido: number; bruto: number }>();
    for (const l of linhas) {
      if (!l.dataPagamento || !podeSerAntecipada(l.tipoVenda, g.nome)) continue;
      const d = iso(l.dataPagamento);
      const atual = porDia.get(d) ?? { liquido: 0, bruto: 0 };
      atual.liquido += Number(l._sum.valorLiquido ?? 0);
      atual.bruto += Number(l._sum.valorBruto ?? 0);
      porDia.set(d, atual);
    }
    restante.set(k, porDia);
  }

  const ajustes: AjusteAntecipacao[] = [];
  const dentro = (d: string) => d >= iso(dataInicio) && d <= iso(dataFim);
  for (const a of antecipacoes) {
    const base = { postoId: a.postoId, postoNome: a.posto.nome, adquirenteId: a.adquirenteId, adquirenteNome: a.adquirente.nome };
    const recebimento = iso(a.dataRecebimento);
    if (dentro(recebimento)) ajustes.push({ ...base, data: recebimento, delta: Number(a.valorLiquido), deltaBruto: Number(a.valorFace) });

    const dias = restante.get(`${a.postoId}|${a.adquirenteId}`)!;
    const de = iso(a.periodoDe);
    const ate = iso(a.periodoAte);
    const diasDoPeriodo = [...dias.keys()].filter((d) => d >= de && d <= ate);
    const disponivel = diasDoPeriodo.reduce((s, d) => s + dias.get(d)!.liquido, 0);
    if (disponivel <= 0) continue;
    const fator = Math.min(Number(a.valorFace), disponivel) / disponivel;
    for (const d of diasDoPeriodo) {
      const dia = dias.get(d)!;
      const reducaoLiquido = dia.liquido * fator;
      const reducaoBruto = dia.bruto * fator;
      dia.liquido -= reducaoLiquido;
      dia.bruto -= reducaoBruto;
      if (dentro(d)) ajustes.push({ ...base, data: d, delta: -reducaoLiquido, deltaBruto: -reducaoBruto });
    }
  }
  return ajustes;
}
