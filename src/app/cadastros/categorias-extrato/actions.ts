"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
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
    await prisma.categoriaExtrato.create({ data: parsed.data });
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
    await prisma.categoriaExtrato.update({ where: { id }, data: parsed.data });
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
