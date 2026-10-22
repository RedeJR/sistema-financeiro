import "server-only";
import { prisma } from "@/lib/prisma";
import { ehDiaUtil, paraProximoDiaUtilSeNecessario } from "@/lib/cartoes/normalizar";
import { previsaoDeRecebimentos } from "@/lib/fluxo/previsaoRecebimentos";
import {
  combustiveisNoExtratoSemConta,
  conferenciaTotalDiario,
  statusDiarioPorPosto,
  type CelulaDiaria,
} from "@/lib/conciliacao";

// Dados do painel inicial. Cada bloco só é calculado se o usuário pode ver o
// módulo correspondente (as queries mais pesadas nem rodam sem permissão).
// Só lê — não grava nada.

export type PermissoesInicio = {
  contas: boolean; // Contas a Pagar
  combustiveis: boolean; // Combustíveis a Pagar
  fluxo: boolean; // Fluxo de Caixa (previsão de recebimento)
  extratos: boolean;
  cartoes: boolean;
  despesasPagas: boolean;
  entrePostos: boolean;
};

const MAQUININHAS = ["CIELO", "CIELO TEF", "CIELO ALUGUEL", "STONE", "PAGSEGURO", "REDE", "GETNET"];
const DIAS_ATRASO_ALERTA = 3; // extrato/venda mais velho que isso entra em "Precisa da sua atenção"
const MIN_LANCAMENTOS_BANCO_ATIVO = 20;
const TOLERANCIA_ATIVA_DIAS = 10;
const CONCILIACAO_DESDE = "2026-09-01"; // mesmo piso usado em Despesas Pagas

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dataUTC(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function somarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function hojeNoBrasil(): Date {
  return dataUTC(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()));
}
export function horaNoBrasil(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
}

export type PostoSituacao = {
  postoId: string;
  posto: string;
  extratoAte: string | null;
  extratoBanco: string | null; // conta bancária mais atrasada do posto (a que define o "último extrato")
  vendasAte: string | null;
  pagarNoDia: number;
  vencidas: number;
  celulas: CelulaDiaria[];
};

export type AlertaInicio = {
  nivel: "ruim" | "atencao" | "ok";
  titulo: string;
  detalhe: string;
  href?: string;
  acao?: string;
};

export type DadosInicio = {
  dataRef: string;
  ehDiaUtil: boolean;
  pagarNoDia: { total: number; qtd: number; combustiveis: number; despesas: number } | null;
  vencidas: { total: number; qtd: number; ateISO: string } | null;
  receber: { total: number; debitoPix: number; creditoVoucher: number; diaISO: string } | null;
  proximosDias: { dia: string; pagar: number | null; receber: number | null }[];
  porPosto: { label: string; despesas: number; combustiveis: number }[];
  situacao: PostoSituacao[];
  alertas: AlertaInicio[];
};

// Os próximos N dias úteis a partir da data de referência (ela mesma, se for útil).
export function proximosDiasUteis(inicio: Date, n: number): Date[] {
  const dias: Date[] = [];
  for (let d = new Date(inicio); dias.length < n; d = somarDias(d, 1)) if (ehDiaUtil(d)) dias.push(new Date(d));
  return dias;
}

const CACHE_MS = 120_000;
const cache = new Map<string, { em: number; dados: Promise<DadosInicio> }>();

export function carregarInicio(params: { dataRef: Date; hoje: Date; perm: PermissoesInicio }): Promise<DadosInicio> {
  const chave = `${iso(params.dataRef)}|${iso(params.hoje)}|${Object.values(params.perm).map(Number).join("")}`;
  const agora = Date.now();
  const guardado = cache.get(chave);
  if (guardado && agora - guardado.em < CACHE_MS) return guardado.dados;
  const dados = calcularInicio(params);
  cache.set(chave, { em: agora, dados });
  dados.catch(() => cache.delete(chave)); // erro não fica guardado
  for (const [k, v] of cache) if (agora - v.em > CACHE_MS * 5) cache.delete(k);
  return dados;
}

