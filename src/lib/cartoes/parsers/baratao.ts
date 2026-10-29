// Baratão — relatório de vendas (CSV com ";", um arquivo por posto): uma linha por abastecimento
// com cupom, litros, valor por litro e o "Valor Repasse Total" que cai na conta. O relatório não
// traz data de pagamento nem a coluna de bruto preenchida; o repasse é 30 dias corridos depois do
// abastecimento (cai no próximo dia útil se der fim de semana/feriado — conferido nos Pix
// "BARATAO TECNOLOGIA" do extrato do Sinergia). Bruto = repasse + taxa do Baratão + desconto.
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { decodificarTexto, dividirLinhasCsv, identificadorComposto, paraDataHora, paraValorDecimal, prazoParaDataPagamento } from "../normalizar";

const PRAZO_DIAS = 30;

export function parseBaratao(arq: ArquivoEntrada): LinhaTransacao[] {
  const linhas = dividirLinhasCsv(decodificarTexto(arq.buffer));
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0].map((c) => c.trim());
  const idx = (nome: string) => cabecalho.findIndex((c) => c.toLowerCase() === nome.toLowerCase());
  const iCupom = idx("Cupom");
  const iData = idx("Data do Abastecimento");
  const iProduto = idx("Produto");
  const iTaxa = idx("Taxa Baratao");
  const iDesconto = idx("Valor Desconto");
  const iRepasse = idx("Valor Repasse Total");
  if (iData < 0 || iRepasse < 0) return [];

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    const dh = paraDataHora(linha[iData]);
    const repasse = paraValorDecimal(linha[iRepasse]);
    if (!dh || repasse === null || Number(repasse) <= 0) continue;

    const taxa = iTaxa >= 0 ? Number(paraValorDecimal(linha[iTaxa]) ?? 0) : 0;
    const desconto = iDesconto >= 0 ? Number(paraValorDecimal(linha[iDesconto]) ?? 0) : 0;
    const bruto = (Math.round(Number(repasse) * 100) + Math.round(taxa * 100) + Math.round(desconto * 100)) / 100;
    const valorBruto = bruto.toFixed(2);
    const tipoVenda = (iProduto >= 0 ? linha[iProduto]?.trim() : "") || "—";
    const cupom = iCupom >= 0 ? linha[iCupom]?.trim() : "";

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: (bruto - Number(repasse)).toFixed(2),
      valorLiquido: repasse,
      dataPagamento: prazoParaDataPagamento(dh.data, PRAZO_DIAS),
      identificadorExterno: identificadorComposto(cupom, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}
