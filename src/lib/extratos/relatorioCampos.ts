import "server-only";
import { prisma } from "@/lib/prisma";

// Relatório de "campos" do extrato (Extratos > Relatórios) — pedido da
// usuária pro fechamento mensal: ela precisa, rápido, de tudo que caiu numa
// categoria específica (hoje: Outros, SAQPAY, Despesas Pagas, Tarifas),
// posto a posto, no formato que ela já usa pra montar a planilha de
// "Receitas extras" (bloco por posto, DATA/VALOR/DESCRIÇÃO, com total).
//
// "Tarifas" junta as duas categorias de tarifa bancária (C/C e Pix) numa
// coisa só — ela não separa isso na planilha.
export type CampoRelatorioExtrato = "OUTROS" | "SAQPAY" | "DESPESAS_PAGAS" | "TARIFAS";

export const CAMPOS_RELATORIO_EXTRATO: { valor: CampoRelatorioExtrato; label: string; categorias: string[] }[] = [
  { valor: "OUTROS", label: "Outros", categorias: ["OUTROS"] },
  { valor: "SAQPAY", label: "SAQPAY", categorias: ["SAQPAY"] },
  { valor: "DESPESAS_PAGAS", label: "Despesas Pagas", categorias: ["DESPESAS PAGAS"] },
  { valor: "TARIFAS", label: "Tarifas", categorias: ["TARIFAS C/C", "TARIFAS PIX"] },
];

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
  campo: CampoRelatorioExtrato;
  postoId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<BlocoRelatorioCampo[]> {
  const { campo, postoId, dataInicio, dataFim } = params;
  const definicao = CAMPOS_RELATORIO_EXTRATO.find((c) => c.valor === campo);
  if (!definicao) return [];

  const [postos, categorias] = await Promise.all([
    prisma.posto.findMany({
      where: { ativo: true, ...(postoId ? { id: postoId } : {}) },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.categoriaExtrato.findMany({ where: { nome: { in: definicao.categorias } }, select: { id: true, nome: true } }),
  ]);
  const nomeCategoriaPorId = new Map(categorias.map((c) => [c.id, c.nome]));
  const categoriaIds = categorias.map((c) => c.id);

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
        ...(postoId ? { postoId } : {}),
      },
      select: { id: true, postoId: true, data: true, valor: true, observacao: true, descricao: true, categoriaId: true },
    }),
    prisma.lancamentoExtratoDivisao.findMany({
      where: {
        categoriaId: { in: categoriaIds },
        lancamentoExtrato: { data: { gte: dataInicio, lte: dataFim }, ...(postoId ? { postoId } : {}) },
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
