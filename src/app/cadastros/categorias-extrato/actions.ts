"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { exigirPermissao } from "@/lib/auth";
import { isUniqueConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const schema = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  // Seguro trocar de caixa aqui: o match do categorizer.ts contra esse nome
  // já é case-insensitive (ver categoriaPorNome em importar.ts).
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da categoria.")
    .transform((v) => v.toUpperCase()),
  tipo: z.enum(["ADQUIRENTE", "PADRAO"]),
  ordem: z.coerce.number().int().default(0),
});

// Duas categorias com a mesma `ordem` deixavam a ordem das colunas do
// Fechamento instável entre uma geração e outra (empate sem critério de
// desempate). Em vez de só deixar acontecer, ao salvar uma categoria com uma
// ordem que já está em uso por OUTRA categoria, empurra ela (e tudo que já
// estava a partir dali) uma casa pra frente — como inserir numa lista
// numerada. `ignorarId` é o id da própria categoria sendo editada, pra não
// se auto-empurrar quando ela já é quem está naquela ordem.
async function abrirEspacoNaOrdem(tx: Prisma.TransactionClient, ordemDesejada: number, ignorarId?: string) {
  const colisao = await tx.categoriaExtrato.findFirst({
    where: { ordem: ordemDesejada, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
  });
  if (!colisao) return;
  await tx.categoriaExtrato.updateMany({
    where: { ordem: { gte: ordemDesejada }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    data: { ordem: { increment: 1 } },
  });
}

export async function criarCategoriaExtrato(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
    ordem: formData.get("ordem") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await abrirEspacoNaOrdem(tx, parsed.data.ordem);
      await tx.categoriaExtrato.create({ data: parsed.data });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe uma categoria com esse nome.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath("/cadastros/categorias-extrato");
  redirect("/cadastros/categorias-extrato");
}

export async function atualizarCategoriaExtrato(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    tipo: formData.get("tipo"),
    ordem: formData.get("ordem") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await abrirEspacoNaOrdem(tx, parsed.data.ordem, id);
      await tx.categoriaExtrato.update({ where: { id }, data: parsed.data });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe uma categoria com esse nome.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath("/cadastros/categorias-extrato");
  redirect("/cadastros/categorias-extrato");
}

export async function alternarAtivoCategoriaExtrato(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.categoriaExtrato.findUniqueOrThrow({ where: { id } });
  await prisma.categoriaExtrato.update({
    where: { id },
    data: { ativo: !atual.ativo },
  });
  revalidatePath("/cadastros/categorias-extrato");
}

export async function excluirCategoriaExtrato(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.categoriaExtrato.delete({ where: { id } });
  revalidatePath("/cadastros/categorias-extrato");
}
