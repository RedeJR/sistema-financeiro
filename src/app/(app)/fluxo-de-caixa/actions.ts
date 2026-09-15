"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { paraDecimalString } from "@/lib/dinheiro";

const ROTA = "/fluxo-de-caixa";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Cada linha da tabela manda um hidden "chave" (postoId|data) — é o que diz
// pra essa action quais pares posto+dia existem na página, já que ela só
// recebe os inputs soltos no FormData. Salva os 3 campos manuais (Saldo
// Inicial, Recebimentos, Despesas Extras); Combustíveis, Despesas e Saldo
// Final nunca são gravados, são sempre recalculados na consulta.
export async function salvarFluxoCaixa(formData: FormData) {
  await exigirPermissao("FLUXO_DE_CAIXA", "editar");

  const chaves = formData.getAll("chave").map(String);

  const upserts = chaves.map((chave) => {
    const [postoId, data] = chave.split("|");
    const saldoInicial = paraDecimalString(String(formData.get(`saldoInicial__${chave}`) ?? "")) ?? "0";
    const recebimentos = paraDecimalString(String(formData.get(`recebimentos__${chave}`) ?? "")) ?? "0";
    const despesasExtras = paraDecimalString(String(formData.get(`despesasExtras__${chave}`) ?? "")) ?? "0";

    return prisma.fluxoCaixaDia.upsert({
      where: { postoId_data: { postoId, data: dataUTC(data) } },
      update: { saldoInicial, recebimentos, despesasExtras },
      create: { postoId, data: dataUTC(data), saldoInicial, recebimentos, despesasExtras },
    });
  });

  if (upserts.length > 0) {
    await prisma.$transaction(upserts);
  }

  const voltarPara = String(formData.get("voltarPara") ?? ROTA);
  redirect(voltarPara);
}