async function calcularInicio(params: { dataRef: Date; hoje: Date; perm: PermissoesInicio }): Promise<DadosInicio> {
  const { dataRef, hoje, perm } = params;
  const diasUteis = proximosDiasUteis(dataRef, 7);
  const diasUteisISO = diasUteis.map(iso);
  const ultimoDia = diasUteis[diasUteis.length - 1];
  const hojeISO = iso(hoje);

  // Consultas independentes saem todas juntas (em paralelo) — uma atrás da outra o painel levava
  // dezenas de segundos com a latência do banco. Cada uma é aguardada mais abaixo, onde é usada.
  const pReceber = perm.fluxo
    ? prisma.posto
        .findMany({ where: { ativo: true }, select: { id: true } })
        .then((ativos) => previsaoDeRecebimentos({ postoIds: ativos.map((a) => a.id), dias: diasUteisISO }))
    : null;
  const pExtrato = perm.extratos
    ? prisma.lancamentoExtrato.groupBy({
        by: ["postoId", "bancoId"],
        where: { data: { gte: somarDias(hoje, -40) } },
        _max: { data: true },
        _count: { _all: true },
      })
    : null;
  const pVendas = perm.cartoes
    ? prisma.transacaoCartao.groupBy({
        by: ["postoId", "adquirenteId"],
        where: { adquirente: { nome: { in: MAQUININHAS } }, dataVenda: { gte: somarDias(hoje, -60) } },
        _max: { dataVenda: true },
      })
    : null;
  const pBancos = perm.extratos ? prisma.banco.findMany({ select: { id: true, nome: true } }) : null;
  const pCelulas = perm.despesasPagas && perm.extratos ? statusDiarioPorPosto({ de: iso(somarDias(hoje, -6)), ate: hojeISO }) : null;
  const pDiasSemLancamento =
    perm.despesasPagas && perm.extratos
      ? conferenciaTotalDiario({
          de: iso(dataUTC(CONCILIACAO_DESDE) > somarDias(hoje, -30) ? dataUTC(CONCILIACAO_DESDE) : somarDias(hoje, -30)),
          ate: hojeISO,
        })
      : null;
  const pSemConta = perm.combustiveis && perm.extratos ? combustiveisNoExtratoSemConta() : null;
  const pEntrePostos = perm.entrePostos
    ? prisma.movimentacaoEntrePostos.count({
        where: { data: { gte: dataUTC("2026-10-01") }, lancamentoExtratoOrigemId: null, lancamentoExtratoDestinoId: null },
      })
    : null;

  const precisaPostos = perm.contas || perm.extratos || perm.cartoes || perm.despesasPagas;
  const postos = precisaPostos
    ? await prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    : [];
  const nomePosto = new Map(postos.map((p) => [p.id, p.nome]));

  // ---------- contas: a pagar no dia, vencidas, próximos dias ----------
  let pagarNoDia: DadosInicio["pagarNoDia"] = null;
  let vencidas: DadosInicio["vencidas"] = null;
  const porPostoMap = new Map<string, { despesas: number; combustiveis: number }>();
  const pagarPorPosto = new Map<string, number>();
  const vencidasPorPosto = new Map<string, number>();
  const pagarPorDia = new Map<string, number>();

  if (perm.contas) {
    const [doDia, vencidasAgg, vencidasGrupo, futuras] = await Promise.all([
      prisma.contaAPagar.findMany({
        where: { paga: false, dataVencimento: dataRef, ...(perm.combustiveis ? {} : { combustivel: false }) },
        select: { valor: true, combustivel: true, postoId: true },
      }),
      prisma.contaAPagar.aggregate({
        where: { paga: false, dataVencimento: { lt: dataRef }, ...(perm.combustiveis ? {} : { combustivel: false }) },
        _count: { _all: true },
        _sum: { valor: true },
      }),
      prisma.contaAPagar.groupBy({
        by: ["postoId"],
        where: { paga: false, dataVencimento: { lt: dataRef }, ...(perm.combustiveis ? {} : { combustivel: false }) },
        _sum: { valor: true },
      }),
      prisma.contaAPagar.groupBy({
        by: ["dataVencimento"],
        where: {
          paga: false,
          dataVencimento: { gte: dataRef, lte: ultimoDia },
          ...(perm.combustiveis ? {} : { combustivel: false }),
        },
        _sum: { valor: true },
      }),
    ]);

    let total = 0;
    let comb = 0;
    for (const c of doDia) {
      const v = Number(c.valor);
      total += v;
      if (c.combustivel) comb += v;
      const nome = nomePosto.get(c.postoId) ?? c.postoId;
      const a = porPostoMap.get(nome) ?? { despesas: 0, combustiveis: 0 };
      if (c.combustivel) a.combustiveis += v;
      else a.despesas += v;
      porPostoMap.set(nome, a);
      pagarPorPosto.set(c.postoId, (pagarPorPosto.get(c.postoId) ?? 0) + v);
    }
    pagarNoDia = { total, qtd: doDia.length, combustiveis: comb, despesas: total - comb };

    vencidas = {
      total: Number(vencidasAgg._sum.valor ?? 0),
      qtd: vencidasAgg._count._all,
      ateISO: iso(somarDias(dataRef, -1)),
    };
    for (const v of vencidasGrupo) vencidasPorPosto.set(v.postoId, Number(v._sum.valor ?? 0));

    // Vencimento em fim de semana/feriado cai no próximo dia útil (mesma regra do Fluxo).
    for (const f of futuras) {
      const dia = iso(paraProximoDiaUtilSeNecessario(f.dataVencimento));
      pagarPorDia.set(dia, (pagarPorDia.get(dia) ?? 0) + Number(f._sum.valor ?? 0));
    }
  }

  // ---------- previsão de recebimento (mesma regra do Fluxo de Caixa) ----------
  let receber: DadosInicio["receber"] = null;
  const receberPorDia = new Map<string, number>();
  if (perm.fluxo) {
    const previsoes = (await pReceber)!;
    let deb0 = 0;
    let cred0 = 0;
    for (const [chave, v] of previsoes) {
      const dia = chave.split("|")[1];
      receberPorDia.set(dia, (receberPorDia.get(dia) ?? 0) + v.debitoPix + v.creditoVoucher);
      if (dia === diasUteisISO[0]) {
        deb0 += v.debitoPix;
        cred0 += v.creditoVoucher;
      }
    }
    receber = { total: deb0 + cred0, debitoPix: deb0, creditoVoucher: cred0, diaISO: diasUteisISO[0] };
  }

  const proximosDias = diasUteisISO.map((dia) => ({
    dia,
    pagar: perm.contas ? (pagarPorDia.get(dia) ?? 0) : null,
    receber: perm.fluxo ? (receberPorDia.get(dia) ?? 0) : null,
  }));

  // ---------- até quando temos extrato e venda de cartão de cada posto ----------
  const extratoAte = new Map<string, Date>();
  const extratoBanco = new Map<string, string>();
  if (perm.extratos) {
    const [bancos, nomesBancos] = await Promise.all([pExtrato!, pBancos!]);
    const nomeBanco = new Map(nomesBancos.map((b) => [b.id, b.nome]));
    for (const b of bancos) {
      if (b._count._all < MIN_LANCAMENTOS_BANCO_ATIVO || !b._max.data) continue;
      const atual = extratoAte.get(b.postoId);
      if (!atual || b._max.data < atual) {
        extratoAte.set(b.postoId, b._max.data);
        extratoBanco.set(b.postoId, nomeBanco.get(b.bancoId) ?? "");
      }
    }
  }
  const vendasAte = new Map<string, Date>();
  if (perm.cartoes) {
    const ultimas = (await pVendas)!;
    const maisRecente = ultimas.reduce<Date | null>((m, u) => (u._max.dataVenda && (!m || u._max.dataVenda > m) ? u._max.dataVenda : m), null);
    if (maisRecente) {
      const corte = somarDias(maisRecente, -TOLERANCIA_ATIVA_DIAS);
      for (const u of ultimas) {
        const d = u._max.dataVenda;
        if (!d || d < corte) continue;
        const atual = vendasAte.get(u.postoId);
        if (!atual || d < atual) vendasAte.set(u.postoId, d);
      }
    }
  }

  // ---------- conciliação dos últimos 7 dias, por posto ----------
  const celulasPorPosto = new Map<string, CelulaDiaria[]>();
  if (perm.despesasPagas && perm.extratos) {
    const linhas = (await pCelulas)!;
    for (const l of linhas) celulasPorPosto.set(l.postoId, l.celulas);
  }

  // ---------- tabela "situação por posto" ----------
  const idsSituacao = new Set<string>([...extratoAte.keys(), ...vendasAte.keys(), ...pagarPorPosto.keys(), ...vencidasPorPosto.keys()]);
  const situacao: PostoSituacao[] = [...idsSituacao]
    .map((id) => ({
      postoId: id,
      posto: nomePosto.get(id) ?? id,
      extratoAte: extratoAte.has(id) ? iso(extratoAte.get(id)!) : null,
      extratoBanco: extratoBanco.get(id) || null,
      vendasAte: vendasAte.has(id) ? iso(vendasAte.get(id)!) : null,
      pagarNoDia: pagarPorPosto.get(id) ?? 0,
      vencidas: vencidasPorPosto.get(id) ?? 0,
      celulas: celulasPorPosto.get(id) ?? [],
    }))
    .sort((a, b) => {
      const pior = (s: PostoSituacao) =>
        (s.vencidas > 0 ? 2 : 0) +
        (s.extratoAte && s.extratoAte < iso(somarDias(hoje, -DIAS_ATRASO_ALERTA)) ? 2 : 0) +
        (s.vendasAte && s.vendasAte < iso(somarDias(hoje, -DIAS_ATRASO_ALERTA)) ? 1 : 0);
      return pior(b) - pior(a) || a.posto.localeCompare(b.posto, "pt-BR");
    });

  // ---------- "Precisa da sua atenção" ----------
  const alertas: AlertaInicio[] = [];
  const limiteAtraso = iso(somarDias(hoje, -DIAS_ATRASO_ALERTA));
  const dm = (s: string) => s.split("-").reverse().slice(0, 2).join("/");

  if (perm.extratos) {
    const velhos = [...extratoAte.entries()].filter(([, d]) => iso(d) < limiteAtraso).sort((a, b) => a[1].getTime() - b[1].getTime());
    if (velhos.length > 0) {
      alertas.push({
        nivel: "ruim",
        titulo: `${velhos.length} posto${velhos.length === 1 ? "" : "s"} com extrato desatualizado`,
        detalhe: velhos.slice(0, 4).map(([id, d]) => `${nomePosto.get(id) ?? id}${extratoBanco.get(id) ? ` · ${extratoBanco.get(id)}` : ""} (até ${dm(iso(d))})`).join(", ") + (velhos.length > 4 ? ` e mais ${velhos.length - 4}` : ""),
        href: "/extratos/importar",
        acao: "Importar",
      });
    }
  }
  if (perm.contas && vencidas && vencidas.qtd > 0) {
    alertas.push({
      nivel: "ruim",
      titulo: `${vencidas.qtd} conta${vencidas.qtd === 1 ? "" : "s"} vencida${vencidas.qtd === 1 ? "" : "s"} em aberto`,
      detalhe: "Ainda não foram marcadas como pagas",
      href: `/conferencia-diaria?ate=${vencidas.ateISO}`,
      acao: "Ver",
    });
  }
  if (perm.despesasPagas && perm.extratos) {
    const dias = (await pDiasSemLancamento)!;
    const faltando = dias.filter((l) => l.diferenca < -0.005);
    if (faltando.length > 0) {
      alertas.push({
        nivel: "atencao",
        titulo: `${faltando.length} dia${faltando.length === 1 ? "" : "s"} com despesa sem lançamento`,
        detalhe: "O extrato mostra saída em Despesas Pagas que não tem despesa lançada",
        href: "/despesas-pagas",
        acao: "Conciliar",
      });
    }
  }
  if (perm.combustiveis && perm.extratos) {
    const semConta = (await pSemConta)!;
    if (semConta.length > 0) {
      const l = semConta[0];
      alertas.push({
        nivel: "atencao",
        titulo: `${semConta.length} ${semConta.length === 1 ? "combustível" : "combustíveis"} no extrato sem conta`,
        detalhe: `${l.postoNome} · saída em ${dm(iso(l.data))}${semConta.length > 1 ? ` e mais ${semConta.length - 1}` : ""}`,
        href: "/combustiveis-a-pagar",
        acao: "Ver",
      });
    }
  }
  if (perm.cartoes) {
    const velhas = [...vendasAte.entries()].filter(([, d]) => iso(d) < limiteAtraso).sort((a, b) => a[1].getTime() - b[1].getTime());
    if (velhas.length > 0) {
      alertas.push({
        nivel: "atencao",
        titulo: "Vendas de cartão desatualizadas",
        detalhe: velhas.slice(0, 4).map(([id, d]) => `${nomePosto.get(id) ?? id} (até ${dm(iso(d))})`).join(", ") + (velhas.length > 4 ? ` e mais ${velhas.length - 4}` : ""),
        href: "/cartoes/vendas",
        acao: "Importar",
      });
    }
  }
  if (perm.entrePostos) {
    const semVinculo = (await pEntrePostos)!;
    if (semVinculo > 0) {
      alertas.push({
        nivel: "atencao",
        titulo: `${semVinculo} movimentaç${semVinculo === 1 ? "ão" : "ões"} entre postos sem vínculo com o extrato`,
        detalhe: "Em outubro, sem nenhum dos dois lados ligado a um lançamento",
        href: "/entre-postos",
        acao: "Ver",
      });
    }
  }
  if (alertas.length === 0) {
    alertas.push({ nivel: "ok", titulo: "Tudo em dia", detalhe: "Nenhuma pendência encontrada agora" });
  }

  return {
    dataRef: iso(dataRef),
    ehDiaUtil: ehDiaUtil(dataRef),
    pagarNoDia,
    vencidas,
    receber,
    proximosDias,
    porPosto: [...porPostoMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.despesas + b.combustiveis - (a.despesas + a.combustiveis)),
    situacao,
    alertas,
  };
}

