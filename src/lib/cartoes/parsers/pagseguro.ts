// PagSeguro — relatório transacional, um arquivo por posto. Traz a data
// prevista de liberação explícita — não precisa inferir por modalidade.
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

export function parsePagseguro(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("Data da Transação");
  const iForma = idx("Forma de Pagamento");
  const iParcela = idx("Parcela");
  const iBruto = idx("Valor Bruto");
  const iTaxa = idx("Valor Taxa");
  const iLiquido = idx("Valor Líquido");
  const iStatus = idx("Status");
  const iDataLiberacao = idx("Data prevista de liberação");
  const iCodigoTransacao = idx("Código da Transação");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "aprovada") continue;

    const dh = paraDataHora(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iBruto]);
    if (!dh || valorBruto === null) continue;

    const forma = (iForma >= 0 ? linha[iForma] : "")?.trim();
    const parcela = (iParcela >= 0 ? linha[iParcela] : "")?.trim();
    const tipoVenda = parcela && parcela !== "-" ? `${forma} ${parcela}`.trim() : forma || "—";

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null;
    const taxaColuna = iTaxa >= 0 ? paraValorAbsoluto(linha[iTaxa]) : null;

    const codigoTransacao = iCodigoTransacao >= 0 ? linha[iCodigoTransacao] : null;

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: iDataLiberacao >= 0 ? paraData(linha[iDataLiberacao]) : null,
      identificadorExterno: identificadorComposto(codigoTransacao, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}
