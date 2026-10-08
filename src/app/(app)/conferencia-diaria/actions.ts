"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { bancoPadraoPorPosto } from "@/lib/banco-padrao-posto";

const ROTA = "/conferencia-diaria";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Marca uma ou várias contas como pagas de uma vez — mesma ação serve pro
// "marcar uma" e pro "marcar em lote" (a diferença é só quantas linhas vêm
// selecionadas). Formulário externo (via atributo form=...), então erros
// simples voltam por query string em vez de useActionState.
export async function marcarComoPagas(formData: FormData) {
  await exigirPermissao("CONFERENCIA_DIARIA", "editar");

  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string");
  const bancoId = formData.get("bancoId");
  const dataPagamento = formData.get("dataPagamento");
  const postoPagamentoId = formData.get("postoPagamentoId");

  if (ids.length === 0) {
    redirect(`${ROTA}?erro=nenhuma-selecionada`);
  }
  if (typeof bancoId !== "string" || !bancoId) {
    redirect(`${ROTA}?erro=sem-banco`);
  }
  if (typeof dataPagamento !== "string" || !dataPagamento) {
    redirect(`${ROTA}?erro=sem-data`);
  }

  // "previsto" = usa o banco escolhido no lançamento de cada conta (ver
  // ContaAPagar.bancoPrevistoId) — agrupa por banco e atualiza um grupo por
  // vez. Conta sem banco previsto usa o padrão do posto que paga (Sinergia =
  // Stone, Lago = Itaú, Aveiro = Banco do Brasil, demais = Bradesco — ver
  // banco-padrao-posto.ts); só não paga nada se nem isso existir.
  const porBanco = new Map<string, string[]>();
  if (bancoId === "previsto") {
    const contas = await prisma.contaAPagar.findMany({
      where: { id: { in: ids }, paga: false },
      select: { id: true, postoId: true, bancoPrevistoId: true },
    });
    const [todosPostos, todosBancos] = await Promise.all([
      prisma.posto.findMany({ select: { id: true, nome: true } }),
      prisma.banco.findMany({ select: { id: true, nome: true } }),
    ]);
    const padraoPorPosto = bancoPadraoPorPosto(todosPostos, todosBancos);
    const postoPagador = typeof postoPagamentoId === "string" && postoPagamentoId ? postoPagamentoId : null;
    for (const c of contas) {
      const bancoDaConta = c.bancoPrevistoId ?? padraoPorPosto[postoPagador ?? c.postoId];
      if (!bancoDaConta) redirect(`${ROTA}?erro=sem-banco-previsto`);
      porBanco.set(bancoDaConta, [...(porBanco.get(bancoDaConta) ?? []), c.id]);
    }
  } else {
    porBanco.set(bancoId, ids);
  }

  for (const [bancoDoGrupo, idsDoGrupo] of porBanco) {
    await prisma.contaAPagar.updateMany({
      where: { id: { in: idsDoGrupo }, paga: false },
      data: {
        paga: true,
        bancoPagamentoId: bancoDoGrupo,
        dataPagamento: dataUTC(dataPagamento),
        // Vazio ("Mesmo posto da conta") = null, e todo o motor de conciliação
        // trata null como "pago pelo próprio posto" (ver postoPagamentoId ??
        // postoId em src/lib/conciliacao.ts). Só grava algo aqui quando a
        // usuária escolheu explicitamente um posto pagador diferente.
        postoPagamentoId: typeof postoPagamentoId === "string" && postoPagamentoId ? postoPagamentoId : null,
      },
    });
  }

  revalidatePath(ROTA);
  revalidatePath("/despesas-pagas");
  revalidatePath("/contas-a-pagar");
  revalidatePath("/combustiveis-a-pagar");
}
