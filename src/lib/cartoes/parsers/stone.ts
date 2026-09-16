// Stone — relatório agrupado multi-posto ("Todos_stone.csv"): um arquivo só
// com as vendas de TODOS os postos juntas, identificadas pela coluna
// DOCUMENTO (CNPJ). Cada linha resolve seu próprio posto (ver
// postoNomeSugerido) — não importa qual posto está selecionado na tela de
// upload, a linha vai pro posto certo sozinha via CNPJ (postos.ts).
//
// Não traz data de pagamento explícita — infere pelo produto: Pix D+0,
// Débito D+1, Crédito/Voucher D+2 (mesma regra do protótipo em Python).
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { calcularTaxaRs, decodificarTexto, dividirLinhasCsv, paraDataHora, paraValorDecimal, proximoDiaUtil } from "../normalizar";
import { postoPorCnpjStone } from "../postos";

function prazoPorProduto(produto: string): number {
  const p = produto.toLowerCase();
  if (p.includes("pix")) return 0;
  if (p.includes("debito") || p.includes("débito")) return 1;
  return 2;
}

export function parseStone(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iDocumento = idx("DOCUMENTO");
  const iData = idx("DATA DA VENDA");
  const iProduto = idx("PRODUTO");
  const iBruto = idx("VALOR BRUTO");
  const iLiquido = idx("VALOR LIQUIDO");
  const iStatus = idx("ULTIMO STATUS");
  const iStoneId = idx("STONE ID");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "aprovada") continue;

    const dh = paraDataHora(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iBruto]);
    if (!dh || valorBruto === null) continue;

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null;
    const taxaRs = calcularTaxaRs(valorBruto, valorLiquido, null);

    const produto = iProduto >= 0 ? linha[iProduto] || "—" : "—";
    const postoNomeSugerido = iDocumento >= 0 ? (postoPorCnpjStone(linha[iDocumento]) ?? undefined) : undefined;

    resultado.push({
      postoNomeSugerido,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: produto,
      valorBruto,
      taxaRs,
      valorLiquido,
      dataPagamento: proximoDiaUtil(dh.data, prazoPorProduto(produto)),
      identificadorExterno: iStoneId >= 0 ? linha[iStoneId] || null : null,
    });
  }
  return resultado;
}
