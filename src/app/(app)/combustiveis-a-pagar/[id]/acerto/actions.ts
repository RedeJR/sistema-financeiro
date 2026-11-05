"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";
import { valoresDoFormulario, type ActionState } from "@/lib/form-state";
import { vincularLancamentosCombustivel } from "@/lib/combustiveis/vinculo";
import { saldoAbertoDoParNoMes } from "@/lib/entrePostos/relatorios";

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
// dívida de um posto com o posto dono da conta). Vira, no Entre Postos, uma DEVOLUÇÃO (se o posto que quitou
// devia pro dono do boleto no mês) ou um EMPRÉSTIMO (se não devia) — do posto que quitou para o dono do
// boleto — ligada à conta, e conta como pagamento dela (a conta é dada como paga quando extrato + acertos
// fecham com o líquido do boleto).
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

  // O sistema decide se o acerto é DEVOLUÇÃO ou EMPRÉSTIMO olhando o que existe no mês: se o posto que quitou
  // já devia pro dono do boleto (empréstimo do dono pra ele, ainda não devolvido, no mesmo mês), o acerto
  // devolve até o saldo da dívida; o que passar disso — ou tudo, se não havia dívida — é um empréstimo novo
  // do posto que quitou pro dono do boleto (ele pagou com o dinheiro dele). Os acertos zeram a cada mês.
  const valorAcerto = Number(parsed.data.valor);
  const saldoDivida = await saldoAbertoDoParNoMes({ credorId: conta.postoId, tomadorId: parsed.data.devedorId, ateData: parsed.data.data });
  const valorDevolucao = Math.round(Math.min(valorAcerto, Math.max(saldoDivida, 0)) * 100) / 100;
  const valorEmprestimo = Math.round((valorAcerto - valorDevolucao) * 100) / 100;

  const descricaoConta = `${conta.fornecedor.nome}${conta.descricao ? ` — ${conta.descricao}` : ""}`;
  const base = {
    data: parsed.data.data,
    postoOrigemId: parsed.data.devedorId,
    postoDestinoId: conta.postoId,
    contaAPagarId: contaId,
  };
  const obs = (rotulo: string) => parsed.data.observacao ?? `Acerto — boleto de combustível (${descricaoConta}) — ${rotulo}`;
  const criar = [];
  if (valorDevolucao > 0) {
    criar.push(prisma.movimentacaoEntrePostos.create({ data: { ...base, valor: valorDevolucao.toFixed(2), tipo: "DEVOLUCAO", observacao: obs("devolução") } }));
  }
  if (valorEmprestimo > 0) {
    criar.push(
      prisma.movimentacaoEntrePostos.create({
        data: { ...base, valor: valorEmprestimo.toFixed(2), tipo: "EMPRESTIMO", observacao: obs("empréstimo (sem dívida em aberto no mês)") },
      })
    );
  }
  await prisma.$transaction(criar);
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
