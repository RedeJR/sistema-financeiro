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

const ROTA = "/cadastros/adquirentes-cartao";

const schema = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado, mesmo padrão
  // do cadastro de Bancos. Permite variantes como "CIELO TEF" e "CIELO
  // ALUGUEL" como adquirentes separadas — a usuária pode ter mais de uma
  // máquina da mesma bandeira no mesmo posto, com taxas diferentes.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da adquirente.")
    .transform((v) => v.toUpperCase()),
});

export async function criarAdquirenteCartao(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }

  try {
    await prisma.adquirenteCartao.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { error: "Já existe uma adquirente com esse nome.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarAdquirenteCartao(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({ nome: formData.get("nome") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }

  try {
    await prisma.adquirenteCartao.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { error: "Já existe uma adquirente com esse nome.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function alternarAtivoAdquirenteCartao(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.adquirenteCartao.findUniqueOrThrow({ where: { id } });
  await prisma.adquirenteCartao.update({ where: { id }, data: { ativo: !atual.ativo } });
  revalidatePath(ROTA);
}

export async function excluirAdquirenteCartao(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.adquirenteCartao.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      redirect(`${ROTA}?erro=em-uso`);
    }
    throw e;
  }
  revalidatePath(ROTA);
}
