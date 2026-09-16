// Redecard (Rede) — "Extrato para simples conferência", xlsx com um
// preâmbulo antes do cabeçalho de verdade (igual a Cielo, só que em xlsx em
// vez de csv). Modalidade e Tipo vêm em colunas separadas ("débito" +
// "à vista") — combinadas aqui pra formar o tipo_venda completo, igual as
// outras adquirentes fazem numa coluna só.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  paraData,
  paraHoraSimples,
  paraValorDecimal,
  prazoTextoParaDias,
  proximoDiaUtil,
} from "../normalizar";

const MAX_LINHAS_PREAMBULO = 5;

export async function parseRedecard(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs tipa o parâmetro com a assinatura antiga de Buffer do @types/node
  // — incompatível com a genérica atual (Buffer<ArrayBufferLike>), mas o
  // valor em si é aceito em runtime sem problema.
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  let linhaHeader = -1;
  let cabecalho: string[] = [];
  for (let r = 1; r <= Math.min(MAX_LINHAS_PREAMBULO, planilha.rowCount); r++) {
    const valores = (planilha.getRow(r).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
    if (valores.some((v) => v.toLowerCase() === "data da venda")) {
      linhaHeader = r;
      cabecalho = valores.map((v) => v.toLowerCase());
      break;
    }
  }
  if (linhaHeader === -1) {
    throw new Error('Cabeçalho não encontrado — esperava a coluna "data da venda".');
  }

  const idx = (nome: string) => cabecalho.indexOf(nome);
  const iData = idx("data da venda");
  const iHora = idx("hora da venda");
  const iStatus = idx("status da venda");
  const iBruto = idx("valor da venda original");
  const iModalidade = idx("modalidade");
  const iTipo = idx("tipo");
  const iTaxaTotal = idx("valor total das taxas descontadas (mdr+recebimento automático)");
  const iLiquido = idx("valor líquido");
  const iPrazo = idx("prazo de recebimento");
  const iNsu = idx("nsu/cv");

  const resultado: LinhaTransacao[] = [];
  for (let r = linhaHeader + 1; r <= planilha.rowCount; r++) {
    const row = planilha.getRow(r);
    const valores = row.values as unknown[];
    if (!valores || valores.length < 2) continue;

    const status = iStatus >= 0 ? String(valores[iStatus] ?? "").trim().toLowerCase() : "";
    if (iStatus >= 0 && status !== "aprovada") continue;

    const dataVenda = iData >= 0 ? paraData(valores[iData]) : null;
    const valorBruto = iBruto >= 0 ? paraValorDecimal(valores[iBruto]) : null;
    if (!dataVenda || valorBruto === null) continue;

    const modalidade = iModalidade >= 0 ? String(valores[iModalidade] ?? "").trim() : "";
    const tipo = iTipo >= 0 ? String(valores[iTipo] ?? "").trim() : "";
    const tipoVenda = tipo && tipo !== "-" ? `${modalidade} ${tipo}`.trim() : modalidade || "—";

    const prazoDias = iPrazo >= 0 ? prazoTextoParaDias(valores[iPrazo]) : null;
    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(valores[iLiquido]) : null;
    const taxaColuna = iTaxaTotal >= 0 ? paraValorDecimal(valores[iTaxaTotal]) : null;

    resultado.push({
      dataVenda,
      horaVenda: iHora >= 0 ? paraHoraSimples(valores[iHora]) : "",
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: prazoDias !== null ? proximoDiaUtil(dataVenda, prazoDias) : null,
      identificadorExterno: iNsu >= 0 ? String(valores[iNsu] ?? "").trim() || null : null,
    });
  }
  return resultado;
}
