"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";
import { vincularLancamento, desvincularLancamento } from "@/lib/entrePostos/vinculo";

const ROTA = "/entre-postos";

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

const schema = z
  .object({
    data: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .transform((v) => new Date(`${v}T00:00:00.000Z`)),
    postoOrigemId: z.string().trim().min(1, "Escolha o posto de origem."),
    postoDestinoId: z.string().trim().min(1, "Escolha o posto de destino."),
    valor: valor("Valor"),
    tipo: z.enum(["EMPRESTIMO", "DEVOLUCAO"], { message: "Escolha o tipo." }),
    statusManual: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
    observacao: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.postoOrigemId === d.postoDestinoId) {
      ctx.addIssue({ code: "custom", message: "Origem e destino não podem ser o mesmo posto.", path: ["postoDestinoId"] });
    }
  });

function lerFormulario(formData: FormData) {
  return schema.safeParse({
    data: formData.get("data"),
    postoOrigemId: formData.get("postoOrigemId"),
    postoDestinoId: formData.get("postoDestinoId"),
    valor: formData.get("valor"),
    tipo: formData.get("tipo"),
    statusManual: formData.get("statusManual"),
    observacao: formData.get("observacao"),
  });
}

export async function criarMovimentacao(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }
  try {
    await prisma.movimentacaoEntrePostos.create({ data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/relacao-devedores`);
  redirect(ROTA);
}

export async function atualizarMovimentacao(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }
  try {
    await prisma.movimentacaoEntrePostos.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/relacao-devedores`);
  redirect(ROTA);
}

export async function excluirMovimentacao(formData: FormData) {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.movimentacaoEntrePostos.delete({ where: { id } });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/relacao-devedores`);
}

function lado(v: FormDataEntryValue | null): "origem" | "destino" | null {
  return v === "origem" || v === "destino" ? v : null;
}

export async function vincularAoExtrato(formData: FormData) {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const movimentacaoId = formData.get("movimentacaoId");
  const ladoEscolhido = lado(formData.get("lado"));
  const lancamentoExtratoId = formData.get("lancamentoExtratoId");
  if (typeof movimentacaoId !== "string" || !ladoEscolhido || typeof lancamentoExtratoId !== "string") return;
  await vincularLancamento({ movimentacaoId, lado: ladoEscolhido, lancamentoExtratoId });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${movimentacaoId}/vincular`);
}

export async function desvincularDoExtrato(formData: FormData) {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const movimentacaoId = formData.get("movimentacaoId");
  const ladoEscolhido = lado(formData.get("lado"));
  if (typeof movimentacaoId !== "string" || !ladoEscolhido) return;
  await desvincularLancamento({ movimentacaoId, lado: ladoEscolhido });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${movimentacaoId}/vincular`);
}
