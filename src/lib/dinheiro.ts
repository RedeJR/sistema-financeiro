// Conversão entre o formato brasileiro (1.234,56) digitado nos formulários e
// o formato que o Postgres/Prisma Decimal aceita (string "1234.56").

export function paraDecimalString(valorBR: string): string | null {
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
