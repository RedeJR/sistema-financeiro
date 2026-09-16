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

// Avança `dias` dias ÚTEIS a partir de `data` (pula sábado/domingo) — usado
// quando a data de pagamento não vem explícita no arquivo e precisa ser
// inferida a partir da modalidade (Pix D+0, Débito D+1, Crédito D+2 etc.).
export function proximoDiaUtil(data: Date, dias: number): Date {
  const resultado = new Date(data);
  let restantes = dias;
  while (restantes > 0) {
    resultado.setUTCDate(resultado.getUTCDate() + 1);
    const diaSemana = resultado.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
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
