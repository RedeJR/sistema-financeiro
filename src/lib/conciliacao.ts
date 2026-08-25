import "server-only";
import { prisma } from "@/lib/prisma";

// Cruza Despesas Pagas (Sistema 2 — Contas a Pagar) com os lançamentos de
// débito do extrato bancário (Sistema 1 — Conciliação de Extratos), ver
// PROJETO_SISTEMA_FINANCEIRO.md, "Integração dos dois sistemas".
//
// Critério de match: mesmo Posto PAGADOR, mesmo Banco (bancoPagamento da
// despesa == banco do lançamento), mesmo valor (em módulo — despesa é sempre
// positiva, débito do extrato é negativo) e mesma data de pagamento.
//
// "Posto pagador" (ver ContaAPagar.postoPagamentoId) é o posto de quem o
// dinheiro realmente saiu — normalmente igual ao posto dono da despesa
// (`postoId`), mas nem sempre: um posto às vezes paga conta de outro (ex:
// OLIVEIRA pagando despesa da SUL AMERICA). O LancamentoExtrato.postoId do
// outro lado é SEMPRE o posto da conta bancária de verdade (é de lá que o
// extrato foi importado), então o cruzamento tem que comparar com o posto
// PAGADOR da despesa, nunca com o dono — usar postoId aqui faz o motor nunca
// achar o lançamento certo (ele está no extrato de outro posto). `?? postoId`
// cobre o caso comum (postoPagamentoId não preenchido = pago pelo próprio
// posto da conta).
function chave(postoId: string, bancoId: string, valorAbs: string, dataIso: string): string {
  return `${postoId}|${bancoId}|${valorAbs}|${dataIso}`;
}

export async function rodarConciliacaoAutomatica(
  postoId?: string,
  bancoId?: string
): Promise<{ novosVinculos: number }> {
  const [despesas, lancamentos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: true,
        lancamentoExtratoConciliado: null,
        bancoPagamentoId: { not: null },
        // postoId aqui filtra pelo posto PAGADOR (ver comentário acima) —
        // cobre tanto quem tem postoPagamentoId explícito quanto quem usa o
        // próprio posto da conta (postoPagamentoId null).
        ...(postoId ? { OR: [{ postoPagamentoId: postoId }, { postoPagamentoId: null, postoId }] } : {}),
        ...(bancoId ? { bancoPagamentoId: bancoId } : {}),
      },
      select: {
        id: true,
        postoId: true,
        postoPagamentoId: true,
        bancoPagamentoId: true,
        valor: true,
        dataPagamento: true,
      },
    }),
    prisma.lancamentoExtrato.findMany({
      where: {
        contaAPagarId: null,
        valor: { lt: 0 },
        ...(postoId ? { postoId } : {}),
        ...(bancoId ? { bancoId } : {}),
      },
      select: { id: true, postoId: true, bancoId: true, valor: true, data: true },
    }),
  ]);

  // Agrupa candidatos de cada lado pela mesma chave (posto pagador+banco+
  // valor+data) — só vira vínculo automático quando os dois lados têm
  // exatamente 1.
  const despesasPorChave = new Map<string, typeof despesas>();
  for (const d of despesas) {
    if (!d.bancoPagamentoId || !d.dataPagamento) continue;
    const postoPagador = d.postoPagamentoId ?? d.postoId;
    const k = chave(postoPagador, d.bancoPagamentoId, Number(d.valor).toFixed(2), d.dataPagamento.toISOString());
    const lista = despesasPorChave.get(k) ?? [];
    lista.push(d);
    despesasPorChave.set(k, lista);
  }

  const lancamentosPorChave = new Map<string, typeof lancamentos>();
  for (const l of lancamentos) {
    const k = chave(l.postoId, l.bancoId, Math.abs(Number(l.valor)).toFixed(2), l.data.toISOString());
    const lista = lancamentosPorChave.get(k) ?? [];
    lista.push(l);
    lancamentosPorChave.set(k, lista);
  }

  const vinculos: { lancamentoId: string; despesaId: string }[] = [];
  for (const [k, listaDespesas] of despesasPorChave) {
    if (listaDespesas.length !== 1) continue; // ambíguo desse lado
    const listaLancamentos = lancamentosPorChave.get(k);
    if (!listaLancamentos || listaLancamentos.length !== 1) continue; // sem match ou ambíguo do outro lado
    vinculos.push({ despesaId: listaDespesas[0].id, lancamentoId: listaLancamentos[0].id });
  }

  if (vinculos.length === 0) return { novosVinculos: 0 };

  await prisma.$transaction(
    vinculos.map((v) =>
      prisma.lancamentoExtrato.update({
        where: { id: v.lancamentoId },
        data: { contaAPagarId: v.despesaId },
      })
    )
  );

  return { novosVinculos: vinculos.length };
}

