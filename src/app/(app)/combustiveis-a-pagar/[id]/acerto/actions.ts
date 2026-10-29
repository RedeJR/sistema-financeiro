"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { valoresDoFormulario, type ActionState } from "@/lib/form-state";
import { vincularLancamentosCombustivel } from "@/lib/combustiveis/vinculo";

const ROTA = "/combustiveis-a-pagar";

const schema = z.object({
  devedorId: z.string().trim().min(1, "Escolha o posto que quitou."),
  data: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .transform((v) => new Date(`${v}T00:00:00.000Z`)),
  valor: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const d = paraDecimalString(v);
      if (d === null || Number(d) <= 0) {
        ctx.addIssue({ code: "custom", message: "Valor inválido." });
        return z.NEVER;
      }
      return d;
    }),
  observacao: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

function revalidar(contaId: string) {
  revalidatePath(ROTA);
  revalidatePath("/combustiveis-pagos");
  revalidatePath("/entre-postos");
  revalidatePath(`${ROTA}/${contaId}/acerto`);
}

// "Acerto entre postos": o boleto foi quitado por fora do extrato (ex: um terceiro pagou e isso abateu a
// dívida de um posto com o posto dono da conta). Vira uma DEVOLUÇÃO no Entre Postos — do posto que
// quitou para o dono do boleto — ligada à conta, e conta como pagamento dela (a conta é dada como paga
// quando extrato + acertos fecham com o líquido do boleto).
export async function registrarAcertoEntrePostos(contaId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");

  const parsed = schema.safeParse({
    devedorId: formData.get("devedorId"),
    data: formData.get("data"),
    valor: formData.get("valor"),
    observacao: formData.get("observacao"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", values: valoresDoFormulario(formData) };

  const conta = await prisma.contaAPagar.findUnique({
    where: { id: contaId },
    include: {
      fornecedor: true,
      lancamentosExtratoConciliados: { select: { valor: true } },
      acertosEntrePostos: { select: { valor: true } },
    },
  });
  if (!conta || !conta.combustivel) return { error: "Combustível não encontrado.", values: valoresDoFormulario(formData) };
  if (parsed.data.devedorId === conta.postoId) {
    return { error: "O posto que quitou precisa ser diferente do posto dono do boleto.", values: valoresDoFormulario(formData) };
  }

  const liquido = Number(conta.valor) - Number(conta.desconto);
  const jaPago =
    conta.lancamentosExtratoConciliados.reduce((s, l) => s + Math.abs(Number(l.valor)), 0) +
    conta.acertosEntrePostos.reduce((s, m) => s + Number(m.valor), 0);
  const restante = Math.round((liquido - jaPago) * 100) / 100;
  if (Number(parsed.data.valor) > restante + 0.005) {
    return {
      error: `O valor do acerto (R$ ${Number(parsed.data.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) é maior que o que falta pagar do boleto (R$ ${restante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
      values: valoresDoFormulario(formData),
    };
  }

  const descricaoConta = `${conta.fornecedor.nome}${conta.descricao ? ` — ${conta.descricao}` : ""}`;
  await prisma.movimentacaoEntrePostos.create({
    data: {
      data: parsed.data.data,
      postoOrigemId: parsed.data.devedorId,
      postoDestinoId: conta.postoId,
      valor: parsed.data.valor,
      tipo: "DEVOLUCAO",
      observacao: parsed.data.observacao ?? `Acerto — boleto de combustível (${descricaoConta})`,
      contaAPagarId: contaId,
    },
  });
  await vincularLancamentosCombustivel({ contaId, lancamentoIds: [] }); // recalcula a baixa

  revalidar(contaId);
  redirect(ROTA);
}

export async function desfazerAcertoEntrePostos(formData: FormData) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const movId = formData.get("movimentacaoId");
  if (typeof movId !== "string" || !movId) return;
  const mov = await prisma.movimentacaoEntrePostos.findUnique({ where: { id: movId } });
  if (!mov || !mov.contaAPagarId) return;
  await prisma.movimentacaoEntrePostos.delete({ where: { id: movId } });
  await vincularLancamentosCombustivel({ contaId: mov.contaAPagarId, lancamentoIds: [] }); // recalcula a baixa
  revalidar(mov.contaAPagarId);
  redirect(`${ROTA}/${mov.contaAPagarId}/acerto`);
}
