import "server-only";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calcularInicio, type DadosInicio, type PermissoesInicio } from "@/lib/painel/inicio";

// Os blocos lentos do painel inicial (previsão de recebimento, extratos e vendas
// desatualizados, conciliação) levam vários segundos pra calcular. Em vez de
// recalcular a cada abertura: a tela mostra NA HORA o último resultado guardado e,
// se ele já passou de TTL, o sistema recalcula em segundo plano (depois de
// responder) e deixa pronto pra próxima abertura. Sem resultado guardado (primeiro
// acesso do dia), calcula na hora e guarda. Só lê dados — nada de vendas/extratos é alterado.

const TTL_MS = 3 * 60_000;

export type InicioPronto = { dados: DadosInicio; atualizadoEm: string; doSnapshot: boolean };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function recalcularEGuardar(chave: string, params: { dataRef: Date; hoje: Date; perm: PermissoesInicio }): Promise<InicioPronto> {
  const dados = await calcularInicio(params);
  const agora = new Date();
  await prisma.painelSnapshot
    .upsert({
      where: { chave },
      create: { chave, dados: dados as unknown as Prisma.InputJsonValue, atualizadoEm: agora },
      update: { dados: dados as unknown as Prisma.InputJsonValue, atualizadoEm: agora },
    })
    .catch(() => {}); // não guardar não pode derrubar a tela
  return { dados, atualizadoEm: agora.toISOString(), doSnapshot: false };
}

export async function carregarInicioComSnapshot(params: {
  dataRef: Date;
  hoje: Date;
  perm: PermissoesInicio;
  forcar?: boolean;
}): Promise<InicioPronto> {
  const { dataRef, hoje, perm, forcar } = params;
  // Uma versão por dia, por dia consultado e por combinação de permissões (cada uma enxerga blocos diferentes).
  const chave = `inicio:${iso(hoje)}:${iso(dataRef)}:${Object.values(perm).map(Number).join("")}`;

  if (!forcar) {
    const guardado = await prisma.painelSnapshot.findUnique({ where: { chave } }).catch(() => null);
    if (guardado) {
      if (Date.now() - guardado.atualizadoEm.getTime() > TTL_MS) {
        after(async () => {
          try {
            await recalcularEGuardar(chave, { dataRef, hoje, perm });
          } catch {
            // fica com o resultado antigo; a próxima abertura tenta de novo
          }
        });
      }
      return { dados: guardado.dados as unknown as DadosInicio, atualizadoEm: guardado.atualizadoEm.toISOString(), doSnapshot: true };
    }
  }
  return recalcularEGuardar(chave, { dataRef, hoje, perm });
}