// ---------------------------------------------------------------------------
// Parte rápida do painel (só contas a pagar): aparece na hora, sem esperar a
// previsão de recebimento, os extratos e as vendas — que chegam depois, em
// blocos separados (ver Suspense em src/app/(app)/page.tsx).
// ---------------------------------------------------------------------------
export type RapidoInicio = Pick<DadosInicio, "dataRef" | "pagarNoDia" | "vencidas" | "porPosto">;

const cacheRapido = new Map<string, { em: number; dados: Promise<RapidoInicio> }>();

export function carregarRapido(params: { dataRef: Date; perm: Pick<PermissoesInicio, "contas" | "combustiveis"> }): Promise<RapidoInicio> {
  const chave = `${iso(params.dataRef)}|${Number(params.perm.contas)}${Number(params.perm.combustiveis)}`;
  const agora = Date.now();
  const guardado = cacheRapido.get(chave);
  if (guardado && agora - guardado.em < CACHE_MS) return guardado.dados;
  const dados = calcularRapido(params);
  cacheRapido.set(chave, { em: agora, dados });
  dados.catch(() => cacheRapido.delete(chave));
  return dados;
}

async function calcularRapido(params: { dataRef: Date; perm: Pick<PermissoesInicio, "contas" | "combustiveis"> }): Promise<RapidoInicio> {
  const { dataRef, perm } = params;
  if (!perm.contas) return { dataRef: iso(dataRef), pagarNoDia: null, vencidas: null, porPosto: [] };
  const semCombustivel = perm.combustiveis ? {} : { combustivel: false };
  const [postos, doDia, vencidasAgg] = await Promise.all([
    prisma.posto.findMany({ select: { id: true, nome: true } }),
    prisma.contaAPagar.findMany({
      where: { paga: false, dataVencimento: dataRef, ...semCombustivel },
      select: { valor: true, combustivel: true, postoId: true },
    }),
    prisma.contaAPagar.aggregate({
      where: { paga: false, dataVencimento: { lt: dataRef }, ...semCombustivel },
      _count: { _all: true },
      _sum: { valor: true },
    }),
  ]);
  const nomePosto = new Map(postos.map((p) => [p.id, p.nome]));
  const porPostoMap = new Map<string, { despesas: number; combustiveis: number }>();
  let total = 0;
  let comb = 0;
  for (const c of doDia) {
    const v = Number(c.valor);
    total += v;
    if (c.combustivel) comb += v;
    const nome = nomePosto.get(c.postoId) ?? c.postoId;
    const a = porPostoMap.get(nome) ?? { despesas: 0, combustiveis: 0 };
    if (c.combustivel) a.combustiveis += v;
    else a.despesas += v;
    porPostoMap.set(nome, a);
  }
  return {
    dataRef: iso(dataRef),
    pagarNoDia: { total, qtd: doDia.length, combustiveis: comb, despesas: total - comb },
    vencidas: { total: Number(vencidasAgg._sum.valor ?? 0), qtd: vencidasAgg._count._all, ateISO: iso(somarDias(dataRef, -1)) },
    porPosto: [...porPostoMap.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.despesas + b.combustiveis - (a.despesas + a.combustiveis)),
  };
}
