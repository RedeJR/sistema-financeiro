// Parser universal de extrato bancário no formato OFX (Open Financial
// Exchange) — todo banco brasileiro relevante oferece exportação nesse
// formato, então um único parser cobre todos, em vez de um por banco/layout
// (que se mostrou frágil: cada exportação de CSV/XLSX tem variações sutis
// que quebram o parsing).
//
// OFX tem duas variações na prática:
//   - OFX 1.x (SGML): tags de valor "folha" não são fechadas
//     (<TRNAMT>-15.50 sem </TRNAMT>), só containers são (<STMTTRN>...</STMTTRN>).
//   - OFX 2.x (XML): tudo devidamente fechado.
// Em vez de tentar parsear como XML de verdade (que quebraria no formato
// 1.x), extrai por regex: acha os blocos <STMTTRN>...</STMTTRN> (sempre
// fechado nas duas variações) e, dentro de cada um, pega o valor de cada
// campo como "tudo entre <TAG> e o próximo <" — funciona igual nas duas
// variações, sem precisar normalizar nada.
import type { LancamentoParseado, ParserBanco } from "../tipos";

// Detecta o encoding pelo cabeçalho OFX (SGML 1.x: CHARSET:1252/8859-1;
// XML 2.x: atributo encoding= na declaração <?xml ...?>). Sem declaração
// reconhecida, assume utf-8 — e troca pra latin1 se a decodificação utf-8
// vier com caractere de substituição (sinal de que não era utf-8 de verdade).
function detectarEncoding(buffer: Buffer): "utf-8" | "latin1" {
  const inicio = buffer.subarray(0, 512).toString("ascii");
  const charset = inicio.match(/CHARSET:\s*([\w-]+)/i)?.[1];
  const encodingXml = inicio.match(/encoding=["']([\w-]+)["']/i)?.[1];
  const declarado = (charset ?? encodingXml ?? "").toUpperCase();
  if (declarado.includes("1252") || declarado.includes("8859") || declarado === "LATIN1") {
    return "latin1";
  }
  return "utf-8";
}

// Assinatura de "mojibake" de UTF-8 lido como latin1: todo caractere
// acentuado de português vira "Ã" (U+00C3, primeiro byte de qualquer par
// UTF-8 começando com "Ã" ou "Â") seguido de um caractere no intervalo
// U+0080-U+00BF (o segundo byte do par, também sempre nesse intervalo).
// Escrito via charCodeAt (não uma classe de caracteres com um caractere de
// controle literal U+0080 dentro dela) — mais claro e evita esse tipo de
// caractere invisível ficando escondido no arquivo/diff.
const RE_MOJIBAKE = new RegExp(`[ÃÂ][${String.fromCharCode(0x80)}-${String.fromCharCode(0xbf)}]`);

// Alguns bancos (visto no Stone — 0% das descrições batendo com regra
// nenhuma — e um pouco no Itaú) declaram um encoding errado no cabeçalho do
// OFX (CHARSET 1252/8859-1) quando o arquivo foi escrito em UTF-8 de
// verdade. Decodificar como o cabeçalho manda produz "mojibake" sem gerar
// o caractere de substituição "�" que detectarEncoding/bufferParaTexto já
// sabem reconhecer (todo byte é "válido" em latin1, só vira o caractere
// errado) — ex: "TransferÃªncia" em vez de "Transferência". Isso nunca bate
// com os acentos certos das regras de categorizer.ts, e é provavelmente a
// causa raiz de tanto lançamento ter precisado de categorização manual.
// Detecta a assinatura desse padrão e re-decodifica certo, independente do
// que o cabeçalho declarou.
function corrigirMojibake(texto: string): string {
  if (!RE_MOJIBAKE.test(texto)) return texto;
  try {
    const corrigido = Buffer.from(texto, "latin1").toString("utf-8");
    if (!corrigido.includes("�")) return corrigido;
  } catch {
    // Não decodificou — segue com o texto original abaixo.
  }
  return texto;
}

function bufferParaTexto(buffer: Buffer): string {
  const encoding = detectarEncoding(buffer);
  const texto = buffer.toString(encoding);
  if (encoding === "utf-8" && texto.includes("�")) {
    return corrigirMojibake(buffer.toString("latin1"));
  }
  return corrigirMojibake(texto);
}

function extrairBlocos(texto: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  const blocos: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) blocos.push(m[1]);
  return blocos;
}

function extrairCampo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>([^<]*)`, "i"));
  return m ? m[1].trim() : null;
}

// "20260801120000[-3:BRT]" ou só "20260801" -> Date em meia-noite UTC.
function parseDataOfx(dtposted: string): Date | null {
  const digitos = dtposted.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!digitos) return null;
  const [, ano, mes, dia] = digitos;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

// O padrão OFX manda TRNAMT com ponto decimal ("-15.50"), mas na prática
// banco brasileiro (ex: Bradesco) exporta com vírgula ("3363,90") — fora do
// spec, mas é o que o arquivo real tem. Se tiver vírgula, trata como decimal
// BR (ponto vira separador de milhar, removido antes); senão usa como veio.
function parseValorOfx(trnamt: string): number {
  let s = trnamt.trim();
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return Number(s);
}

export const parseOfx: ParserBanco = async (buffer) => {
  const texto = bufferParaTexto(buffer);
  const blocos = extrairBlocos(texto, "STMTTRN");

  const out: LancamentoParseado[] = [];
  for (const bloco of blocos) {
    const dtposted = extrairCampo(bloco, "DTPOSTED");
    const trnamt = extrairCampo(bloco, "TRNAMT");
    if (!dtposted || !trnamt) continue;

    const data = parseDataOfx(dtposted);
    const valor = parseValorOfx(trnamt);
    if (!data || Number.isNaN(valor)) continue;

    const name = extrairCampo(bloco, "NAME");
    const memo = extrairCampo(bloco, "MEMO");
    const descricao =
      name && memo && name !== memo
        ? `${name} - ${memo}`
        : name || memo || "(sem descrição)";

    // `<FITID></FITID>` (tag presente, vazia) é comum em linha de saldo — o
    // banco não dá um id de transação porque não é uma transação de
    // verdade. Trata como ausente (undefined), não como string vazia — uma
    // string vazia colidiria com outra na constraint de unicidade.
    const fitidBruto = extrairCampo(bloco, "FITID");
    const fitid = fitidBruto ? fitidBruto : undefined;

    // Linha de saldo (ex: Banco do Brasil manda "Saldo Anterior"/"Saldo do
    // dia" como se fossem STMTTRN): sem FITID de verdade e valor zerado —
    // não é lançamento nenhum, só um marcador de conferência de saldo.
    const linhaControle = !fitid && valor === 0;

    out.push({
      data,
      descricao,
      valor,
      saldoExtrato: null, // OFX não traz saldo por lançamento, só do período
      linhaControle,
      fitid,
    });
  }

  return out;
};