// Status agregado por dia+posto+banco, usado na listagem de Despesas Pagas
// (ver PROJETO_SISTEMA_FINANCEIRO.md "Integração dos dois sistemas").
//
// Critério: TOTAL do grupo (soma das despesas daquele dia/posto/banco)
// contra o TOTAL dos débitos do extrato categorizados "Despesas Pagas" no
// mesmo dia/posto/banco — não mais casamento linha a linha. Decisão da
// usuária: um pagamento lançado uma única vez aqui (ex: folha de
// pagamento/salário) às vezes sai do banco desmembrado em vários PIX/TED
// separados — nenhum deles bate sozinho com o valor da despesa, mas a SOMA
// bate. Comparar por total resolve isso sem exigir vínculo individual.
//
// Isso NÃO é comparar contra TODOS os débitos do dia (empréstimo, tarifa,
// transferência entre contas etc. fariam a soma nunca bater) — só entra na
// conta o que já está categorizado como "Despesas Pagas" no extrato, o
// mesmo escopo usado em conferenciaTotalDiario.
export type StatusConciliacaoGrupo = "CONCILIADO" | "DIVERGENTE" | "NAO_CONCILIADO";

export type GrupoParaStatus = {
  chave: string;
  // Posto PAGADOR do grupo (ver comentário no topo do arquivo) — quem chama
  // essa função precisa já ter resolvido postoPagamentoId ?? postoId antes
  // de montar o grupo, não o postoId (dono) direto.
  postoId: string;
  bancoId: string;
  data: Date;
  despesas: { id: string; valor: number }[];
};

function chaveGrupo(postoId: string, bancoId: string, dataIso: string): string {
  return `${postoId}|${bancoId}|${dataIso}`;
}

