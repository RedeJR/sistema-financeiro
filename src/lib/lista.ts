// Ordenação por cabeçalho + paginação das listas (Conferência Diária, Contas a
// Pagar, Combustíveis a Pagar...). Tudo vem pela URL (?ordem=&dir=&pagina=&porPagina=)
// pra funcionar com a página renderizada no servidor e dar pra mandar o link filtrado.

export const OPCOES_POR_PAGINA = [10, 25, 50] as const;
export const POR_PAGINA_PADRAO = 25;

export type ParamsLista = { ordem?: string; dir?: string; pagina?: string; porPagina?: string };
export type Direcao = "asc" | "desc";

export type EstadoLista = { ordem: string; dir: Direcao; pagina: number; porPagina: number };

export function lerParamsLista(p: ParamsLista, padrao: { ordem: string; dir: Direcao }, ordensValidas: string[]): EstadoLista {
  const ordem = p.ordem && ordensValidas.includes(p.ordem) ? p.ordem : padrao.ordem;
  const dir: Direcao = p.dir === "asc" || p.dir === "desc" ? p.dir : padrao.dir;
  const porPaginaPedido = Number(p.porPagina);
  const porPagina = (OPCOES_POR_PAGINA as readonly number[]).includes(porPaginaPedido) ? porPaginaPedido : POR_PAGINA_PADRAO;
  const pagina = Math.max(1, Math.floor(Number(p.pagina)) || 1);
  return { ordem, dir, pagina, porPagina };
}

type Valor = string | number | Date | null | undefined;

function comparar(a: Valor, b: Valor): number {
  // Vazio sempre por último, em qualquer direção (resolvido por quem chama).
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { sensitivity: "base", numeric: true });
}

// Ordena uma cópia: texto em ordem alfabética, datas da mais antiga pra mais
// nova, números do menor pro maior (asc); desc inverte. Empate cai na ordem original.
export function ordenar<T>(itens: T[], ordem: string, dir: Direcao, acessores: Record<string, (t: T) => Valor>): T[] {
  const get = acessores[ordem];
  if (!get) return itens;
  const sinal = dir === "asc" ? 1 : -1;
  return itens
    .map((item, i) => ({ item, i }))
    .sort((x, y) => {
      const vx = get(x.item);
      const vy = get(y.item);
      const vazioX = vx === null || vx === undefined || vx === "";
      const vazioY = vy === null || vy === undefined || vy === "";
      if (vazioX !== vazioY) return vazioX ? 1 : -1;
      const c = comparar(vx, vy) * sinal;
      return c !== 0 ? c : x.i - y.i;
    })
    .map((x) => x.item);
}

export function paginar<T>(itens: T[], pagina: number, porPagina: number) {
  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(pagina, totalPaginas);
  const inicio = (atual - 1) * porPagina;
  return { itens: itens.slice(inicio, inicio + porPagina), total, totalPaginas, pagina: atual, inicio };
}

// Monta a URL da própria página com os filtros atuais (qs) e as mudanças pedidas.
export function hrefLista(base: string, qs: string, mudar: Record<string, string | undefined>): string {
  const params = new URLSearchParams(qs);
  for (const [k, v] of Object.entries(mudar)) {
    params.delete(k);
    if (v !== undefined && v !== "") params.set(k, v);
  }
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}
