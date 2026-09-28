"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
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
//
// Um INSERT só, com todas as linhas de uma vez (ON CONFLICT faz o upsert) —
// não um upsert por linha dentro de uma transação. Com um período grande e
// vários postos (ex: um mês inteiro, todos os postos = ~570 linhas), 570
// upserts um a um estourava os 5s de timeout padrão de transação
// interativa do Prisma e o salvamento falhava sem avisar nada (bug real,
// reproduzido: 26 postos x 22 dias = 5763ms, timeout em 5000ms). Um INSERT
// multi-linha é UMA viagem ao banco, independente de quantas linhas tem.
export async function salvarFluxoCaixa(formData: FormData) {
  await exigirPermissao("FLUXO_DE_CAIXA", "editar");

  const chaves = formData.getAll("chave").map(String);

  const linhas = chaves.map((chave) => {
    const [postoId, data] = chave.split("|");
    return {
      postoId,
      data: dataUTC(data),
      saldoInicial: paraDecimalString(String(formData.get(`saldoInicial__${chave}`) ?? "")) ?? "0",
      recebimentos: paraDecimalString(String(formData.get(`recebimentos__${chave}`) ?? "")) ?? "0",
      despesasExtras: paraDecimalString(String(formData.get(`despesasExtras__${chave}`) ?? "")) ?? "0",
    };
  });

  if (linhas.length > 0) {
    const valores = Prisma.join(
      linhas.map(
        (l) =>
          Prisma.sql`(${Prisma.raw(`gen_random_uuid()::text`)}, ${l.postoId}, ${l.data}, ${l.saldoInicial}::numeric, ${l.recebimentos}::numeric, ${l.despesasExtras}::numeric, now(), now())`
      )
    );
    await prisma.$executeRaw`
      INSERT INTO fluxo_caixa_dias (id, "postoId", data, "saldoInicial", recebimentos, "despesasExtras", "createdAt", "updatedAt")
      VALUES ${valores}
      ON CONFLICT ("postoId", data) DO UPDATE SET
        "saldoInicial" = EXCLUDED."saldoInicial",
        recebimentos = EXCLUDED.recebimentos,
        "despesasExtras" = EXCLUDED."despesasExtras",
        "updatedAt" = now()
    `;
  }

  const voltarPara = String(formData.get("voltarPara") ?? ROTA);
  redirect(voltarPara);
}
