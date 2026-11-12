// Conversão entre o formato brasileiro (1.234,56) digitado nos formulários e
// o formato que o Postgres/Prisma Decimal aceita (string "1234.56").

export function paraDecimalString(valorBR: string): string | null {
  // Sem vírgula e com ponto seguido de 1 ou 2 dígitos ("82.26") é decimal no formato do banco de dados, não
  // separador de milhar (que sempre tem 3 dígitos). Sem isso o valor virava 8226 — 100x maior — sem aviso.
  if (/^-?\d+\.\d{1,2}$/.test(valorBR.trim())) return valorBR.trim();
  const limpo = valorBR
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (limpo === "" || Number.isNaN(Number(limpo))) return null;
  return limpo;
}

export function formatarMoeda(valor: string | number): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