export async function statusConciliacaoPorGrupo(
  grupos: GrupoParaStatus[]
): Promise<Map<string, { status: StatusConciliacaoGrupo }>> {
  const resultado = new Map<string, { status: StatusConciliacaoGrupo }>();
  if (grupos.length === 0) return resultado;

  const postoIds = [...new Set(grupos.map((g) => g.postoId))];
  const bancoIds = [...new Set(grupos.map((g) => g.bancoId))];
  const tempos = grupos.map((g) => g.data.getTime());
  const dataMin = new Date(Math.min(...tempos));
  const dataMax = new Date(Math.max(...tempos));

  // Só pra saber se o extrato daquele dia/posto/banco já foi importado —
  // decide NAO_CONCILIADO (extrato nem chegou) x DIVERGENTE (chegou, total
  // não bate).
  const lancamentosQualquer = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId: { in: postoIds },
      bancoId: { in: bancoIds },
      data: { gte: dataMin, lte: dataMax },
      valor: { lt: 0 },
    },
    select: { postoId: true, bancoId: true, data: true },
  });
  const existeExtratoPorChave = new Set<string>();
  for (const l of lancamentosQualquer) {
    existeExtratoPorChave.add(chaveGrupo(l.postoId, l.bancoId, l.data.toISOString()));
  }

  // Soma dos débitos "Despesas Pagas" do extrato, por dia+posto+banco —
  // soma tanto lançamento direto quanto divisões (ver
  // LancamentoExtratoDivisao), igual conferenciaTotalDiario faz.
  const categoriaDespesasPagas = await prisma.categoriaExtrato.findUnique({
    where: { nome: "DESPESAS PAGAS" },
  });
  const totalExtratoPorChave = new Map<string, number>();
  if (categoriaDespesasPagas) {
    const [diretos, divisoes] = await Promise.all([
      prisma.lancamentoExtrato.findMany({
        where: {
          postoId: { in: postoIds },
          bancoId: { in: bancoIds },
          data: { gte: dataMin, lte: dataMax },
          categoriaId: categoriaDespesasPagas.id,
        },
        select: { postoId: true, bancoId: true, data: true, valor: true },
      }),
      prisma.lancamentoExtratoDivisao.findMany({
        where: {
          categoriaId: categoriaDespesasPagas.id,
          lancamentoExtrato: {
            postoId: { in: postoIds },
            bancoId: { in: bancoIds },
            data: { gte: dataMin, lte: dataMax },
          },
        },
        select: { valor: true, lancamentoExtrato: { select: { postoId: true, bancoId: true, data: true } } },
      }),
    ]);
    // Soma com sinal (não Math.abs por linha) — um pagamento que saiu e
    // voltou (ex: PIX enviado + devolução, a usuária categoriza os dois como
    // "Despesas Pagas" pra zerar o efeito no total do dia) tem que se
    // cancelar aqui. Tirando o abs() de cada linha antes de somar, os dois
    // lançamentos contavam em dobro em vez de se anular (bug real, viu na
    // prática: SINERGIA 13/08, +232,75 e -232,75 viraram +465,50).
    for (const l of diretos) {
      const k = chaveGrupo(l.postoId, l.bancoId, l.data.toISOString());
      totalExtratoPorChave.set(k, (totalExtratoPorChave.get(k) ?? 0) + Number(l.valor));
    }
    for (const d of divisoes) {
      const k = chaveGrupo(
        d.lancamentoExtrato.postoId,
        d.lancamentoExtrato.bancoId,
        d.lancamentoExtrato.data.toISOString()
      );
      totalExtratoPorChave.set(k, (totalExtratoPorChave.get(k) ?? 0) + Number(d.valor));
    }
  }

  for (const g of grupos) {
    const k = chaveGrupo(g.postoId, g.bancoId, g.data.toISOString());
    let status: StatusConciliacaoGrupo;
    if (!existeExtratoPorChave.has(k)) {
      status = "NAO_CONCILIADO";
    } else {
      const totalDespesas = g.despesas.reduce((soma, d) => soma + d.valor, 0);
      // totalExtratoPorChave é a soma COM SINAL (débito negativo) — o abs()
      // é só na hora de comparar com o total de despesas (sempre positivo).
      const totalExtrato = Math.abs(totalExtratoPorChave.get(k) ?? 0);
      status = Math.abs(totalDespesas - totalExtrato) < 0.01 ? "CONCILIADO" : "DIVERGENTE";
    }
    resultado.set(g.chave, { status });
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Combustíveis a Pagar: baixa automática via conciliação bancária.
// ---------------------------------------------------------------------------
// Diferença fundamental do motor acima (rodarConciliacaoAutomatica): aquele
// só casa despesas que JÁ estão marcadas como pagas (paga=true) com o
// lançamento correspondente — ele não decide SE algo foi pago, só liga dois
// registros que já sabem que foram. Combustível é o contrário: a conta
// nasce "a pagar" (paga=false) e é o PRÓPRIO casamento com o extrato que
// decide que foi paga — pedido explícito da usuária ("a baixa da conta será
// automática após a conciliação bancária").
//
// Critério de match: mesmo posto + mesmo valor (em módulo) + lançamento
// categorizado "Combustíveis" no extrato (a usuária já revisa/categoriza os
// débitos do extrato normalmente — reaproveita esse trabalho em vez de
// pedir uma segunda categorização). SEM exigir data igual: a data de
// vencimento do combustível é só uma previsão, o débito real no banco pode
// cair em outro dia. Só liga automaticamente quando há exatamente 1
// candidato de cada lado pra aquela chave (posto+valor) — mesmo princípio
// conservador do resto do sistema (categorizer.ts, motor de conciliação
// normal): ambíguo fica pra revisão manual em vez de arriscar ligar errado.
function chaveCombustivel(postoId: string, valorAbs: string): string {
  return `${postoId}|${valorAbs}`;
}

export async function rodarConciliacaoAutomaticaCombustiveis(): Promise<{ novasBaixas: number }> {
  const categoriaCombustiveis = await prisma.categoriaExtrato.findUnique({
    where: { nome: "COMBUSTÍVEIS" },
  });
  if (!categoriaCombustiveis) return { novasBaixas: 0 };

  const [pendentes, lancamentos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: { combustivel: true, paga: false, lancamentoExtratoConciliado: null },
      select: { id: true, postoId: true, valor: true },
    }),
    prisma.lancamentoExtrato.findMany({
      where: { categoriaId: categoriaCombustiveis.id, contaAPagarId: null, valor: { lt: 0 } },
      select: { id: true, postoId: true, valor: true, data: true, bancoId: true },
    }),
  ]);

  const pendentesPorChave = new Map<string, typeof pendentes>();
  for (const p of pendentes) {
    const k = chaveCombustivel(p.postoId, Number(p.valor).toFixed(2));
    const lista = pendentesPorChave.get(k) ?? [];
    lista.push(p);
    pendentesPorChave.set(k, lista);
  }

  const lancamentosPorChave = new Map<string, typeof lancamentos>();
  for (const l of lancamentos) {
    const k = chaveCombustivel(l.postoId, Math.abs(Number(l.valor)).toFixed(2));
    const lista = lancamentosPorChave.get(k) ?? [];
    lista.push(l);
    lancamentosPorChave.set(k, lista);
  }

  const baixas: { contaId: string; lancamentoId: string; data: Date; bancoId: string }[] = [];
  for (const [k, listaPendentes] of pendentesPorChave) {
    if (listaPendentes.length !== 1) continue;
    const listaLancamentos = lancamentosPorChave.get(k);
    if (!listaLancamentos || listaLancamentos.length !== 1) continue;
    baixas.push({
      contaId: listaPendentes[0].id,
      lancamentoId: listaLancamentos[0].id,
      data: listaLancamentos[0].data,
      bancoId: listaLancamentos[0].bancoId,
    });
  }

  if (baixas.length === 0) return { novasBaixas: 0 };

  await prisma.$transaction(
    baixas.flatMap((b) => [
      prisma.contaAPagar.update({
        where: { id: b.contaId },
        data: { paga: true, dataPagamento: b.data, bancoPagamentoId: b.bancoId },
      }),
      prisma.lancamentoExtrato.update({
        where: { id: b.lancamentoId },
        data: { contaAPagarId: b.contaId },
      }),
    ])
  );

  return { novasBaixas: baixas.length };
}

