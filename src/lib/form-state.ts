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

export function isForeignKeyConstraintError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003"
  );
}
