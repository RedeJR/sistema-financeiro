// VR Benefícios — relatório "Relatorio de Transação de Venda" (.xls), com
// preâmbulo (razão social, endereço, CNPJ/período) antes do cabeçalho
// "CNPJ | Produto | Data | Hora | Cartão | Número Autorização | Valor". Só traz
// o valor da venda: sem líquido, taxa nem data de repasse (o repasse vem em
// guias semanais no relatório de recebimentos, ainda não lido) — por isso
// líquido e data de pagamento ficam vazios e a venda não entra na
// conciliação, só em Vendas e na conferência de caixa.
import * as XLSX from "xlsx";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { identificadorComposto, paraData, paraValorDecimal } from "../normalizar";

const MAX_LINHAS_PREAMBULO = 30;

export function parseVr(arq: ArquivoEntrada): LinhaTransacao[] {
  const workbook = XLSX.read(arq.buffer, { type: "buffer" });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  if (!planilha) return [];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, raw: false, defval: "" });

  let linhaHeader = -1;
  for (let r = 0; r < Math.min(MAX_LINHAS_PREAMBULO, linhas.length); r++) {
    const celulas = linhas[r].map((c) => String(c).trim().toLowerCase());
    if (celulas.includes("data") && celulas.includes("hora") && celulas.includes("valor")) {
      linhaHeader = r;
      break;
    }
  }
  if (linhaHeader === -1) return [];

  const cabecalho = linhas[linhaHeader].map((c) => String(c).trim().toLowerCase());
  const iCnpj = cabecalho.indexOf("cnpj");
  const iProduto = cabecalho.indexOf("produto");
  const iData = cabecalho.indexOf("data");
  const iHora = cabecalho.indexOf("hora");
  const iAutorizacao = cabecalho.findIndex((c) => c.startsWith("número autoriza") || c.startsWith("numero autoriza"));
  const iValor = cabecalho.indexOf("valor");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(linhaHeader + 1)) {
    const dataVenda = paraData(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iValor]);
    if (!dataVenda || valorBruto === null) continue;

    const hora = String(linha[iHora] ?? "").trim().match(/^(\d{1,2})h(\d{2})/);
    const horaVenda = hora ? `${hora[1].padStart(2, "0")}:${hora[2]}` : "";
    const tipoVenda = (iProduto >= 0 ? String(linha[iProduto] ?? "").trim() : "") || "—";
    const autorizacao = iAutorizacao >= 0 ? String(linha[iAutorizacao] ?? "").trim() : "";

    resultado.push({
      dataVenda,
      horaVenda,
      tipoVenda,
      valorBruto,
      taxaRs: null,
      valorLiquido: null,
      dataPagamento: null,
      identificadorExterno: identificadorComposto(autorizacao, dataVenda, horaVenda, valorBruto, tipoVenda),
      postoCnpjSugerido: iCnpj >= 0 ? String(linha[iCnpj] ?? "").trim() : undefined,
    });
  }
  return resultado;
}
