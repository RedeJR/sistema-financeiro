// Filtro de múltipla escolha vindo da URL (?postoId=a&postoId=b): o Next
// entrega string quando tem um valor só e string[] quando tem vários — esses
// helpers normalizam pra sempre lista, pra cada tela não reescrever isso.
export function paraLista(v?: string | string[] | null): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

// Condição de where do Prisma: vazio = sem filtro (nada no objeto).
export function emLista(campo: string, ids: string[]): Record<string, { in: string[] }> {
  return ids.length > 0 ? { [campo]: { in: ids } } : {};
}

// Monta a query string repetindo a chave pra cada valor (?k=a&k=b).
export function anexarLista(qs: URLSearchParams, chave: string, ids: string[]): void {
  for (const id of ids) qs.append(chave, id);
}
