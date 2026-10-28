import "server-only";
import { prisma } from "@/lib/prisma";
import type { BandeiraCombustivel } from "@/generated/prisma/client";

// Conciliação da Bonificação Postecipada (ver model BonificacaoPostecipada): compara o valor que o
// posto tem a receber da distribuidora, num período de compras, com o que realmente veio. É
// "postecipada" porque o desconto chega DEPOIS do período (ex: bonificação de setembro vem nos
// boletos / transferências de outubro). Por isso o que conta é o que cai depois do fim do período:
//  - IPIRANGA: o desconto vem no próprio boleto — soma do campo Desconto das contas de combustível
//    da Ipiranga, do posto, com vencimento depois do fim do período;
//  - VIBRA: o desconto vem por transferência na conta corrente — créditos da categoria de extrato
//    "BONIFICAÇÃO VIBRA" do posto, com data depois do fim do período;
//  - SHELL: ainda manual (sem conciliação automática).
// Como o mesmo posto tem várias bonificações em sequência, cada desconto/transferência é atribuído a
// UMA bonificação só (ver alocar): primeiro as que fecham exatamente com 1 a 3 lançamentos, depois, em
// ordem cronológica, o que sobrar vai preenchendo as que ainda estão em aberto.

export const NOME_CATEGORIA_VIBRA = "BONIFICAÇÃO VIBRA";
export const ROTULO_BANDEIRA: Record<BandeiraCombustivel, string> = { IPIRANGA: "Ipiranga", VIBRA: "Vibra", SHELL: "Shell" };

const TOLERANCIA = 0.05;
const JANELA_DIAS = 90; // quanto tempo depois do fim do período ainda se procura o desconto
const DIA = 86400000;

export type OrigemBonificacao = { data: Date; descricao: string; valor: number };
export type Situacao = "CONCILIADA" | "PARCIAL" | "A_RECEBER" | "ACIMA" | "MANUAL";

