// Abastece Aí — relatório agrupado multi-posto ("todos_abastece ai.csv"):
// um arquivo só com as vendas de TODOS os postos juntas, identificadas pela
// coluna CNPJ. Cada linha resolve seu próprio posto contra o cadastro de
// Postos (ver postos.ts/importar.ts) — não importa qual posto está
// selecionado na tela de upload. Valores vêm entre aspas com prefixo "R$"
// (ex: "R$160,52") — paraValorDecimal já limpa isso sozinho.
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { decodificarTexto, dividirLinhasCsv, paraData, paraDataHora, paraValorDecimal } from "../normalizar";

export function parseAbasteceAi(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhas = dividirLinhasCsv(texto);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iCnpj = idx("CNPJ");
  const iStatus = idx("Status");
  const iCanal = idx("Canal de venda");
  const iCodigo = cabecalho.findIndex((c) => c.startsWith("Código da Transação"));
  const iData = idx("Data");
  const iHora = idx("Hora");
  const iMeioPagamento = idx("Meio de Pagamento");
  const iBruto = idx("Valor da Compra");
  const iTaxa = idx("Total Taxas");
  const iLiquido = idx("Líquido a receber");
  const iDataPagamento = idx("Data Pagamento");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "autorizado") continue;

    const dh = paraDataHora(iData >= 0 ? `${linha[iData]} ${iHora >= 0 ? linha[iHora] : ""}`.trim() : null);
    const valorBruto = paraValorDecimal(linha[iBruto]);
    if (!dh || valorBruto === null) continue;

    resultado.push({
      postoCnpjSugerido: iCnpj >= 0 ? linha[iCnpj] || undefined : undefined,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: (iMeioPagamento >= 0 ? linha[iMeioPagamento] : iCanal >= 0 ? linha[iCanal] : null) || "—",
      valorBruto,
      taxaRs: iTaxa >= 0 ? paraValorDecimal(linha[iTaxa]) : null,
      valorLiquido: iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null,
      dataPagamento: iDataPagamento >= 0 ? paraData(linha[iDataPagamento]) : null,
      identificadorExterno: iCodigo >= 0 ? linha[iCodigo] || null : null,
    });
  }
  return resultado;
}
