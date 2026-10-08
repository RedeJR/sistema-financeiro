import "server-only";
import { prisma } from "@/lib/prisma";

// Relatório de "campos" do extrato (Extratos > Relatórios) — pedido da
// usuária pro fechamento mensal: ela precisa, rápido, de tudo que caiu numa
// categoria específica do extrato, posto a posto, no formato que ela já usa
// pra montar a planilha de "Receitas extras" (bloco por posto, DATA/VALOR/
// DESCRIÇÃO, com total). O "campo" é literalmente uma CategoriaExtrato — a
// tela lista TODAS as categorias ativas do cadastro (não só um recorte fixo,
// pedido explícito da usuária em 28/09/2026), então uma categoria nova
// criada em Cadastros > Categorias de Extrato já aparece aqui sozinha.
export async function listarCategoriasRelatorioExtrato(): Promise<{ id: string; nome: string }[]> {
  return prisma.categoriaExtrato.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true },
  });
}

export type LinhaRelatorioCampo = {
  id: string;
  data: Date;
  valor: number;
  // Texto que a usuária digitou na revisão (/extratos/editar) — é o que
  // aparece na planilha manual (ex: "ALUGUEL CONVENIÊNCIA"), não a descrição
  // crua do banco. Cai pra "" quando ela ainda não anotou nada nessa linha.
  descricao: string;
  descricaoBanco: string;
  categoriaNome: string;
};

export type BlocoRelatorioCampo = {
  postoId: string;
  postoNome: string;
  linhas: LinhaRelatorioCampo[];
  total: number;
};

export async function buscarRelatorioCampoExtrato(params: {
  categoriaId: string;
  postoIds?: string[];
  dataInicio: Date;
  dataFim: Date;
}): Promise<BlocoRelatorioCampo[]> {
  const { categoriaId, postoIds = [], dataInicio, dataFim } = params;

  const [postos, categoria] = await Promise.all([
    prisma.posto.findMany({
      where: { ativo: true, ...(postoIds.length ? { id: { in: postoIds } } : {}) },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.categoriaExtrato.findUnique({ where: { id: categoriaId }, select: { id: true, nome: true } }),
  ]);
  const nomeCategoriaPorId = new Map(categoria ? [[categoria.id, categoria.nome]] : []);
  const categoriaIds = categoria ? [categoria.id] : [];

  const blocos = new Map<string, BlocoRelatorioCampo>(
    postos.map((p) => [p.id, { postoId: p.id, postoNome: p.nome, linhas: [], total: 0 }])
  );
  if (categoriaIds.length === 0) return [...blocos.values()];

  // `divisoes: { none: {} }` pelo mesmo motivo de sempre (ver
  // gerarFechamento em extratos/fechamento.ts): um lançamento dividido às
  // vezes também tem categoriaId preenchido no registro principal — sem
  // esse filtro ele contaria duas vezes.
  const [diretos, divisoes] = await Promise.all([
    prisma.lancamentoExtrato.findMany({
      where: {
        categoriaId: { in: categoriaIds },
        divisoes: { none: {} },
        data: { gte: dataInicio, lte: dataFim },
        ...(postoIds.length ? { postoId: { in: postoIds } } : {}),
      },
      select: { id: true, postoId: true, data: true, valor: true, observacao: true, descricao: true, categoriaId: true },
    }),
    prisma.lancamentoExtratoDivisao.findMany({
      where: {
        categoriaId: { in: categoriaIds },
        lancamentoExtrato: { data: { gte: dataInicio, lte: dataFim }, ...(postoIds.length ? { postoId: { in: postoIds } } : {}) },
      },
      select: {
        id: true,
        valor: true,
        observacao: true,
        categoriaId: true,
        lancamentoExtrato: { select: { postoId: true, data: true, descricao: true, observacao: true } },
      },
    }),
  ]);

  for (const l of diretos) {
    const bloco = blocos.get(l.postoId);
    if (!bloco) continue; // posto filtrado fora ou inativo
    bloco.linhas.push({
      id: l.id,
      data: l.data,
      valor: Number(l.valor),
      descricao: l.observacao ?? "",
      descricaoBanco: l.descricao,
      categoriaNome: nomeCategoriaPorId.get(l.categoriaId as string) ?? "",
    });
    bloco.total += Number(l.valor);
  }
  for (const d of divisoes) {
    const bloco = blocos.get(d.lancamentoExtrato.postoId);
    if (!bloco) continue;
    bloco.linhas.push({
      id: d.id,
      data: d.lancamentoExtrato.data,
      valor: Number(d.valor),
      descricao: d.observacao ?? d.lancamentoExtrato.observacao ?? "",
      descricaoBanco: d.lancamentoExtrato.descricao,
      categoriaNome: nomeCategoriaPorId.get(d.categoriaId as string) ?? "",
    });
    bloco.total += Number(d.valor);
  }

  for (const bloco of blocos.values()) bloco.linhas.sort((a, b) => a.data.getTime() - b.data.getTime());
  return [...blocos.values()];
}

// Recategoriza em lote — usado quando a usuária marca linhas numa planilha
// exportada (coluna "ID") pra virar Receita Extra (ou outra categoria) sem
// precisar clicar lançamento por lançamento em /extratos/editar. `id` de
// cada linha vem prefixado "L:" (LancamentoExtrato) ou "D:" (divisão — ver
// LinhaRelatorioCampo acima), pra saber em qual tabela atualizar.
export async function recategorizarLancamentos(params: { ids: string[]; categoriaNome: string }): Promise<number> {
  const { ids, categoriaNome } = params;
  const categoria = await prisma.categoriaExtrato.findUniqueOrThrow({ where: { nome: categoriaNome } });
  const idsLancamento = ids.filter((id) => id.startsWith("L:")).map((id) => id.slice(2));
  const idsDivisao = ids.filter((id) => id.startsWith("D:")).map((id) => id.slice(2));

  const [r1, r2] = await Promise.all([
    idsLancamento.length > 0
      ? prisma.lancamentoExtrato.updateMany({ where: { id: { in: idsLancamento } }, data: { categoriaId: categoria.id } })
      : { count: 0 },
    idsDivisao.length > 0
      ? prisma.lancamentoExtratoDivisao.updateMany({ where: { id: { in: idsDivisao } }, data: { categoriaId: categoria.id } })
      : { count: 0 },
  ]);
  return r1.count + r2.count;
}