export type BonificacaoConciliada = {
  id: string;
  bandeira: BandeiraCombustivel;
  postoId: string;
  posto: string;
  periodoDe: Date;
  periodoAte: Date;
  retornoPorLitro: number; // R$ por litro
  litros: number;
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

type Item = OrigemBonificacao & { id: number };
type BonifBase = { id: string; periodoAte: Date; esperado: number };

// Distribui os itens (descontos de boleto ou transferências) entre as bonificações de UM posto/fornecedor.
export function alocar(bonificacoes: BonifBase[], itens: OrigemBonificacao[]): Map<string, OrigemBonificacao[]> {
  const resultado = new Map<string, OrigemBonificacao[]>(bonificacoes.map((b) => [b.id, []]));
  const livres: Item[] = itens.map((o, id) => ({ ...o, id })).sort((a, b) => a.data.getTime() - b.data.getTime());
  const ordem = [...bonificacoes].sort((a, b) => a.periodoAte.getTime() - b.periodoAte.getTime());

  const elegivel = (b: BonifBase, i: Item) => i.data > b.periodoAte && i.data.getTime() <= b.periodoAte.getTime() + JANELA_DIAS * DIA;
  const usar = (b: BonifBase, itensUsados: Item[]) => {
    resultado.get(b.id)!.push(...itensUsados.map(({ id, ...o }) => { void id; return o; }));
    for (const u of itensUsados) livres.splice(livres.findIndex((l) => l.id === u.id), 1);
  };
  const soma = (xs: Item[]) => xs.reduce((s, x) => s + x.valor, 0);

  // 1) fecha exatamente com 1, 2 ou 3 lançamentos
  const fechadas = new Set<string>();
  for (const b of ordem) {
    const cand = livres.filter((i) => elegivel(b, i));
    let achou: Item[] | null = null;
    outer: for (let k = 1; k <= 3 && !achou; k++) {
      const n = cand.length;
      const idx: number[] = [];
      const busca = (ini: number): boolean => {
        if (idx.length === k) return Math.abs(soma(idx.map((j) => cand[j])) - b.esperado) <= TOLERANCIA;
        for (let j = ini; j < n; j++) {
          idx.push(j);
          if (busca(j + 1)) return true;
          idx.pop();
        }
        return false;
      };
      if (busca(0)) {
        achou = idx.map((j) => cand[j]);
        break outer;
      }
    }
    if (achou) {
      usar(b, achou);
      fechadas.add(b.id);
    }
  }

  // 2) o que sobrou, em ordem de data, vai pra primeira bonificação elegível que ainda não fechou
  for (const i of [...livres]) {
    const alvo = ordem.find((b) => !fechadas.has(b.id) && elegivel(b, i) && soma(resultado.get(b.id)!.map((o, n) => ({ ...o, id: n }))) < b.esperado - TOLERANCIA);
    if (alvo) usar(alvo, [i]);
  }
  return resultado;
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

  // Pra distribuir certo, a alocação considera TODAS as bonificações do mesmo posto e fornecedor,
  // mesmo as que o filtro da tela escondeu.
  const postosEnvolvidos = [...new Set(itens.map((b) => b.postoId))];
  const todas = await prisma.bonificacaoPostecipada.findMany({ where: { postoId: { in: postosEnvolvidos } } });

  const categoriaVibra = await prisma.categoriaExtrato.findUnique({ where: { nome: NOME_CATEGORIA_VIBRA } });
  const minFim = new Date(Math.min(...todas.map((b) => b.periodoAte.getTime())) + DIA);
  const maxFim = new Date(Math.max(...todas.map((b) => b.periodoAte.getTime())) + JANELA_DIAS * DIA);

  const [boletos, creditos] = await Promise.all([
    todas.some((b) => b.bandeira === "IPIRANGA")
      ? prisma.contaAPagar.findMany({
          where: {
            combustivel: true,
            postoId: { in: postosEnvolvidos },
            desconto: { gt: 0 },
            dataVencimento: { gte: minFim, lte: maxFim },
            fornecedor: { nome: { contains: "IPIRANGA", mode: "insensitive" } },
          },
          select: { postoId: true, dataVencimento: true, descricao: true, desconto: true },
        })
      : Promise.resolve([]),
    categoriaVibra && todas.some((b) => b.bandeira === "VIBRA")
      ? prisma.lancamentoExtrato.findMany({
          where: { postoId: { in: postosEnvolvidos }, categoriaId: categoriaVibra.id, valor: { gt: 0 }, data: { gte: minFim, lte: maxFim } },
          select: { postoId: true, data: true, descricao: true, valor: true, banco: { select: { nome: true } } },
        })
      : Promise.resolve([]),
  ]);

  // alocação por posto + fornecedor
  const alocado = new Map<string, OrigemBonificacao[]>();
  for (const postoId of postosEnvolvidos) {
    for (const bandeira of ["IPIRANGA", "VIBRA"] as const) {
      const bonifs = todas.filter((b) => b.postoId === postoId && b.bandeira === bandeira).map((b) => ({ id: b.id, periodoAte: b.periodoAte, esperado: Number(b.valor) }));
      if (bonifs.length === 0) continue;
      const lancs: OrigemBonificacao[] =
        bandeira === "IPIRANGA"
          ? boletos.filter((c) => c.postoId === postoId).map((c) => ({ data: c.dataVencimento, descricao: `Desconto no boleto${c.descricao ? ` — ${c.descricao}` : ""}`, valor: Number(c.desconto) }))
          : creditos.filter((l) => l.postoId === postoId).map((l) => ({ data: l.data, descricao: `${l.banco.nome} — ${l.descricao.slice(0, 40)}`, valor: Number(l.valor) }));
      for (const [id, o] of alocar(bonifs, lancs)) alocado.set(id, o);
    }
  }

  return itens.map((b) => {
    const origem = (alocado.get(b.id) ?? []).sort((a, c) => a.data.getTime() - c.data.getTime());
    const recebido = b.bandeira === "SHELL" ? null : Math.round(origem.reduce((s, o) => s + o.valor, 0) * 100) / 100;
    const esperado = Number(b.valor);
    return {
      id: b.id,
      bandeira: b.bandeira,
      postoId: b.postoId,
      posto: b.posto.nome,
      periodoDe: b.periodoDe,
      periodoAte: b.periodoAte,
      retornoPorLitro: Number(b.retornoPorLitro),
      litros: Number(b.litros),
      esperado,
      recebido,
      diferenca: recebido === null ? null : Math.round((recebido - esperado) * 100) / 100,
      situacao: situacaoDe(esperado, recebido),
      observacao: b.observacao,
      origem,
    };
  });
}
