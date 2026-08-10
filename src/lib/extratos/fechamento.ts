import "server-only";
import { prisma } from "@/lib/prisma";

export const MESES_PT = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Port de aba2_fechamento.py: soma os lançamentos JÁ categorizados por
// dia x categoria, num único posto e mês, com saldo acumulado. Lançamentos
// sem categoria ficam de fora da soma (não dá pra fechar sem saber onde
// entram) — o total deles vem em `semCategoria`, pra usuária resolver antes
// ou decidir gerar mesmo assim.
//
// Diferença do protótipo: lá "Cielo Débito"/"Cielo Crédito" eram duas
// categorias que precisavam ser somadas numa coluna só (categoria_bd_para_fechamento).
// Aqui isso já vem de graça — débito/crédito de adquirente são a MESMA
// categoria (campo tipoAdquirente separado), então basta uma coluna por
// categoria, sem merge nenhum.
//
// Também não tem coluna de saldo do banco / "confere" (o CSV antigo do
// Bradesco trazia saldo por linha; OFX não traz saldo por dia, só o saldo
// final do período) — decisão da usuária, PROJETO ainda não cobre isso.

export type LinhaFechamento = {
  dia: number;
  porCategoria: number[]; // mesmo índice de `categorias`
  saldoAcumulado: number;
};

export type ResultadoFechamento = {
  postoNome: string;
  ano: number;
  mes: number;
  ultimoDia: number;
  categorias: { id: string; nome: string }[];
  linhas: LinhaFechamento[];
  totalPorCategoria: number[];
  totalGeral: number;
  saldoInicial: number;
  saldoFinal: number;
  semCategoria: number;
};

export async function gerarFechamento(params: {
  postoId: string;
  ano: number;
  mes: number; // 1-12
  saldoInicial: number;
}): Promise<ResultadoFechamento> {
  const { postoId, ano, mes, saldoInicial } = params;

  const posto = await prisma.posto.findUniqueOrThrow({ where: { id: postoId } });
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0)); // dia 0 do mês seguinte = último dia deste mês
  const ultimoDia = fim.getUTCDate();

  const categorias = await prisma.categoriaExtrato.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
  });
  const idxPorCategoria = new Map(categorias.map((c, i) => [c.id, i]));

  const [lancamentos, divisoes, semCategoria] = await Promise.all([
    prisma.lancamentoExtrato.findMany({
      where: { postoId, data: { gte: inicio, lte: fim }, categoriaId: { not: null } },
      select: { data: true, valor: true, categoriaId: true },
    }),
    // Lançamentos DIVIDIDOS (ver LancamentoExtratoDivisao) não têm categoriaId
    // no registro principal — a categoria/valor de cada um mora aqui, uma
    // linha por parte. Busca junto pra somar por (dia, categoria) igual aos
    // lançamentos normais.
    prisma.lancamentoExtratoDivisao.findMany({
      where: { lancamentoExtrato: { postoId, data: { gte: inicio, lte: fim } } },
      select: { valor: true, categoriaId: true, lancamentoExtrato: { select: { data: true } } },
    }),
    prisma.lancamentoExtrato.count({
      where: { postoId, data: { gte: inicio, lte: fim }, categoriaId: null, divisoes: { none: {} } },
    }),
  ]);

  // soma[dia][índiceCategoria]
  const soma: number[][] = Array.from({ length: ultimoDia + 1 }, () => new Array(categorias.length).fill(0));
  for (const l of lancamentos) {
    const dia = l.data.getUTCDate();
    const idx = idxPorCategoria.get(l.categoriaId as string);
    if (idx === undefined) continue;
    soma[dia][idx] += Number(l.valor);
  }
  for (const d of divisoes) {
    if (!d.categoriaId) continue;
    const dia = d.lancamentoExtrato.data.getUTCDate();
    const idx = idxPorCategoria.get(d.categoriaId);
    if (idx === undefined) continue;
    soma[dia][idx] += Number(d.valor);
  }

  let acumulado = saldoInicial;
  const linhas: LinhaFechamento[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const porCategoria = soma[dia];
    acumulado += porCategoria.reduce((s, v) => s + v, 0);
    linhas.push({ dia, porCategoria, saldoAcumulado: acumulado });
  }

  const totalPorCategoria = categorias.map((_, i) => linhas.reduce((s, l) => s + l.porCategoria[i], 0));
  const totalGeral = totalPorCategoria.reduce((s, v) => s + v, 0);

  return {
    postoNome: posto.nome,
    ano,
    mes,
    ultimoDia,
    categorias: categorias.map((c) => ({ id: c.id, nome: c.nome })),
    linhas,
    totalPorCategoria,
    totalGeral,
    saldoInicial,
    saldoFinal: acumulado,
    semCategoria,
  };
}
