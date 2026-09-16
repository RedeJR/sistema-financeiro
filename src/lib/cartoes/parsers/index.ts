import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { parseCielo } from "./cielo";
import { parseStone } from "./stone";
import { parseGetnet } from "./getnet";
import { parsePagseguro } from "./pagseguro";
import { parseRedecard } from "./redecard";
import { parseSaqpay } from "./saqpay";
import { parseSemParar } from "./semparar";
import { parseAbasteceAi } from "./abasteceai";

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
];

export function detectarAdquirente(nomeArquivo: string): keyof typeof PARSERS | null {
  const nome = nomeArquivo.toUpperCase();
  for (const [chave, valor] of DETECCAO) {
    if (nome.includes(chave)) return valor;
  }
  return null;
}
