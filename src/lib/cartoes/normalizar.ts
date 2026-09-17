// Utilitários compartilhados pelos parsers de arquivo de adquirente
// (src/lib/cartoes/parsers/*) — decodificação de encoding, parsing de
// data/hora no formato brasileiro e cálculo de próximo dia útil (usado
// quando a adquirente não informa a data de pagamento explicitamente).

// A maioria dos arquivos de adquirente vem em UTF-8 (às vezes com BOM) ou
// Windows-1252 (Cielo, Getnet) — nunca latin-1 puro na prática observada.
// Estratégia: decodifica como UTF-8; se aparecer o caractere de substituição
// (sinal de bytes inválidos pra UTF-8), redecodifica como Windows-1252.
export function decodificarTexto(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }
  const comoUtf8 = buffer.toString("utf-8");
  if (comoUtf8.includes("�")) {
    return new TextDecoder("windows-1252").decode(buffer);
  }
  return comoUtf8;
}

export function dividirLinhasCsv(texto: string, separador = ";"): string[][] {
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(separador).map((c) => c.trim()));
}

function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
}

// Localiza coluna por nome tolerando acento (ex: a Stone já mandou
// "VALOR LIQUIDO" num export e "VALOR LÍQUIDO" noutro, mesmo relatório) —
// sem isso, a coluna "some" silenciosamente e o dado correspondente vira
// null/vazio pro arquivo inteiro sem nenhum erro visível.
export function criarBuscadorDeColuna(cabecalho: unknown[]) {
  const normalizado = cabecalho.map((c) => normalizarCabecalho(String(c ?? "")));
  return (nome: string) => normalizado.indexOf(normalizarCabecalho(nome));
}

