"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import type { StatusConferenciaCaixa } from "@/generated/prisma/client";

const ROTA = "/conferencia-caixa/conferencia";

export async function atualizarStatusConferenciaCaixa(formData: FormData) {
  await exigirPermissao("CONFERENCIA_CAIXA", "editar");
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || typeof status !== "string") return;
  if (status !== "PENDENTE" && status !== "CONFERIDO" && status !== "DIVERGENTE") return;
  await prisma.conferenciaCaixa.update({ where: { id }, data: { status: status as StatusConferenciaCaixa } });
  revalidatePath(ROTA);
}
