// Port fiel de `_brl_to_float` em conciliador/parsers.py: converte um valor
// em formato brasileiro ("R$ 1.234,56", "-1.234,56", "1234,56") pra number.
// Retorna null quando não dá pra interpretar (célula vazia, texto etc).
export function brlParaNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  let s = String(valor).trim();
  if (s === "") return null;
  const negativo = s.startsWith("-");
  s = s.replace(/R\$/g, "").replace(/-/g, "").trim();
  s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  if (Number.isNaN(v)) return null;
  return negativo ? -v : v;
}

// Data "DD/MM/AAAA" (ou "DD/MM/AA", 2 dígitos de ano) -> meia-noite UTC.
export function dataBrParaUTC(dataStr: string, anoComDoisDigitos = false): Date {
  const [d, m, a] = dataStr.trim().split("/").map(Number);
  const ano = anoComDoisDigitos ? (a < 100 ? 2000 + a : a) : a;
  return new Date(Date.UTC(ano, m - 1, d));
}
