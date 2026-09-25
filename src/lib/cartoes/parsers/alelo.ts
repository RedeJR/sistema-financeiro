// Alelo — xlsx com abas "Instruções", "Extrato" (relatório de vendas),
// "Recebimentos" (vendas já pagas, inclusive de meses anteriores) e "Não
// Exportadas". Nas duas abas de vendas cada linha já traz valor líquido e
// data de pagamento (visto: desconto de 5% e pagamento 30 dias depois da
// venda); a aba "Outras Transações" (tarifa diária de R$ 1,22) não é venda
// e fica de fora. Um arquivo por posto.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { calcularTaxaRs, criarBuscadorDeColuna, identificadorComposto, paraData, paraDataHora, paraValorDecimal } from "../normalizar";

export async function parseAlelo(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);

  const resultado: LinhaTransacao[] = [];
  for (const planilha of workbook.worksheets) {
    if (planilha.name !== "Extrato" && planilha.name !== "Recebimentos") continue;

    const cabecalho = (planilha.getRow(1).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
    const idx = criarBuscadorDeColuna(cabecalho);
    const iData = idx("Data da Venda");
    const iAutorizacao = idx("Número da Autorização") >= 0 ? idx("Número da Autorização") : idx("Nº da Autorização");
    const iTipo = idx("Tipo Cartão");
    const iBruto = idx("Valor Bruto");
    const iLiquido = idx("Valor Líquido");
    const iStatus = idx("Status");
    const iPagamento = idx("Data de Pagamento");

    for (let r = 2; r <= planilha.rowCount; r++) {
      const valores = planilha.getRow(r).values as unknown[];
      if (!valores || valores.length < 2) continue;

      if (iStatus >= 0 && String(valores[iStatus] ?? "").trim().toLowerCase() !== "aprovada") continue;

      const dh = iData >= 0 ? paraDataHora(valores[iData]) : null;
      const valorBruto = iBruto >= 0 ? paraValorDecimal(valores[iBruto]) : null;
      if (!dh || valorBruto === null) continue;

      const valorLiquido = iLiquido >= 0 ? paraValorDecimal(valores[iLiquido]) : null;
      const tipoVenda = (iTipo >= 0 ? String(valores[iTipo] ?? "").trim() : "") || "—";
      const autorizacao = iAutorizacao >= 0 ? String(valores[iAutorizacao] ?? "").trim() : "";

      resultado.push({
        dataVenda: dh.data,
        horaVenda: dh.hora,
        tipoVenda,
        valorBruto,
        taxaRs: calcularTaxaRs(valorBruto, valorLiquido, null),
        valorLiquido,
        dataPagamento: iPagamento >= 0 ? paraData(valores[iPagamento]) : null,
        identificadorExterno: identificadorComposto(autorizacao, dh.data, dh.hora, valorBruto, tipoVenda),
      });
    }
  }
  return resultado;
}
