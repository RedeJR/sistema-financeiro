import "server-only";
import { prisma } from "@/lib/prisma";
import type { BandeiraCombustivel } from "@/generated/prisma/client";

// Conciliação da Bonificação Postecipada (ver model BonificacaoPostecipada): compara o valor que o
// posto tem a receber da distribuidora, num período, com o que realmente veio.
//  - IPIRANGA: o desconto vem no próprio boleto — soma do campo Desconto das contas de combustível
//    da Ipiranga, do posto, com vencimento dentro do período;
//  - VIBRA: o desconto vem por transferência na conta corrente — soma dos créditos da categoria de
//    extrato "BONIFICAÇÃO VIBRA" do posto, com data dentro do período;
//  - SHELL: ainda manual (sem conciliação automática).

export const NOME_CATEGORIA_VIBRA = "BONIFICAÇÃO VIBRA";
export const ROTULO_BANDEIRA: Record<BandeiraCombustivel, string> = { IPIRANGA: "Ipiranga", VIBRA: "Vibra", SHELL: "Shell" };

const TOLERANCIA = 0.05;

export type OrigemBonificacao = { data: Date; descricao: string; valor: number };
export type Situacao = "CONCILIADA" | "PARCIAL" | "A_RECEBER" | "ACIMA" | "MANUAL";

export type BonificacaoConciliada = {
  id: string;
  bandeira: BandeiraCombustivel;
  postoId: string;
  posto: string;
  periodoDe: Date;
  periodoAte: Date;
  esperado: number;
  recebido: number | null; // null = sem conciliação automática (Shell)
  diferenca: number | null; // recebido − esperado
  situacao: Situacao;
  observacao: string | null;
  origem: OrigemBonificacao[];
};

export function situacaoDe(esperado: number, recebido: number | null): Situacao {
  if (recebido === null) return "MANUAL";
  const dif = recebido - esperado;
  if (Math.abs(dif) <= TOLERANCIA) return "CONCILIADA";
  if (dif > 0) return "ACIMA";
  return recebido > TOLERANCIA ? "PARCIAL" : "A_RECEBER";
}

export async function conciliarBonificacoes(filtro: { postoIds?: string[]; bandeira?: BandeiraCombustivel; de?: Date; ate?: Date }): Promise<BonificacaoConciliada[]> {
  const itens = await prisma.bonificacaoPostecipada.findMany({
    where: {
      ...(filtro.postoIds?.length ? { postoId: { in: filtro.postoIds } } : {}),
      ...(filtro.bandeira ? { bandeira: filtro.bandeira } : {}),
      // período da bonificação que encosta no intervalo pedido
      ...(filtro.ate ? { periodoDe: { lte: filtro.ate } } : {}),
      ...(filtro.de ? { periodoAte: { gte: filtro.de } } : {}),
    },
    include: { posto: true },
    orderBy: [{ periodoDe: "desc" }, { posto: { nome: "asc" } }],
  });
  if (itens.length === 0) return [];

  const categoriaVibra = await prisma.categoriaExtrato.findUnique({ where: { nome: NOME_CATEGORIA_VIBRA } });

  return Promise.all(
    itens.map(async (b) => {
      let recebido: number | null = null;
      let origem: OrigemBonificacao[] = [];

      if (b.bandeira === "IPIRANGA") {
        const contas = await prisma.contaAPagar.findMany({
          where: {
            combustivel: true,
            postoId: b.postoId,
            desconto: { gt: 0 },
            dataVencimento: { gte: b.periodoDe, lte: b.periodoAte },
            fornecedor: { nome: { contains: "IPIRANGA", mode: "insensitive" } },
          },
          select: { dataVencimento: true, descricao: true, desconto: true },
          orderBy: { dataVencimento: "asc" },
        });
        origem = contas.map((c) => ({ data: c.dataVencimento, descricao: `Desconto no boleto${c.descricao ? ` — ${c.descricao}` : ""}`, valor: Number(c.desconto) }));
        recebido = origem.reduce((s, o) => s + o.valor, 0);
      } else if (b.bandeira === "VIBRA") {
        const lancs = categoriaVibra
          ? await prisma.lancamentoExtrato.findMany({
              where: { postoId: b.postoId, categoriaId: categoriaVibra.id, valor: { gt: 0 }, data: { gte: b.periodoDe, lte: b.periodoAte } },
              select: { data: true, descricao: true, valor: true, banco: { select: { nome: true } } },
              orderBy: { data: "asc" },
            })
          : [];
        origem = lancs.map((l) => ({ data: l.data, descricao: `${l.banco.nome} — ${l.descricao.slice(0, 40)}`, valor: Number(l.valor) }));
        recebido = origem.reduce((s, o) => s + o.valor, 0);
      }

      const esperado = Number(b.valor);
      const arred = recebido === null ? null : Math.round(recebido * 100) / 100;
      return {
        id: b.id,
        bandeira: b.bandeira,
        postoId: b.postoId,
        posto: b.posto.nome,
        periodoDe: b.periodoDe,
        periodoAte: b.periodoAte,
        esperado,
        recebido: arred,
        diferenca: arred === null ? null : Math.round((arred - esperado) * 100) / 100,
        situacao: situacaoDe(esperado, arred),
        observacao: b.observacao,
        origem,
      };
    })
  );
}
