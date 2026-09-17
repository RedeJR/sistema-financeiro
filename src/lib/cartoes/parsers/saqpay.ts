// SAQPAY — relatório agrupado multi-posto ("Todos_saqpay.xlsx"): um arquivo
// só com as transações de TODOS os postos juntas, identificadas por um
// texto livre (razão social/apelido) na coluna LOJISTA — não CNPJ (ver
// postos.ts/importar.ts). Cobre tanto "Venda PIX" quanto "Saque PIX": os
// dois valores (VALOR VENDA / VALOR SAQUE) são mutuamente exclusivos, então
// soma os dois pra ter o valor bruto de qualquer um dos dois tipos.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { identificadorComposto, paraData, paraDataHora, paraProximoDiaUtilSeNecessario, paraValorDecimal } from "../normalizar";

// "DATA PAGAMENTO TRANSAÇÃO" do arquivo é a data em que a SAQPAY INICIA o
// repasse, não a data em que o dinheiro cai de fato na conta — confirmado
// comparando contra o extrato real em dois postos: o valor esperado de um
// dia batia certinho com o que caía no extrato no dia seguinte, sempre.
// Soma 1 dia corrido (não dia útil) e, se cair em fim de semana ou feriado
// nacional, empurra pro próximo dia útil (banco não processa nesses dias).
function paraDataPagamentoReal(valor: unknown): Date | null {
  const data = paraData(valor);
  if (!data) return null;
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + 1);
  return paraProximoDiaUtilSeNecessario(resultado);
}

export async function parseSaqpay(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  const cabecalho = (planilha.getRow(1).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iLojista = idx("LOJISTA");
  const iTipo = idx("TIPO TRANSACÃO");
  const iData = idx("DATA TRANSAÇÃO");
  const iValorVenda = idx("VALOR VENDA");
  const iValorSaque = idx("VALOR SAQUE");
  const iTaxa = idx("TAXA VENDA");
  const iStatus = idx("STATUS TRANSAÇÃO");
  const iCodigo = idx("CÓDIGO DA TRANSAÇÃO");
  const iTotalReceber = idx("TOTAL A RECEBER");
  const iDataPagamento = idx("DATA PAGAMENTO TRANSAÇÃO");

  const resultado: LinhaTransacao[] = [];
  for (let r = 2; r <= planilha.rowCount; r++) {
    const valores = planilha.getRow(r).values as unknown[];
    if (!valores || valores.length < 2) continue;

    // "Aprovado" = transação recém-feita, ainda não repassada; "Transferido"
    // = já repassada pra conta do posto. As duas são vendas válidas — só
    // status de erro/cancelamento fica de fora. Sem esse segundo valor, só
    // as vendas do dia (ainda em "Aprovado") apareciam — o resto do mês já
    // tinha virado "Transferido" e sumia inteiro do relatório.
    const status = iStatus >= 0 ? String(valores[iStatus] ?? "").trim().toLowerCase() : "";
    if (iStatus >= 0 && status !== "aprovado" && status !== "transferido") continue;

    const dh = iData >= 0 ? paraDataHora(valores[iData]) : null;
    const valorVenda = Number(paraValorDecimal(iValorVenda >= 0 ? valores[iValorVenda] : null) ?? 0);
    const valorSaque = Number(paraValorDecimal(iValorSaque >= 0 ? valores[iValorSaque] : null) ?? 0);
    const valorBruto = (valorVenda + valorSaque).toFixed(2);
    if (!dh || Number(valorBruto) <= 0) continue;

    const tipoVenda = (iTipo >= 0 ? String(valores[iTipo] ?? "").trim() : "") || "—";
    const codigo = iCodigo >= 0 ? String(valores[iCodigo] ?? "").trim() : "";

    resultado.push({
      postoTextoLivreSugerido: iLojista >= 0 ? String(valores[iLojista] ?? "").trim() || undefined : undefined,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: iTaxa >= 0 ? paraValorDecimal(valores[iTaxa]) : null,
      valorLiquido: iTotalReceber >= 0 ? paraValorDecimal(valores[iTotalReceber]) : null,
      dataPagamento: iDataPagamento >= 0 ? paraDataPagamentoReal(valores[iDataPagamento]) : null,
      identificadorExterno: identificadorComposto(codigo, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}
