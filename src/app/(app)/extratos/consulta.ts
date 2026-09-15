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

// Pagina por DIA, não por lançamento — as duas telas que consomem isso
// (resumo e edição) agrupam por dia (resumo: dia+posto+banco; edição: só
// dia) e mostram um subtotal por bloco. Paginar por linha crua cortava um
// dia ao meio sempre que ele tivesse mais lançamentos que o tamanho da
// página — real e não hipotético: um extrato do PagSeguro não agrupa
// vendas (uma linha por venda), e um único dia chegou a ter 358 lançamentos
// pra um posto só, muito acima do antigo limite de 150. O resultado era um
// bloco de dia aparecendo TRUNCADO na página 1 (subtotal errado, contagem
// errada) e "continuando" sem aviso nenhum na página 2. Um dia inteiro,
// por maior que seja, cabe sempre por completo numa única página agora.
export const DIAS_POR_PAGINA = 5;

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

// Categorias em que a Observação deixa de ser opcional: "Outros" nunca
// explica sozinho o que é o lançamento, e "Venda a Prazo" precisa dizer
// pra quem/o quê foi vendido — quem for conciliar depois não tem como
// adivinhar. Mesmo tratamento de lembrete que "sem categoria" já tem (ver
// SEM_CATEGORIA_DE_VERDADE), só que aqui o gatilho é ter a categoria certa
// só que faltando o texto obrigatório.
const CATEGORIAS_DESCRICAO_OBRIGATORIA = ["OUTROS", "VENDA A PRAZO"];

// Casa tanto o lançamento inteiro (categoria direta + observacao vazia)
// quanto uma das partes de um dividido (ver LancamentoExtratoDivisao) —
// mesma dualidade do filtro por categoria normal (comentário em
// somarValorFiltrado). Embrulhado em AND: [...] (não um "OR" solto no nível
// raiz) de propósito — where já pode ter sua própria chave "OR" quando um
// filtro de categoria normal está ativo, e um segundo "OR" no mesmo objeto
// se sobrescreveria (spread de objeto, chave duplicada).
const SEM_DESCRICAO_OBRIGATORIA: Prisma.LancamentoExtratoWhereInput = {
  AND: [
    {
      OR: [
        {
          categoria: { nome: { in: CATEGORIAS_DESCRICAO_OBRIGATORIA } },
          divisoes: { none: {} },
          OR: [{ observacao: null }, { observacao: "" }],
        },
        {
          divisoes: {
            some: {
              categoria: { nome: { in: CATEGORIAS_DESCRICAO_OBRIGATORIA } },
              OR: [{ observacao: null }, { observacao: "" }],
            },
          },
        },
      ],
    },
  ],
};

function whereDosFiltros(filtros: FiltrosExtratos) {
  const { postoId, bancoId, categoria, de, ate, arquivo } = filtros;

  const where: Prisma.LancamentoExtratoWhereInput = {};

  if (postoId) where.postoId = postoId;
  if (bancoId) where.bancoId = bancoId;
  if (categoria === "sem") Object.assign(where, SEM_CATEGORIA_DE_VERDADE);
  else if (categoria === "sem-descricao") Object.assign(where, SEM_DESCRICAO_OBRIGATORIA);
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
  if (!categoriaFiltro || categoriaFiltro === "sem" || categoriaFiltro === "sem-descricao") {
    // "sem-descricao" não é uma categoria única pra fatiar dividido — o
    // que importa aqui é o lançamento INTEIRO (a pessoa que for revisar
    // precisa ver o valor todo pra saber do que se trata), então soma
    // direto como no "sem categoria".
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

  // Dias distintos que batem no filtro, mais recente primeiro — a página é
  // uma fatia DESSA lista (ver DIAS_POR_PAGINA), não da lista de lançamentos.
  const diasDistintos = await prisma.lancamentoExtrato.findMany({
    where,
    distinct: ["data"],
    select: { data: true },
    orderBy: { data: "desc" },
  });
  const totalDias = diasDistintos.length;
  const totalPaginas = Math.max(1, Math.ceil(totalDias / DIAS_POR_PAGINA));
  const diasDaPagina = diasDistintos
    .slice((pagina - 1) * DIAS_POR_PAGINA, pagina * DIAS_POR_PAGINA)
    .map((d) => d.data);

  const [total, totalSemCategoria, totalSemDescricaoObrigatoria, somaValor, lancamentos] = await Promise.all([
    prisma.lancamentoExtrato.count({ where }),
    prisma.lancamentoExtrato.count({ where: { ...where, ...SEM_CATEGORIA_DE_VERDADE } }),
    prisma.lancamentoExtrato.count({ where: { ...where, ...SEM_DESCRICAO_OBRIGATORIA } }),
    somarValorFiltrado(where, filtros.categoria),
    // Sem skip/take: busca TODOS os lançamentos dos dias dessa página, por
    // maior que seja um dia específico — é exatamente o que evita a
    // fragmentação (ver comentário em DIAS_POR_PAGINA).
    prisma.lancamentoExtrato.findMany({
      where: { ...where, data: { in: diasDaPagina } },
      include: {
        posto: true,
        banco: true,
        categoria: true,
        divisoes: { include: { categoria: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  return {
    lancamentos,
    total,
    totalSemCategoria,
    totalSemDescricaoObrigatoria,
    somaValor,
    pagina,
    totalPaginas,
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
