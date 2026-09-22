import { classificarModalidade, paraProximoDiaUtilSeNecessario, proximoDiaUtil } from "./normalizar";

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

// Prazo curto (até 5 dias) conta em dias úteis (D+1, D+2); prazo longo é em
// dias corridos (30 dias) e, se cair em fim de semana ou feriado, vai pro
// próximo dia útil.
function dataDePagamento(dataVenda: Date, prazo: number): Date {
  if (prazo <= 5) return proximoDiaUtil(dataVenda, prazo);
  const d = new Date(dataVenda);
  d.setUTCDate(d.getUTCDate() + prazo);
  return paraProximoDiaUtilSeNecessario(d);
}

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
    dataPagamento: dataDePagamento(venda.dataVenda, regra.prazo),
  };
}
