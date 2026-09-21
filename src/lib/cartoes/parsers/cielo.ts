// Cielo — relatório "Detalhado de vendas" (transacional, uma linha por
// venda). O arquivo real tem um preâmbulo (ouvidoria, filtros, totalizador)
// antes do cabeçalho de verdade — por isso a busca pelo cabeçalho varre as
// primeiras linhas em vez de assumir a linha 0.
//
// Só esse formato está coberto por enquanto (é o que apareceu nos arquivos
// reais conferidos). Os formatos "parceiros" (vouchers), "calendário
// agrupado" e "pivot" que existem no protótipo em Python ainda não foram
// portados — um arquivo nesses formatos não tem "Hora da venda" na mesma
// linha que "Data da venda" e cai no erro "cabeçalho não encontrado".
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  decodificarTexto,
  dividirLinhasCsv,
  identificadorComposto,
  paraData,
  paraHoraSimples,
  paraValorAbsoluto,
  paraValorDecimal,
} from "../normalizar";

const MAX_LINHAS_PREAMBULO = 40;

export function parseCielo(arq: ArquivoEntrada): LinhaTransacao[] {
  const texto = decodificarTexto(arq.buffer);
  const linhasBrutas = texto.split(/\r?\n/);

  let indiceHeader = -1;
  for (let i = 0; i < Math.min(MAX_LINHAS_PREAMBULO, linhasBrutas.length); i++) {
    if (linhasBrutas[i].includes("Data da venda") && linhasBrutas[i].includes("Hora da venda")) {
      indiceHeader = i;
      break;
    }
  }
  if (indiceHeader === -1) {
    throw new Error(
      'Cabeçalho não encontrado — só o formato "Detalhado de vendas" (transacional) da Cielo está coberto por enquanto.'
    );
  }

  const linhas = dividirLinhasCsv(linhasBrutas.slice(indiceHeader).join("\n"));
  const cabecalho = linhas[0];
  const idx = (nome: string) => cabecalho.indexOf(nome);

  const iData = idx("Data da venda");
  const iHora = idx("Hora da venda");
  const iForma = idx("Forma de pagamento");
  const iTipoLancamento = idx("Tipo de lançamento");
  const iBruto = idx("Valor bruto");
  const iTaxaMdr = idx("Valor da taxa administrativa (MDR)");
  const iTaxaTarifa = idx("Valor Taxa/Tarifa");
  const iTotalTaxas = idx("Total de taxas");
  const iLiquido = idx("Valor líquido");
  const iStatus = idx("Status da venda");
  const iDataPagamento = idx("Data prevista do pagamento");

  const resultado: LinhaTransacao[] = [];
  for (const linha of linhas.slice(1)) {
    if (linha.length < 2) continue;
    if (iStatus >= 0 && linha[iStatus]?.trim().toLowerCase() !== "aprovada") continue;

    const dataVenda = paraData(linha[iData]);
    const valorBruto = paraValorDecimal(linha[iBruto]);
    if (!dataVenda || valorBruto === null) continue;

    const valorLiquido = iLiquido >= 0 ? paraValorDecimal(linha[iLiquido]) : null;
    const taxaColuna =
      (iTaxaMdr >= 0 ? paraValorAbsoluto(linha[iTaxaMdr]) : null) ??
      (iTaxaTarifa >= 0 ? paraValorAbsoluto(linha[iTaxaTarifa]) : null) ??
      (iTotalTaxas >= 0 ? paraValorAbsoluto(linha[iTotalTaxas]) : null);

    const horaVenda = paraHoraSimples(linha[iHora]);
    const tipoVenda = (iForma >= 0 ? linha[iForma] : linha[iTipoLancamento]) || "—";
    resultado.push({
      dataVenda,
      horaVenda,
      tipoVenda,
      valorBruto,
      taxaRs: calcularTaxaRs(valorBruto, valorLiquido, taxaColuna),
      valorLiquido,
      dataPagamento: iDataPagamento >= 0 ? paraData(linha[iDataPagamento]) : null,
      identificadorExterno: identificadorComposto(null, dataVenda, horaVenda, valorBruto, tipoVenda),
    });
  }

  // O "Código da venda" da Cielo tem 19 dígitos e vira notação científica
  // ("2,6091E+18", sem os dígitos) quando o arquivo passa pelo Excel — o mesmo
  // relatório sai com código completo numa exportação e truncado noutra, então
  // ele NÃO serve de identificador: o reenvio duplicava tudo, e com o código
  // truncado vendas diferentes no mesmo minuto/valor/tipo colapsavam numa só.
  // Identificador = data+hora+valor+tipo + nº de ocorrência dessa combinação
  // no arquivo (#1, #2...): duas vendas idênticas no mesmo minuto ficam com
  // #1 e #2, e o mesmo arquivo reexportado gera os mesmos identificadores.
  const ocorrencias = new Map<string, number>();
  for (const r of resultado) {
    const base = r.identificadorExterno!;
    const n = (ocorrencias.get(base) ?? 0) + 1;
    ocorrencias.set(base, n);
    r.identificadorExterno = `${base}#${n}`;
  }
  return resultado;
}
