"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { valoresDoFormulario, type ActionState } from "@/lib/form-state";

const ROTA = "/combustiveis-pagos";

function decimal(rotulo: string, opcional: boolean) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) {
        if (opcional) return "0.00";
        ctx.addIssue({ code: "custom", message: `Informe ${rotulo}.` });
        return z.NEVER;
      }
      const d = paraDecimalString(v);
      if (d === null || Number(d) < 0 || (!opcional && Number(d) <= 0)) {
        ctx.addIssue({ code: "custom", message: `${rotulo} inválido.` });
        return z.NEVER;
      }
      return d;
    });
}

const schema = z.object({ valor: decimal("o valor do boleto", false), desconto: decimal("o desconto", true) });

const TOLERANCIA = 0.01;

// Acerto manual do desconto de um combustível JÁ PAGO (a conta já foi baixada pela conciliação e não
// abre mais na edição normal). Troca só o valor cheio do boleto e o desconto, sem mexer em mais nada
// (a baixa, a data de pagamento e os vínculos com o extrato ficam como estão). Pra não bagunçar a
// conciliação, valor − desconto tem que continuar igual ao que saiu do banco nos lançamentos vinculados.
export async function acertarDescontoCombustivelPago(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const parsed = schema.safeParse({ valor: formData.get("valor"), desconto: formData.get("desconto") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };

  const conta = await prisma.contaAPagar.findUnique({ where: { id }, include: { lancamentosExtratoConciliados: { select: { valor: true } } } });
  if (!conta || !conta.combustivel || !conta.paga) return { error: "Combustível pago não encontrado.", values: valoresDoFormulario(formData) };

  const valor = Number(parsed.data.valor);
  const desconto = Number(parsed.data.desconto);
  if (desconto > valor) return { error: "O desconto não pode ser maior que o valor do boleto.", values: valoresDoFormulario(formData) };

  if (conta.lancamentosExtratoConciliados.length > 0) {
    const pagoNoExtrato = conta.lancamentosExtratoConciliados.reduce((s, l) => s + Math.abs(Number(l.valor)), 0);
    if (Math.abs(valor - desconto - pagoNoExtrato) > TOLERANCIA) {
      const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return {
        error: `Valor menos desconto (R$ ${fmt(valor - desconto)}) precisa ser igual ao que foi pago no extrato (R$ ${fmt(pagoNoExtrato)}).`,
        values: valoresDoFormulario(formData),
      };
    }
  }

  await prisma.contaAPagar.update({ where: { id }, data: { valor: parsed.data.valor, desconto: parsed.data.desconto } });
  revalidatePath(ROTA);
  revalidatePath("/combustiveis-a-pagar");
  revalidatePath("/bonificacao-postecipada");
  redirect(ROTA);
}
