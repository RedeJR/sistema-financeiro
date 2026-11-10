"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { CATEGORIA_ANTECIPACAO_DAYCOVAL, CATEGORIA_TRANSFERENCIA } from "@/lib/extratos/transferencias";

const ROTA = "/extratos/transferencias";

function destino(formData: FormData): string {
  const v = formData.get("voltarPara");
  return typeof v === "string" && v.startsWith(ROTA) ? v : ROTA;
}

function idsDoForm(formData: FormData): string[] {
  return formData.getAll("ids").filter((v): v is string => typeof v === "string" && v.length > 0);
}

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath("/extratos");
  revalidatePath("/extratos/editar");
  revalidatePath("/extratos/fechamento");
}

// Marca entradas como operação do Daycoval (antecipação de recebíveis): o dinheiro entrou pela conta Daycoval e foi
// repassado pras contas principais, então NÃO é transferência entre contas — é crédito financiado. A categoria
// própria deixa o total antecipado de cada posto visível (pro chamado do Daycoval) e tira o valor do "sem par".
export async function marcarComoAntecipacaoDaycoval(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");
  const ids = idsDoForm(formData);
  if (ids.length === 0) redirect(`${destino(formData)}${destino(formData).includes("?") ? "&" : "?"}erro=nenhuma-selecionada`);

  let categoria = await prisma.categoriaExtrato.findUnique({ where: { nome: CATEGORIA_ANTECIPACAO_DAYCOVAL } });
  if (!categoria) {
    const maior = await prisma.categoriaExtrato.aggregate({ _max: { ordem: true } });
    categoria = await prisma.categoriaExtrato.create({ data: { nome: CATEGORIA_ANTECIPACAO_DAYCOVAL, tipo: "PADRAO", ordem: (maior._max.ordem ?? 0) + 1 } });
  }
  // só entradas: antecipação é dinheiro que entra
  await prisma.lancamentoExtrato.updateMany({ where: { id: { in: ids }, valor: { gt: 0 } }, data: { categoriaId: categoria.id, tipoAdquirente: null } });
  revalidar();
  redirect(destino(formData));
}

// Desfaz a marcação: volta a ser "transferência entre contas".
export async function desmarcarAntecipacaoDaycoval(formData: FormData) {
  await exigirPermissao("EXTRATOS", "editar");
  const ids = idsDoForm(formData);
  if (ids.length === 0) redirect(destino(formData));
  const transf = await prisma.categoriaExtrato.findUnique({ where: { nome: CATEGORIA_TRANSFERENCIA } });
  if (!transf) redirect(destino(formData));
  await prisma.lancamentoExtrato.updateMany({ where: { id: { in: ids }, categoria: { nome: CATEGORIA_ANTECIPACAO_DAYCOVAL } }, data: { categoriaId: transf.id } });
  revalidar();
  redirect(destino(formData));
}
