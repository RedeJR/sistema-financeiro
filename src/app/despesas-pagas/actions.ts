"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { isForeignKeyConstraintError, valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/despesas-pagas";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const schemaAvulsa = z.object({
  postoId: z.string().trim().min(1, "Escolha um posto."),
  fornecedorId: z.string().trim().min(1, "Escolha um fornecedor."),
  planoContaId: z.string().trim().min(1, "Escolha uma conta do plano de contas."),
  bancoId: z.string().trim().min(1, "Escolha o banco onde foi pago."),
  dataPagamento: z.string().trim().min(1, "Informe a data do pagamento."),
  postoPagamentoId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  numeroDocumento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  descricao: z
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

// Despesa avulsa: algo que "surgiu no dia", fora do planejamento normal de
// Contas a Pagar. Já nasce marcada como paga.
export async function criarDespesaAvulsa(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await exigirPermissao("DESPESAS_PAGAS", "editar");

  const parsed = schemaAvulsa.safeParse({
    postoId: formData.get("postoId"),
    fornecedorId: formData.get("fornecedorId"),
    planoContaId: formData.get("planoContaId"),
    bancoId: formData.get("bancoId"),
    dataPagamento: formData.get("dataPagamento"),
    postoPagamentoId: formData.get("postoPagamentoId"),
    numeroDocumento: formData.get("numeroDocumento"),
    descricao: formData.get("descricao"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      values: valoresDoFormulario(formData),
    };
  }

  const dataPagamento = dataUTC(parsed.data.dataPagamento);

  try {
    await prisma.contaAPagar.create({
      data: {
        postoId: parsed.data.postoId,
        fornecedorId: parsed.data.fornecedorId,
        planoContaId: parsed.data.planoContaId,
        numeroDocumento: parsed.data.numeroDocumento,
        descricao: parsed.data.descricao,
        valor: parsed.data.valor,
        dataEmissao: dataPagamento,
        dataVencimento: dataPagamento,
        paga: true,
        avulsa: true,
        dataPagamento,
        bancoPagamentoId: parsed.data.bancoId,
        postoPagamentoId: parsed.data.postoPagamentoId,
      },
    });
  } catch (e) {
    if (isForeignKeyConstraintError(e)) {
      return {
        error: "Posto, fornecedor, conta do plano de contas ou banco inválido.",
        values: valoresDoFormulario(formData),
      };
    }
    throw e;
  }

  revalidatePath(ROTA);
  revalidatePath("/contas-a-pagar");
  // Volta pro filtro que já estava aplicado na lista (ver campo oculto
  // "voltarPara" em formulario-despesa-avulsa.tsx) — pedido da usuária, sem
  // isso caía sempre na lista sem filtro nenhum.
  const voltarPara = formData.get("voltarPara");
  redirect(typeof voltarPara === "string" && voltarPara ? voltarPara : ROTA);
}

// Desfaz o pagamento — volta a conta pro estado "a pagar", liberando edição
// de novo em Contas a Pagar. Não some com o histórico: só zera paga/banco/
// data/posto pagador. Também desfaz o vínculo de conciliação, se houver
// (senão o lançamento do extrato continuava "ligado" a uma despesa que não
// está mais paga, e nunca mais aparecia pra revisão em Conciliação de
// Extratos nem podia ser religado a nada).
export async function desfazerPagamento(formData: FormData) {
  await exigirPermissao("DESPESAS_PAGAS", "editar");
  const id = formData.get("id");
  if (typeof id !== "string") return;

  await prisma.$transaction([
    prisma.lancamentoExtrato.updateMany({ where: { contaAPagarId: id }, data: { contaAPagarId: null } }),
    prisma.contaAPagar.update({
      where: { id },
      data: { paga: false, bancoPagamentoId: null, dataPagamento: null, postoPagamentoId: null },
    }),
  ]);

  revalidatePath(ROTA);
  revalidatePath("/contas-a-pagar");
  revalidatePath("/conferencia-diaria");
  revalidatePath("/extratos/conciliacao");
}