// "01/09/2026" ou "01/09/2026 05:18" (com T ou espaço entre data e hora) →
// { data, hora }. `hora` fica "" quando o valor não traz horário.
export function paraDataHora(valor: unknown): { data: Date; hora: string } | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    // Vem de célula de planilha (exceljs já decodifica pra Date real).
    const iso = valor.toISOString();
    const hhmm = valor.getUTCHours() === 0 && valor.getUTCMinutes() === 0 ? "" : iso.slice(11, 16);
    return { data: new Date(iso.slice(0, 10) + "T00:00:00.000Z"), hora: hhmm };
  }
  const s = String(valor).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return {
    data: new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`),
    hora: hh && min ? `${hh}:${min}` : "",
  };
}

// Só a data, ignorando hora se vier junto (ex: coluna que mistura os dois).
export function paraData(valor: unknown): Date | null {
  return paraDataHora(valor)?.data ?? null;
}

// "05:18" (string simples, sem data junto) — usado quando data e hora vêm em
// colunas separadas no arquivo (ex: Cielo, Redecard). Aceita também um Date
// vindo de célula de planilha "só hora" — nesse caso o dia do Date é
// irrelevante (o Excel guarda como 1970-01-01 + horário), só a hora importa.
export function paraHoraSimples(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    const hh = String(valor.getUTCHours()).padStart(2, "0");
    const mm = String(valor.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(valor).trim();
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

// Valor monetário (aceita número já pronto, vindo de célula de planilha, ou
// texto) → string decimal pronta pro Prisma, ou null quando vazio/"-"/
// inválido. Diferente do paraDecimalString de src/lib/dinheiro.ts (que
// assume sempre formato BR digitado por usuária): aqui o texto vem de
// arquivo de adquirente, e cada uma usa uma convenção — a maioria formato
// BR ("1.234,56"), mas pelo menos a SAQPAY usa ponto decimal direto
// ("50.00", sem separador de milhar). Só remove pontos como separador de
// milhar quando aparece vírgula também (só aí um ponto pode ser milhar);
// sem vírgula, o texto já está pronto (ponto decimal ou inteiro puro).
export function paraValorDecimal(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor.toFixed(2) : null;
  let s = String(valor).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "nan") return null;
  s = s.replace(/[^\d,.-]/g, "");
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  return Number.isNaN(Number(s)) ? null : s;
}

// Mesma coisa, mas sempre positivo — usado pra taxa, que costuma vir negativa
// (valor descontado) nos relatórios das adquirentes.
export function paraValorAbsoluto(valor: unknown): string | null {
  const decimal = paraValorDecimal(valor);
  if (decimal === null) return null;
  return Math.abs(Number(decimal)).toFixed(2);
}

// Combina o identificador "cru" que a adquirente manda (NSU, código da
// venda, comprovante...) com data/hora/valor/modalidade antes de usar como
// chave de dedupe. Sozinho, esse identificador já se mostrou não-confiável
// em várias adquirentes (Stone, Getnet, Cielo): ou porque o terminal
// reinicia a numeração de tempos em tempos (mesmo número = vendas
// diferentes em dias diferentes), ou porque o arquivo passou pelo Excel e
// um número grande virou notação científica truncada (várias vendas reais
// colapsam no mesmo texto). Em ambos os casos, duas vendas DIFERENTES
// pareciam "duplicata" uma da outra e uma sumia sem aviso. Com
// data/hora/valor/modalidade no meio, só colide de verdade quando for
// mesmo a mesma venda.
//
// Normaliza bruto/valor ANTES de montar a string — sem isso, o mesmo
// relatório baixado em dias diferentes pode formatar o mesmo dado de jeito
// diferente (ex: comprovante "000020623" vs "20623", valor "100.00" vs
// "100") e o reenvio do mesmo arquivo duplica tudo por engano, mesmo sem
// nenhuma venda nova de verdade (já aconteceu 2x: migração de formato e
// comprovante da Getnet). Normalizar aqui dentro, e não em cada parser,
// garante que qualquer chamador (parser novo, script de migração) sempre
// produza o mesmo identificador pro mesmo dado, não importa como a string
// de entrada veio formatada.
function normalizarBruto(bruto: string): string {
  return /^\d+$/.test(bruto) ? String(Number(bruto)) : bruto;
}

export function identificadorComposto(
  bruto: string | null | undefined,
  dataVenda: Date,
  horaVenda: string,
  valorBruto: string,
  tipoVenda: string
): string {
  const brutoNormalizado = bruto ? normalizarBruto(bruto) : "";
  const valorNormalizado = Number(valorBruto).toFixed(2);
  return `${brutoNormalizado}|${dataVenda.toISOString()}|${horaVenda}|${valorNormalizado}|${tipoVenda}`;
}

// Classifica o texto livre de modalidade (ex: "Crédito À Vista", "Débito",
// "Crédito Parcelado 3x", "Debito Pre-pago", "Etanol Comum", "Online") no
// campo de TaxaCartao correspondente — usado pra saber qual taxa/prazo
// cadastrado comparar contra o que o arquivo trouxe (ver
// src/lib/cartoes/conferenciaTaxas.ts). Adquirentes "voucher" (SAQPAY, Sem
// Parar, Abastece Aí, Premmia) não têm essa distinção — a modalidade que
// aparece no arquivo delas é o tipo de combustível/canal, não forma de
// pagamento — e caem em DEBITO por convenção, já que é o único campo usado
// pra essas adquirentes no cadastro.
export type ModalidadeCartao = "DEBITO" | "CREDITO_VISTA" | "CREDITO_PARCELADO" | "CREDITO_PRE_PAGO" | "PIX";

// Só essas adquirentes (maquininha de verdade) cobram PIX como modalidade
// própria, com taxa/prazo cadastrados em separado — as "voucher" (SAQPAY,
// Sem Parar, Abastece Aí, Premmia) não, mesmo quando o texto da venda
// menciona "PIX" (ex: "Saque PIX" da SAQPAY é outra coisa, não uma venda
// PIX de maquininha — por isso o parâmetro adquirenteNome abaixo).
const ADQUIRENTES_COM_PIX_MODALIDADE = new Set(["CIELO", "CIELO TEF", "CIELO ALUGUEL", "PAGSEGURO", "REDE", "STONE", "GETNET"]);

export function classificarModalidade(tipoVenda: string, adquirenteNome: string): ModalidadeCartao {
  const t = tipoVenda.toLowerCase();
  if (t.includes("pix") && ADQUIRENTES_COM_PIX_MODALIDADE.has(adquirenteNome)) return "PIX";
  if (t.includes("parcel") || /\b[2-9]\d?\s*x\b/.test(t)) return "CREDITO_PARCELADO";
  // Checa débito ANTES de pré-pago: "Débito Pré-pago" (Stone, cartão
  // benefício usado como débito) precisa continuar caindo em DEBITO — só
  // "Crédito pré-pago" (Pagseguro, cartão de crédito recarregável) é uma
  // modalidade própria.
  if (t.includes("débito") || t.includes("debito")) return "DEBITO";
  if (
    (t.includes("crédito") || t.includes("credito")) &&
    (t.includes("pré pago") || t.includes("pré-pago") || t.includes("pre pago") || t.includes("pre-pago"))
  ) {
    return "CREDITO_PRE_PAGO";
  }
  if (t.includes("crédito") || t.includes("credito") || t.includes("credit")) return "CREDITO_VISTA";
  return "DEBITO";
}

// Taxa cobrada = bruto − líquido sempre que o líquido vier no arquivo — é o
// valor que realmente bate com o totalizador do relatório (algumas
// adquirentes têm coluna de taxa "pura" tipo MDR que não inclui antecipação/
// outros descontos, subestimando o total). Some parsers usam sempre isso;
// só cai pra coluna de taxa declarada quando o líquido não vem no arquivo.
export function calcularTaxaRs(valorBruto: string, valorLiquido: string | null, taxaColuna: string | null): string | null {
  if (valorLiquido !== null) {
    return Math.max(0, Number(valorBruto) - Number(valorLiquido)).toFixed(2);
  }
  return taxaColuna;
}

function ehFimDeSemana(data: Date): boolean {
  const dia = data.getUTCDay();
  return dia === 0 || dia === 6;
}

// Data da Páscoa (algoritmo de Meeus/Jones/Butcher) — base pra calcular os
// feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi).
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(data: Date, dias: number): Date {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

// Feriados NACIONAIS bancários — fixos + móveis. Não inclui feriado
// estadual/municipal nem ponto facultativo (só o que fecha banco no país
// inteiro), já que é isso que decide se o repasse cai ou não.
function feriadosNacionais(ano: number): Set<string> {
  const chave = (d: Date) => d.toISOString().slice(0, 10);
  const pascoa = calcularPascoa(ano);
  const datas = [
    new Date(Date.UTC(ano, 0, 1)), // Confraternização Universal
    somarDias(pascoa, -47), // Carnaval (segunda)
    somarDias(pascoa, -46), // Carnaval (terça)
    somarDias(pascoa, -2), // Sexta-feira Santa
    somarDias(pascoa, 60), // Corpus Christi
    new Date(Date.UTC(ano, 3, 21)), // Tiradentes
    new Date(Date.UTC(ano, 4, 1)), // Dia do Trabalho
    new Date(Date.UTC(ano, 8, 7)), // Independência
    new Date(Date.UTC(ano, 9, 12)), // Nossa Senhora Aparecida
    new Date(Date.UTC(ano, 10, 2)), // Finados
    new Date(Date.UTC(ano, 10, 15)), // Proclamação da República
    new Date(Date.UTC(ano, 10, 20)), // Consciência Negra (feriado nacional a partir de 2024)
    new Date(Date.UTC(ano, 11, 25)), // Natal
  ];
  return new Set(datas.map(chave));
}

const cacheFeriados = new Map<number, Set<string>>();
function ehFeriado(data: Date): boolean {
  const ano = data.getUTCFullYear();
  let feriados = cacheFeriados.get(ano);
  if (!feriados) {
    feriados = feriadosNacionais(ano);
    cacheFeriados.set(ano, feriados);
  }
  return feriados.has(data.toISOString().slice(0, 10));
}

export function ehDiaUtil(data: Date): boolean {
  return !ehFimDeSemana(data) && !ehFeriado(data);
}

// Avança `dias` dias ÚTEIS a partir de `data` (pula sábado/domingo/feriado
// nacional) — usado quando a data de pagamento não vem explícita no
// arquivo e precisa ser inferida a partir da modalidade (Pix D+0, Débito
// D+1, Crédito D+2 etc.).
export function proximoDiaUtil(data: Date, dias: number): Date {
  const resultado = new Date(data);
  let restantes = dias;
  while (restantes > 0) {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
    if (ehDiaUtil(resultado)) restantes--;
  }
  return resultado;
}

// Se `data` já é dia útil, devolve ela mesma; senão empurra pro próximo dia
// útil — usado quando uma data (não uma contagem de dias) precisa recair
// num dia em que o banco processa (ex: repasse previsto pro sábado cai de
// fato na segunda).
export function paraProximoDiaUtilSeNecessario(data: Date): Date {
  let resultado = new Date(data);
  while (!ehDiaUtil(resultado)) {
    resultado = somarDias(resultado, 1);
  }
  return resultado;
}

// Extrai dias de um texto livre de prazo ("D+1", "disponível em D+1",
// "31  dias", "recebimento pela bandeira") — null quando não reconhece.
export function prazoTextoParaDias(texto: unknown): number | null {
  if (!texto) return null;
  const t = String(texto).toLowerCase();
  const porD = t.match(/d\s*\+\s*(\d+)/);
  if (porD) return Number(porD[1]);
  const porDias = t.match(/(\d+)\s*dias?/);
  if (porDias) return Number(porDias[1]);
  return null;
}
