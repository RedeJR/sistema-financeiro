import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidade, type ModalidadeCartao } from "./normalizar";

export type LinhaConferenciaTaxas = {
  postoId: string;
  posto: string;
  adquirente: string;
  tipoVenda: string;
  modalidade: ModalidadeCartao;
  qtd: number;
  somaBruto: number;
  somaTaxa: number; // taxa em R$ das vendas que já têm taxa/líquido no arquivo
  somaLiquido: number;
  qtdSemLiquido: number; // aprovadas, mas ainda sem líquido (a adquirente não liquidou) — entram no bruto, não na taxa
  prazoRealDias: number | null; // média, em dias corridos (dataPagamento − dataVenda)
  prazoCadastradoDias: number | null;
  taxaRealPct: number | null; // média, em % do bruto
  taxaCadastradaPct: number | null;
  semTaxaCadastrada: boolean; // adquirente sem TaxaCartao pra esse posto
};

const CAMPO_POR_MODALIDADE: Record<
  ModalidadeCartao,
  {
    taxa: "taxaDebito" | "taxaCreditoVista" | "taxaCreditoParcelado" | "taxaPix" | "taxaCreditoPrePago";
    prazo: "prazoDebitoDias" | "prazoCreditoVistaDias" | "prazoCreditoParceladoDias" | "prazoPixDias" | "prazoCreditoPrePagoDias";
  }
> = {
  DEBITO: { taxa: "taxaDebito", prazo: "prazoDebitoDias" },
  CREDITO_VISTA: { taxa: "taxaCreditoVista", prazo: "prazoCreditoVistaDias" },
  CREDITO_PARCELADO: { taxa: "taxaCreditoParcelado", prazo: "prazoCreditoParceladoDias" },
  PIX: { taxa: "taxaPix", prazo: "prazoPixDias" },
  CREDITO_PRE_PAGO: { taxa: "taxaCreditoPrePago", prazo: "prazoCreditoPrePagoDias" },
};

export async function buscarConferenciaTaxas(params: {
  postoIds: string[];
  dataInicio: Date;
  dataFim: Date;
  adquirenteId?: string;
}): Promise<LinhaConferenciaTaxas[]> {
  const { postoIds, dataInicio, dataFim, adquirenteId } = params;

  const [transacoes, taxas] = await Promise.all([
    prisma.transacaoCartao.findMany({
      where: { postoId: { in: postoIds }, dataVenda: { gte: dataInicio, lte: dataFim }, ...(adquirenteId ? { adquirenteId } : {}) },
      include: { adquirente: true, posto: true },
    }),
    prisma.taxaCartao.findMany({ where: { postoId: { in: postoIds } }, include: { adquirente: true } }),
  ]);

  const taxaPorAdquirente = new Map(taxas.map((t) => [`${t.postoId}|${t.adquirenteId}`, t]));

  // Agrupa por (adquirente, tipoVenda) — mantém o texto cru da modalidade
  // (em vez de só DEBITO/CREDITO) pra ela conseguir ver exatamente o que
  // apareceu no arquivo.
  const grupos = new Map<
    string,
    { postoId: string; posto: string; adquirente: string; adquirenteId: string; tipoVenda: string; qtd: number; somaBruto: number; somaTaxa: number; somaBrutoComTaxa: number; somaLiquido: number; qtdSemLiquido: number; prazos: number[] }
  >();

  for (const t of transacoes) {
    const chave = `${t.postoId}|${t.adquirenteId}|${t.tipoVenda}`;
    const grupo = grupos.get(chave) ?? {
      postoId: t.postoId,
      posto: t.posto.nome,
      adquirente: t.adquirente.nome,
      adquirenteId: t.adquirenteId,
      tipoVenda: t.tipoVenda,
      qtd: 0,
      somaBruto: 0,
      somaTaxa: 0,
      somaBrutoComTaxa: 0,
      somaLiquido: 0,
      qtdSemLiquido: 0,
      prazos: [],
    };
    grupo.qtd++;
    grupo.somaBruto += Number(t.valorBruto);
    if (t.dataPagamento) {
      const dias = Math.round((t.dataPagamento.getTime() - t.dataVenda.getTime()) / (1000 * 60 * 60 * 24));
      grupo.prazos.push(dias);
    }
    if (t.valorLiquido === null) grupo.qtdSemLiquido++;
    else grupo.somaLiquido += Number(t.valorLiquido);
    if (t.taxaRs !== null) {
      grupo.somaTaxa += Number(t.taxaRs);
      grupo.somaBrutoComTaxa += Number(t.valorBruto);
    }
    grupos.set(chave, grupo);
  }

  const media = (arr: number[]) => (arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length);

  const resultado: LinhaConferenciaTaxas[] = [];
  for (const g of grupos.values()) {
    const modalidade = classificarModalidade(g.tipoVenda, g.adquirente);
    const campos = CAMPO_POR_MODALIDADE[modalidade];
    const taxaCartao = taxaPorAdquirente.get(`${g.postoId}|${g.adquirenteId}`);

    resultado.push({
      postoId: g.postoId,
      posto: g.posto,
      adquirente: g.adquirente,
      tipoVenda: g.tipoVenda,
      modalidade,
      qtd: g.qtd,
      somaBruto: g.somaBruto,
      somaTaxa: g.somaTaxa,
      somaLiquido: g.somaLiquido,
      qtdSemLiquido: g.qtdSemLiquido,
      prazoRealDias: media(g.prazos),
      prazoCadastradoDias: taxaCartao ? taxaCartao[campos.prazo] : null,
      // Ponderada pelo valor (taxa total ÷ bruto total das vendas com taxa), igual a
      // bruto − líquido ÷ bruto. A média simples dos % de cada venda (que era usada
      // antes) pesava uma venda de R$ 5 igual a uma de R$ 500 e não fechava com a conta.
      taxaRealPct: g.somaBrutoComTaxa > 0 ? (g.somaTaxa / g.somaBrutoComTaxa) * 100 : null,
      taxaCadastradaPct: taxaCartao && taxaCartao[campos.taxa] !== null ? Number(taxaCartao[campos.taxa]) : null,
      semTaxaCadastrada: !taxaCartao,
    });
  }

  return resultado.sort((a, b) => a.posto.localeCompare(b.posto) || a.adquirente.localeCompare(b.adquirente) || b.somaBruto - a.somaBruto);
}
