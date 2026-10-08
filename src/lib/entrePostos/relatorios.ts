import "server-only";
import { prisma } from "@/lib/prisma";

export type MovimentacaoEntrePostos = {
  id: string;
  data: Date;
  postoOrigemId: string;
  postoOrigemNome: string;
  postoDestinoId: string;
  postoDestinoNome: string;
  valor: number;
  tipo: "EMPRESTIMO" | "DEVOLUCAO";
  statusManual: string | null;
  observacao: string | null;
  vinculadoOrigem: boolean;
  vinculadoDestino: boolean;
};

export async function listarMovimentacoes(params: {
  postoId?: string | string[]; // participa como origem OU destino
  dataInicio?: Date;
  dataFim?: Date;
}): Promise<MovimentacaoEntrePostos[]> {
  const { postoId, dataInicio, dataFim } = params;
  const postoIds = Array.isArray(postoId) ? postoId : postoId ? [postoId] : [];
  const movs = await prisma.movimentacaoEntrePostos.findMany({
    where: {
      ...(postoIds.length ? { OR: [{ postoOrigemId: { in: postoIds } }, { postoDestinoId: { in: postoIds } }] } : {}),
      ...(dataInicio || dataFim
        ? { data: { ...(dataInicio ? { gte: dataInicio } : {}), ...(dataFim ? { lte: dataFim } : {}) } }
        : {}),
    },
    include: { postoOrigem: { select: { nome: true } }, postoDestino: { select: { nome: true } } },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
  });
  return movs.map((m) => ({
    id: m.id,
    data: m.data,
    postoOrigemId: m.postoOrigemId,
    postoOrigemNome: m.postoOrigem.nome,
    postoDestinoId: m.postoDestinoId,
    postoDestinoNome: m.postoDestino.nome,
    valor: Number(m.valor),
    tipo: m.tipo,
    statusManual: m.statusManual,
    observacao: m.observacao,
    vinculadoOrigem: m.lancamentoExtratoOrigemId !== null,
    vinculadoDestino: m.lancamentoExtratoDestinoId !== null,
  }));
}

// --- Cálculo de saldo -------------------------------------------------
//
// Cada relação de empréstimo é identificada pelo par (Credor, Tomador) —
// quem emprestou originalmente pra quem. Um EMPRESTIMO soma nesse par na
// direção literal (Origem=Credor, Destino=Tomador). Uma DEVOLUCAO é o
// Tomador mandando dinheiro de volta pro Credor — na transação em si o
// dinheiro sai do Tomador (Origem da linha) e chega no Credor (Destino da
// linha), ou seja, o par de referência é o INVERSO do que está gravado na
// linha (Destino da linha, Origem da linha). Ver comentário no schema
// (MovimentacaoEntrePostos).

export type SaldoPorPar = {
  credorId: string;
  credorNome: string;
  tomadorId: string;
  tomadorNome: string;
  totalEmprestado: number;
  totalDevolvido: number;
  saldoAberto: number; // totalEmprestado - totalDevolvido
};

const TOLERANCIA = 0.01;

export async function calcularSaldoPorPar(params: { dataFim?: Date } = {}): Promise<SaldoPorPar[]> {
  const { dataFim } = params;
  const movs = await prisma.movimentacaoEntrePostos.findMany({
    where: dataFim ? { data: { lte: dataFim } } : {},
    include: { postoOrigem: { select: { nome: true } }, postoDestino: { select: { nome: true } } },
  });

  const pares = new Map<string, SaldoPorPar>();
  const chave = (credorId: string, tomadorId: string) => `${credorId}|${tomadorId}`;

  for (const m of movs) {
    const [credorId, credorNome, tomadorId, tomadorNome] =
      m.tipo === "EMPRESTIMO"
        ? [m.postoOrigemId, m.postoOrigem.nome, m.postoDestinoId, m.postoDestino.nome]
        : [m.postoDestinoId, m.postoDestino.nome, m.postoOrigemId, m.postoOrigem.nome];

    const k = chave(credorId, tomadorId);
    const par = pares.get(k) ?? {
      credorId,
      credorNome,
      tomadorId,
      tomadorNome,
      totalEmprestado: 0,
      totalDevolvido: 0,
      saldoAberto: 0,
    };
    if (m.tipo === "EMPRESTIMO") par.totalEmprestado += Number(m.valor);
    else par.totalDevolvido += Number(m.valor);
    pares.set(k, par);
  }

  for (const par of pares.values()) par.saldoAberto = par.totalEmprestado - par.totalDevolvido;

  return [...pares.values()].sort(
    (a, b) => a.credorNome.localeCompare(b.credorNome) || a.tomadorNome.localeCompare(b.tomadorNome)
  );
}

export type BlocoDevedor = {
  postoId: string;
  postoNome: string;
  credores: { postoId: string; postoNome: string; saldo: number }[];
  total: number;
};

// Só relações com saldo em aberto (> 1 centavo) — quitadas não aparecem,
// igual à planilha da usuária ("Relação de Devedores").
export async function calcularRelacaoDevedores(params: { dataFim?: Date } = {}): Promise<BlocoDevedor[]> {
  const pares = await calcularSaldoPorPar(params);
  const emAberto = pares.filter((p) => p.saldoAberto > TOLERANCIA);

  const blocos = new Map<string, BlocoDevedor>();
  for (const p of emAberto) {
    const b = blocos.get(p.tomadorId) ?? { postoId: p.tomadorId, postoNome: p.tomadorNome, credores: [], total: 0 };
    b.credores.push({ postoId: p.credorId, postoNome: p.credorNome, saldo: p.saldoAberto });
    b.total += p.saldoAberto;
    blocos.set(p.tomadorId, b);
  }
  for (const b of blocos.values()) b.credores.sort((a, c) => a.postoNome.localeCompare(c.postoNome));
  return [...blocos.values()].sort((a, b) => a.postoNome.localeCompare(b.postoNome));
}

export type SaldoLiquidoPosto = {
  postoId: string;
  postoNome: string;
  credor: number; // a receber
  devedor: number; // a pagar
  liquido: number; // credor - devedor
};

// "É credor / Deve / Saldo líquido" por posto — soma dos saldos em aberto de
// cada par onde o posto é credor menos onde é tomador. Serve de conferência
// rápida: a soma de todos os líquidos deve dar zero (cada real emprestado em
// aberto é, ao mesmo tempo, crédito de um posto e débito de outro).
export async function calcularSaldoLiquidoPorPosto(params: { dataFim?: Date } = {}): Promise<SaldoLiquidoPosto[]> {
  const pares = await calcularSaldoPorPar(params);
  const emAberto = pares.filter((p) => p.saldoAberto > TOLERANCIA);

  const porPosto = new Map<string, SaldoLiquidoPosto>();
  const pega = (id: string, nome: string) => {
    const existente = porPosto.get(id);
    if (existente) return existente;
    const novo = { postoId: id, postoNome: nome, credor: 0, devedor: 0, liquido: 0 };
    porPosto.set(id, novo);
    return novo;
  };
  for (const p of emAberto) {
    pega(p.credorId, p.credorNome).credor += p.saldoAberto;
    pega(p.tomadorId, p.tomadorNome).devedor += p.saldoAberto;
  }
  for (const s of porPosto.values()) s.liquido = s.credor - s.devedor;
  return [...porPosto.values()].sort((a, b) => a.postoNome.localeCompare(b.postoNome));
}
