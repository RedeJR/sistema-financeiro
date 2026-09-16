// Getnet — relatório transacional, um arquivo por posto (posto vem da tela
// de upload, não do arquivo). Já traz a data prevista de pagamento explícita
// — não precisa inferir por modalidade.
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  decodificarTexto,
  dividirLinhasCsv,
  paraData,
  paraDataHora,
  paraValorAbsoluto,
  paraValorDecimal,
} from "../normalizar";

export function parseGetnet(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("DATA/HORA DA VENDA");
  const iForma = idx("FORMA DE PAGAMENTO");
  const iBruto = idx("VALOR BRUTO");
  const iTaxa = idx("VALOR TAXA");
  const iLiquido = idx("VALOR LÍQUIDO");
  const iStatus = idx("STATUS DA TRANSAÇÃO");
  const iDataPagamento = idx("DATA PREVISTA DO 1º PAGAMENTO");
  const iComprovante = idx("NÚMERO DO COMPROVANTE DE VENDAS (CV)");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "aprovada") continue;

    const dh = paraDataHora(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iBruto]);
    if (!dh || valorBruto === null) continue;

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null;
    const taxaColuna = iTaxa >= 0 ? paraValorAbsoluto(linha[iTaxa]) : null;

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: (iForma >= 0 ? linha[iForma] : null) || "—",
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: iDataPagamento >= 0 ? paraData(linha[iDataPagamento]) : null,
      identificadorExterno: iComprovante >= 0 ? linha[iComprovante] || null : null,
    });
  }
  return resultado;
}
