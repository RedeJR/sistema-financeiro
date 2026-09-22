"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/cartoes/antecipacoes";

function valor(rotulo: string) {
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      const decimal = paraDecimalString(v);
      if (decimal === null || Number(decimal) <= 0) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido.` });
        return z.NEVER;
      }
      return decimal;
    });
}

function data(rotulo: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`)
    .transform((v) => new Date(`${v}T00:00:00.000Z`));
}

const schema = z
  .object({
    postoId: z.string().trim().min(1, "Escolha um posto."),
    adquirenteId: z.string().trim().min(1, "Escolha uma adquirente."),
    dataRecebimento: data("Data do recebimento"),
    periodoDe: data("Início do período"),
    periodoAte: data("Fim do período"),
    valorFace: valor("Valor dos recebíveis"),
    valorLiquido: valor("Valor líquido recebido"),
    observacao: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.periodoAte < d.periodoDe) ctx.addIssue({ code: "custom", message: "O fim do período é antes do início." });
    if (Number(d.valorLiquido) > Number(d.valorFace)) {
      ctx.addIssue({ code: "custom", message: "O líquido recebido não pode ser maior que o valor dos recebíveis." });
    }
  });

function lerFormulario(formData: FormData) {
  return schema.safeParse({
    postoId: formData.get("postoId"),
    adquirenteId: formData.get("adquirenteId"),
    dataRecebimento: formData.get("dataRecebimento"),
    periodoDe: formData.get("periodoDe"),
    periodoAte: formData.get("periodoAte"),
    valorFace: formData.get("valorFace"),
    valorLiquido: formData.get("valorLiquido"),
    observacao: formData.get("observacao"),
  });
}

export async function criarAntecipacao(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("CARTOES", "editar");
  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }
  try {
    await prisma.antecipacaoCartao.create({ data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto ou adquirente inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarAntecipacao(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("CARTOES", "editar");
  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }
  try {
    await prisma.antecipacaoCartao.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto ou adquirente inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function excluirAntecipacao(formData: FormData) {
  await exigirPermissao("CARTOES", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.antecipacaoCartao.delete({ where: { id } });
  revalidatePath(ROTA);
}
