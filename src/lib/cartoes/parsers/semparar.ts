// Sem Parar — relatório agrupado multi-posto ("todos_sem parar.csv" ou
// ".xlsx" — a adquirente exporta nos dois formatos dependendo do posto):
// um arquivo só com as vendas de TODOS os postos juntas, identificadas pela
// razão social na coluna CREDENCIADO (texto livre, não CNPJ — ver
// postos.ts/importar.ts). Tem um preâmbulo (totalizador) antes do
// cabeçalho de verdade, nos dois formatos.
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  decodificarTexto,
  dividirLinhasCsv,
  identificadorComposto,
  paraData,
  paraDataHora,
  paraValorAbsoluto,
  paraValorDecimal,
} from "../normalizar";

const MAX_LINHAS_PREAMBULO = 10;

function extrairLinhas(cabecalho: unknown[], linhas: unknown[][]): LinhaTransacao[] {
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("DATA_TRANSACAO");
  const iNsu = idx("NSU");
  const iCombustivel = idx("COMBUSTIVEL");
  const iValor = idx("VALOR");
  const iCredenciado = idx("CREDENCIADO");
  const iStatus = idx("STATUS");
  const iDataRepasse = idx("DATA_REPASSE");
  const iValorLiquido = idx("VALOR_LIQUIDO");
  const iValorTaxa = idx("VALOR_TAXA");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas) {
    if (!linha || linha.length < 2) continue;
    const status = iStatus >= 0 ? String(linha[iStatus] ?? "").trim().toLowerCase() : "";
    if (iStatus >= 0 && status !== "aprovada") continue;

    const dh = iData >= 0 ? paraDataHora(linha[iData]) : null;
    const valorBruto = iValor >= 0 ? paraValorDecimal(linha[iValor]) : null;
    if (!dh || valorBruto === null) continue;

    // VALOR_LIQUIDO/VALOR_TAXA só vêm preenchidos depois que a venda é
    // repassada (semanas depois, ver DATA_REPASSE) — antes disso o arquivo
    // mostra "0,00" nos dois, não um zero de verdade. Tratando "0,00" como
    // zero real, calcularTaxaRs interpretaria bruto−0 como 100% de taxa.
    // Em vendas ainda não repassadas, é melhor não afirmar nada (null).
    const valorLiquidoBruto = iValorLiquido >= 0 ? paraValorDecimal(linha[iValorLiquido]) : null;
    const valorLiquido = valorLiquidoBruto && Number(valorLiquidoBruto) > 0 ? valorLiquidoBruto : null;
    // VALOR_TAXA vem negativo (ex: "-3,00", o desconto aplicado) — normaliza
    // pra positivo, e passa pelo mesmo tratamento de "0,00 = ainda não
    // repassado" acima (não é um valor real quando a venda ainda não
    // liquidou, então também vira null em vez de zero).
    const taxaColunaBruta = iValorTaxa >= 0 ? paraValorAbsoluto(linha[iValorTaxa]) : null;
    const taxaColuna = taxaColunaBruta && Number(taxaColunaBruta) > 0 ? taxaColunaBruta : null;

    const tipoVenda = (iCombustivel >= 0 ? String(linha[iCombustivel] ?? "").trim() : "") || "—";
    const nsu = iNsu >= 0 ? String(linha[iNsu] ?? "").trim() : "";

    resultado.push({
      postoTextoLivreSugerido: iCredenciado >= 0 ? String(linha[iCredenciado] ?? "").trim() || undefined : undefined,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: iDataRepasse >= 0 ? paraData(linha[iDataRepasse]) : null,
      identificadorExterno: identificadorComposto(nsu, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}

function parseCsv(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhasBrutas = texto.split(/\r?\n/);

  let indiceHeader = -1;
  for (let i = 0; i < Math.min(MAX_LINHAS_PREAMBULO, linhasBrutas.length); i++) {
    if (linhasBrutas[i].includes("DATA_TRANSACAO") && linhasBrutas[i].includes("CREDENCIADO")) {
      indiceHeader = i;
      break;
    }
  }
  if (indiceHeader === -1) {
    throw new Error('Cabeçalho não encontrado — esperava a coluna "DATA_TRANSACAO".');
  }

  const linhas = dividirLinhasCsv(linhasBrutas.slice(indiceHeader).join("\n"));
  return extrairLinhas(linhas[0], linhas.slice(1));
}

async function parseXlsx(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
  const planilha = workbook.worksheets[0];
  if (!planilha) return [];

  let linhaHeader = -1;
  let cabecalho: unknown[] = [];
  for (let r = 1; r <= Math.min(MAX_LINHAS_PREAMBULO, planilha.rowCount); r++) {
    const valores = planilha.getRow(r).values as unknown[];
    const textoLinha = valores.map((v) => (v == null ? "" : String(v))).join("|");
    if (textoLinha.includes("DATA_TRANSACAO") && textoLinha.includes("CREDENCIADO")) {
      linhaHeader = r;
      cabecalho = valores;
      break;
    }
  }
  if (linhaHeader === -1) {
    throw new Error('Cabeçalho não encontrado — esperava a coluna "DATA_TRANSACAO".');
  }

  const linhas: unknown[][] = [];
  for (let r = linhaHeader + 1; r <= planilha.rowCount; r++) {
    linhas.push(planilha.getRow(r).values as unknown[]);
  }
  return extrairLinhas(cabecalho, linhas);
}

export async function parseSemParar(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const ehXlsx = arq.buffer[0] === 0x50 && arq.buffer[1] === 0x4b; // assinatura ZIP ("PK")
  return ehXlsx ? parseXlsx(arq) : parseCsv(arq);
}
