"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarDocumento } from "@/lib/documento";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
  valoresDoFormulario,
  type ActionState,
} from "@/lib/form-state";

const schema = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do fornecedor.")
    .transform((v) => v.toUpperCase()),
  // Normaliza o formato aqui também (não só no onChange do campo) — cobre
  // colar um valor já digitado ou desligar o JS, e garante que a coluna
  // @unique no banco (ver schema.prisma) realmente pegue duplicidade.
  documento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? formatarDocumento(v) : null)),
});

function erroDocumentoDuplicado(e: unknown): ActionState | null {
  if (!isUniqueConstraintError(e)) return null;
  return { error: "Já existe um fornecedor cadastrado com esse CNPJ/CPF." };
}

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

  try {
    await prisma.fornecedor.create({ data: parsed.data });
  } catch (e) {
    const erroDuplicado = erroDocumentoDuplicado(e);
    if (erroDuplicado) return { ...erroDuplicado, values: valoresDoFormulario(formData) };
    throw e;
  }

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

  try {
    await prisma.fornecedor.update({ where: { id }, data: parsed.data });
  } catch (e) {
    const erroDuplicado = erroDocumentoDuplicado(e);
    if (erroDuplicado) return { ...erroDuplicado, values: valoresDoFormulario(formData) };
    throw e;
  }

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
