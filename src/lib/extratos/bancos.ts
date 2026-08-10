// Mapeamento entre o campo "Código do arquivo" de um Banco (Cadastros) e o
// conjunto de regras de categorização certo (categorizer.ts). A leitura do
// arquivo em si é sempre via OFX (parsers/ofx.ts), igual pra qualquer banco
// — isso aqui só decide QUAIS regras de regex aplicar sobre a descrição do
// lançamento pra sugerir categoria automaticamente.

// Identificador interno de cada conjunto de regras — estável mesmo que a
// usuária renomeie o campo "Código do arquivo" do banco em Cadastros.
export type CodigoParser = "BRADESCO" | "PAGSEGURO" | "BANCO_DO_BRASIL" | "ITAU" | "STONE" | "SANTANDER";

// Vários apelidos possíveis pro mesmo banco — cobre tanto o valor semeado
// originalmente (BancoDoBrasil, Conta3036) quanto o que a usuária já ajustou
// via Cadastros > Bancos (BB, Itau). "Conta3036" era o rótulo provisório da
// agência 3036 (posto Paineira), confirmado depois como Itaú.
const ALIASES: Record<string, CodigoParser> = {
  bradesco: "BRADESCO",
  pagseguro: "PAGSEGURO",
  bb: "BANCO_DO_BRASIL",
  bancodobrasil: "BANCO_DO_BRASIL",
  "banco do brasil": "BANCO_DO_BRASIL",
  itau: "ITAU",
  conta3036: "ITAU",
  stone: "STONE",
  santander: "SANTANDER",
};

// Faixa Unicode dos diacríticos combinantes (0x0300–0x036f) — construída por
// código de ponto em vez de literal na regex pra não depender de como o
// editor/terminal trata o caractere combinante bruto.
const INICIO_DIACRITICOS = String.fromCodePoint(0x0300);
const FIM_DIACRITICOS = String.fromCodePoint(0x036f);
const REGEX_ACENTOS = new RegExp(`[${INICIO_DIACRITICOS}-${FIM_DIACRITICOS}]`, "g");

// Normaliza pra comparar sem se importar com acento/caixa: remove diacríticos
// via decomposição Unicode (NFD) antes de comparar (ex: "Itaú" -> "itau").
function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(REGEX_ACENTOS, "");
}

export function normalizarCodigoBanco(codigoArquivo: string | null | undefined): CodigoParser | null {
  if (!codigoArquivo) return null;
  return ALIASES[normalizar(codigoArquivo)] ?? null;
}
