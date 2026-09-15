"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
  valoresDoFormulario,
  type ActionState,
} from "@/lib/form-state";

const schema = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  // codigoArquivo NÃO entra nessa transformação: é usado pra reconhecer o
  // banco pelo nome do arquivo importado (ver PARSERS_POR_CODIGO em
  // importar.ts) e já é validado como só letras/números.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do banco.")
    .transform((v) => v.toUpperCase()),
  codigoArquivo: z
    .string()
    .trim()
    .min(1, "Informe o código usado no nome do arquivo (ex: Bradesco).")
    .regex(/^[A-Za-z0-9]+$/, "Use só letras e números, sem espaço ou acento (ex: BancoDoBrasil)."),
});

export async function criarBanco(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    codigoArquivo: formData.get("codigoArquivo"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.banco.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe um banco com esse nome ou código de arquivo.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath("/cadastros/bancos");
  redirect("/cadastros/bancos");
}

export async function atualizarBanco(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    codigoArquivo: formData.get("codigoArquivo"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.banco.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe um banco com esse nome ou código de arquivo.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath("/cadastros/bancos");
  redirect("/cadastros/bancos");
}

export async function alternarAtivoBanco(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.banco.findUniqueOrThrow({ where: { id } });
  await prisma.banco.update({ where: { id }, data: { ativo: !atual.ativo } });
  revalidatePath("/cadastros/bancos");
}

export async function excluirBanco(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.banco.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      redirect("/cadastros/bancos?erro=em-uso");
    }
    throw e;
  }
  revalidatePath("/cadastros/bancos");
}
