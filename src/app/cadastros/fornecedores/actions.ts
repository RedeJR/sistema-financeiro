"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const schema = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do fornecedor.")
    .transform((v) => v.toUpperCase()),
  documento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function criarFornecedor(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    documento: formData.get("documento"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  await prisma.fornecedor.create({ data: parsed.data });

  revalidatePath("/cadastros/fornecedores");
  redirect("/cadastros/fornecedores");
}

export async function atualizarFornecedor(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    documento: formData.get("documento"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  await prisma.fornecedor.update({ where: { id }, data: parsed.data });

  revalidatePath("/cadastros/fornecedores");
  redirect("/cadastros/fornecedores");
}

export async function alternarAtivoFornecedor(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.fornecedor.findUniqueOrThrow({ where: { id } });
  await prisma.fornecedor.update({
    where: { id },
    data: { ativo: !atual.ativo },
  });
  revalidatePath("/cadastros/fornecedores");
}

export async function excluirFornecedor(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.fornecedor.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      redirect("/cadastros/fornecedores?erro=em-uso");
    }
    throw e;
  }
  revalidatePath("/cadastros/fornecedores");
}
