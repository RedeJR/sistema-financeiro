"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/bonificacao-postecipada";

function data(rotulo: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`)
    .transform((v) => new Date(`${v}T00:00:00.000Z`));
}

const schema = z
  .object({
    bandeira: z.enum(["IPIRANGA", "VIBRA", "SHELL"], { message: "Escolha o fornecedor." }),
    postoId: z.string().trim().min(1, "Escolha um posto."),
    periodoDe: data("Início do período"),
    periodoAte: data("Fim do período"),
    valor: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const decimal = paraDecimalString(v);
        if (decimal === null || Number(decimal) <= 0) {
          ctx.addIssue({ code: "custom", message: "Valor inválido." });
          return z.NEVER;
        }
        return decimal;
      }),
    observacao: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.periodoAte < d.periodoDe) ctx.addIssue({ code: "custom", message: "O fim do período é antes do início." });
  });

function ler(formData: FormData) {
  return schema.safeParse({
    bandeira: formData.get("bandeira"),
    postoId: formData.get("postoId"),
    periodoDe: formData.get("periodoDe"),
    periodoAte: formData.get("periodoAte"),
    valor: formData.get("valor"),
    observacao: formData.get("observacao"),
  });
}

export async function criarBonificacao(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const parsed = ler(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  try {
    await prisma.bonificacaoPostecipada.create({ data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarBonificacao(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const parsed = ler(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  try {
    await prisma.bonificacaoPostecipada.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function excluirBonificacao(formData: FormData) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.bonificacaoPostecipada.delete({ where: { id } });
  revalidatePath(ROTA);
}
