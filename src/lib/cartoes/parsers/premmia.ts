// Premmia (programa de fidelidade Shell) — xlsx, um arquivo por posto. Dois
// formatos de relatório:
//  1) "Pagamento Detalhado" (planilha com as abas "Pagamento Consolidado" e
//     "Pagamento Detalhado") — traz bruto, desconto e líquido por venda, e a
//     condição de recebimento (D01 = Pix, D31 = Cartão APP, "Até o 5º dia
//     útil do mês seguinte" = cupom/vale). É o formato que concilia.
//  2) Export antigo por transação (cabeçalho direto na linha 1) — só traz o
//     valor da venda e a forma de pagamento; taxa e prazo saem das regras
//     contratuais vistas no formato 1 (Pix 0,89% em D+1, Cartão APP 2,1% em
//     D+31, cupom/vale 2,1% no 5º dia útil do mês seguinte).
import ExcelJS from "exceljs";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  criarBuscadorDeColuna,
  identificadorComposto,
  paraDataHora,
  paraProximoDiaUtilSeNecessario,
  paraValorDecimal,
} from "../normalizar";

// "2026-09-09 11:04:38" (texto) ou Date de célula → data + "HH:MM".
function paraDataHoraIso(valor: unknown): { data: Date; hora: string } | null {
  if (valor instanceof Date) return paraDataHora(valor);
  const m = String(valor ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return paraDataHora(valor);
  const [, yyyy, mm, dd, hh, min] = m;
  return { data: new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`), hora: hh && min ? `${hh}:${min}` : "" };
}

// 5º dia útil do mês seguinte — conta segunda a sábado (sábado vale como dia
// útil, igual ao repasse real visto: vendas de setembro/2026 caíram em 06/10),
// e se o 5º cair em domingo/feriado/sábado sem expediente bancário, vai pro
// próximo dia útil.
function quintoDiaUtilDoMesSeguinte(dataVenda: Date): Date {
  const d = new Date(Date.UTC(dataVenda.getUTCFullYear(), dataVenda.getUTCMonth() + 1, 1));
  let contados = 0;
  while (true) {
    if (d.getUTCDay() !== 0) contados++;
    if (contados === 5) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return paraProximoDiaUtilSeNecessario(d);
}

function dataPagamentoPorCondicao(condicao: string, dataVenda: Date): Date | null {
  const c = condicao.trim().toUpperCase();
  const porDias = c.match(/^D(\d+)$/);
  if (porDias) {
    const d = new Date(dataVenda);
    d.setUTCDate(d.getUTCDate() + Number(porDias[1]));
    return paraProximoDiaUtilSeNecessario(d);
  }
  if (c.includes("5º DIA ÚTIL") || c.includes("5O DIA UTIL") || c === "D05U") return quintoDiaUtilDoMesSeguinte(dataVenda);
  return null;
}

const TAXA_PIX_PCT = 0.89;
const TAXA_CONTRATO_PCT = 2.1;

// Forma de pagamento do export antigo → condição de recebimento do contrato.
function condicaoPorForma(forma: string): string {
  const f = forma.toLowerCase();
  if (f.includes("pix")) return "D01";
  if (f.includes("desconto") || f.includes("vale") || f.includes("cupom")) return "D05U";
  return "D31";
}

function tipoPorCondicao(condicao: string): string {
  const c = condicao.trim().toUpperCase();
  if (c === "D01") return "Pix";
  if (/^D\d+$/.test(c)) return "Crédito Cartão APP";
  return "Desconto";
}

function parseDetalhado(planilha: ExcelJS.Worksheet): LinhaTransacao[] {
  const cabecalho = (planilha.getRow(1).values as unknown[]).map((v) => (v == null ? "" : String(v).trim()));
  const idx = criarBuscadorDeColuna(cabecalho);
  const iData = idx("Data da Transação");
  const iCodigo = idx("Código da Transação");
  const iCondicao = idx("Condição de Recebimento");
  const iBruto = idx("Valor Total");
  const iLiquido = idx("Valor Líquido");
  const iDesconto = idx("Valor Descontado");

  const resultado: LinhaTransacao[] = [];
  for (let r = 2; r <= planilha.rowCount; r++) {
    const valores = planilha.getRow(r).values as unknown[];
    if (!valores || valores.length < 2) continue;

    const dh = iData >= 0 ? paraDataHoraIso(valores[iData]) : null;
    const valorBruto = iBruto >= 0 ? paraValorDecimal(valores[iBruto]) : null;
    if (!dh || valorBruto === null) continue;

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(valores[iLiquido]) : null;
    const desconto = iDesconto >= 0 ? paraValorDecimal(valores[iDesconto]) : null;
    const condicao = iCondicao >= 0 ? String(valores[iCondicao] ?? "").trim() : "";
    const tipoVenda = tipoPorCondicao(condicao);
    const codigo = iCodigo >= 0 ? String(valores[iCodigo] ?? "").trim() : "";

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, desconto),
      valorLiquido,
      dataPagamento: dataPagamentoPorCondicao(condicao, dh.data),
      identificadorExterno: identificadorComposto(codigo, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}

export async function parsePremmia(arq: ArquivoEntrada): Promise<LinhaTransacao[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);

  const detalhado = workbook.getWorksheet("Pagamento Detalhado");
  if (detalhado) return parseDetalhado(detalhado);

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

    const tipoVenda = (iForma >= 0 ? String(valores[iForma] ?? "").trim() : "") || "—";
    const codigo = iCodigo >= 0 ? String(valores[iCodigo] ?? "").trim() : "";

    const condicao = condicaoPorForma(tipoVenda);
    const pct = condicao === "D01" ? TAXA_PIX_PCT : TAXA_CONTRATO_PCT;
    const taxa = Math.round(Number(valorBruto) * pct) / 100;
    const tipoNormalizado = tipoPorCondicao(condicao);

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: tipoNormalizado,
      valorBruto,
      taxaRs: taxa.toFixed(2),
      valorLiquido: (Number(valorBruto) - taxa).toFixed(2),
      dataPagamento: dataPagamentoPorCondicao(condicao, dh.data),
      identificadorExterno: identificadorComposto(codigo, dh.data, dh.hora, valorBruto, tipoNormalizado),
    });
  }
  return resultado;
}
