"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROTA = "/extratos/conciliacao";

function revalidarTudo() {
  revalidatePath(ROTA);
  revalidatePath("/extratos");
  revalidatePath("/extratos/editar");
}

function rotaDeVolta(formData: FormData): string {
  const voltarPara = formData.get("voltarPara");
  return typeof voltarPara === "string" && voltarPara ? voltarPara : ROTA;
}

// Vincula manualmente uma despesa paga a um lançamento do extrato — usado
// quando a conciliação automática não achou candidato único (datas não
// batem exatamente, valor arredondado diferente etc.).
export async function vincularManualmente(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");

  const despesaId = formData.get("despesaId");
  const lancamentoId = formData.get("lancamentoId");
  const voltar = rotaDeVolta(formData);

  if (typeof despesaId !== "string" || !despesaId) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=sem-despesa`);
  }
  if (typeof lancamentoId !== "string" || !lancamentoId) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=sem-lancamento`);
  }

  // Uma despesa normal só concilia com UM lançamento (o banco não impede
  // mais isso sozinho — ver comentário em LancamentoExtrato.contaAPagarId
  // no schema, que deixou de ser @unique só pra Combustível a Pagar poder
  // vincular vários lançamentos do mesmo dia numa única conta somada). O
  // vínculo manual daqui nunca cria isso de propósito, então barra se já
  // existir QUALQUER lançamento vinculado a essa despesa.
  const jaVinculado = await prisma.lancamentoExtrato.findFirst({
    where: { contaAPagarId: despesaId },
    select: { id: true },
  });
  if (jaVinculado) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=ja-vinculado`);
  }

  await prisma.lancamentoExtrato.update({
    where: { id: lancamentoId },
    data: { contaAPagarId: despesaId },
  });

  revalidarTudo();
  redirect(voltar);
}

// Desfaz um vínculo (a despesa e o lançamento voltam a aparecer como
// pendentes) — pra corrigir um match automático ou manual que saiu errado.
export async function desvincular(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");

  const lancamentoId = formData.get("lancamentoId");
  if (typeof lancamentoId !== "string" || !lancamentoId) return;

  await prisma.lancamentoExtrato.update({
    where: { id: lancamentoId },
    data: { contaAPagarId: null },
  });

  revalidarTudo();
}
