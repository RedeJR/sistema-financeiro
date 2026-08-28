import { Prisma } from "@/generated/prisma/client";

// Estado devolvido pelas Server Actions de criar/editar, consumido via
// useActionState nos formulários. `null` = sem erro (sucesso segue com
// redirect, então nem chega a renderizar de novo com esse estado).
// `values` carrega de volta o que a usuária tinha digitado, pra não perder
// o preenchimento quando a validação falha.
export type ActionState = { error: string; values?: Record<string, string> } | null;

// Lê os campos de um FormData como um objeto simples de strings, pra devolver
// junto do erro de validação (ver `values` acima).
export function valoresDoFormulario(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (typeof valor === "string") valores[chave] = valor;
  }
  return valores;
}

export function isUniqueConstraintError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

// Quais colunas bateram na constraint única, pra distinguir "nome duplicado"
// de "CNPJ duplicado" num model com mais de um campo @unique (ver Posto).
// Prisma 7 com driver adapter (@prisma/adapter-pg) não preenche mais
// `meta.target` como nas versões antigas — o nome da coluna vem embrulhado
// em `meta.driverAdapterError.cause.constraint.fields` (confirmado testando
// direto contra o Postgres; ver prisma/temp-debug-unique.ts no histórico).
// Checa os dois formatos pra não quebrar se isso mudar de novo.
export function camposUniqueViolados(e: unknown): string[] {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return [];
  const meta = e.meta as Record<string, unknown> | undefined;
  const alvo = meta?.target;
  if (Array.isArray(alvo)) return alvo.map(String);
  if (typeof alvo === "string") return [alvo];
  const driverError = meta?.driverAdapterError as Record<string, unknown> | undefined;
  const cause = driverError?.cause as Record<string, unknown> | undefined;
  const constraint = cause?.constraint as Record<string, unknown> | undefined;
  const campos = constraint?.fields;
  return Array.isArray(campos) ? campos.map(String) : [];
}

export function isForeignKeyConstraintError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003"
  );
}
