"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { buscarRelatorioCaixa } from "@/lib/cartoes/relatorio";

// datetime-local ("AAAA-MM-DDTHH:MM") tratado como UTC direto — mesmo
// padrão da tela de Relatório de Caixa.
function paraDatetimeUTC(valor: string): Date {
  return new Date(`${valor}:00.000Z`);
}

// Marca o caixa (posto + turno) como conferido ou divergente e volta pra
// tela em branco, pronta pra conferir o próximo. O valor total é
// recalculado aqui, não vem do formulário.
export async function registrarConferenciaCaixa(formData: FormData) {
  await exigirPermissao("CONFERENCIA_CAIXA", "editar");
  const postoId = formData.get("postoId");
  const inicioParam = formData.get("inicio");
  const fimParam = formData.get("fim");
  const status = formData.get("status");
  if (typeof postoId !== "string" || typeof inicioParam !== "string" || typeof fimParam !== "string") return;
  if (status !== "CONFERIDO" && status !== "DIVERGENTE") return;

  const inicio = paraDatetimeUTC(inicioParam);
  const fim = paraDatetimeUTC(fimParam);
  const relatorio = await buscarRelatorioCaixa({ postoId, inicio, fim });

  await prisma.conferenciaCaixa.upsert({
    where: { postoId_inicio_fim: { postoId, inicio, fim } },
    create: { postoId, inicio, fim, valorTotal: relatorio.totalBruto, status },
    update: { valorTotal: relatorio.totalBruto, status },
  });

  revalidatePath("/conferencia-caixa/conferencia");
  redirect("/conferencia-caixa/relatorio");
}
