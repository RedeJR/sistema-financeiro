// Pluxee — relatório "extrato_vendas" (xlsx), com preâmbulo (CNPJ, Razão
// Social, Produto, filtro de período) antes do cabeçalho de verdade. Já traz
// a própria "Data de pagamento" por venda — sem precisar nenhuma regra de
// prazo pra inferir (prazo real visto: bem longo, ~30 dias). Não traz valor
// líquido/taxa — só aparece no relatório de recebimento, que mostrou taxa
// 0% no período conferido, então valorLiquido = valorBruto por enquanto.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { criarBuscadorDeColuna, identificadorComposto, paraData, paraValorDecimal } from "../normalizar";

const MAX_LINHAS_PREAMBULO = 20;

export async function parsePluxee(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs tipa o parâmetro com a assinatura antiga de Buffer do @types/node
  // — incompatível com a genérica atual (Buffer<ArrayBufferLike>), mas o
  // valor em si é aceito em runtime sem problema.
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  let linhaHeader = -1;
  let cabecalho: unknown[] = [];
  for (let r = 1; r <= Math.min(MAX_LINHAS_PREAMBULO, planilha.rowCount); r++) {
    const valores = (planilha.getRow(r).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
    if (valores.some((v) => v.toLowerCase() === "data da transação")) {
      linhaHeader = r;
      cabecalho = valores;
      break;
    }
  }
  if (linhaHeader === -1) {
    throw new Error('Cabeçalho não encontrado — esperava a coluna "Data da transação".');
  }

  const idx = criarBuscadorDeColuna(cabecalho);
  const iDataTransacao = idx("Data da transação");
  const iDescricao = idx("Descrição");
  const iAutorizacao = idx("Número da autorização");
  const iValorBruto = idx("Valor bruto");
  const iDataPagamento = idx("Data de pagamento");

  const resultado: LinhaTransacao[] = [];
  for (let r = linhaHeader + 1; r <= planilha.rowCount; r++) {
    const valores = planilha.getRow(r).values as unknown[];
    if (!valores || valores.length < 2) continue;

    const dataVenda = iDataTransacao >= 0 ? paraData(valores[iDataTransacao]) : null;
    const valorBruto = iValorBruto >= 0 ? paraValorDecimal(valores[iValorBruto]) : null;
    if (!dataVenda || valorBruto === null) continue;

    const tipoVenda = (iDescricao >= 0 ? String(valores[iDescricao] ?? "").trim() : "") || "—";
    const autorizacao = iAutorizacao >= 0 ? String(valores[iAutorizacao] ?? "").trim() : "";

    resultado.push({
      dataVenda,
      horaVenda: "",
      tipoVenda,
      valorBruto,
      taxaRs: "0.00",
      valorLiquido: valorBruto,
      dataPagamento: iDataPagamento >= 0 ? paraData(valores[iDataPagamento]) : null,
      identificadorExterno: identificadorComposto(autorizacao, dataVenda, "", valorBruto, tipoVenda),
    });
  }
  return resultado;
}
