import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export type FiltrosExtratos = {
  postoId?: string;
  bancoId?: string;
  // "" ou ausente = todos; "sem" = só os sem categoria (revisão pendente);
  // caso contrário é o id da CategoriaExtrato.
  categoria?: string;
  de?: string;
  ate?: string;
  pagina?: string;
  // Nome(s) de arquivo — usado logo após importar, pra abrir a tela já
  // filtrada só nos lançamentos que acabaram de entrar (ver actions.ts).
  // Repete a chave "arquivo" na URL pra cada arquivo; Next entrega como
  // array quando tem mais de um.
  arquivo?: string | string[];
};

// Maior que o padrão de outras listas do sistema porque agora os
// lançamentos são agrupados por dia na tela — um valor baixo cortaria um
// dia ao meio entre duas páginas com mais frequência.
export const TAMANHO_PAGINA = 150;

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// "Sem categoria" de verdade: nem categoria direta, nem dividido em partes
// que já têm categoria (ver LancamentoExtratoDivisao) — um lançamento
// dividido tem categoriaId null no registro principal, mas NÃO está
// pendente de revisão.
const SEM_CATEGORIA_DE_VERDADE: Prisma.LancamentoExtratoWhereInput = {
  categoriaId: null,
  divisoes: { none: {} },
};

function whereDosFiltros(filtros: FiltrosExtratos) {
  const { postoId, bancoId, categoria, de, ate, arquivo } = filtros;

  const where: Prisma.LancamentoExtratoWhereInput = {};

  if (postoId) where.postoId = postoId;
  if (bancoId) where.bancoId = bancoId;
  if (categoria === "sem") Object.assign(where, SEM_CATEGORIA_DE_VERDADE);
  else if (categoria) {
    where.OR = [{ categoriaId: categoria }, { divisoes: { some: { categoriaId: categoria } } }];
  }
  if (de || ate) {
    where.data = {
      ...(de ? { gte: dataUTC(de) } : {}),
      ...(ate ? { lte: dataUTC(ate) } : {}),
    };
  }
  if (arquivo) {
    where.arquivoOrigem = Array.isArray(arquivo) ? { in: arquivo } : arquivo;
  }
  return where;
}

// Filtro por categoria específica (não "sem") casa um lançamento dividido
// pelo total dele mesmo quando só UMA das partes é da categoria filtrada
// (ver whereDosFiltros: `divisoes: { some: { categoriaId } }`). Um
// aggregate(_sum: valor) simples então soma o lançamento INTEIRO, não só a
// fatia que pertence à categoria — ficou visível pra usuária como "está
// somando errado" ao desmembrar um lançamento do Barramares. Busca os
// registros e soma na mão, pegando só a parte certa dos divididos.
async function somarValorFiltrado(
  where: Prisma.LancamentoExtratoWhereInput,
  categoriaFiltro: string | undefined
): Promise<number> {
  if (!categoriaFiltro || categoriaFiltro === "sem") {
    const agg = await prisma.lancamentoExtrato.aggregate({ where, _sum: { valor: true } });
    return Number(agg._sum.valor ?? 0);
  }
  const registros = await prisma.lancamentoExtrato.findMany({
    where,
    select: { valor: true, divisoes: { select: { valor: true, categoriaId: true } } },
  });
  let soma = 0;
  for (const r of registros) {
    if (r.divisoes.length > 0) {
      for (const d of r.divisoes) if (d.categoriaId === categoriaFiltro) soma += Number(d.valor);
    } else {
      soma += Number(r.valor);
    }
  }
  return soma;
}

export async function buscarLancamentosExtrato(filtros: FiltrosExtratos) {
  const where = whereDosFiltros(filtros);
  const pagina = Math.max(1, Number(filtros.pagina) || 1);

  const [total, totalSemCategoria, somaValor, lancamentos] = await Promise.all([
    prisma.lancamentoExtrato.count({ where }),
    prisma.lancamentoExtrato.count({ where: { ...where, ...SEM_CATEGORIA_DE_VERDADE } }),
    somarValorFiltrado(where, filtros.categoria),
    prisma.lancamentoExtrato.findMany({
      where,
      include: {
        posto: true,
        banco: true,
        categoria: true,
        divisoes: { include: { categoria: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      skip: (pagina - 1) * TAMANHO_PAGINA,
      take: TAMANHO_PAGINA,
    }),
  ]);

  return {
    lancamentos,
    total,
    totalSemCategoria,
    somaValor,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
  };
}

export type Lancamento = Awaited<ReturnType<typeof buscarLancamentosExtrato>>["lancamentos"][number];

function nomeComTipo(nome: string | undefined, tipoAdquirente: "DEBITO" | "CREDITO" | null): string {
  if (!nome) return "sem categoria";
  return `${nome}${tipoAdquirente ? ` ${tipoAdquirente === "DEBITO" ? "Déb." : "Créd."}` : ""}`;
}

// Um lançamento normal contribui uma vez, com a categoria/valor dele mesmo.
// Um lançamento DIVIDIDO (ver LancamentoExtratoDivisao) contribui uma vez
// POR PARTE, cada uma com sua própria categoria/valor — a soma das partes
// bate com o valor total do lançamento, então somar por categoria em cima
// disso (fechamento, subtotal por dia) continua fechando certo no total
// geral, só que agora distribuído nas categorias certas.
export function contribuicoesPorCategoria(
  l: Pick<Lancamento, "valor" | "categoria" | "tipoAdquirente" | "divisoes">
): { nome: string; valor: number }[] {
  if (l.divisoes.length > 0) {
    return l.divisoes.map((d) => ({
      nome: nomeComTipo(d.categoria?.nome, d.tipoAdquirente),
      valor: Number(d.valor),
    }));
  }
  return [{ nome: nomeComTipo(l.categoria?.nome, l.tipoAdquirente), valor: Number(l.valor) }];
}
