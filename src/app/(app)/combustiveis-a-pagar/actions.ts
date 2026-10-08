"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";
import { vincularLancamentosCombustivel, desvincularLancamentoCombustivel } from "@/lib/combustiveis/vinculo";

const ROTA = "/combustiveis-a-pagar";

// Conta do plano de contas (DRE) usada SEMPRE pra combustível — fixa, não
// aparece pra usuária escolher: GERAL > GERAL (pedido dela, em vez de
// VEICULOS - FROTA > COMBUSTIVEIS, que sujava a DRE de veículos).
async function planoContaCombustivelId(): Promise<string> {
  const conta = await prisma.planoConta.findFirst({
    where: { nome: "GERAL", grupo: { nome: "GERAL" } },
    select: { id: true },
  });
  if (!conta) {
    throw new Error(
      'Conta "GERAL" não encontrada no grupo "GERAL" do plano de contas — cadastre ela em Cadastros > Plano de Contas antes de lançar combustível.'
    );
  }
  return conta.id;
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const schema = z.object({
  postoId: z.string().trim().min(1, "Escolha um posto."),
  fornecedorId: z.string().trim().min(1, "Escolha um fornecedor."),
  dataDescarga: z.string().trim().min(1, "Informe a data de descarga."),
  dataVencimento: z.string().trim().min(1, "Informe a data de vencimento."),
  // Vazio = pago pelo próprio posto dono da conta (caso comum) — mesmo
  // padrão de ContaAPagar.postoPagamentoId usado em Despesas Pagas e
  // Conferência Diária, pra quando um posto manda combustível de/pra outro.
  postoPagamentoId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  observacao: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  valor: z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .transform((v, ctx) => {
      const decimal = paraDecimalString(v);
      if (decimal === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido." });
        return z.NEVER;
      }
      return decimal;
    }),
});

export async function criarCombustivelAPagar(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const parsed = schema.safeParse({
    postoId: formData.get("postoId"),
    fornecedorId: formData.get("fornecedorId"),
    dataDescarga: formData.get("dataDescarga"),
    dataVencimento: formData.get("dataVencimento"),
    postoPagamentoId: formData.get("postoPagamentoId"),
    observacao: formData.get("observacao"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    const planoContaId = await planoContaCombustivelId();
    const dataDescarga = dataUTC(parsed.data.dataDescarga);
    await prisma.contaAPagar.create({
      data: {
        postoId: parsed.data.postoId,
        fornecedorId: parsed.data.fornecedorId,
        planoContaId,
        dataEmissao: dataDescarga,
        dataDescarga,
        dataVencimento: dataUTC(parsed.data.dataVencimento),
        valor: parsed.data.valor,
        descricao: parsed.data.observacao,
        postoPagamentoId: parsed.data.postoPagamentoId,
        combustivel: true,
        paga: false,
      },
    });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      return { error: "Posto ou fornecedor inválido.", values: valoresDoFormulario(formData) };
    }
    if (e instanceof Error && e.message.includes("COMBUSTIVEIS")) {
      return { error: e.message, values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function atualizarCombustivelAPagar(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const parsed = schema.safeParse({
    postoId: formData.get("postoId"),
    fornecedorId: formData.get("fornecedorId"),
    dataDescarga: formData.get("dataDescarga"),
    dataVencimento: formData.get("dataVencimento"),
    postoPagamentoId: formData.get("postoPagamentoId"),
    observacao: formData.get("observacao"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  const atual = await prisma.contaAPagar.findUnique({ where: { id } });
  if (!atual || !atual.combustivel) {
    return { error: "Combustível não encontrado.", values: valoresDoFormulario(formData) };
  }
  if (atual.paga) {
    return {
      error: "Essa conta já foi baixada automaticamente pela conciliação — não dá mais pra editar.",
      values: valoresDoFormulario(formData),
    };
  }

  try {
    const dataDescarga = dataUTC(parsed.data.dataDescarga);
    await prisma.contaAPagar.update({
      where: { id },
      data: {
        postoId: parsed.data.postoId,
        fornecedorId: parsed.data.fornecedorId,
        dataEmissao: dataDescarga,
        dataDescarga,
        dataVencimento: dataUTC(parsed.data.dataVencimento),
        valor: parsed.data.valor,
        descricao: parsed.data.observacao,
        postoPagamentoId: parsed.data.postoPagamentoId,
      },
    });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      return { error: "Posto ou fornecedor inválido.", values: valoresDoFormulario(formData) };
    }
    throw e;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function excluirCombustivelAPagar(formData: FormData) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  const atual = await prisma.contaAPagar.findUnique({ where: { id } });
  if (!atual || !atual.combustivel) return;
  if (atual.paga) {
    redirect(`${ROTA}?erro=ja-paga`);
  }

  await prisma.contaAPagar.delete({ where: { id } });
  revalidatePath(ROTA);
}

function revalidarVinculo(contaId: string) {
  revalidatePath(ROTA);
  revalidatePath("/combustiveis-pagos");
  revalidatePath(`${ROTA}/${contaId}/vincular`);
}

export async function vincularCombustivel(formData: FormData) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const contaId = formData.get("contaId");
  const lancamentoIds = formData.getAll("lancamentoId").map(String);
  if (typeof contaId !== "string" || !contaId || lancamentoIds.length === 0) return;

  const resultado = await vincularLancamentosCombustivel({ contaId, lancamentoIds });
  revalidarVinculo(contaId);

  // Alguém (ou outra aba) já tinha pego um dos selecionados nesse meio
  // tempo — avisa em vez de deixar parecer que vinculou tudo.
  if (resultado.idsJaUsadosPorOutraConta.length > 0) {
    redirect(`${ROTA}/${contaId}/vincular?erro=ja-vinculado&qtd=${resultado.idsJaUsadosPorOutraConta.length}`);
  }
}

export async function desvincularCombustivel(formData: FormData) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const contaId = formData.get("contaId");
  const lancamentoId = formData.get("lancamentoId");
  if (typeof contaId !== "string" || !contaId || typeof lancamentoId !== "string" || !lancamentoId) return;

  await desvincularLancamentoCombustivel({ contaId, lancamentoId });
  revalidarVinculo(contaId);
}
