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

// Detalhamento lançamento-a-lançamento de uma categoria específica (ver
// DETALHE_NOME abaixo) — a coluna do fechamento só mostra o total do dia,
// isso aqui é o "de onde veio cada valor" que a usuária pediu pra Outros e
// Venda a Prazo. `observacao` é o texto que ela mesma digita na tela de
// revisão (/extratos/editar), não a descrição crua do banco — cai pra "" só
// quando ela ainda não anotou nada nessa linha.
export type LinhaDetalhe = {
  dia: number;
  data: Date;
  valor: number;
  observacao: string;
  descricaoBanco: string;
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
  // Uma entrada por categoria em DETALHE_NOME que exista no cadastro (ver
  // abaixo) — nome da categoria -> linhas do mês, mais recente por último.
  detalhes: { categoriaNome: string; linhas: LinhaDetalhe[] }[];
};

// Categorias que ganham aba de detalhamento (data/valor/observação) no
// fechamento, além do total por dia — pedido da usuária pra conseguir ver de
// onde vem cada valor de "Outros" e "Venda a Prazo" sem abrir a tela de
// Conciliação de Extratos e catar linha por linha.
const DETALHE_NOME = ["OUTROS", "VENDA A PRAZO"];

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

  const detalhes = await gerarDetalhes({ postoId, inicio, fim, categorias });

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
    detalhes,
  };
}

async function gerarDetalhes(params: {
  postoId: string;
  inicio: Date;
  fim: Date;
  categorias: { id: string; nome: string }[];
}): Promise<{ categoriaNome: string; linhas: LinhaDetalhe[] }[]> {
  const { postoId, inicio, fim, categorias } = params;
  const categoriasAlvo = categorias.filter((c) => DETALHE_NOME.includes(c.nome));
  if (categoriasAlvo.length === 0) return [];
  const idsAlvo = categoriasAlvo.map((c) => c.id);

  const [diretos, divisoes] = await Promise.all([
    prisma.lancamentoExtrato.findMany({
      where: { postoId, data: { gte: inicio, lte: fim }, categoriaId: { in: idsAlvo } },
      select: { data: true, valor: true, observacao: true, descricao: true, categoriaId: true },
    }),
    // Parte de um lançamento dividido (ver LancamentoExtratoDivisao) — ainda
    // não tem campo de observação editável na tela de divisão, então usa a
    // observação/descrição do lançamento "pai" como contexto.
    prisma.lancamentoExtratoDivisao.findMany({
      where: { categoriaId: { in: idsAlvo }, lancamentoExtrato: { postoId, data: { gte: inicio, lte: fim } } },
      select: {
        valor: true,
        categoriaId: true,
        observacao: true,
        lancamentoExtrato: { select: { data: true, observacao: true, descricao: true } },
      },
    }),
  ]);

  const porCategoria = new Map<string, LinhaDetalhe[]>(categoriasAlvo.map((c) => [c.id, []]));
  for (const l of diretos) {
    porCategoria.get(l.categoriaId as string)?.push({
      dia: l.data.getUTCDate(),
      data: l.data,
      valor: Number(l.valor),
      observacao: l.observacao ?? "",
      descricaoBanco: l.descricao,
    });
  }
  for (const d of divisoes) {
    if (!d.categoriaId) continue;
    porCategoria.get(d.categoriaId)?.push({
      dia: d.lancamentoExtrato.data.getUTCDate(),
      data: d.lancamentoExtrato.data,
      valor: Number(d.valor),
      observacao: d.observacao ?? d.lancamentoExtrato.observacao ?? "",
      descricaoBanco: d.lancamentoExtrato.descricao,
    });
  }

  return categoriasAlvo.map((c) => ({
    categoriaNome: c.nome,
    linhas: (porCategoria.get(c.id) ?? []).sort((a, b) => a.data.getTime() - b.data.getTime()),
  }));
}
