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

const ROTA = "/cadastros/plano-de-contas";

// ---------------------------------------------------------------------------
// Grupo
// ---------------------------------------------------------------------------

const schemaGrupo = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome do grupo.")
    .transform((v) => v.toUpperCase()),
  ordem: z.coerce.number().int().default(0),
});

export async function criarGrupoPlanoConta(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schemaGrupo.safeParse({
    nome: formData.get("nome"),
    ordem: formData.get("ordem") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.grupoPlanoConta.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { error: "Já existe um grupo com esse nome.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarGrupoPlanoConta(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schemaGrupo.safeParse({
    nome: formData.get("nome"),
    ordem: formData.get("ordem") || 0,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.grupoPlanoConta.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { error: "Já existe um grupo com esse nome.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function alternarAtivoGrupoPlanoConta(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.grupoPlanoConta.findUniqueOrThrow({ where: { id } });
  await prisma.grupoPlanoConta.update({ where: { id }, data: { ativo: !atual.ativo } });
  revalidatePath(ROTA);
}

export async function excluirGrupoPlanoConta(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.grupoPlanoConta.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      revalidatePath(ROTA);
      redirect(`${ROTA}?erro=grupo-com-contas`);
    }
    throw e;
  }
  revalidatePath(ROTA);
}

// ---------------------------------------------------------------------------
// Conta (dentro de um grupo)
// ---------------------------------------------------------------------------

const schemaConta = z.object({
  // Maiúsculo pra manter os cadastros com visual padronizado (pedido da
  // usuária) — nome digitado de qualquer jeito vira MAIÚSCULO ao salvar.
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da conta.")
    .transform((v) => v.toUpperCase()),
  grupoId: z.string().trim().min(1, "Escolha um grupo."),
  codigo: z
    .string()
    .trim()
    .transform((v) => (v ? v.toUpperCase() : null))
    .nullable()
    .optional(),
});

export async function criarPlanoConta(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schemaConta.safeParse({
    nome: formData.get("nome"),
    grupoId: formData.get("grupoId"),
    codigo: formData.get("codigo"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.planoConta.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const alvo = (e as { meta?: { target?: string[] } }).meta?.target;
      const mensagem = alvo?.includes("codigo")
        ? "Já existe uma conta com esse código."
        : "Esse grupo já tem uma conta com esse nome.";
      return { error: mensagem, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarPlanoConta(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schemaConta.safeParse({
    nome: formData.get("nome"),
    grupoId: formData.get("grupoId"),
    codigo: formData.get("codigo"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.planoConta.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      const alvo = (e as { meta?: { target?: string[] } }).meta?.target;
      const mensagem = alvo?.includes("codigo")
        ? "Já existe uma conta com esse código."
        : "Esse grupo já tem uma conta com esse nome.";
      return { error: mensagem, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function alternarAtivoPlanoConta(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.planoConta.findUniqueOrThrow({ where: { id } });
  await prisma.planoConta.update({ where: { id }, data: { ativo: !atual.ativo } });
  revalidatePath(ROTA);
}

export async function excluirPlanoConta(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.planoConta.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      redirect(`${ROTA}?erro=conta-em-uso`);
    }
    throw e;
  }
  revalidatePath(ROTA);
}
