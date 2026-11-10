// PagSeguro — relatório transacional, um arquivo por posto. Traz a data
// prevista de liberação explícita — não precisa inferir por modalidade.
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  decodificarTexto,
  dividirLinhasCsv,
  normalizarBandeira,
  identificadorComposto,
  paraData,
  paraDataHora,
  paraValorAbsoluto,
  paraValorDecimal,
} from "../normalizar";

// Maquininha que mudou de posto mas continua cadastrada na conta PagSeguro de origem: o relatório da conta traz as
// vendas dela junto com as do posto de origem, então a regra por "Identificação da Maquininha" lança no posto onde
// ela está. Vale em qualquer importação (se alguém subir o relatório de novo), e as vendas já lançadas não
// duplicam. Taxa e data de liberação seguem o relatório (contrato da conta de origem).
const MAQUININHAS_EM_OUTRO_POSTO = [
  // Paineira -> Oliveira: a partir de 05/11/2026 às 09:42 (venda de teste de R$ 1,00 no Pix).
  { maquininha: "1731669115", de: "2026-11-05", horaDe: "09:42", posto: "OLIVEIRA" },
];

export function parsePagseguro(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("Data da Transação");
  const iForma = idx("Forma de Pagamento");
  const iBandeira = idx("Bandeira");
  const iParcela = idx("Parcela");
  const iBruto = idx("Valor Bruto");
  const iTaxa = idx("Valor Taxa");
  const iLiquido = idx("Valor Líquido");
  const iStatus = idx("Status");
  const iDataLiberacao = idx("Data prevista de liberação");
  const iCodigoTransacao = idx("Código da Transação");
  const iMaquininha = idx("Identificação da Maquininha");

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

    const maquininha = iMaquininha >= 0 ? (linha[iMaquininha] ?? "").trim() : "";
    const emOutroPosto = maquininha
      ? MAQUININHAS_EM_OUTRO_POSTO.find((m) => {
          const dia = dh.data.toISOString().slice(0, 10);
          return m.maquininha === maquininha && (dia > m.de || (dia === m.de && dh.hora.slice(0, 5) >= m.horaDe));
        })
      : undefined;

    resultado.push({
      postoNomeForcado: emOutroPosto?.posto,
      bandeira: iBandeira >= 0 ? normalizarBandeira(linha[iBandeira]) : undefined,
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
