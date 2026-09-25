// Pluxee — relatório "extrato_vendas" (xlsx), com preâmbulo (CNPJ, Razão
// Social, Produto, filtro de período) antes do cabeçalho de verdade. Já traz
// a própria "Data de pagamento" por venda — sem precisar nenhuma regra de
// prazo pra inferir (prazo real visto: bem longo, ~30 dias). Não traz valor
// líquido/taxa — o importador aplica a taxa cadastrada pro posto (ver
// ADQUIRENTES_LIQUIDO_PELA_TAXA em importar.ts). Também lê o relatório de
// recebimento ("extrato_pagamentos", mesmas colunas + Status): traz as
// vendas de meses anteriores que só foram pagas agora. O status "ERRO NO
// PAGAMENTO" não muda a data: o dinheiro caiu na data prevista mesmo assim
// (conferido no extrato de Cantareira e Barramares), então é ignorado.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { criarBuscadorDeColuna, identificadorComposto, paraData, paraValorDecimal } from "../normalizar";

const MAX_LINHAS_PREAMBULO = 40;

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
  const iAutorizacao = idx("Número da autorização") >= 0 ? idx("Número da autorização") : idx("Nº de Autorização");
  const iValorBruto = idx("Valor bruto") >= 0 ? idx("Valor bruto") : idx("Valor Bruto R$");
  const iDataPagamento = idx("Data de pagamento") >= 0 ? idx("Data de pagamento") : idx("Data do Pagamento");

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
