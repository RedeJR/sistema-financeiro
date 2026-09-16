// Sem Parar — relatório agrupado multi-posto ("todos_sem parar.csv"): um
// arquivo só com as vendas de TODOS os postos juntas, identificadas pela
// razão social na coluna CREDENCIADO (texto livre, não CNPJ — ver
// postos.ts/importar.ts). Tem um preâmbulo (totalizador) antes do
// cabeçalho de verdade.
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { decodificarTexto, dividirLinhasCsv, paraData, paraDataHora, paraValorDecimal } from "../normalizar";

const MAX_LINHAS_PREAMBULO = 10;

export function parseSemParar(arq: ArquivoEntrada): LinhaTransacao[] {
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
  const cabecalho = linhas[0];
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
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "aprovada") continue;

    const dh = paraDataHora(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iValor]);
    if (!dh || valorBruto === null) continue;

    resultado.push({
      postoTextoLivreSugerido: iCredenciado >= 0 ? linha[iCredenciado] || undefined : undefined,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: (iCombustivel >= 0 ? linha[iCombustivel] : null) || "—",
      valorBruto,
      taxaRs: iValorTaxa >= 0 ? paraValorDecimal(linha[iValorTaxa]) : null,
      valorLiquido: iValorLiquido >= 0 ? paraValorDecimal(linha[iValorLiquido]) : null,
      dataPagamento: iDataRepasse >= 0 ? paraData(linha[iDataRepasse]) : null,
      identificadorExterno: iNsu >= 0 ? linha[iNsu] || null : null,
    });
  }
  return resultado;
}