// ---------------------------------------------------------------------------
// Conferência por total do dia (complementa o vínculo linha-a-linha acima).
// ---------------------------------------------------------------------------
// Pedido da usuária: o vínculo 1-a-1 só aponta problema quando os DOIS lados
// existem e o valor não bate — se uma despesa inteira nunca foi lançada em
// Contas a Pagar (nem existe pra comparar), ele fica quieto. Comparando o
// TOTAL do dia das Contas a Pagar pagas com o total do dia da categoria
// "Despesas Pagas" no extrato (que é justamente a categoria que a usuária
// usa pra marcar "esse débito é uma despesa paga do Sistema 2"), uma conta
// faltando aparece como diferença nos totais mesmo sem ter par nenhum.
//
// Some tanto lançamentos direto quanto divisões (ver LancamentoExtratoDivisao)
// — um lançamento dividido em Despesa Posto + Conveniência, por exemplo,
// contribui só pela fatia que for "Despesas Pagas", se houver.

export type LinhaConferenciaDiaria = {
  postoId: string;
  postoNome: string;
  data: Date;
  totalContasPagas: number;
  totalExtratoDespesasPagas: number;
  diferenca: number;
};

export async function conferenciaTotalDiario(params: {
  postoId?: string;
  de?: string; // "YYYY-MM-DD"
  ate?: string;
}): Promise<LinhaConferenciaDiaria[]> {
  const { postoId, de, ate } = params;

  const categoriaDespesasPagas = await prisma.categoriaExtrato.findUnique({
    where: { nome: "DESPESAS PAGAS" },
  });
  if (!categoriaDespesasPagas) return [];

  const dataUTC = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const filtroData =
    de || ate
      ? { ...(de ? { gte: dataUTC(de) } : {}), ...(ate ? { lte: dataUTC(ate) } : {}) }
      : undefined;

  const [contasPagas, lancamentosDireto, divisoes, postos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: true,
        // Combustível tem reconciliação própria contra a categoria
        // "Combustíveis" do extrato (ver rodarConciliacaoAutomaticaCombustiveis),
        // já verificada 1-a-1 na hora da baixa — não é o tipo de despesa que
        // essa comparação por "Despesas Pagas" pretende cobrir. Contando ele
        // aqui também, o total do dia acusaria diferença falsa sempre que
        // teve combustível baixado (a extrato dele foi pra outra categoria).
        combustivel: false,
        // postoId filtra pelo posto PAGADOR (mesmo motivo do comentário no
        // topo do arquivo) — essa comparação é contra o extrato bancário
        // real, que é sempre do posto de quem pagou.
        ...(postoId ? { OR: [{ postoPagamentoId: postoId }, { postoPagamentoId: null, postoId }] } : {}),
        ...(filtroData ? { dataPagamento: filtroData } : {}),
      },
      select: { postoId: true, postoPagamentoId: true, dataPagamento: true, valor: true },
    }),
    prisma.lancamentoExtrato.findMany({
      where: {
        categoriaId: categoriaDespesasPagas.id,
        ...(postoId ? { postoId } : {}),
        ...(filtroData ? { data: filtroData } : {}),
      },
      select: { postoId: true, data: true, valor: true },
    }),
    prisma.lancamentoExtratoDivisao.findMany({
      where: {
        categoriaId: categoriaDespesasPagas.id,
        lancamentoExtrato: {
          ...(postoId ? { postoId } : {}),
          ...(filtroData ? { data: filtroData } : {}),
        },
      },
      select: { valor: true, lancamentoExtrato: { select: { postoId: true, data: true } } },
    }),
    prisma.posto.findMany({ select: { id: true, nome: true } }),
  ]);

  const nomePosto = new Map(postos.map((p) => [p.id, p.nome]));

  type Acumulado = { totalContasPagas: number; totalExtrato: number };
  const porChave = new Map<string, Acumulado>();
  const chave = (postoId: string, data: Date) => `${postoId}|${data.toISOString().slice(0, 10)}`;
  function acc(postoId: string, data: Date): Acumulado {
    const k = chave(postoId, data);
    let a = porChave.get(k);
    if (!a) {
      a = { totalContasPagas: 0, totalExtrato: 0 };
      porChave.set(k, a);
    }
    return a;
  }

  for (const c of contasPagas) {
    if (!c.dataPagamento) continue;
    // Agrupa pelo posto PAGADOR, não pelo dono da despesa — ver comentário
    // no topo do arquivo (ContaAPagar.postoPagamentoId).
    acc(c.postoPagamentoId ?? c.postoId, c.dataPagamento).totalContasPagas += Number(c.valor);
  }
  // Soma com sinal (não Math.abs por linha, mesmo motivo de
  // statusConciliacaoPorGrupo acima) — um pagamento que saiu e voltou
  // (PIX + devolução, ambos categorizados "Despesas Pagas" pra zerar o
  // efeito no total do dia) precisa se cancelar na soma, não contar em
  // dobro.
  for (const l of lancamentosDireto) {
    acc(l.postoId, l.data).totalExtrato += Number(l.valor);
  }
  for (const d of divisoes) {
    acc(d.lancamentoExtrato.postoId, d.lancamentoExtrato.data).totalExtrato += Number(d.valor);
  }

  const linhas: LinhaConferenciaDiaria[] = [...porChave.entries()].map(([k, a]) => {
    const [pId, dataIso] = k.split("|");
    // totalExtrato acumulado é COM SINAL (débito negativo) — abs() só na
    // hora de exibir/comparar com o total de contas pagas (sempre positivo).
    const totalExtratoAbs = Math.abs(a.totalExtrato);
    return {
      postoId: pId,
      postoNome: nomePosto.get(pId) ?? "—",
      data: dataUTC(dataIso),
      totalContasPagas: a.totalContasPagas,
      totalExtratoDespesasPagas: totalExtratoAbs,
      diferenca: Math.round((a.totalContasPagas - totalExtratoAbs) * 100) / 100,
    };
  });

  linhas.sort((x, y) => y.data.getTime() - x.data.getTime() || x.postoNome.localeCompare(y.postoNome));
  return linhas;
}
