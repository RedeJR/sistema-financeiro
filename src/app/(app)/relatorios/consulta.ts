import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export type FiltrosRelatorio = {
  // "PAGA" e/ou "A_PAGAR" — repete a chave na URL pra mais de um (Next
  // entrega como array automaticamente, mesmo padrão de "arquivo" em
  // extratos/consulta.ts). "statusEnviado" é um marcador oculto do form:
  // sem ele, ausência de "status" = formulário nunca enviado = mostra tudo;
  // com ele presente e "status" ausente = usuária desmarcou as duas caixas
  // de propósito = não mostra nada (ver buscarRelatorio).
  status?: string | string[];
  statusEnviado?: string;
  postoId?: string | string[];
  // "1" = filtra pelo posto PAGADOR (postoPagamentoId ?? postoId); ausente
  // = filtra pelo posto DONO da despesa (postoId puro). Cada tela que chama
  // buscarRelatorio decide seu próprio padrão passando esse campo explícito
  // — Relatórios sempre manda "1" (mantém o comportamento de sempre); Contas
  // Pagas manda o que vier do checkbox "Pagador" (padrão: dono da despesa,
  // pedido explícito da usuária, só nessa tela).
  postoPagador?: string;
  fornecedorId?: string | string[];
  planoContaId?: string | string[];
  de?: string; // vencimento de
  ate?: string; // vencimento até
  pagde?: string; // data de pagamento de
  pagate?: string; // data de pagamento até
  // Agrupamento em até dois níveis: "ordem" é o 1º, "ordem2" o 2º (vazio = só um nível). Valores: ver Dimensao.
  ordem?: string;
  ordem2?: string;
};

export async function buscarRelatorio(filtros: FiltrosRelatorio) {
  const statusArr = paraArray(filtros.status);
  const postoIds = paraArray(filtros.postoId);
  const fornecedorIds = paraArray(filtros.fornecedorId);
  const planoContaIds = paraArray(filtros.planoContaId);

  // undefined = sem filtro de paga/não paga (mostra as duas situações).
  // true/false = só uma das duas marcada. Ver comentário no tipo acima pro
  // caso das duas desmarcadas.
  let filtroPaga: boolean | undefined;
  if (filtros.statusEnviado && statusArr.length === 0) {
    // desmarcou as duas de propósito — nenhum resultado bate.
    return [];
  }
  if (statusArr.length === 1) {
    filtroPaga = statusArr[0] === "PAGA";
  }

  const where: Prisma.ContaAPagarWhereInput = {
    // Combustível é aba própria (Combustíveis a Pagar), com fluxo e
    // relatório próprios — mesmo escopo que Contas a Pagar e Despesas
    // Pagas já excluem em toda a tela.
    combustivel: false,
    ...(filtroPaga !== undefined ? { paga: filtroPaga } : {}),
    // Pagador (postoPagador="1"): mesmo motivo do comentário no topo de
    // src/lib/conciliacao.ts — filtrar pela OLIVEIRA tem que trazer as
    // despesas de outros postos que ela pagou, não só as que são dela
    // mesma. postoPagamentoId null conta como "pago pelo próprio posto da
    // conta". Dono (padrão): filtra só pelo postoId puro, ignora quem
    // pagou.
    ...(postoIds.length
      ? filtros.postoPagador === "1"
        ? { OR: [{ postoPagamentoId: { in: postoIds } }, { postoPagamentoId: null, postoId: { in: postoIds } }] }
        : { postoId: { in: postoIds } }
      : {}),
    ...(fornecedorIds.length ? { fornecedorId: { in: fornecedorIds } } : {}),
    ...(planoContaIds.length ? { planoContaId: { in: planoContaIds } } : {}),
    ...(filtros.de || filtros.ate
      ? {
          dataVencimento: {
            ...(filtros.de ? { gte: dataUTC(filtros.de) } : {}),
            ...(filtros.ate ? { lte: dataUTC(filtros.ate) } : {}),
          },
        }
      : {}),
    ...(filtros.pagde || filtros.pagate
      ? {
          dataPagamento: {
            ...(filtros.pagde ? { gte: dataUTC(filtros.pagde) } : {}),
            ...(filtros.pagate ? { lte: dataUTC(filtros.pagate) } : {}),
          },
        }
      : {}),
  };

  return prisma.contaAPagar.findMany({
    where,
    include: {
      posto: true,
      // Posto que efetivamente pagou, quando diferente do dono — ver
      // ContaAPagar.postoPagamentoId.
      postoPagamento: true,
      fornecedor: true,
      planoConta: { include: { grupo: true } },
      bancoPagamento: true,
    },
    orderBy: [{ dataVencimento: "asc" }, { posto: { nome: "asc" } }],
  });
}

export type LinhaRelatorio = Awaited<ReturnType<typeof buscarRelatorio>>[number];

export type GrupoRelatorio = {
  chave: string;
  titulo: string;
  subtitulo?: string;
  ordem: number;
  linhas: LinhaRelatorio[];
  total: number;
};

