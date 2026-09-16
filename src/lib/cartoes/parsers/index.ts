import type { ArquivoEntrada, LinhaTransacao } from "../tipos";
import { parseCielo } from "./cielo";
import { parseStone } from "./stone";
import { parseGetnet } from "./getnet";
import { parsePagseguro } from "./pagseguro";
import { parseRedecard } from "./redecard";

export type DefinicaoAdquirente = {
  nomeExibicao: string;
  // true = o arquivo traz vendas de vários postos juntas (identificadas por
  // CNPJ) — o posto escolhido na tela de upload é ignorado, cada linha
  // resolve o seu próprio posto (ver LinhaTransacao.postoNomeSugerido).
  multiPosto: boolean;
  parse: (arq: ArquivoEntrada) => LinhaTransacao[] | Promise<LinhaTransacao[]>;
};

export const PARSERS: Record<string, DefinicaoAdquirente> = {
  CIELO: { nomeExibicao: "CIELO", multiPosto: false, parse: parseCielo },
  STONE: { nomeExibicao: "STONE", multiPosto: true, parse: parseStone },
  REDECARD: { nomeExibicao: "REDE", multiPosto: false, parse: parseRedecard },
  GETNET: { nomeExibicao: "GETNET", multiPosto: false, parse: parseGetnet },
  PAGSEGURO: { nomeExibicao: "PAGSEGURO", multiPosto: false, parse: parsePagseguro },
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
];

export function detectarAdquirente(nomeArquivo: string): keyof typeof PARSERS | null {
  const nome = nomeArquivo.toUpperCase();
  for (const [chave, valor] of DETECCAO) {
    if (nome.includes(chave)) return valor;
  }
  return null;
}
