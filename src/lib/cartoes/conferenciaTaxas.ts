import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidade, type ModalidadeCartao } from "./normalizar";

export type LinhaConferenciaTaxas = {
  adquirente: string;
  tipoVenda: string;
  modalidade: ModalidadeCartao;
  qtd: number;
  somaBruto: number;
  prazoRealDias: number | null; // média, em dias corridos (dataPagamento − dataVenda)
  prazoCadastradoDias: number | null;
  taxaRealPct: number | null; // média, em % do bruto
  taxaCadastradaPct: number | null;
  semTaxaCadastrada: boolean; // adquirente sem TaxaCartao pra esse posto
};

const CAMPO_POR_MODALIDADE: Record<
  ModalidadeCartao,
  {
    taxa: "taxaDebito" | "taxaCreditoVista" | "taxaCreditoParcelado" | "taxaPix";
    prazo: "prazoDebitoDias" | "prazoCreditoVistaDias" | "prazoCreditoParceladoDias" | "prazoPixDias";
  }
> = {
  DEBITO: { taxa: "taxaDebito", prazo: "prazoDebitoDias" },
  CREDITO_VISTA: { taxa: "taxaCreditoVista", prazo: "prazoCreditoVistaDias" },
  CREDITO_PARCELADO: { taxa: "taxaCreditoParcelado", prazo: "prazoCreditoParceladoDias" },
  PIX: { taxa: "taxaPix", prazo: "prazoPixDias" },
};

export async function buscarConferenciaTaxas(params: {
  postoId: string;
  dataInicio: Date;
  dataFim: Date;
  adquirenteId?: string;
}): Promise<LinhaConferenciaTaxas[]> {
  const { postoId, dataInicio, dataFim, adquirenteId } = params;

  const [transacoes, taxas] = await Promise.all([
    prisma.transacaoCartao.findMany({
      where: { postoId, dataVenda: { gte: dataInicio, lte: dataFim }, ...(adquirenteId ? { adquirenteId } : {}) },
      include: { adquirente: true },
    }),
    prisma.taxaCartao.findMany({ where: { postoId }, include: { adquirente: true } }),
  ]);

  const taxaPorAdquirente = new Map(taxas.map((t) => [t.adquirenteId, t]));

  // Agrupa por (adquirente, tipoVenda) — mantém o texto cru da modalidade
  // (em vez de só DEBITO/CREDITO) pra ela conseguir ver exatamente o que
  // apareceu no arquivo.
  const grupos = new Map<
    string,
    { adquirente: string; adquirenteId: string; tipoVenda: string; qtd: number; somaBruto: number; prazos: number[]; taxasPct: number[] }
  >();

  for (const t of transacoes) {
    const chave = `${t.adquirenteId}|${t.tipoVenda}`;
    const grupo = grupos.get(chave) ?? {
      adquirente: t.adquirente.nome,
      adquirenteId: t.adquirenteId,
      tipoVenda: t.tipoVenda,
      qtd: 0,
      somaBruto: 0,
      prazos: [],
      taxasPct: [],
    };
    grupo.qtd++;
    grupo.somaBruto += Number(t.valorBruto);
    if (t.dataPagamento) {
      const dias = Math.round((t.dataPagamento.getTime() - t.dataVenda.getTime()) / (1000 * 60 * 60 * 24));
      grupo.prazos.push(dias);
    }
    if (t.taxaRs !== null && Number(t.valorBruto) > 0) {
      grupo.taxasPct.push((Number(t.taxaRs) / Number(t.valorBruto)) * 100);
    }
    grupos.set(chave, grupo);
  }

  const media = (arr: number[]) => (arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length);

  const resultado: LinhaConferenciaTaxas[] = [];
  for (const g of grupos.values()) {
    const modalidade = classificarModalidade(g.tipoVenda, g.adquirente);
    const campos = CAMPO_POR_MODALIDADE[modalidade];
    const taxaCartao = taxaPorAdquirente.get(g.adquirenteId);

    resultado.push({
      adquirente: g.adquirente,
      tipoVenda: g.tipoVenda,
      modalidade,
      qtd: g.qtd,
      somaBruto: g.somaBruto,
      prazoRealDias: media(g.prazos),
      prazoCadastradoDias: taxaCartao ? taxaCartao[campos.prazo] : null,
      taxaRealPct: media(g.taxasPct),
      taxaCadastradaPct: taxaCartao && taxaCartao[campos.taxa] !== null ? Number(taxaCartao[campos.taxa]) : null,
      semTaxaCadastrada: !taxaCartao,
    });
  }

  return resultado.sort((a, b) => a.adquirente.localeCompare(b.adquirente) || b.somaBruto - a.somaBruto);
}
