"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";

// Desmembramento de um lançamento (ver PROJETO_SISTEMA_FINANCEIRO.md e
// LancamentoExtratoDivisao no schema): um único débito do banco às vezes
// cobre mais de uma categoria de verdade (ex: boleto de cesta básica que é
// parte "Despesa Posto", parte "Conveniência"). Chamado direto (não via
// useActionState/<form action>) porque o número de partes é dinâmico —
// mais simples de montar como array JS do que serializar em FormData.

function revalidarTudo() {
  revalidatePath("/extratos");
  revalidatePath("/extratos/editar");
  revalidatePath("/extratos/fechamento");
}

export type ItemDivisao = {
  categoriaId: string | null;
  tipoAdquirente: "DEBITO" | "CREDITO" | null;
  valor: number;
  observacao: string | null;
};

export async function salvarDivisaoLancamento(
  lancamentoId: string,
  itens: ItemDivisao[]
): Promise<{ error: string } | { ok: true }> {
  await exigirPermissao("EXTRATOS", "editar");

  const lancamento = await prisma.lancamentoExtrato.findUnique({ where: { id: lancamentoId } });
  if (!lancamento) return { error: "Lançamento não encontrado." };

  const itensValidos = itens.filter(
    (i) => i.categoriaId && Number.isFinite(i.valor) && Math.round(i.valor * 100) !== 0
  );
  if (itensValidos.length < 2) {
    return { error: "Pra dividir, informe pelo menos 2 partes com categoria e valor." };
  }

  const soma = itensValidos.reduce((s, i) => s + i.valor, 0);
  const totalLancamento = Number(lancamento.valor);
  if (Math.round((soma - totalLancamento) * 100) !== 0) {
    return {
      error: `A soma das partes (${formatarMoeda(soma)}) precisa bater com o valor do lançamento (${formatarMoeda(totalLancamento)}).`,
    };
  }

  await prisma.$transaction([
    prisma.lancamentoExtratoDivisao.deleteMany({ where: { lancamentoExtratoId: lancamentoId } }),
    prisma.lancamentoExtratoDivisao.createMany({
      data: itensValidos.map((i) => ({
        lancamentoExtratoId: lancamentoId,
        categoriaId: i.categoriaId,
        tipoAdquirente: i.tipoAdquirente,
        valor: i.valor.toFixed(2),
        observacao: i.observacao,
      })),
    }),
    // Categoria/tipo do lançamento "pai" ficam em branco — a categoria de
    // verdade agora mora nas partes. Ver contribuicoesPorCategoria em
    // consulta.ts, que os dois lados (resumo e fechamento) usam pra somar
    // certo independente de dividido ou não.
    prisma.lancamentoExtrato.update({
      where: { id: lancamentoId },
      data: { categoriaId: null, tipoAdquirente: null },
    }),
  ]);

  revalidarTudo();
  return { ok: true };
}

export async function removerDivisaoLancamento(lancamentoId: string): Promise<{ error: string } | { ok: true }> {
  await exigirPermissao("EXTRATOS", "editar");
  await prisma.lancamentoExtratoDivisao.deleteMany({ where: { lancamentoExtratoId: lancamentoId } });
  revalidarTudo();
  return { ok: true };
}
