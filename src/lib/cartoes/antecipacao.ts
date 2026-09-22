import { classificarModalidade, prazoParaDataPagamento } from "./normalizar";

// Crédito com antecipação automática (TaxaCartao.antecipacaoAutomatica): o
// arquivo da adquirente (ex: Getnet) traz o prazo cheio do crédito (30 dias) e
// só a taxa do crédito, mas o dinheiro cai antes e com a taxa de antecipação
// somada. Nesses casos vale o que está cadastrado — taxa total e prazo em dias
// úteis — no lugar do líquido e da data de pagamento do arquivo.

export type TaxaCreditoCadastrada = {
  taxaCreditoVista: number | null;
  prazoCreditoVistaDias: number;
  taxaCreditoParcelado: number | null;
  prazoCreditoParceladoDias: number;
  taxaCreditoPrePago: number | null;
  prazoCreditoPrePagoDias: number;
};

export type AjusteAntecipacao = {
  valorLiquido: string;
  taxaRs: string;
  dataPagamento: Date;
};

function taxaEPrazoDoCredito(tipoVenda: string, adquirenteNome: string, c: TaxaCreditoCadastrada) {
  switch (classificarModalidade(tipoVenda, adquirenteNome)) {
    case "CREDITO_VISTA":
      return { taxa: c.taxaCreditoVista, prazo: c.prazoCreditoVistaDias };
    case "CREDITO_PARCELADO":
      return { taxa: c.taxaCreditoParcelado, prazo: c.prazoCreditoParceladoDias };
    case "CREDITO_PRE_PAGO":
      return { taxa: c.taxaCreditoPrePago, prazo: c.prazoCreditoPrePagoDias };
    default:
      return null; // débito e pix não são antecipados
  }
}

// null quando a venda não é de crédito ou a modalidade não tem taxa
// cadastrada (nesse caso fica o que veio no arquivo).
export function calcularAjusteAntecipacao(
  venda: { tipoVenda: string; valorBruto: string; dataVenda: Date },
  adquirenteNome: string,
  cadastro: TaxaCreditoCadastrada
): AjusteAntecipacao | null {
  const regra = taxaEPrazoDoCredito(venda.tipoVenda, adquirenteNome, cadastro);
  if (!regra || regra.taxa === null) return null;
  const bruto = Number(venda.valorBruto);
  const liquido = Math.round(bruto * (1 - regra.taxa / 100) * 100) / 100;
  return {
    valorLiquido: liquido.toFixed(2),
    taxaRs: (Math.round((bruto - liquido) * 100) / 100).toFixed(2),
    dataPagamento: prazoParaDataPagamento(venda.dataVenda, regra.prazo),
  };
}
