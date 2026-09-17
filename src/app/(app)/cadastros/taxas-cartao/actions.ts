"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import {
  isForeignKeyConstraintError,
  isUniqueConstraintError,
  valoresDoFormulario,
  type ActionState,
} from "@/lib/form-state";

const ROTA = "/cadastros/taxas-cartao";

// Taxa opcional: campo vazio = "-" na planilha de origem (não contratado).
function taxaOpcional(rotulo: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const decimal = paraDecimalString(v);
      if (decimal === null) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválida.` });
        return z.NEVER;
      }
      return decimal;
    });
}

// Prazo em dias, editável linha a linha (pode variar por posto/adquirente —
// pedido explícito da usuária), com o padrão da modalidade como valor inicial.
function prazoDias(rotulo: string, padrao: number) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return padrao;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido.` });
        return z.NEVER;
      }
      return n;
    });
}

const schema = z.object({
  postoId: z.string().trim().min(1, "Escolha um posto."),
  adquirenteId: z.string().trim().min(1, "Escolha uma adquirente."),
  taxaDebito: taxaOpcional("Taxa de débito"),
  prazoDebitoDias: prazoDias("Prazo de débito", 1),
  taxaCreditoVista: taxaOpcional("Taxa de crédito à vista"),
  prazoCreditoVistaDias: prazoDias("Prazo de crédito à vista", 1),
  taxaCreditoParcelado: taxaOpcional("Taxa de crédito parcelado"),
  prazoCreditoParceladoDias: prazoDias("Prazo de crédito parcelado", 30),
  taxaPix: taxaOpcional("Taxa de PIX"),
  prazoPixDias: prazoDias("Prazo de PIX", 1),
  domicilioBancoId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  observacao: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

function lerFormulario(formData: FormData) {
  return schema.safeParse({
    postoId: formData.get("postoId"),
    adquirenteId: formData.get("adquirenteId"),
    taxaDebito: formData.get("taxaDebito"),
    prazoDebitoDias: formData.get("prazoDebitoDias"),
    taxaCreditoVista: formData.get("taxaCreditoVista"),
    prazoCreditoVistaDias: formData.get("prazoCreditoVistaDias"),
    taxaCreditoParcelado: formData.get("taxaCreditoParcelado"),
    prazoCreditoParceladoDias: formData.get("prazoCreditoParceladoDias"),
    taxaPix: formData.get("taxaPix"),
    prazoPixDias: formData.get("prazoPixDias"),
    domicilioBancoId: formData.get("domicilioBancoId"),
    observacao: formData.get("observacao"),
  });
}

export async function criarTaxaCartao(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }

  try {
    await prisma.taxaCartao.create({ data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe uma taxa cadastrada pra essa adquirente nesse posto — edite a existente.",
        values: valoresDoFormulario(formData),
      };
    }
    if (isForeignKeyConstraintError(e)) {
      return { error: "Posto, adquirente ou banco inválido.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarTaxaCartao(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("CADASTROS", "editar");

  const parsed = lerFormulario(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };
  }

  try {
    await prisma.taxaCartao.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return {
        error: "Já existe uma taxa cadastrada pra essa adquirente nesse posto.",
        values: valoresDoFormulario(formData),
      };
    }
    if (isForeignKeyConstraintError(e)) {
      return { error: "Posto, adquirente ou banco inválido.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function alternarAtivoTaxaCartao(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  const atual = await prisma.taxaCartao.findUniqueOrThrow({ where: { id } });
  await prisma.taxaCartao.update({ where: { id }, data: { ativo: !atual.ativo } });
  revalidatePath(ROTA);
}

export async function excluirTaxaCartao(formData: FormData) {
  await exigirPermissao("CADASTROS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await prisma.taxaCartao.delete({ where: { id } });
  revalidatePath(ROTA);
}