function formatarDataGrupo(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function agruparPorVencimento(linhas: LinhaRelatorio[]): GrupoRelatorio[] {
  const porData = new Map<string, GrupoRelatorio>();
  for (const l of linhas) {
    const chave = l.dataVencimento.toISOString();
    let g = porData.get(chave);
    if (!g) {
      g = { chave, titulo: formatarDataGrupo(l.dataVencimento), ordem: l.dataVencimento.getTime(), linhas: [], total: 0 };
      porData.set(chave, g);
    }
    g.linhas.push(l);
    g.total += Number(l.valor);
  }
  return [...porData.values()].sort((a, b) => a.ordem - b.ordem);
}

export function agruparPorPlanoConta(linhas: LinhaRelatorio[]): GrupoRelatorio[] {
  const porPlano = new Map<string, GrupoRelatorio>();
  for (const l of linhas) {
    const chave = l.planoContaId;
    let g = porPlano.get(chave);
    if (!g) {
      g = {
        chave,
        titulo: l.planoConta.nome,
        subtitulo: l.planoConta.grupo.nome,
        ordem: l.planoConta.grupo.ordem,
        linhas: [],
        total: 0,
      };
      porPlano.set(chave, g);
    }
    g.linhas.push(l);
    g.total += Number(l.valor);
  }
  const grupos = [...porPlano.values()];
  for (const g of grupos) g.linhas.sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
  return grupos.sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo));
}

// ---------------------------------------------------------------------------------------------------
// Agrupamento em até dois níveis (ex.: Posto > Plano de contas). Usado por Relatórios e Contas Pagas.
// ---------------------------------------------------------------------------------------------------
export type Dimensao = "vencimento" | "pagamento" | "planoConta" | "posto";

export const DIMENSOES: { valor: Dimensao; rotulo: string }[] = [
  { valor: "vencimento", rotulo: "Vencimento (por data)" },
  { valor: "pagamento", rotulo: "Pagamento (por data paga)" },
  { valor: "planoConta", rotulo: "Plano de contas" },
  { valor: "posto", rotulo: "Posto (quem pagou)" },
];

export function dimensaoDe(v: string | undefined): Dimensao | null {
  return DIMENSOES.find((d) => d.valor === v)?.valor ?? null;
}

export type NoRelatorio = {
  chave: string;
  titulo: string;
  subtitulo?: string;
  quantidade: number;
  total: number;
  filhos: NoRelatorio[]; // preenchido quando há um nível abaixo
  linhas: LinhaRelatorio[]; // preenchido só no último nível
};

type ChaveGrupo = { chave: string; titulo: string; subtitulo?: string; ordem: number };

function chaveDaDimensao(l: LinhaRelatorio, dim: Dimensao): ChaveGrupo {
  switch (dim) {
    case "vencimento":
      return { chave: l.dataVencimento.toISOString(), titulo: `Vencimento: ${formatarDataGrupo(l.dataVencimento)}`, ordem: l.dataVencimento.getTime() };
    case "pagamento":
      return l.dataPagamento
        ? { chave: l.dataPagamento.toISOString(), titulo: `Pagamento: ${formatarDataGrupo(l.dataPagamento)}`, ordem: l.dataPagamento.getTime() }
        : { chave: "sem-pagamento", titulo: "Sem pagamento (a pagar)", ordem: Number.MAX_SAFE_INTEGER };
    case "planoConta":
      return { chave: l.planoContaId, titulo: l.planoConta.nome, subtitulo: l.planoConta.grupo.nome, ordem: l.planoConta.grupo.ordem };
    case "posto": {
      const pagador = l.postoPagamento ?? l.posto;
      return { chave: pagador.id, titulo: pagador.nome, ordem: 0 };
    }
  }
}

export function agruparEm(linhas: LinhaRelatorio[], dims: Dimensao[]): NoRelatorio[] {
  if (dims.length === 0) return [];
  const [dim, ...resto] = dims;
  const mapa = new Map<string, { k: ChaveGrupo; linhas: LinhaRelatorio[] }>();
  for (const l of linhas) {
    const k = chaveDaDimensao(l, dim);
    const g = mapa.get(k.chave);
    if (g) g.linhas.push(l);
    else mapa.set(k.chave, { k, linhas: [l] });
  }
  return [...mapa.values()]
    .sort((a, b) => a.k.ordem - b.k.ordem || a.k.titulo.localeCompare(b.k.titulo))
    .map(({ k, linhas: ls }) => {
      const ordenadas = [...ls].sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
      return {
        chave: k.chave,
        titulo: k.titulo,
        subtitulo: k.subtitulo,
        quantidade: ls.length,
        total: ls.reduce((s, l) => s + Number(l.valor), 0),
        filhos: resto.length ? agruparEm(ordenadas, resto) : [],
        linhas: resto.length ? [] : ordenadas,
      };
    });
}

// Agrupa pelo posto PAGADOR (postoPagamentoId ?? postoId), não pelo dono da
// despesa — mesmo critério do filtro em buscarRelatorio acima. Pedido da
// usuária: relatório "da OLIVEIRA" precisa reunir tudo que ela pagou, ainda
// que a despesa em si seja de outro posto (aparece como nota em cada linha,
// ver page.tsx).
export function agruparPorPosto(linhas: LinhaRelatorio[]): GrupoRelatorio[] {
  const porPosto = new Map<string, GrupoRelatorio>();
  for (const l of linhas) {
    const pagador = l.postoPagamento ?? l.posto;
    const chave = pagador.id;
    let g = porPosto.get(chave);
    if (!g) {
      g = { chave, titulo: pagador.nome, ordem: 0, linhas: [], total: 0 };
      porPosto.set(chave, g);
    }
    g.linhas.push(l);
    g.total += Number(l.valor);
  }
  const grupos = [...porPosto.values()];
  for (const g of grupos) g.linhas.sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());
  return grupos.sort((a, b) => a.titulo.localeCompare(b.titulo));
}
