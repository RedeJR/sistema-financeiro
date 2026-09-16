import ExcelJS from "exceljs";
import { decodificarTexto } from "../normalizar";
import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { parseCielo } from "./cielo";
import { parseStone } from "./stone";
import { parseGetnet } from "./getnet";
import { parsePagseguro } from "./pagseguro";
import { parseRedecard } from "./redecard";
import { parseSaqpay } from "./saqpay";
import { parseSemParar } from "./semparar";
import { parseAbasteceAi } from "./abasteceai";
import { parsePremmia } from "./premmia";

export type DefinicaoAdquirente = {
  nomeExibicao: string;
  // O arquivo traz vendas de vários postos juntas — o posto escolhido na
  // tela de upload é ignorado, cada linha resolve o seu próprio (ver
  // postos.ts/importar.ts): "cnpj" quando a linha traz o CNPJ do posto,
  // "nome" quando traz só um texto livre (razão social/apelido). false =
  // arquivo de posto único, usa o posto escolhido na tela pra tudo.
  multiPosto: false | "cnpj" | "nome";
  parse: (arq: ArquivoEntrada) => LinhaTransacao[] | Promise<LinhaTransacao[]>;
};

export const PARSERS: Record<string, DefinicaoAdquirente> = {
  CIELO: { nomeExibicao: "CIELO", multiPosto: false, parse: parseCielo },
  STONE: { nomeExibicao: "STONE", multiPosto: "cnpj", parse: parseStone },
  REDECARD: { nomeExibicao: "REDE", multiPosto: false, parse: parseRedecard },
  GETNET: { nomeExibicao: "GETNET", multiPosto: false, parse: parseGetnet },
  PAGSEGURO: { nomeExibicao: "PAGSEGURO", multiPosto: false, parse: parsePagseguro },
  SAQPAY: { nomeExibicao: "SAQPAY", multiPosto: "nome", parse: parseSaqpay },
  SEMPARAR: { nomeExibicao: "SEM PARAR", multiPosto: "nome", parse: parseSemParar },
  ABASTECE_AI: { nomeExibicao: "ABASTECE AÍ", multiPosto: "cnpj", parse: parseAbasteceAi },
  PREMMIA: { nomeExibicao: "PREMMIA", multiPosto: false, parse: parsePremmia },
};

// Reconhece a adquirente pelo nome do arquivo — mesma convenção que já era
// usada no protótipo em Python (POSTO_ADQUIRENTE.ext, ex: BARRAMARES_CIELO.csv,
// Todos_stone.csv). Ordem importa: "REDE" sozinho bateria com "REDECARD"
// também, então não precisa de entrada separada.
const DETECCAO: [string, keyof typeof PARSERS][] = [
  ["CIELO", "CIELO"],
  ["STONE", "STONE"],
  ["REDECARD", "REDECARD"],
  ["REDE", "REDECARD"],
  ["GETNET", "GETNET"],
  ["PAGSEGURO", "PAGSEGURO"],
  ["PAGS", "PAGSEGURO"],
  ["SAQPAY", "SAQPAY"],
  ["SEM PARAR", "SEMPARAR"],
  ["SEM_PARAR", "SEMPARAR"],
  ["SEM-PARAR", "SEMPARAR"],
  ["SEMPARAR", "SEMPARAR"],
  ["ABASTECE", "ABASTECE_AI"],
  ["PREMMIA", "PREMMIA"],
];

export function detectarAdquirentePorNome(nomeArquivo: string): keyof typeof PARSERS | null {
  const nome = nomeArquivo.toUpperCase();
  for (const [chave, valor] of DETECCAO) {
    if (nome.includes(chave)) return valor;
  }
  return null;
}

// Cada adquirente tem uma combinação de nomes de coluna (ou texto de
// cabeçalho/título do relatório) que não aparece em nenhuma outra — usado
// como fallback quando o nome do arquivo não ajuda (ex: ela renomeou, ou
// baixou com o nome padrão do site da adquirente em vez do formato
// POSTO_ADQUIRENTE que a gente sugere).
const ASSINATURAS: [string[], keyof typeof PARSERS][] = [
  [["STONECODE"], "STONE"],
  [["DETALHADO DE VENDAS CIELO"], "CIELO"],
  [["EXTRATO PARA SIMPLES CONFER"], "REDECARD"],
  [["ESTABELECIMENTO COMERCIAL", "NÚMERO DO TERMINAL"], "GETNET"],
  [["DATA PREVISTA DE LIBERA"], "PAGSEGURO"],
  [["LOJISTA", "REGRA DE PAGAMENTO"], "SAQPAY"],
  [["CREDENCIADO", "DATA_REPASSE"], "SEMPARAR"],
  [["OFERTA É SUA", "LÍQUIDO A RECEBER"], "ABASTECE_AI"],
  [["CÓDIGO TRANSAÇÃO", "FORMA DE PAGAMENTO"], "PREMMIA"],
];

// Junta as primeiras linhas/células do arquivo num texto só, em maiúsculas,
// pra comparar contra as assinaturas acima — trata xlsx (lê a planilha) e
// csv/texto (decodifica) de formas diferentes.
async function textoParaAssinatura(arq: ArquivoEntrada): Promise<string> {
  const ehXlsx = arq.buffer[0] === 0x50 && arq.buffer[1] === 0x4b; // assinatura ZIP ("PK")
  if (ehXlsx) {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arq.buffer as unknown as ExcelJS.Buffer);
      const planilha = workbook.worksheets[0];
      if (!planilha) return "";
      let texto = "";
      for (let r = 1; r <= Math.min(10, planilha.rowCount); r++) {
        texto += (planilha.getRow(r).values as unknown[]).map((v) => (v == null ? "" : String(v))).join(" ") + "\n";
      }
      return texto.toUpperCase();
    } catch {
      return "";
    }
  }
  return decodificarTexto(arq.buffer).slice(0, 8000).toUpperCase();
}

export async function detectarAdquirentePorConteudo(arq: ArquivoEntrada): Promise<keyof typeof PARSERS | null> {
  const texto = await textoParaAssinatura(arq);
  if (!texto) return null;
  for (const [chaves, valor] of ASSINATURAS) {
    if (chaves.every((c) => texto.includes(c))) return valor;
  }
  return null;
}

// Tenta pelo nome do arquivo primeiro (rápido); só abre o conteúdo se isso
// não bater com nada.
export async function detectarAdquirente(arq: ArquivoEntrada): Promise<keyof typeof PARSERS | null> {
  return detectarAdquirentePorNome(arq.nome) ?? (await detectarAdquirentePorConteudo(arq));
}
