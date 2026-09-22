// Getnet — dois relatórios diferentes, ambos "um arquivo por posto" (posto
// vem da tela de upload, não do arquivo):
//  1) "Detalhado de vendas" (Débito/Crédito) — o de sempre, com data prevista
//     de pagamento explícita.
//  2) "QR Code" (Pix) — relatório separado, cabeçalho totalmente diferente
//     (nem "FORMA DE PAGAMENTO" nem "VALOR BRUTO" existem nele) e sem coluna
//     de data de pagamento. Detectado pelo cabeçalho, não pelo nome do
//     arquivo (os dois têm "getnet" no nome).
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

function parseGetnetVendas(linhas: string[][]): LinhaTransacao[] {
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

    const tipoVenda = (iForma >= 0 ? linha[iForma] : null) || "—";
    const comprovante = iComprovante >= 0 ? linha[iComprovante] || "" : "";

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: iDataPagamento >= 0 ? paraData(linha[iDataPagamento]) : null,
      // O número do comprovante (CV) sozinho não é confiável: o terminal
      // reinicia essa contagem periodicamente, então o mesmo número volta a
      // aparecer em dias diferentes pra vendas totalmente diferentes — teve
      // caso real de quase 30% das vendas de um arquivo sendo descartadas
      // como "duplicata" por causa disso (ver identificadorComposto).
      identificadorExterno: identificadorComposto(comprovante, dh.data, dh.hora, valorBruto, tipoVenda),
    });
  }
  return resultado;
}

// Só tem 2 status nos arquivos reais vistos: "Paga" (QR code pago de
// verdade) e "Qr Code Expirado" (gerado mas ninguém pagou) — só a primeira
// conta como venda.
function parseGetnetPix(linhas: string[][]): LinhaTransacao[] {
  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("DATA/HORA DA VENDA");
  const iValor = idx("VALOR DA VENDA");
  const iTaxa = idx("VALOR TAXA");
  const iLiquido = idx("VALOR LÍQUIDO");
  const iStatus = idx("STATUS");
  const iId = idx("ID/TRANSAÇÃO (ID)");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "paga") continue;

    const dh = paraDataHora(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iValor]);
    if (!dh || valorBruto === null) continue;

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null;
    const taxaColuna = iTaxa >= 0 ? paraValorAbsoluto(linha[iTaxa]) : null;
    const idTransacao = iId >= 0 ? linha[iId] || "" : "";

    resultado.push({
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: "Pix",
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      // Sem coluna de data prevista de pagamento nesse relatório — Pix
      // liquida no mesmo dia (D+0), diferente do Débito/Crédito acima.
      dataPagamento: dh.data,
      identificadorExterno: identificadorComposto(idTransacao, dh.data, dh.hora, valorBruto, "Pix"),
    });
  }
  return resultado;
}

export function parseGetnet(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  return cabecalho.includes("FORMA DE CAPTURA") && cabecalho.includes("VALOR DA VENDA")
    ? parseGetnetPix(linhas)
    : parseGetnetVendas(linhas);
}
