// Stone — relatório agrupado multi-posto ("Todos_stone.csv"): um arquivo só
// com as vendas de TODOS os postos juntas, identificadas pela coluna
// DOCUMENTO (CNPJ). Cada linha resolve seu próprio posto pelo CNPJ contra
// o cadastro de Postos (ver postos.ts/importar.ts) — não importa qual
// posto está selecionado na tela de upload.
//
// Não traz data de pagamento explícita — infere pelo produto: Pix D+0,
// Débito D+1, Crédito/Voucher D+2 (mesma regra do protótipo em Python).
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import {
  calcularTaxaRs,
  criarBuscadorDeColuna,
  decodificarTexto,
  dividirLinhasCsv,
  normalizarBandeira,
  identificadorComposto,
  paraDataHora,
  paraValorDecimal,
  prazoParaDataPagamento,
  proximoDiaUtil,
} from "../normalizar";

// Maquininha que ficou em outro posto mas continua cadastrada (EC) no CNPJ de origem: o relatório da Stone traz as
// vendas dela no CNPJ de origem, então a regra por número de série lança no posto onde ela estava. Vale em
// qualquer importação (ex: se alguém subir o relatório de novo), e as vendas já lançadas não duplicam.
// Crédito à vista segue o contrato do EC de origem (30 dias); débito, pix e pré-pago, o prazo normal.
const MAQUININHAS_EM_OUTRO_POSTO = [
  // Goodbye -> Oliveira: de 27/10/2026 até a devolução, em 03/11/2026 às 10h03 (última venda).
  { serie: "XC03025046576", de: "2026-10-27", ate: "2026-11-03", horaAte: "10:03", cnpjPosto: "53060723000142", prazoCreditoDias: 30 },
];

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
  // Tolerante a acento: a Stone já mandou "VALOR LIQUIDO"/"ULTIMO STATUS"
  // num export e "VALOR LÍQUIDO"/"ÚLTIMO STATUS" noutro, mesmo relatório —
  // com indexOf exato, a coluna "some" e o filtro de status fica desativado
  // sem erro nenhum (deixa passar venda não aprovada).
  const idx = criarBuscadorDeColuna(cabecalho);

  const iDocumento = idx("DOCUMENTO");
  const iData = idx("DATA DA VENDA");
  const iProduto = idx("PRODUTO");
  const iBandeira = idx("BANDEIRA");
  const iBruto = idx("VALOR BRUTO");
  const iLiquido = idx("VALOR LIQUIDO");
  const iStatus = idx("ULTIMO STATUS");
  // Não usa "STONE ID" pra dedupe: em exports que passaram pelo Excel, essa
  // coluna também vem em notação científica igual o CNPJ (ver postos.ts) —
  // duas vendas diferentes viram o mesmo texto truncado e pareceriam
  // "duplicatas" uma da outra. "CÓDIGO DE AUTORIZAÇÃO" sozinho também não é
  // 100% único (identificadorComposto cobre isso combinando com data/hora/
  // valor/modalidade).
  const iCodigoAutorizacao = idx("CÓDIGO DE AUTORIZAÇÃO");
  const iSerie = idx("N DE SERIE");

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
    let postoCnpjSugerido = iDocumento >= 0 ? linha[iDocumento] || undefined : undefined;
    const autorizacao = iCodigoAutorizacao >= 0 ? linha[iCodigoAutorizacao] || "" : "";

    let dataPagamento = proximoDiaUtil(dh.data, prazoPorProduto(produto));
    const serie = iSerie >= 0 ? (linha[iSerie] ?? "").trim() : "";
    const emOutroPosto = serie
      ? MAQUININHAS_EM_OUTRO_POSTO.find((m) => {
          const dia = dh.data.toISOString().slice(0, 10);
          return m.serie === serie && dia >= m.de && (dia < m.ate || (dia === m.ate && dh.hora.slice(0, 5) <= m.horaAte));
        })
      : undefined;
    if (emOutroPosto) {
      postoCnpjSugerido = emOutroPosto.cnpjPosto;
      if (/^cr[eé]dito$/i.test(produto.trim())) dataPagamento = prazoParaDataPagamento(dh.data, emOutroPosto.prazoCreditoDias);
    }

    resultado.push({
      postoCnpjSugerido,
      bandeira: iBandeira >= 0 ? normalizarBandeira(linha[iBandeira]) : undefined,
      dataVenda: dh.data,
      horaVenda: dh.hora,
      tipoVenda: produto,
      valorBruto,
      taxaRs,
      valorLiquido,
      dataPagamento,
      identificadorExterno: identificadorComposto(autorizacao, dh.data, dh.hora, valorBruto, produto),
    });
  }
  return resultado;
}
