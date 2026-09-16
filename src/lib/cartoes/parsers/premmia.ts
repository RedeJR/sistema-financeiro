// Premmia (programa de fidelidade Shell) — xlsx, um arquivo por posto,
// cabeçalho direto na linha 1. Só traz valor líquido (sem bruto/taxa
// separados — não há desconto de MDR nesse relatório, então valor líquido
// vira valor bruto direto). Formas de pagamento: Cartão APP, Pix,
// Vale-Premmia, Desconto.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { paraDataHora, paraValorDecimal } from "../normalizar";

export async function parsePremmia(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  const cabecalho = (planilha.getRow(1).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iValor = idx("Valor líquido");
  const iData = idx("Data/Hora da transação");
  const iForma = idx("Forma de Pagamento");
  const iStatus = idx("Status");
  const iCodigo = idx("Código Transação");

  const resultado: LinhaTransacao[] = [];
  for (let r = 2; r <= planilha.rowCount; r++) {
    const valores = planilha.getRow(r).values as unknown[];
    if (!valores || valores.length < 2) continue;

    const status = iStatus >= 0 ? String(valores[iStatus] ?? "").trim().toLowerCase() : "";
    if (iStatus >= 0 && status !== "processada") continue;

    const dh = iData >= 0 ? paraDataHora(valores[iData]) : null;
    const valorBruto = iValor >= 0 ? paraValorDecimal(valores[iValor]) : null;
    if (!dh || valorBruto === null) continue;

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: (iForma >= 0 ? String(valores[iForma] ?? "").trim() : "") || "—",
      valorBruto,
      taxaRs: null,
      valorLiquido: valorBruto,
      dataPagamento: null,
      identificadorExterno: iCodigo >= 0 ? String(valores[iCodigo] ?? "").trim() || null : null,
    });
  }
  return resultado;
}
