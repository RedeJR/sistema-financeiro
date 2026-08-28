"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarDocumento } from "@/lib/documento";
import {
  camposUniqueViolados,
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
    .min(1, "Informe o nome do posto.")
    .transform((v) => v.toUpperCase()),
  // Normaliza o formato aqui também (não só no onChange do campo) — ver
  // mesmo comentário em cadastros/fornecedores/actions.ts.
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? formatarDocumento(v) : null)),
});

// "nome" e "cnpj" são únicos os dois — distingue qual bateu pelo `meta.target`
// que o Postgres devolve no erro, pra não dizer "nome duplicado" quando na
// verdade foi o CNPJ que já existia (ou vice-versa).
function mensagemPostoDuplicado(e: unknown): string | null {
  if (!isUniqueConstraintError(e)) return null;
  const campos = camposUniqueViolados(e);
  if (campos.some((c) => c.toLowerCase().includes("cnpj"))) {
    return "Já existe um posto cadastrado com esse CNPJ.";
  }
  return "Já existe um posto com esse nome.";
}

export async function criarPosto(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    cnpj: formData.get("cnpj"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.posto.create({ data: parsed.data });
  } catch (e) {
    const erro = mensagemPostoDuplicado(e);
    if (erro) {
      return { error: erro, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath("/cadastros/postos");
  redirect("/cadastros/postos");
}

export async function atualizarPosto(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = schema.safeParse({
    nome: formData.get("nome"),
    cnpj: formData.get("cnpj"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    await prisma.posto.update({
      where: { id },
      data: parsed.data,
    });
  } catch (e) {
    const erro = mensagemPostoDuplicado(e);
    if (erro) {
      return { error: erro, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath("/cadastros/postos");
  redirect("/cadastros/postos");
}

export async function alternarAtivoPosto(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.posto.findUniqueOrThrow({ where: { id } });
  await prisma.posto.update({
    where: { id },
    data: { ativo: !atual.ativo },
  });
  revalidatePath("/cadastros/postos");
}

export async function excluirPosto(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  try {
    await prisma.posto.delete({ where: { id } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      redirect("/cadastros/postos?erro=em-uso");
    }
    throw e;
  }
  revalidatePath("/cadastros/postos");
}
