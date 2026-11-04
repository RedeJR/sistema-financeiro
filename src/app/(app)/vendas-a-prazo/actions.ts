"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";
import { vincularVenda, desvincularVenda } from "@/lib/vendasAPrazo/vinculo";

const ROTA = "/vendas-a-prazo";

function data(rotulo: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`)
    .transform((v) => new Date(`${v}T00:00:00.000Z`));
}

const schema = z
  .object({
    postoId: z.string().trim().min(1, "Escolha o posto."),
    cliente: z.string().trim().min(2, "Informe o cliente."),
    periodoDe: data("Início do período"),
    periodoAte: data("Fim do período"),
    valor: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const decimal = paraDecimalString(v);
        if (decimal === null || Number(decimal) <= 0) {
          ctx.addIssue({ code: "custom", message: "Valor total inválido." });
          return z.NEVER;
        }
        return decimal;
      }),
    dataPagamento: data("Data de pagamento"),
    observacao: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((d, ctx) => {
    if (d.periodoAte < d.periodoDe) ctx.addIssue({ code: "custom", message: "O fim do período é antes do início.", path: ["periodoAte"] });
  });

function ler(formData: FormData) {
  return schema.safeParse({
    postoId: formData.get("postoId"),
    cliente: formData.get("cliente"),
    periodoDe: formData.get("periodoDe"),
    periodoAte: formData.get("periodoAte"),
    valor: formData.get("valor"),
    dataPagamento: formData.get("dataPagamento"),
    observacao: formData.get("observacao"),
  });
}

export async function criarVendaAPrazo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const parsed = ler(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  try {
    await prisma.vendaAPrazo.create({ data: parsed.data });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarVendaAPrazo(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const parsed = ler(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  try {
    // Mudou o valor ou o posto: o vínculo antigo deixa de valer (o automático liga de novo se achar).
    const atual = await prisma.vendaAPrazo.findUnique({ where: { id } });
    const mudouCasamento = !atual || atual.postoId !== parsed.data.postoId || Number(atual.valor).toFixed(2) !== Number(parsed.data.valor).toFixed(2);
    await prisma.vendaAPrazo.update({ where: { id }, data: { ...parsed.data, ...(mudouCasamento ? { lancamentoExtratoId: null } : {}) } });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) return { error: "Posto inválido.", values: valoresDoFormulario(formData) };
    throw e;
  }
  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function excluirVendaAPrazo(formData: FormData) {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.vendaAPrazo.delete({ where: { id } });
  revalidatePath(ROTA);
}

export async function vincularAoExtrato(formData: FormData) {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const vendaId = formData.get("vendaId");
  const lancamentoExtratoId = formData.get("lancamentoExtratoId");
  if (typeof vendaId !== "string" || typeof lancamentoExtratoId !== "string") return;
  await vincularVenda({ vendaId, lancamentoExtratoId });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${vendaId}/vincular`);
}

export async function desvincularDoExtrato(formData: FormData) {
  await exigirPermissao("VENDAS_A_PRAZO", "editar");
  const vendaId = formData.get("vendaId");
  if (typeof vendaId !== "string") return;
  await desvincularVenda(vendaId);
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${vendaId}/vincular`);
}
