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
  fornecedorId?: string | string[];
  planoContaId?: string | string[];
  de?: string;
  ate?: string;
  ordem?: string; // "vencimento" (padrão) | "planoConta"
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
    ...(postoIds.length ? { postoId: { in: postoIds } } : {}),
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
  };

  return prisma.contaAPagar.findMany({
    where,
    include: {
      posto: true,
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
