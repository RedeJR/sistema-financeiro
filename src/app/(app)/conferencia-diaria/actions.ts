"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";

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
  // vez; se alguma das selecionadas não tem banco previsto, não paga nada.
  const porBanco = new Map<string, string[]>();
  if (bancoId === "previsto") {
    const contas = await prisma.contaAPagar.findMany({
      where: { id: { in: ids }, paga: false },
      select: { id: true, bancoPrevistoId: true },
    });
    for (const c of contas) {
      if (!c.bancoPrevistoId) redirect(`${ROTA}?erro=sem-banco-previsto`);
      porBanco.set(c.bancoPrevistoId, [...(porBanco.get(c.bancoPrevistoId) ?? []), c.id]);
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
