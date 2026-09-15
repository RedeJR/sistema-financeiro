import "server-only";
import { prisma } from "@/lib/prisma";

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoDeData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Lista de datas ISO entre de/ate (inclusive), um dia por posição — é o que
// deixa a tela "organizada por dias separados" mesmo quando o período
// filtrado tem vários dias (pedido explícito da usuária).
function diasEntre(deISO: string, ateISO: string): string[] {
  const dias: string[] = [];
  for (let d = dataUTC(deISO); d <= dataUTC(ateISO); d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(isoDeData(d));
  }
  return dias;
}

export type LinhaFluxoCaixa = {
  postoId: string;
  posto: string;
  data: string;
  saldoInicial: number;
  recebimentos: number;
  combustiveis: number;
  despesas: number;
  despesasExtras: number;
  saldoFinal: number;
};

export type DiaFluxoCaixa = {
  data: string;
  linhas: LinhaFluxoCaixa[];
  saldoFinalRede: number;
};

// Combustíveis e Despesas nunca são digitados aqui — são somados na hora a
// partir de ContaAPagar (mesma dataVencimento usada em Combustíveis a Pagar
// e Contas a Pagar), pelo campo `combustivel`. Só Saldo Inicial, Recebimentos
// e Despesas Extras vêm de FluxoCaixaDia (preenchimento manual). Saldo Final
// nunca é guardado, é sempre recalculado.
export async function buscarFluxoCaixa(filtros: {
  postoIds: string[];
  de: string;
  ate: string;
}): Promise<DiaFluxoCaixa[]> {
  const { postoIds, de, ate } = filtros;

  const postos = await prisma.posto.findMany({
    where: { ativo: true, ...(postoIds.length ? { id: { in: postoIds } } : {}) },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  const idsPostos = postos.map((p) => p.id);

  const [contas, manuais] = await Promise.all([
    idsPostos.length
      ? prisma.contaAPagar.groupBy({
          by: ["postoId", "dataVencimento", "combustivel"],
          where: {
            dataVencimento: { gte: dataUTC(de), lte: dataUTC(ate) },
            postoId: { in: idsPostos },
          },
          _sum: { valor: true },
        })
      : Promise.resolve([]),
    idsPostos.length
      ? prisma.fluxoCaixaDia.findMany({
          where: {
            data: { gte: dataUTC(de), lte: dataUTC(ate) },
            postoId: { in: idsPostos },
          },
        })
      : Promise.resolve([]),
  ]);

  const somaContas = new Map<string, number>();
  for (const c of contas) {
    const chave = `${c.postoId}|${isoDeData(c.dataVencimento)}|${c.combustivel}`;
    somaContas.set(chave, Number(c._sum.valor ?? 0));
  }

  const manuaisPorChave = new Map<string, (typeof manuais)[number]>();
  for (const m of manuais) {
    manuaisPorChave.set(`${m.postoId}|${isoDeData(m.data)}`, m);
  }

  return diasEntre(de, ate).map((dia) => {
    const linhas: LinhaFluxoCaixa[] = postos.map((posto) => {
      const manual = manuaisPorChave.get(`${posto.id}|${dia}`);
      const saldoInicial = manual ? Number(manual.saldoInicial) : 0;
      const recebimentos = manual ? Number(manual.recebimentos) : 0;
      const despesasExtras = manual ? Number(manual.despesasExtras) : 0;
      const combustiveis = somaContas.get(`${posto.id}|${dia}|true`) ?? 0;
      const despesas = somaContas.get(`${posto.id}|${dia}|false`) ?? 0;
      const saldoFinal = saldoInicial + recebimentos - combustiveis - despesas - despesasExtras;
      return {
        postoId: posto.id,
        posto: posto.nome,
        data: dia,
        saldoInicial,
        recebimentos,
        combustiveis,
        despesas,
        despesasExtras,
        saldoFinal,
      };
    });
    const saldoFinalRede = linhas.reduce((s, l) => s + l.saldoFinal, 0);
    return { data: dia, linhas, saldoFinalRede };
  });
}
